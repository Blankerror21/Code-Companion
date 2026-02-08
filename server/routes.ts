import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { processAgentMessage, testLmStudioConnection, getProjectFileTree } from "./agent";
import { processAgentMessageDualModel } from "./dual-agent";
import * as replitApi from "./replit-api";
import { insertConversationSchema, insertSettingsSchema } from "@shared/schema";
import { setupAuth, registerAuthRoutes, isAuthenticated } from "./replit_integrations/auth";
import { z } from "zod";
import * as fs from "fs";
import * as path from "path";
import axios from "axios";
import { WebSocketServer, WebSocket } from "ws";
import { execSync } from "child_process";
import { projectRunner } from "./project-runner";
import { publishManager } from "./publish-manager";

const PROJECTS_DIR = path.resolve(process.cwd(), "projects");

const chatSchema = z.object({
  conversationId: z.string().min(1),
  content: z.string().min(1),
});

const testConnectionSchema = z.object({
  endpoint: z.string().url(),
});

const readFileSchema = z.object({
  path: z.string().min(1),
});

const createProjectSchema = z.object({
  name: z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/, "Project name can only contain letters, numbers, hyphens, and underscores"),
});

function sanitizePath(inputPath: string, baseDir?: string): string {
  const base = baseDir || process.cwd();
  const resolved = path.resolve(base, inputPath);
  if (!resolved.startsWith(base)) {
    throw new Error("Path traversal not allowed");
  }
  return resolved;
}

function getProjectDir(projectPath: string): string {
  const dir = path.resolve(PROJECTS_DIR, projectPath);
  if (!dir.startsWith(PROJECTS_DIR)) {
    throw new Error("Invalid project path");
  }
  return dir;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  await setupAuth(app);
  registerAuthRoutes(app);

  function getUserId(req: any): string | undefined {
    return req.user?.claims?.sub;
  }

  app.get("/api/conversations", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const conversations = await storage.getConversations(userId);
      res.json(conversations);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  async function verifyConversationOwnership(req: any, res: any): Promise<any | null> {
    const conv = await storage.getConversation(req.params.id);
    if (!conv) { res.status(404).json({ error: "Not found" }); return null; }
    const userId = getUserId(req);
    if (conv.userId && conv.userId !== userId) { res.status(403).json({ error: "Forbidden" }); return null; }
    return conv;
  }

  app.get("/api/conversations/:id", isAuthenticated, async (req: any, res) => {
    try {
      const conv = await verifyConversationOwnership(req, res);
      if (!conv) return;
      res.json(conv);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/conversations", isAuthenticated, async (req: any, res) => {
    try {
      const parsed = insertConversationSchema.partial().parse(req.body);
      const userId = getUserId(req);
      const conv = await storage.createConversation({
        title: parsed.title || "New Conversation",
        mode: parsed.mode,
        replId: parsed.replId,
        replName: parsed.replName,
        userId,
      });
      res.json(conv);
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: err.errors });
      }
      res.status(500).json({ error: err.message });
    }
  });

  app.patch("/api/conversations/:id", isAuthenticated, async (req: any, res) => {
    try {
      const conv = await verifyConversationOwnership(req, res);
      if (!conv) return;
      const parsed = insertConversationSchema.partial().parse(req.body);
      if (parsed.localProjectPath) {
        const sanitized = path.basename(parsed.localProjectPath);
        if (!sanitized || sanitized !== parsed.localProjectPath || /[^a-zA-Z0-9_-]/.test(sanitized)) {
          return res.status(400).json({ error: "Invalid project path" });
        }
        getProjectDir(sanitized);
        parsed.localProjectPath = sanitized;
        const existing = await storage.getConversationsByProjectPath(sanitized, req.params.id);
        if (existing.length > 0) {
          return res.status(409).json({ 
            error: `This project is already linked to another conversation. Each project can only be used by one conversation.` 
          });
        }
      }
      const updated = await storage.updateConversation(req.params.id, parsed);
      if (!updated) return res.status(404).json({ error: "Not found" });
      res.json(updated);
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: err.errors });
      }
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/conversations/:id", isAuthenticated, async (req: any, res) => {
    try {
      const conv = await verifyConversationOwnership(req, res);
      if (!conv) return;
      await storage.deleteConversation(req.params.id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/conversations/:id/fork", isAuthenticated, async (req: any, res) => {
    try {
      const conv = await verifyConversationOwnership(req, res);
      if (!conv) return;
      const userId = getUserId(req);
      const messages = await storage.getMessages(req.params.id);
      const messageUpTo = req.body.messageId;

      let forkedProjectPath = conv.localProjectPath;
      if (conv.localProjectPath) {
        const sanitizedBase = path.basename(conv.localProjectPath);
        const srcDir = getProjectDir(sanitizedBase);
        const baseName = sanitizedBase.replace(/-fork-\d+$/, "");
        let suffix = 1;
        let destName = `${baseName}-fork-${suffix}`;
        while (fs.existsSync(path.join(PROJECTS_DIR, destName))) {
          suffix++;
          destName = `${baseName}-fork-${suffix}`;
        }
        const destDir = path.join(PROJECTS_DIR, destName);
        if (fs.existsSync(srcDir)) {
          const { execFileSync } = require("child_process");
          execFileSync("cp", ["-r", srcDir, destDir]);
        } else {
          fs.mkdirSync(destDir, { recursive: true });
        }
        forkedProjectPath = destName;
      }

      const forkedConv = await storage.createConversation({
        title: `${conv.title} (fork)`,
        mode: conv.mode,
        replId: conv.replId,
        replName: conv.replName,
        localProjectPath: forkedProjectPath,
        forkedFrom: conv.id,
        userId,
      });

      const messagesToCopy = messageUpTo
        ? messages.filter((m) => new Date(m.createdAt) <= new Date(messages.find((msg) => msg.id === messageUpTo)?.createdAt || ""))
        : messages;

      for (const msg of messagesToCopy) {
        await storage.createMessage({
          conversationId: forkedConv.id,
          role: msg.role,
          content: msg.content,
          toolCalls: msg.toolCalls as any,
          status: msg.status,
        });
      }

      res.json(forkedConv);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/conversations/:id/messages", isAuthenticated, async (req: any, res) => {
    try {
      const conv = await verifyConversationOwnership(req, res);
      if (!conv) return;
      const msgs = await storage.getMessages(req.params.id);
      res.json(msgs);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/conversations/:id/tasks", isAuthenticated, async (req: any, res) => {
    try {
      const conv = await verifyConversationOwnership(req, res);
      if (!conv) return;
      if (!conv.localProjectPath) {
        return res.json({ tasks: [] });
      }
      const projectDir = getProjectDir(conv.localProjectPath);
      const taskListPath = path.join(projectDir, ".agent-tasks.json");
      if (fs.existsSync(taskListPath)) {
        const data = JSON.parse(fs.readFileSync(taskListPath, "utf-8"));
        return res.json({ tasks: data.tasks || [] });
      }
      res.json({ tasks: [] });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/settings", async (_req, res) => {
    try {
      const s = await storage.getSettings();
      res.json(s);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.patch("/api/settings", async (req, res) => {
    try {
      const parsed = insertSettingsSchema.partial().parse(req.body);
      const s = await storage.updateSettings(parsed);
      res.json(s);
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: err.errors });
      }
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/test-connection", async (req, res) => {
    try {
      const parsed = testConnectionSchema.parse(req.body);
      const result = await testLmStudioConnection(parsed.endpoint);
      res.json(result);
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: err.errors });
      }
      res.json({ success: false, error: err.message });
    }
  });

  app.post("/api/chat", isAuthenticated, async (req: any, res) => {
    try {
      const parsed = chatSchema.parse(req.body);
      const settingsData = await storage.getSettings();
      const conversation = await storage.getConversation(parsed.conversationId);
      if (!conversation) return res.status(404).json({ error: "Conversation not found" });
      const userId = getUserId(req);
      if (conversation.userId && conversation.userId !== userId) return res.status(403).json({ error: "Forbidden" });
      const projectPath = conversation?.localProjectPath || undefined;

      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });

      const useDualModel = !!settingsData.dualModelEnabled;
      const generator = useDualModel
        ? processAgentMessageDualModel(
            parsed.conversationId,
            parsed.content,
            settingsData.lmStudioEndpoint,
            settingsData.modelName || undefined,
            settingsData.mode,
            settingsData.maxTokens || 4096,
            parseFloat(settingsData.temperature || "0.7"),
            projectPath,
            settingsData.plannerModelName || undefined,
            settingsData.coderModelName || undefined,
          )
        : processAgentMessage(
            parsed.conversationId,
            parsed.content,
            settingsData.lmStudioEndpoint,
            settingsData.modelName || undefined,
            settingsData.mode,
            settingsData.maxTokens || 4096,
            parseFloat(settingsData.temperature || "0.7"),
            projectPath
          );

      let hadToolCalls = false;
      try {
        for await (const chunk of generator) {
          res.write(`data: ${JSON.stringify(chunk)}\n\n`);
          if (chunk.type === "tool_call") hadToolCalls = true;
        }
      } catch (streamErr: any) {
        const errorMsg = streamErr?.message || "An unexpected error occurred during processing";
        res.write(`data: ${JSON.stringify({ type: "error", content: `Agent error: ${errorMsg}` })}\n\n`);
      }

      if (hadToolCalls && projectPath && settingsData.mode === "build") {
        try {
          const info = projectRunner.getStatus(projectPath);
          if (info.status === "stopped" || info.status === "error") {
            const projectDir = path.resolve(PROJECTS_DIR, projectPath);
            const pkgPath = path.join(projectDir, "package.json");
            if (fs.existsSync(pkgPath)) {
              const hasNodeModules = fs.existsSync(path.join(projectDir, "node_modules"));
              if (!hasNodeModules) {
                try {
                  execSync("npm install", { cwd: projectDir, timeout: 120000, stdio: "ignore" });
                } catch {}
              }
              if (fs.existsSync(path.join(projectDir, "node_modules"))) {
                const result = await projectRunner.start(projectPath);
                await new Promise(r => setTimeout(r, 3000));
                const latestInfo = projectRunner.getStatus(projectPath);
                const actualPort = latestInfo.port || result.port;
                res.write(`data: ${JSON.stringify({ type: "auto_start", port: actualPort })}\n\n`);
              }
            } else {
              const hasIndex = fs.existsSync(path.join(projectDir, "index.html")) ||
                fs.existsSync(path.join(projectDir, "public", "index.html")) ||
                fs.existsSync(path.join(projectDir, "src", "index.html"));
              if (hasIndex) {
                const result = await projectRunner.start(projectPath);
                await new Promise(r => setTimeout(r, 3000));
                const latestInfo = projectRunner.getStatus(projectPath);
                const actualPort = latestInfo.port || result.port;
                res.write(`data: ${JSON.stringify({ type: "auto_start", port: actualPort })}\n\n`);
              }
            }
          }
        } catch (autoStartErr: any) {
          res.write(`data: ${JSON.stringify({ type: "auto_start_error", error: autoStartErr?.message || "Failed to auto-start project" })}\n\n`);
        }
      }

      res.write("data: [DONE]\n\n");
      res.end();
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        if (!res.headersSent) {
          return res.status(400).json({ error: err.errors });
        }
      }
      if (!res.headersSent) {
        res.status(500).json({ error: err.message });
      } else {
        res.write(`data: ${JSON.stringify({ type: "error", content: err.message })}\n\n`);
        res.end();
      }
    }
  });

  app.get("/api/conversations/:id/files", async (req, res) => {
    try {
      const conv = await storage.getConversation(req.params.id);
      let dir = process.cwd();
      if (conv?.localProjectPath) {
        dir = getProjectDir(conv.localProjectPath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
      }
      const files = getProjectFileTree(dir);
      res.json(files);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/conversations/:id/read-file", async (req, res) => {
    try {
      const parsed = readFileSchema.parse(req.body);
      const conv = await storage.getConversation(req.params.id);
      let baseDir = process.cwd();
      if (conv?.localProjectPath) {
        baseDir = getProjectDir(conv.localProjectPath);
      }
      const filePath = sanitizePath(parsed.path, baseDir);
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: "File not found" });
      }
      const content = fs.readFileSync(filePath, "utf-8");
      res.json({ content });
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: err.errors });
      }
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/change-logs", async (_req, res) => {
    try {
      const logs = await storage.getChangeLogs();
      res.json(logs);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/replit/verify-token", async (_req, res) => {
    try {
      const s = await storage.getSettings();
      if (!s.replitToken) {
        return res.json({ valid: false, error: "No token configured" });
      }
      const result = await replitApi.verifyToken(s.replitToken);
      res.json(result);
    } catch (err: any) {
      res.json({ valid: false, error: err.message });
    }
  });

  app.get("/api/replit/repls", async (req, res) => {
    try {
      const s = await storage.getSettings();
      if (!s.replitToken) {
        return res.status(400).json({ error: "No Replit token configured" });
      }
      const search = req.query.search as string | undefined;
      const repls = search
        ? await replitApi.searchRepls(s.replitToken, search)
        : await replitApi.listRepls(s.replitToken, 30);
      res.json(repls);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/replit/repls/:replId", async (req, res) => {
    try {
      const s = await storage.getSettings();
      if (!s.replitToken) {
        return res.status(400).json({ error: "No Replit token configured" });
      }
      const repl = await replitApi.getReplById(s.replitToken, req.params.replId);
      res.json(repl);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/replit/repls/:replId/files", async (req, res) => {
    try {
      const s = await storage.getSettings();
      if (!s.replitToken) {
        return res.status(400).json({ error: "No Replit token configured" });
      }
      const dirPath = (req.query.path as string) || ".";
      const files = await replitApi.listReplFiles(s.replitToken, req.params.replId, dirPath);
      res.json(files);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/replit/repls/:replId/read-file", async (req, res) => {
    try {
      const s = await storage.getSettings();
      if (!s.replitToken) {
        return res.status(400).json({ error: "No Replit token configured" });
      }
      const parsed = readFileSchema.parse(req.body);
      const content = await replitApi.readReplFile(s.replitToken, req.params.replId, parsed.path);
      res.json({ content });
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: err.errors });
      }
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/local-projects", isAuthenticated, async (req: any, res) => {
    try {
      if (!fs.existsSync(PROJECTS_DIR)) {
        fs.mkdirSync(PROJECTS_DIR, { recursive: true });
      }
      const userId = getUserId(req);
      const entries = fs.readdirSync(PROJECTS_DIR, { withFileTypes: true });
      const userConversations = await storage.getConversations(userId);
      const userProjectPaths = new Set(
        userConversations.filter(c => c.localProjectPath).map(c => c.localProjectPath!)
      );
      const projects = entries
        .filter((e) => e.isDirectory() && !e.name.startsWith(".") && userProjectPaths.has(e.name))
        .map((e) => {
          const conv = userConversations.find(c => c.localProjectPath === e.name);
          return {
            name: e.name,
            path: e.name,
            conversationId: conv?.id || null,
            conversationTitle: conv?.title || null,
            updatedAt: conv?.updatedAt || null,
          };
        });
      projects.sort((a, b) => {
        if (!a.updatedAt || !b.updatedAt) return 0;
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      });
      res.json(projects);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/local-projects", isAuthenticated, async (req: any, res) => {
    try {
      const parsed = createProjectSchema.parse(req.body);
      const projectDir = path.join(PROJECTS_DIR, parsed.name);
      if (fs.existsSync(projectDir)) {
        return res.status(409).json({ error: "A project with that name already exists" });
      }
      fs.mkdirSync(projectDir, { recursive: true });
      const userId = getUserId(req);
      const conv = await storage.createConversation({
        title: parsed.name,
        mode: "build",
        userId,
        localProjectPath: parsed.name,
      });
      res.json({ name: parsed.name, path: parsed.name, conversationId: conv.id });
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: err.errors });
      }
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/local-projects/:name/conversation", isAuthenticated, async (req: any, res) => {
    try {
      const projectName = req.params.name;
      const sanitized = path.basename(projectName);
      if (!sanitized || sanitized !== projectName || /[^a-zA-Z0-9_-]/.test(sanitized)) {
        return res.status(400).json({ error: "Invalid project name" });
      }
      const projectDir = path.join(PROJECTS_DIR, sanitized);
      if (!fs.existsSync(projectDir)) {
        return res.status(404).json({ error: "Project not found" });
      }
      const userId = getUserId(req);
      const existing = await storage.getConversationsByProjectPath(sanitized);
      const ownConv = existing.find(c => c.userId === userId);
      if (ownConv) {
        return res.json(ownConv);
      }
      const conv = await storage.createConversation({
        title: sanitized,
        mode: "build",
        userId,
        localProjectPath: sanitized,
      });
      res.json(conv);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

  const fileWatchers = new Map<string, { watcher: any; clients: Set<WebSocket> }>();
  let chokidarModule: any = null;
  import("chokidar").then((m) => { chokidarModule = m; }).catch(() => {});

  function subscribeToFileWatcher(projectPath: string, ws: WebSocket) {
    if (fileWatchers.has(projectPath)) {
      fileWatchers.get(projectPath)!.clients.add(ws);
      return;
    }
    const fullPath = path.resolve(PROJECTS_DIR, projectPath);
    if (!fs.existsSync(fullPath)) return;
    try {
      const clients = new Set<WebSocket>([ws]);
      if (!chokidarModule) return;
      const watcher = chokidarModule.watch(fullPath, {
        ignored: /(node_modules|\.git|^\.|__pycache__)/,
        persistent: true,
        ignoreInitial: true,
        awaitWriteFinish: { stabilityThreshold: 300 },
      });
      watcher.on("all", (eventType: string, filePath: string) => {
        const filename = path.relative(fullPath, filePath);
        const changeEvent = JSON.stringify({
          type: "file_change",
          eventType,
          filename,
          projectPath,
          timestamp: Date.now(),
        });
        clients.forEach((client) => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(changeEvent);
          }
        });
      });
      fileWatchers.set(projectPath, { watcher, clients });
    } catch {}
  }

  function unsubscribeFromFileWatcher(projectPath: string, ws: WebSocket) {
    const entry = fileWatchers.get(projectPath);
    if (!entry) return;
    entry.clients.delete(ws);
    if (entry.clients.size === 0) {
      entry.watcher.close();
      fileWatchers.delete(projectPath);
    }
  }

  wss.on("connection", (ws: WebSocket) => {
    let subscribedProject: string | null = null;

    const logHandler = (projectPath: string, line: string) => {
      if (projectPath === subscribedProject) {
        ws.send(JSON.stringify({ type: "log", line }));
      }
    };

    const statusHandler = (projectPath: string, status: string) => {
      if (projectPath === subscribedProject) {
        ws.send(JSON.stringify({ type: "status", status }));
      }
    };

    const portHandler = (projectPath: string, port: number) => {
      if (projectPath === subscribedProject) {
        ws.send(JSON.stringify({ type: "port_changed", port }));
      }
    };

    projectRunner.on("log", logHandler);
    projectRunner.on("status", statusHandler);
    projectRunner.on("port_changed", portHandler);

    ws.on("message", (data: Buffer) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === "subscribe" && msg.projectPath) {
          if (subscribedProject) {
            unsubscribeFromFileWatcher(subscribedProject, ws);
          }
          subscribedProject = msg.projectPath;
          const info = projectRunner.getStatus(msg.projectPath);
          ws.send(JSON.stringify({ type: "status", status: info.status }));
          ws.send(JSON.stringify({ type: "logs_batch", logs: info.logs }));
          subscribeToFileWatcher(msg.projectPath, ws);
        }
      } catch {}
    });

    ws.on("close", () => {
      projectRunner.removeListener("log", logHandler);
      projectRunner.removeListener("status", statusHandler);
      projectRunner.removeListener("port_changed", portHandler);
      if (subscribedProject) {
        unsubscribeFromFileWatcher(subscribedProject, ws);
      }
    });
  });

  publishManager.restoreRunningApps().catch(err => {
    console.error("Failed to restore published apps on startup:", err.message);
  });

  app.get("/api/published-apps", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const apps = await storage.getPublishedApps(userId);
      const enriched = apps.map(app => {
        const running = publishManager.getRunningApp(app.name);
        return {
          ...app,
          liveStatus: app.type === "static" && app.status === "running"
            ? "running"
            : running?.status || (app.status === "running" ? "stopped" : app.status),
          url: `/apps/${app.name}/`,
        };
      });
      res.json(enriched);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/published-apps/:name", isAuthenticated, async (req: any, res) => {
    try {
      const app = await storage.getPublishedAppByName(req.params.name);
      if (!app) return res.status(404).json({ error: "App not found" });
      const userId = getUserId(req);
      if (app.userId && app.userId !== userId) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const running = publishManager.getRunningApp(app.name);
      res.json({
        ...app,
        liveStatus: app.type === "static" && app.status === "running"
          ? "running"
          : running?.status || (app.status === "running" ? "stopped" : app.status),
        url: `/apps/${app.name}/`,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/published-apps/publish", isAuthenticated, async (req: any, res) => {
    try {
      const { projectPath, appName } = req.body;
      if (!projectPath || !appName) {
        return res.status(400).json({ error: "projectPath and appName are required" });
      }
      if (!/^[a-zA-Z0-9_-]+$/.test(appName)) {
        return res.status(400).json({ error: "App name can only contain letters, numbers, hyphens, and underscores" });
      }
      if (!/^[a-zA-Z0-9_-]+$/.test(projectPath)) {
        return res.status(400).json({ error: "Invalid project path" });
      }
      const userId = getUserId(req);

      const userConvs = await storage.getConversationsByProjectPath(projectPath);
      const ownsProject = userConvs.some(c => c.userId === userId);
      if (!ownsProject) {
        return res.status(403).json({ error: "You don't have access to this project" });
      }

      const existing = await storage.getPublishedAppByName(appName);
      if (existing && existing.userId && existing.userId !== userId) {
        return res.status(403).json({ error: "This app name is owned by another user" });
      }

      const result = await publishManager.publish(projectPath, appName, userId);
      const app = await storage.getPublishedApp(result.appId);
      res.json({ success: true, app, buildLog: result.buildLog });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/published-apps/:name/restart", isAuthenticated, async (req: any, res) => {
    try {
      const app = await storage.getPublishedAppByName(req.params.name);
      if (!app) return res.status(404).json({ error: "App not found" });
      const userId = getUserId(req);
      if (app.userId && app.userId !== userId) {
        return res.status(403).json({ error: "Forbidden" });
      }
      await publishManager.restartApp(req.params.name);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/published-apps/:name/stop", isAuthenticated, async (req: any, res) => {
    try {
      const app = await storage.getPublishedAppByName(req.params.name);
      if (!app) return res.status(404).json({ error: "App not found" });
      const userId = getUserId(req);
      if (app.userId && app.userId !== userId) {
        return res.status(403).json({ error: "Forbidden" });
      }
      publishManager.stopApp(req.params.name);
      await storage.updatePublishedApp(app.id, { status: "stopped" });
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/published-apps/:name", isAuthenticated, async (req: any, res) => {
    try {
      const app = await storage.getPublishedAppByName(req.params.name);
      if (!app) return res.status(404).json({ error: "App not found" });
      const userId = getUserId(req);
      if (app.userId && app.userId !== userId) {
        return res.status(403).json({ error: "Forbidden" });
      }
      await publishManager.unpublish(req.params.name);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.use("/apps/:appName", async (req, res) => {
    try {
      const appName = req.params.appName;
      if (!/^[a-zA-Z0-9_-]+$/.test(appName)) {
        return res.status(400).send("Invalid app name");
      }

      const dbApp = await storage.getPublishedAppByName(appName);
      if (!dbApp || dbApp.status !== "running") {
        return res.status(404).send(`
          <!DOCTYPE html>
          <html><head><title>App Not Found</title>
          <style>body{font-family:system-ui;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#0a0a0a;color:#e5e5e5}
          .c{text-align:center}.t{font-size:1.5rem;font-weight:600;margin-bottom:0.5rem}.s{color:#737373}</style></head>
          <body><div class="c"><div class="t">${dbApp ? 'App is not running' : 'App not found'}</div><div class="s">${appName}</div></div></body></html>
        `);
      }

      if (dbApp.type === "static") {
        const publishDir = publishManager.getPublishedDir(appName);
        const prefix = `/apps/${appName}`;
        const rawPath = req.originalUrl.slice(prefix.length) || "/";
        let requestedPath: string;
        try {
          requestedPath = decodeURIComponent(rawPath.split("?")[0]);
        } catch {
          requestedPath = rawPath.split("?")[0];
        }
        if (requestedPath === "/" || requestedPath === "") requestedPath = "/index.html";

        const safePath = path.normalize(requestedPath).replace(/^(\.\.(\/|\\|$))+/, '');
        const filePath = path.join(publishDir, safePath);

        if (!filePath.startsWith(publishDir)) {
          return res.status(403).send("Forbidden");
        }

        if (!fs.existsSync(filePath)) {
          const indexPath = path.join(publishDir, "index.html");
          if (fs.existsSync(indexPath)) {
            let html = fs.readFileSync(indexPath, "utf-8");
            html = html.replace(/(src|href)="\//g, `$1="${prefix}/`);
            return res.type("html").send(html);
          }
          return res.status(404).send("Not found");
        }

        const ext = path.extname(filePath).toLowerCase();
        const mimeTypes: Record<string, string> = {
          ".html": "text/html", ".js": "application/javascript", ".mjs": "application/javascript",
          ".css": "text/css", ".json": "application/json", ".png": "image/png",
          ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif",
          ".svg": "image/svg+xml", ".ico": "image/x-icon", ".woff": "font/woff",
          ".woff2": "font/woff2", ".ttf": "font/ttf", ".eot": "application/vnd.ms-fontobject",
          ".map": "application/json", ".webp": "image/webp",
        };

        const contentType = mimeTypes[ext] || "application/octet-stream";

        if (contentType === "text/html") {
          let html = fs.readFileSync(filePath, "utf-8");
          html = html.replace(/(src|href)="\/(?!\/|apps\/)/g, `$1="${prefix}/`);
          return res.type("html").send(html);
        }

        if (contentType === "application/javascript" || contentType === "text/css") {
          let text = fs.readFileSync(filePath, "utf-8");
          const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          text = text.replace(new RegExp(`(from\\s+["'])\\/(?!\\/|${escapedPrefix.slice(1)})`, 'g'), `$1${prefix}/`);
          text = text.replace(new RegExp(`(import\\s*\\(["'])\\/(?!\\/|${escapedPrefix.slice(1)})`, 'g'), `$1${prefix}/`);
          return res.type(contentType).send(text);
        }

        return res.type(contentType).sendFile(filePath);
      }

      if (dbApp.type === "fullstack") {
        const running = publishManager.getRunningApp(appName);
        if (!running || running.status !== "running") {
          return res.status(503).json({ error: "App is not running" });
        }

        const prefix = `/apps/${appName}`;
        let targetPath = req.originalUrl.slice(prefix.length) || "/";
        if (!targetPath.startsWith("/")) targetPath = "/" + targetPath;
        const targetUrl = `http://localhost:${running.port}${targetPath}`;

        try {
          const proxyRes = await axios({
            method: req.method as any,
            url: targetUrl,
            headers: { ...req.headers, host: `localhost:${running.port}` },
            data: req.body,
            responseType: "arraybuffer",
            validateStatus: () => true,
            timeout: 15000,
            maxRedirects: 0,
          });

          const skipHeaders = new Set(["transfer-encoding", "connection", "keep-alive", "content-encoding", "content-length"]);
          Object.entries(proxyRes.headers).forEach(([key, value]) => {
            if (!skipHeaders.has(key.toLowerCase()) && value) {
              if (key.toLowerCase() === "location") {
                const loc = value as string;
                res.setHeader(key, loc.startsWith("/") ? `${prefix}${loc}` : loc);
              } else {
                res.setHeader(key, value as string);
              }
            }
          });

          const contentType = (proxyRes.headers["content-type"] || "").toString().toLowerCase();
          let body = Buffer.from(proxyRes.data);

          if (contentType.includes("text/html") || contentType.includes("javascript") || contentType.includes("text/css")) {
            const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            let text = body.toString("utf-8");
            text = text.replace(new RegExp(`(src|href|action)=(["'])\\/(?!\\/|${escapedPrefix.slice(1)})`, 'g'), `$1=$2${prefix}/`);
            text = text.replace(new RegExp(`(from\\s+["'])\\/(?!\\/|${escapedPrefix.slice(1)})`, 'g'), `$1${prefix}/`);
            text = text.replace(new RegExp(`(import\\s*\\(["'])\\/(?!\\/|${escapedPrefix.slice(1)})`, 'g'), `$1${prefix}/`);
            body = Buffer.from(text, "utf-8");
          }

          res.setHeader("content-length", body.length);
          res.status(proxyRes.status).send(body);
        } catch (err: any) {
          res.status(502).json({ error: "Could not reach app server: " + err.message });
        }
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/project-runner/start", async (req, res) => {
    try {
      const { projectPath } = req.body;
      if (!projectPath) return res.status(400).json({ error: "projectPath required" });
      const result = await projectRunner.start(projectPath);
      await new Promise(r => setTimeout(r, 3000));
      const latestInfo = projectRunner.getStatus(projectPath);
      const actualPort = latestInfo.port || result.port;
      res.json({ success: true, port: actualPort });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/project-runner/stop", async (req, res) => {
    try {
      const { projectPath } = req.body;
      if (!projectPath) return res.status(400).json({ error: "projectPath required" });
      projectRunner.stop(projectPath);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/project-runner/status/:projectPath", async (req, res) => {
    try {
      const info = projectRunner.getStatus(req.params.projectPath);
      res.json(info);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.use("/api/project-preview/:projectPath", async (req, res) => {
    try {
      const projectPath = req.params.projectPath;
      const info = projectRunner.getStatus(projectPath);
      if (!info.port) return res.status(503).json({ error: "Project not running" });

      const prefix = `/api/project-preview/${projectPath}`;
      const targetPath = req.originalUrl.slice(prefix.length) || "/";
      const targetUrl = `http://localhost:${info.port}${targetPath}`;

      try {
        const proxyRes = await axios({
          method: req.method as any,
          url: targetUrl,
          headers: {
            ...req.headers,
            host: `localhost:${info.port}`,
            referer: undefined,
            origin: undefined,
          },
          data: req.body,
          responseType: "arraybuffer",
          validateStatus: () => true,
          timeout: 15000,
          maxRedirects: 0,
        });

        const skipHeaders = new Set(["transfer-encoding", "connection", "keep-alive", "content-encoding", "content-length"]);
        Object.entries(proxyRes.headers).forEach(([key, value]) => {
          if (!skipHeaders.has(key.toLowerCase()) && value) {
            if (key.toLowerCase() === "location") {
              const loc = value as string;
              if (loc.startsWith("/")) {
                res.setHeader(key, `${prefix}${loc}`);
              } else {
                res.setHeader(key, loc);
              }
            } else {
              res.setHeader(key, value as string);
            }
          }
        });

        const contentType = (proxyRes.headers["content-type"] || "").toString().toLowerCase();
        let body = Buffer.from(proxyRes.data);

        const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const rewriteAbsolutePaths = (text: string): string => {
          text = text.replace(new RegExp(`(src|href|action)=(["'])\\/(?!\\/|${escapedPrefix.slice(1)})`, 'g'), `$1=$2${prefix}/`);
          text = text.replace(new RegExp(`(from\\s+["'])\\/(?!\\/|${escapedPrefix.slice(1)})`, 'g'), `$1${prefix}/`);
          text = text.replace(new RegExp(`(import\\s*\\(["'])\\/(?!\\/|${escapedPrefix.slice(1)})`, 'g'), `$1${prefix}/`);
          text = text.replace(new RegExp(`(import\\s+["'])\\/(?!\\/|${escapedPrefix.slice(1)})`, 'g'), `$1${prefix}/`);
          text = text.replace(new RegExp(`(url\\s*\\(\\s*["']?)\\/(?!\\/|${escapedPrefix.slice(1)})`, 'g'), `$1${prefix}/`);
          return text;
        };

        if (contentType.includes("text/html") || contentType.includes("javascript") || contentType.includes("text/css")) {
          let text = body.toString("utf-8");
          text = rewriteAbsolutePaths(text);
          body = Buffer.from(text, "utf-8");
        }

        res.setHeader("content-length", body.length);
        res.status(proxyRes.status).send(body);
      } catch (err: any) {
        res.status(502).json({ error: "Could not reach project server: " + err.message });
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  return httpServer;
}
