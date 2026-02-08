import { spawn, ChildProcess } from "child_process";
import * as path from "path";
import * as fs from "fs";
import { EventEmitter } from "events";

const PROJECTS_DIR = path.resolve(process.cwd(), "projects");

interface RunningProject {
  process: ChildProcess;
  projectPath: string;
  port: number;
  logs: string[];
  status: "starting" | "running" | "stopped" | "error";
}

class ProjectRunner extends EventEmitter {
  private projects: Map<string, RunningProject> = new Map();
  private nextPort = 3100;

  getStatus(projectPath: string): { status: string; port?: number; logs: string[] } {
    const project = this.projects.get(projectPath);
    if (!project) return { status: "stopped", logs: [] };
    return { status: project.status, port: project.port, logs: project.logs };
  }

  getLogs(projectPath: string, since?: number): string[] {
    const project = this.projects.get(projectPath);
    if (!project) return [];
    if (since !== undefined) return project.logs.slice(since);
    return project.logs;
  }

  async start(projectPath: string): Promise<{ port: number }> {
    const existing = this.projects.get(projectPath);
    if (existing && existing.status !== "stopped" && existing.status !== "error") {
      return { port: existing.port };
    }

    const projectDir = path.resolve(PROJECTS_DIR, projectPath);
    if (!projectDir.startsWith(PROJECTS_DIR)) throw new Error("Invalid project path");
    if (!fs.existsSync(projectDir)) throw new Error("Project directory not found");

    const port = this.nextPort++;
    const startCmd = this.detectStartCommand(projectDir, port);
    if (!startCmd) throw new Error("Could not detect how to start this project. Ensure package.json has a 'start' or 'dev' script, or there's an index.html file.");

    const logs: string[] = [];
    const env = { ...process.env, PORT: String(port) };

    const child = spawn("sh", ["-c", startCmd], {
      cwd: projectDir,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const project: RunningProject = {
      process: child,
      projectPath,
      port,
      logs,
      status: "starting",
    };
    this.projects.set(projectPath, project);

    const addLog = (line: string) => {
      project.logs.push(line);
      if (project.logs.length > 1000) project.logs.splice(0, project.logs.length - 1000);
      this.emit("log", projectPath, line);
    };

    const tryDetectPort = (line: string) => {
      const portPatterns = [
        /https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0):(\d+)/i,
        /(?:listening|running|started|serving|ready)\s+(?:on|at)\s+(?:port\s+)?(\d+)/i,
        /port\s+(\d+)/i,
        /Local:\s+https?:\/\/[^:]+:(\d+)/i,
      ];
      for (const pattern of portPatterns) {
        const match = line.match(pattern);
        if (match) {
          const detectedPort = parseInt(match[1], 10);
          if (detectedPort > 0 && detectedPort < 65536 && detectedPort !== project.port) {
            project.port = detectedPort;
            this.emit("port_changed", projectPath, detectedPort);
          }
          return true;
        }
      }
      return false;
    };

    child.stdout?.on("data", (data: Buffer) => {
      const text = data.toString();
      text.split("\n").filter(Boolean).forEach(line => {
        addLog(line);
        const portFound = tryDetectPort(line);
        if (project.status === "starting" && (portFound || line.toLowerCase().includes("listening") || line.toLowerCase().includes("ready") || line.toLowerCase().includes("started") || line.match(/port\s+\d+/i))) {
          project.status = "running";
          this.emit("status", projectPath, "running");
        }
      });
    });

    child.stderr?.on("data", (data: Buffer) => {
      const text = data.toString();
      text.split("\n").filter(Boolean).forEach(line => {
        addLog(`[stderr] ${line}`);
        tryDetectPort(line);
      });
    });

    child.on("exit", (code) => {
      project.status = "stopped";
      addLog(`Process exited with code ${code}`);
      this.emit("status", projectPath, "stopped");
    });

    child.on("error", (err) => {
      project.status = "error";
      addLog(`Process error: ${err.message}`);
      this.emit("status", projectPath, "error");
    });

    setTimeout(() => {
      if (project.status === "starting") {
        project.status = "running";
        this.emit("status", projectPath, "running");
      }
    }, 8000);

    return { port };
  }

  stop(projectPath: string): void {
    const project = this.projects.get(projectPath);
    if (!project) return;
    try {
      project.process.kill("SIGTERM");
      setTimeout(() => {
        try { project.process.kill("SIGKILL"); } catch {}
      }, 5000);
    } catch {}
    project.status = "stopped";
    this.emit("status", projectPath, "stopped");
  }

  private detectStartCommand(projectDir: string, port: number): string | null {
    const pkgPath = path.join(projectDir, "package.json");
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
        const isVite = this.isViteProject(projectDir, pkg);

        if (isVite) {
          return `npx vite --port ${port} --host 0.0.0.0`;
        }
        if (pkg.scripts?.dev) return "npm run dev";
        if (pkg.scripts?.start) return "npm start";
        if (pkg.main) return `node ${pkg.main}`;
      } catch {}
    }

    const mainPy = path.join(projectDir, "main.py");
    if (fs.existsSync(mainPy)) return "python3 main.py";
    const appPy = path.join(projectDir, "app.py");
    if (fs.existsSync(appPy)) return "python3 app.py";

    const staticServePath = path.resolve(process.cwd(), "server", "static-serve.cjs");

    const indexHtml = path.join(projectDir, "index.html");
    if (fs.existsSync(indexHtml)) return `node ${staticServePath} ${port} .`;

    const publicIndexHtml = path.join(projectDir, "public", "index.html");
    if (fs.existsSync(publicIndexHtml)) return `node ${staticServePath} ${port} public`;

    const srcIndexHtml = path.join(projectDir, "src", "index.html");
    if (fs.existsSync(srcIndexHtml)) return `node ${staticServePath} ${port} src`;

    const indexJs = path.join(projectDir, "index.js");
    if (fs.existsSync(indexJs)) return "node index.js";
    const serverJs = path.join(projectDir, "server.js");
    if (fs.existsSync(serverJs)) return "node server.js";

    return null;
  }

  private isViteProject(projectDir: string, pkg: any): boolean {
    const hasViteConfig = fs.existsSync(path.join(projectDir, "vite.config.ts")) ||
      fs.existsSync(path.join(projectDir, "vite.config.js")) ||
      fs.existsSync(path.join(projectDir, "vite.config.mjs"));
    const hasViteDep = pkg.devDependencies?.vite || pkg.dependencies?.vite;
    return !!(hasViteConfig || hasViteDep);
  }
}

export const projectRunner = new ProjectRunner();
