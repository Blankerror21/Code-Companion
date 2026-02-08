import { spawn, ChildProcess, execSync } from "child_process";
import * as path from "path";
import * as fs from "fs";
import { EventEmitter } from "events";
import { storage } from "./storage";

const PROJECTS_DIR = path.resolve(process.cwd(), "projects");
const PUBLISHED_DIR = path.resolve(process.cwd(), "published");

interface RunningPublishedApp {
  process: ChildProcess;
  port: number;
  status: "running" | "stopped" | "crashed";
  appId: string;
}

class PublishManager extends EventEmitter {
  private runningApps: Map<string, RunningPublishedApp> = new Map();
  private nextPublishPort = 4000;

  constructor() {
    super();
    if (!fs.existsSync(PUBLISHED_DIR)) {
      fs.mkdirSync(PUBLISHED_DIR, { recursive: true });
    }
  }

  async publish(
    projectPath: string,
    appName: string,
    userId?: string
  ): Promise<{ appId: string; buildLog: string }> {
    const projectDir = path.resolve(PROJECTS_DIR, projectPath);
    if (!projectDir.startsWith(PROJECTS_DIR)) throw new Error("Invalid project path");
    if (!fs.existsSync(projectDir)) throw new Error("Project directory not found");

    const existing = await storage.getPublishedAppByName(appName);
    let appId: string;
    let buildLog = "";

    if (existing) {
      appId = existing.id;
      this.stopApp(appName);
      await storage.updatePublishedApp(appId, { status: "building", buildLog: "" });
    } else {
      const app = await storage.createPublishedApp({
        name: appName,
        projectPath,
        userId: userId || null,
        type: "static",
        port: null,
        status: "building",
        buildLog: "",
      });
      appId = app.id;
    }

    try {
      const projectType = this.detectProjectType(projectDir);
      const publishDir = path.resolve(PUBLISHED_DIR, appName);

      if (projectType === "static-html") {
        this.copyDir(projectDir, publishDir);
        buildLog += "Copied static files.\n";
        await storage.updatePublishedApp(appId, {
          type: "static",
          status: "running",
          buildLog,
        });
        return { appId, buildLog };
      }

      if (projectType === "vite" || projectType === "react") {
        if (!fs.existsSync(path.join(projectDir, "node_modules"))) {
          buildLog += "Installing dependencies...\n";
          await storage.updatePublishedApp(appId, { buildLog });
          try {
            const installOut = execSync("npm install", {
              cwd: projectDir,
              timeout: 120000,
              encoding: "utf-8",
              stdio: ["pipe", "pipe", "pipe"],
            });
            buildLog += installOut + "\n";
          } catch (e: any) {
            buildLog += `npm install failed: ${e.stderr || e.message}\n`;
          }
          await storage.updatePublishedApp(appId, { buildLog });
        }

        buildLog += "Building project...\n";
        await storage.updatePublishedApp(appId, { buildLog });

        let buildCmd = "npm run build";
        try {
          const pkg = JSON.parse(fs.readFileSync(path.join(projectDir, "package.json"), "utf-8"));
          if (!pkg.scripts?.build) {
            const localVite = path.join(projectDir, "node_modules", ".bin", "vite");
            if (fs.existsSync(localVite)) {
              buildCmd = `${localVite} build`;
            } else {
              buildCmd = "npx vite build";
            }
          }
        } catch {}

        try {
          const buildOut = execSync(buildCmd, {
            cwd: projectDir,
            timeout: 120000,
            encoding: "utf-8",
            stdio: ["pipe", "pipe", "pipe"],
          });
          buildLog += buildOut + "\n";
        } catch (e: any) {
          const rawError = e.stderr || e.message || "Unknown build error";
          const lines = rawError.split("\n");
          const meaningful = lines.filter((l: string) => !l.trim().startsWith("at ") && l.trim().length > 0).slice(0, 10).join("\n");
          buildLog += `Build failed:\n${rawError}\n`;
          await storage.updatePublishedApp(appId, { status: "error", buildLog });
          throw new Error(meaningful || rawError);
        }

        const distDir = path.join(projectDir, "dist");
        if (!fs.existsSync(distDir)) {
          buildLog += "No dist/ directory found after build.\n";
          await storage.updatePublishedApp(appId, { status: "error", buildLog });
          throw new Error("Build produced no output (no dist/ directory)");
        }

        if (fs.existsSync(publishDir)) {
          fs.rmSync(publishDir, { recursive: true, force: true });
        }
        this.copyDir(distDir, publishDir);
        buildLog += "Static build copied to publish directory.\n";

        await storage.updatePublishedApp(appId, {
          type: "static",
          status: "running",
          buildLog,
        });

        return { appId, buildLog };
      }

      if (projectType === "node-server") {
        const publishProjectDir = path.resolve(PUBLISHED_DIR, appName);
        if (fs.existsSync(publishProjectDir)) {
          fs.rmSync(publishProjectDir, { recursive: true, force: true });
        }
        this.copyDir(projectDir, publishProjectDir);

        if (!fs.existsSync(path.join(publishProjectDir, "node_modules"))) {
          buildLog += "Installing dependencies...\n";
          await storage.updatePublishedApp(appId, { buildLog });
          try {
            execSync("npm install --production", {
              cwd: publishProjectDir,
              timeout: 120000,
              encoding: "utf-8",
              stdio: ["pipe", "pipe", "pipe"],
            });
            buildLog += "Dependencies installed.\n";
          } catch (e: any) {
            buildLog += `npm install failed: ${e.stderr || e.message}\n`;
          }
        }

        const port = this.nextPublishPort++;
        buildLog += `Starting server on port ${port}...\n`;
        await storage.updatePublishedApp(appId, { buildLog });

        const startCmd = this.detectServerStartCommand(publishProjectDir);
        if (!startCmd) {
          buildLog += "Could not detect start command.\n";
          await storage.updatePublishedApp(appId, { status: "error", buildLog });
          throw new Error("Could not detect how to start this server app");
        }

        const child = spawn("sh", ["-c", startCmd], {
          cwd: publishProjectDir,
          env: { ...process.env, PORT: String(port), NODE_ENV: "production" },
          stdio: ["ignore", "pipe", "pipe"],
        });

        const app: RunningPublishedApp = {
          process: child,
          port,
          status: "running",
          appId,
        };
        this.runningApps.set(appName, app);

        child.stdout?.on("data", (data: Buffer) => {
          buildLog += data.toString();
        });
        child.stderr?.on("data", (data: Buffer) => {
          buildLog += data.toString();
        });

        child.on("exit", (code) => {
          app.status = "crashed";
          this.emit("app_stopped", appName);
          storage.updatePublishedApp(appId, { status: "stopped", buildLog: buildLog + `\nProcess exited with code ${code}` });
        });

        child.on("error", (err) => {
          app.status = "crashed";
          storage.updatePublishedApp(appId, { status: "error", buildLog: buildLog + `\nProcess error: ${err.message}` });
        });

        await new Promise(r => setTimeout(r, 3000));

        await storage.updatePublishedApp(appId, {
          type: "fullstack",
          port,
          status: "running",
          buildLog,
        });

        return { appId, buildLog };
      }

      buildLog += "Unknown project type. Copying as static.\n";
      this.copyDir(projectDir, path.resolve(PUBLISHED_DIR, appName));
      await storage.updatePublishedApp(appId, { type: "static", status: "running", buildLog });
      return { appId, buildLog };
    } catch (err: any) {
      if (!buildLog.includes(err.message)) {
        buildLog += `Error: ${err.message}\n`;
      }
      await storage.updatePublishedApp(appId, { status: "error", buildLog });
      throw err;
    }
  }

  stopApp(appName: string): void {
    const app = this.runningApps.get(appName);
    if (!app) return;
    try {
      app.process.kill("SIGTERM");
      setTimeout(() => {
        try { app.process.kill("SIGKILL"); } catch {}
      }, 5000);
    } catch {}
    app.status = "stopped";
    this.runningApps.delete(appName);
  }

  async restartApp(appName: string): Promise<void> {
    const dbApp = await storage.getPublishedAppByName(appName);
    if (!dbApp) throw new Error("App not found");
    if (dbApp.type !== "fullstack") throw new Error("Only full-stack apps can be restarted");

    this.stopApp(appName);

    const publishProjectDir = path.resolve(PUBLISHED_DIR, appName);
    if (!fs.existsSync(publishProjectDir)) throw new Error("Published app directory not found");

    const port = this.nextPublishPort++;
    const startCmd = this.detectServerStartCommand(publishProjectDir);
    if (!startCmd) throw new Error("Could not detect start command");

    const child = spawn("sh", ["-c", startCmd], {
      cwd: publishProjectDir,
      env: { ...process.env, PORT: String(port), NODE_ENV: "production" },
      stdio: ["ignore", "pipe", "pipe"],
    });

    const app: RunningPublishedApp = {
      process: child,
      port,
      status: "running",
      appId: dbApp.id,
    };
    this.runningApps.set(appName, app);

    child.on("exit", () => {
      app.status = "crashed";
      this.emit("app_stopped", appName);
    });

    await new Promise(r => setTimeout(r, 3000));
    await storage.updatePublishedApp(dbApp.id, { port, status: "running" });
  }

  async unpublish(appName: string): Promise<void> {
    this.stopApp(appName);
    const publishDir = path.resolve(PUBLISHED_DIR, appName);
    if (fs.existsSync(publishDir)) {
      fs.rmSync(publishDir, { recursive: true, force: true });
    }
    const dbApp = await storage.getPublishedAppByName(appName);
    if (dbApp) {
      await storage.deletePublishedApp(dbApp.id);
    }
  }

  getRunningApp(appName: string): RunningPublishedApp | undefined {
    return this.runningApps.get(appName);
  }

  getPublishedDir(appName: string): string {
    return path.resolve(PUBLISHED_DIR, appName);
  }

  isStaticApp(appName: string): boolean {
    const publishDir = this.getPublishedDir(appName);
    return fs.existsSync(publishDir) && fs.existsSync(path.join(publishDir, "index.html"));
  }

  private detectProjectType(projectDir: string): "vite" | "react" | "node-server" | "static-html" | "unknown" {
    const pkgPath = path.join(projectDir, "package.json");
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
        const hasViteConfig = fs.existsSync(path.join(projectDir, "vite.config.ts")) ||
          fs.existsSync(path.join(projectDir, "vite.config.js")) ||
          fs.existsSync(path.join(projectDir, "vite.config.mjs"));
        const hasViteDep = pkg.devDependencies?.vite || pkg.dependencies?.vite;
        if (hasViteConfig || hasViteDep) return "vite";

        const hasReact = pkg.dependencies?.react || pkg.devDependencies?.react;
        if (hasReact && pkg.scripts?.build) return "react";

        const hasExpress = pkg.dependencies?.express || pkg.dependencies?.fastify || pkg.dependencies?.koa;
        if (hasExpress) return "node-server";

        if (pkg.scripts?.start || pkg.main) return "node-server";
      } catch {}
    }

    if (fs.existsSync(path.join(projectDir, "index.html"))) return "static-html";
    return "unknown";
  }

  private detectServerStartCommand(projectDir: string): string | null {
    const pkgPath = path.join(projectDir, "package.json");
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
        if (pkg.scripts?.start) return "npm start";
        if (pkg.main) return `node ${pkg.main}`;
      } catch {}
    }
    if (fs.existsSync(path.join(projectDir, "server.js"))) return "node server.js";
    if (fs.existsSync(path.join(projectDir, "index.js"))) return "node index.js";
    if (fs.existsSync(path.join(projectDir, "app.js"))) return "node app.js";
    return null;
  }

  private copyDir(src: string, dest: string): void {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      if (entry.isDirectory()) {
        this.copyDir(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }

  private async syncPortCounter(): Promise<void> {
    try {
      const apps = await storage.getPublishedApps();
      let maxPort = 3999;
      for (const app of apps) {
        if (app.port && app.port >= maxPort) {
          maxPort = app.port;
        }
      }
      this.nextPublishPort = maxPort + 1;
    } catch {}
  }

  async restoreRunningApps(): Promise<void> {
    try {
      await this.syncPortCounter();
      const apps = await storage.getPublishedApps();
      for (const app of apps) {
        if (app.type === "fullstack" && app.status === "running") {
          try {
            await this.restartApp(app.name);
          } catch (err: any) {
            console.error(`Failed to restore published app ${app.name}:`, err.message);
            await storage.updatePublishedApp(app.id, { status: "stopped" });
          }
        }
      }
    } catch (err: any) {
      console.error("Failed to restore published apps:", err.message);
    }
  }
}

export const publishManager = new PublishManager();
