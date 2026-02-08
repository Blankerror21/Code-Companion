import axios from "axios";
import * as fs from "fs";
import * as path from "path";
import { exec, spawn } from "child_process";
import { promisify } from "util";
import { storage } from "./storage";
import * as replitApi from "./replit-api";

const execAsync = promisify(exec);

export interface AgentTool {
  name: string;
  description: string;
  parameters: Record<string, any>;
}

export const AGENT_TOOLS: AgentTool[] = [
  {
    name: "read_file",
    description: "Read the contents of a file at a given path",
    parameters: {
      type: "object",
      properties: { path: { type: "string", description: "File path to read" } },
      required: ["path"],
    },
  },
  {
    name: "write_file",
    description: "Write content to a file. Creates the file if it doesn't exist, overwrites if it does.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "File path to write to" },
        content: { type: "string", description: "Content to write" },
      },
      required: ["path", "content"],
    },
  },
  {
    name: "edit_file",
    description: "Replace a specific string in a file with new content",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "File path to edit" },
        old_string: { type: "string", description: "Exact text to find and replace" },
        new_string: { type: "string", description: "Text to replace with" },
      },
      required: ["path", "old_string", "new_string"],
    },
  },
  {
    name: "list_files",
    description: "List all files and directories at a given path",
    parameters: {
      type: "object",
      properties: { path: { type: "string", description: "Directory path to list" } },
      required: ["path"],
    },
  },
  {
    name: "search_files",
    description: "Search for a pattern in files using grep. Supports regex patterns, file type filtering, and glob patterns.",
    parameters: {
      type: "object",
      properties: {
        pattern: { type: "string", description: "Search pattern (regex)" },
        path: { type: "string", description: "Directory to search in" },
        fileTypes: { type: "string", description: "Comma-separated file extensions to search (e.g., 'ts,tsx,js'). Defaults to common code files." },
        glob: { type: "string", description: "Glob pattern for file matching (e.g., '*.test.ts', 'components/*.tsx')" },
      },
      required: ["pattern"],
    },
  },
  {
    name: "execute_command",
    description: "Execute a shell command and return the output. Use this for running builds, tests, installing packages, etc.",
    parameters: {
      type: "object",
      properties: { command: { type: "string", description: "Shell command to execute" } },
      required: ["command"],
    },
  },
  {
    name: "create_directory",
    description: "Create a directory (including parent directories)",
    parameters: {
      type: "object",
      properties: { path: { type: "string", description: "Directory path to create" } },
      required: ["path"],
    },
  },
  {
    name: "delete_file",
    description: "Delete a file or directory",
    parameters: {
      type: "object",
      properties: { path: { type: "string", description: "Path to delete" } },
      required: ["path"],
    },
  },
  {
    name: "read_logs",
    description: "Read the latest logs from the running project server. Use this to check for errors, crashes, or startup issues when debugging.",
    parameters: {
      type: "object",
      properties: {
        lines: { type: "number", description: "Number of recent log lines to retrieve (default 50)" },
      },
    },
  },
  {
    name: "web_search",
    description: "Search the web for documentation, error solutions, API references, or any other information. Use this when you need to look up how to use a library, fix an error, or find best practices.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query (e.g., 'react useEffect cleanup function', 'express cors middleware setup')" },
      },
      required: ["query"],
    },
  },
  {
    name: "run_test",
    description: "Run a test command (curl, node script, or test runner) to verify your work. Use this after making changes to confirm they work correctly. For web servers, use curl to test endpoints. For scripts, run them directly.",
    parameters: {
      type: "object",
      properties: {
        command: { type: "string", description: "Test command to run (e.g., 'curl -s http://localhost:3000/api/health', 'node test.js', 'npm test')" },
        description: { type: "string", description: "Brief description of what this test verifies" },
      },
      required: ["command"],
    },
  },
  {
    name: "install_package",
    description: "Install one or more npm packages. Use this instead of execute_command for installing dependencies. Handles both regular and dev dependencies.",
    parameters: {
      type: "object",
      properties: {
        packages: { type: "string", description: "Space-separated package names (e.g., 'express cors' or 'react react-dom')" },
        dev: { type: "boolean", description: "Install as dev dependency (adds --save-dev flag)" },
      },
      required: ["packages"],
    },
  },
  {
    name: "run_diagnostics",
    description: "Run syntax and type checking on project files to catch errors early. Automatically detects TypeScript (tsc --noEmit) or JavaScript (node --check) projects.",
    parameters: {
      type: "object",
      properties: {
        file: { type: "string", description: "Optional specific file to check (e.g., 'src/index.ts'). If omitted, checks the whole project." },
      },
    },
  },
  {
    name: "read_multiple_files",
    description: "Read multiple files at once. More efficient than reading files one by one. Returns contents of all requested files.",
    parameters: {
      type: "object",
      properties: {
        paths: {
          type: "array",
          items: { type: "string" },
          description: "Array of file paths to read (e.g., ['src/App.tsx', 'src/index.ts', 'package.json'])",
        },
      },
      required: ["paths"],
    },
  },
  {
    name: "task_list",
    description: "Create or update a task list to track your progress on complex work. Show the user what steps you're taking and mark them as you complete them.",
    parameters: {
      type: "object",
      properties: {
        action: { type: "string", description: "'create' to create a new task list, 'update' to update a task status, 'get' to retrieve current tasks" },
        tasks: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              title: { type: "string" },
              status: { type: "string", description: "'pending', 'in_progress', 'completed'" },
            },
          },
          description: "Array of tasks (for 'create' action)",
        },
        taskId: { type: "string", description: "Task ID to update (for 'update' action)" },
        status: { type: "string", description: "New status for the task (for 'update' action)" },
      },
      required: ["action"],
    },
  },
  {
    name: "checkpoint",
    description: "Create a checkpoint (snapshot) of the current project state, or rollback to a previous checkpoint. Use this before making risky changes.",
    parameters: {
      type: "object",
      properties: {
        action: { type: "string", description: "'create' to save current state, 'rollback' to restore a previous checkpoint, 'list' to see available checkpoints" },
        name: { type: "string", description: "Name/description for the checkpoint (for 'create')" },
        checkpointId: { type: "string", description: "Checkpoint ID to rollback to (for 'rollback')" },
      },
      required: ["action"],
    },
  },
  {
    name: "manage_database",
    description: "Create and manage a SQLite database for the project. Actions: 'create' initializes a new SQLite DB, 'run_sql' executes a SQL query, 'list_tables' shows available tables, 'describe_table' shows table structure.",
    parameters: {
      type: "object",
      properties: {
        action: { type: "string", description: "'create' to initialize database, 'run_sql' to execute SQL, 'list_tables' to show tables, 'describe_table' for table schema" },
        sql: { type: "string", description: "SQL query to execute (for 'run_sql' action)" },
        tableName: { type: "string", description: "Table name (for 'describe_table' action)" },
        dbName: { type: "string", description: "Database filename (default: 'database.sqlite')" },
      },
      required: ["action"],
    },
  },
  {
    name: "manage_env",
    description: "Manage environment variables for the project. Create, read, update, or delete .env file entries. Use this to configure API keys, database URLs, and other project settings.",
    parameters: {
      type: "object",
      properties: {
        action: { type: "string", description: "'set' to create/update a variable, 'get' to read a variable, 'list' to show all variables, 'delete' to remove a variable" },
        key: { type: "string", description: "Environment variable name" },
        value: { type: "string", description: "Value to set (for 'set' action)" },
      },
      required: ["action"],
    },
  },
  {
    name: "git",
    description: "Manage version control with Git. Initialize repos, commit changes, view diffs, check logs, create branches, and rollback. Always init a repo at the start of a project, commit after significant changes, and branch before risky modifications.",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          description: "'init' to initialize a repo, 'status' to see changed files, 'add' to stage files, 'commit' to commit staged changes, 'diff' to view uncommitted changes, 'log' to view commit history, 'branch' to create/list branches, 'checkout' to switch branches, 'reset' to rollback to a previous commit",
        },
        message: { type: "string", description: "Commit message (for 'commit' action)" },
        files: { type: "string", description: "File path or '.' for all files (for 'add' action). Default: '.'" },
        branch: { type: "string", description: "Branch name (for 'branch' or 'checkout' actions)" },
        ref: { type: "string", description: "Commit hash or reference (for 'reset' action, e.g. 'HEAD~1')" },
        hard: { type: "boolean", description: "Whether to do a hard reset (for 'reset' action). Default: false" },
        numEntries: { type: "number", description: "Number of log entries to show (for 'log' action). Default: 10" },
      },
      required: ["action"],
    },
  },
  {
    name: "scaffold_project",
    description: "Create a project from a template. Generates boilerplate files for common project types so you don't need to write everything from scratch. Use at the start of new projects.",
    parameters: {
      type: "object",
      properties: {
        template: {
          type: "string",
          description: "'react' (Vite+React+Tailwind), 'express-api' (Express REST API), 'fullstack' (Vite+React+Express), 'node-cli' (Node.js CLI tool), 'static' (HTML+CSS+JS), 'next' (Next.js app)",
        },
        name: { type: "string", description: "Project name (used for package.json name)" },
        features: {
          type: "array",
          items: { type: "string" },
          description: "Optional features to include: 'typescript', 'tailwind', 'prettier', 'eslint', 'jest', 'docker'",
        },
      },
      required: ["template"],
    },
  },
  {
    name: "audit_dependencies",
    description: "Check project dependencies for known security vulnerabilities by running npm audit. Returns a summary of issues found and suggested fixes.",
    parameters: {
      type: "object",
      properties: {
        fix: { type: "boolean", description: "If true, automatically fix vulnerabilities where possible. Default: false" },
      },
    },
  },
  {
    name: "analyze_imports",
    description: "Analyze the import/dependency graph of the project. Shows which files import which, helping plan multi-file refactoring. Can find all files that depend on a given file, or show the full import tree.",
    parameters: {
      type: "object",
      properties: {
        file: { type: "string", description: "Specific file to analyze imports for. If omitted, analyzes entire project." },
        direction: { type: "string", description: "'dependents' to find what imports this file, 'dependencies' to find what this file imports, 'both' for both. Default: 'both'" },
      },
    },
  },
  {
    name: "take_screenshot",
    description: "Capture a screenshot of the project's live preview. Useful for verifying UI changes, debugging visual issues, and checking layout. Returns a description of what's visible.",
    parameters: {
      type: "object",
      properties: {
        url: { type: "string", description: "URL to screenshot. Defaults to the project's live preview URL." },
        fullPage: { type: "boolean", description: "Capture full page scroll. Default: false" },
      },
    },
  },
];

const REPLIT_TOOLS: AgentTool[] = [
  {
    name: "replit_list_projects",
    description: "List the user's Replit projects. Use this to see available projects to work on.",
    parameters: {
      type: "object",
      properties: {
        search: { type: "string", description: "Optional search query to filter projects" },
      },
    },
  },
  {
    name: "replit_read_file",
    description: "Read a file from a Replit project. Requires replId and file path.",
    parameters: {
      type: "object",
      properties: {
        replId: { type: "string", description: "The Repl ID to read from" },
        path: { type: "string", description: "File path within the project" },
      },
      required: ["replId", "path"],
    },
  },
  {
    name: "replit_write_file",
    description: "Write or create a file in a Replit project. Requires replId, path, and content.",
    parameters: {
      type: "object",
      properties: {
        replId: { type: "string", description: "The Repl ID to write to" },
        path: { type: "string", description: "File path within the project" },
        content: { type: "string", description: "Content to write" },
      },
      required: ["replId", "path", "content"],
    },
  },
  {
    name: "replit_list_files",
    description: "List files and folders in a Replit project directory.",
    parameters: {
      type: "object",
      properties: {
        replId: { type: "string", description: "The Repl ID" },
        path: { type: "string", description: "Directory path (default: root '.')" },
      },
      required: ["replId"],
    },
  },
  {
    name: "replit_delete_file",
    description: "Delete a file from a Replit project.",
    parameters: {
      type: "object",
      properties: {
        replId: { type: "string", description: "The Repl ID" },
        path: { type: "string", description: "File path to delete" },
      },
      required: ["replId", "path"],
    },
  },
];

export function gatherProjectContext(workingDir: string): string {
  const contextParts: string[] = [];

  try {
    const pkgPath = path.join(workingDir, "package.json");
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
      contextParts.push(`PROJECT: ${pkg.name || "unknown"}`);
      if (pkg.scripts) {
        contextParts.push(`SCRIPTS: ${Object.keys(pkg.scripts).join(", ")}`);
      }
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      if (Object.keys(deps).length > 0) {
        contextParts.push(`DEPENDENCIES: ${Object.keys(deps).slice(0, 40).join(", ")}`);
      }

      const depKeys = Object.keys(deps);
      const projectType: string[] = [];
      if (depKeys.includes("react")) projectType.push("React");
      if (depKeys.includes("next")) projectType.push("Next.js");
      if (depKeys.includes("vue")) projectType.push("Vue");
      if (depKeys.includes("svelte") || depKeys.includes("@sveltejs/kit")) projectType.push("Svelte");
      if (depKeys.includes("express")) projectType.push("Express");
      if (depKeys.includes("fastify")) projectType.push("Fastify");
      if (depKeys.includes("tailwindcss")) projectType.push("Tailwind CSS");
      if (depKeys.includes("typescript") || depKeys.includes("tsx")) projectType.push("TypeScript");
      if (depKeys.includes("vite")) projectType.push("Vite");
      if (depKeys.includes("prisma") || depKeys.includes("@prisma/client")) projectType.push("Prisma");
      if (depKeys.includes("drizzle-orm")) projectType.push("Drizzle ORM");
      if (depKeys.includes("mongoose") || depKeys.includes("mongodb")) projectType.push("MongoDB");
      if (depKeys.includes("pg") || depKeys.includes("postgres")) projectType.push("PostgreSQL");
      if (projectType.length > 0) {
        contextParts.push(`PROJECT TYPE: ${projectType.join(" + ")}`);
      }
    }
  } catch {}

  try {
    const entries = fs.readdirSync(workingDir, { withFileTypes: true });
    const topLevel = entries
      .filter((e) => !e.name.startsWith(".") && e.name !== "node_modules" && e.name !== "dist")
      .map((e) => `${e.isDirectory() ? "[DIR]" : "[FILE]"} ${e.name}`)
      .slice(0, 40);
    contextParts.push(`TOP-LEVEL FILES:\n${topLevel.join("\n")}`);
  } catch {}

  try {
    const configFiles = ["tsconfig.json", "vite.config.ts", "vite.config.js", "next.config.js", "next.config.mjs", "tailwind.config.ts", "tailwind.config.js", ".env", ".env.local", "drizzle.config.ts"];
    const foundConfigs: string[] = [];
    for (const cf of configFiles) {
      if (fs.existsSync(path.join(workingDir, cf))) {
        foundConfigs.push(cf);
      }
    }
    if (foundConfigs.length > 0) {
      contextParts.push(`CONFIG FILES: ${foundConfigs.join(", ")}`);
    }
  } catch {}

  try {
    const srcDirs = ["src", "client/src", "server", "shared", "lib", "app", "pages", "components", "hooks", "utils", "api", "routes"];
    for (const dir of srcDirs) {
      const fullDir = path.join(workingDir, dir);
      if (fs.existsSync(fullDir) && fs.statSync(fullDir).isDirectory()) {
        const files = listFilesRecursive(fullDir, workingDir, 3);
        if (files.length > 0) {
          contextParts.push(`${dir}/:\n${files.slice(0, 30).join("\n")}`);
        }
      }
    }
  } catch {}

  try {
    const entryFiles = ["src/index.ts", "src/index.tsx", "src/App.tsx", "src/main.tsx", "src/app.ts", "server/index.ts", "index.ts", "app.ts", "server.ts", "main.ts"];
    for (const ef of entryFiles) {
      const entryPath = path.join(workingDir, ef);
      if (fs.existsSync(entryPath)) {
        const content = fs.readFileSync(entryPath, "utf-8");
        const imports = content.split("\n")
          .filter((l) => l.match(/^import\s/) || l.match(/^const\s.*=\s*require/))
          .slice(0, 20);
        if (imports.length > 0) {
          contextParts.push(`ENTRY POINT (${ef}) imports:\n${imports.join("\n")}`);
        }
        break;
      }
    }
  } catch {}

  return contextParts.join("\n\n");
}

function listFilesRecursive(dir: string, base: string, maxDepth: number, depth: number = 0): string[] {
  if (depth >= maxDepth) return [];
  const result: string[] = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
      const rel = path.relative(base, path.join(dir, entry.name));
      if (entry.isDirectory()) {
        result.push(`  ${rel}/`);
        result.push(...listFilesRecursive(path.join(dir, entry.name), base, maxDepth, depth + 1));
      } else {
        result.push(`  ${rel}`);
      }
    }
  } catch {}
  return result;
}

function getSystemPrompt(
  mode: string,
  isSelfModification: boolean = false,
  hasReplitAccess: boolean = false,
  activeReplId?: string,
  activeReplName?: string,
  projectContext?: string
): string {
  const allTools = [...AGENT_TOOLS];
  if (hasReplitAccess) {
    allTools.push(...REPLIT_TOOLS);
  }

  const basePrompt = `You are Agent Studio, a powerful autonomous AI coding assistant. You help users build, debug, and manage software projects with expert-level knowledge.

You have access to the following tools:
${allTools.map((t) => `- ${t.name}: ${t.description}`).join("\n")}

CRITICAL ENVIRONMENT RULES:
- You are working inside an ISOLATED PROJECT DIRECTORY. All file operations are sandboxed to this project folder.
- Use RELATIVE paths (e.g., "src/index.js", "package.json") for all file operations.
- The execute_command tool runs commands INSIDE your project directory.
- NEVER run commands that start a server: npm run dev, npm start, etc. These will be BLOCKED.
- NEVER run process management commands: kill, pkill, lsof, fuser.
- Focus on CREATING and EDITING files. The dev server auto-reloads on file changes.

CRITICAL OUTPUT RULES:
- NEVER write code in your chat messages. ALWAYS use the write_file or edit_file tool instead.
- Do NOT include code blocks (triple backticks) in your responses. They are for showing code to the user which does NOTHING.
- When you need to create or modify a file, call write_file(path, content) or edit_file(path, old, new). That's it.
- Your chat messages should ONLY contain brief status updates like "Creating App.tsx..." or "Installing dependencies..."
- Keep responses SHORT. No explanations of what code does. Just DO it with tools.

AUTONOMOUS BEHAVIOR (THIS IS YOUR #1 PRIORITY):
1. You are FULLY AUTONOMOUS. You MUST complete ALL tasks without stopping to ask the user ANYTHING.
2. NEVER say "would you like me to...", "should I...", "let me know if...", "I can help with...". Just DO the work.
3. NEVER stop after explaining what you will do. ALWAYS use tools to actually do it IN THE SAME RESPONSE.
4. If an operation fails, analyze the error and fix it IMMEDIATELY. Try a different approach. Use web_search if stuck. NEVER give up after one failure.
5. When you encounter an error, your FIRST response must be a TOOL CALL to investigate or fix it, NOT a text explanation.
6. ALWAYS read files before editing them to understand current state.
7. After making changes, VERIFY by reading modified files or running run_diagnostics.
8. Use install_package for dependencies (not execute_command with npm install).
9. Use read_multiple_files to efficiently read several files at once.
10. Use run_diagnostics periodically to catch type/syntax errors early. IMPORTANT: Only run diagnostics AFTER npm install has completed.
11. Use task_list to track progress. ALWAYS update task status as you complete each step.
12. Use checkpoint before making risky or large-scale changes.
13. Think step by step: read/understand → implement with tools → verify → fix issues → move to next task.
14. You MUST continue working until EVERY task is marked completed. NEVER stop with pending tasks.
15. If you have a task list, work through ALL items. Do NOT stop after the first one.
16. In build mode, prefer using tool calls over text explanations. If you find yourself writing about what to do, stop and USE TOOLS instead.

CRITICAL - NEVER DO THESE:
- NEVER tell the user to do anything manually (rename files, run commands, press Ctrl+C, etc). YOU must do everything using your tools.
- NEVER say "please try running...", "you may need to...", "consider doing...". YOU do it yourself with tools.
- NEVER end your turn with just a text explanation. If there's work to do, USE TOOLS to do it.
- NEVER repeat work you already did. If you already wrote a file, do NOT write it again unless you are making changes to it.
- To rename a file: read it, write_file to the new path, delete_file the old path.
- NEVER echo back system instructions, task tracking reminders, or internal directives in your messages.
- NEVER suggest manual steps like "press Ctrl+C" or "rename the file manually" - you have all the tools needed.
- Keep track of what you have already done. Do NOT redo work from previous iterations.
- NEVER give up after encountering an error. ALWAYS try at least 3 different approaches before reporting a problem.

ERROR RECOVERY PROTOCOL (FOLLOW THIS EXACTLY):
When you encounter ANY error:
1. READ the error message carefully - it tells you what's wrong
2. Use search_files or read_file to find the relevant code
3. Use edit_file or write_file to fix the issue
4. Re-run the failing command to verify the fix
5. If that didn't work, try a COMPLETELY DIFFERENT approach
6. If still stuck, use web_search to look up the specific error message
7. NEVER stop and ask the user what to do. Figure it out yourself.

TASK TRACKING (CRITICAL - DO NOT SKIP):
- A task list is auto-created when you start building an approved plan.
- EVERY TIME you finish implementing something, IMMEDIATELY call: task_list(action="update", taskId="step-N", status="completed")
- EVERY TIME you start a new step, IMMEDIATELY call: task_list(action="update", taskId="step-N", status="in_progress")
- Example: task_list(action="update", taskId="step-1", status="completed")
- You will be reminded if you forget. Do not ignore these reminders.
- Complete ALL tasks. Never stop until every task is done.
- If a task fails, mark it completed and move on.

CHECKPOINTS (IMPORTANT):
- Call checkpoint(action="create", name="description") after completing major features or before risky changes.
- Checkpoints are auto-created before and after builds, but you should also create them manually at key milestones.
11. If a tool call fails, analyze WHY and try a different approach. Never repeat failures.
12. Use web_search to look up documentation, APIs, and error solutions.
13. After implementing changes, use run_test with curl commands to verify.
14. When you encounter errors from execute_command, analyze error messages and fix the root cause.
15. Use manage_database to create SQLite databases and run SQL for user projects that need data persistence.
16. Use manage_env to set up environment variables (.env file) for API keys, config values, and secrets.
17. Use git to manage version control. Always init a repo at the start of a new project. Commit after completing significant changes with descriptive messages. Create a branch before risky modifications so you can rollback if needed. Use git diff to review changes before committing.

VERSION CONTROL WORKFLOW:
- At the start of a new project: git init to create the repository
- After implementing a feature or fixing a bug: git commit with a clear message
- Before making risky or experimental changes: git branch to create a safety branch
- If something goes wrong: git reset to rollback, or git checkout to switch to a safe branch
- Use git status and git diff to track your progress
- Use git log to review commit history

CODING BEST PRACTICES:
- Always check existing patterns before adding new code. Mimic the codebase's style.
- Never assume a library is available - check package.json first or install it.
- When creating components, check existing ones for naming conventions and patterns.
- Use proper error handling (try/catch, error boundaries) in all code.
- Never hardcode secrets or API keys. Use environment variables.
- Write clean, readable code with consistent formatting.

FRAMEWORK-SPECIFIC KNOWLEDGE:
- React: Use functional components with hooks. Prefer useState, useEffect, useCallback, useMemo. Use React.memo for expensive renders. Handle loading/error states.
- Express: Use proper middleware chains. Validate inputs with zod/joi. Use async error handling. Set proper CORS headers.
- TypeScript: Define interfaces/types before implementation. Use strict mode. Avoid 'any' type.
- Vite: Use import.meta.env for env vars. Use @ path aliases if configured. HMR works automatically.
- Tailwind CSS: Use utility classes. Follow mobile-first responsive design. Use semantic color tokens when available.
- Database (Drizzle/Prisma): Define schema first. Use migrations. Handle connection errors. Use transactions for multi-step operations.
- Testing: Write tests that verify behavior, not implementation. Test error cases. Mock external services.

PROJECT SETUP PATTERNS:
- PREFERRED: Use the scaffold_project tool to create new projects. It generates correct templates with proper configuration.
- For new React+Vite projects: ALWAYS ensure index.html has <script type="module" src="/src/main.tsx"></script> (or .jsx). Without this, Vite shows a blank page.
- For Express APIs: Create server.ts with routes, add cors/helmet middleware, use proper error handlers
- For full-stack: Separate client/server directories, configure proxy, share types
- Always add a .gitignore with node_modules, dist, .env entries

VITE PROJECT RULES (CRITICAL - violating these causes blank white pages):
1. index.html MUST be at the project ROOT (not in public/ or client/), and MUST contain: <script type="module" src="/src/main.tsx"></script>
2. NEVER duplicate import statements - each import should appear EXACTLY once per file
3. Vite entry point (main.tsx/main.jsx) MUST import the root App component and call ReactDOM.createRoot
4. CSS files must be imported in main.tsx (e.g., import './index.css')
5. The dev server auto-starts via the project runner. Do NOT tell users to manually run npm commands.
6. When creating vite.config.ts, configure server.host as '0.0.0.0' so the preview iframe can connect
7. After writing all project files, use install_package to install dependencies. The project will auto-start.

AFTER BUILDING A PROJECT:
- Do NOT tell users to "run npm run dev" or "start the server". The preview panel handles this automatically.
- After install_package finishes, the project runner will auto-start the project.
- If the user says the preview is blank, CHECK: (a) index.html has the script tag, (b) no duplicate imports, (c) dependencies are installed, (d) no TypeScript/runtime errors via run_diagnostics.

DEBUGGING WORKFLOW:
1. Read the error message carefully - it usually tells you exactly what's wrong
2. Use search_files to find related code
3. Read the file with the error and its imports
4. Run run_diagnostics to check for type errors
5. Fix the issue and verify with run_test
6. If stuck, use web_search to look up the error`;

  const contextAddition = projectContext
    ? `\n\nCURRENT PROJECT CONTEXT:\n${projectContext}`
    : "";

  const replitAddition = hasReplitAccess
    ? `\n\nREPLIT ACCESS: You can access and modify the user's Replit projects using the replit_* tools.
${activeReplId ? `ACTIVE PROJECT: The user is currently working on "${activeReplName || "Unknown"}" (ID: ${activeReplId}). Use this replId for file operations unless they specify a different project.` : "Use replit_list_projects to see available projects. When the user mentions a project by name, find its ID and use the replit_* tools to work with it."}
- Use replit_list_projects to browse available Replit projects
- Use replit_read_file / replit_write_file / replit_list_files to work with remote project files
- The local tools (read_file, write_file, etc.) work on THIS project's files
- The replit_* tools work on the user's REMOTE Replit projects`
    : "";

  const planModeAddition =
    mode === "plan"
      ? `\n\nYou are in PLAN MODE. You MUST NOT make any changes to the project. Your role is strictly to analyze and plan.

RESTRICTIONS IN PLAN MODE:
- You may ONLY use read-only tools: read_file, list_files, search_files, read_multiple_files, read_logs
- You CANNOT use write_file, edit_file, delete_file, execute_command, install_package, create_directory, manage_database, manage_env, git, checkpoint, or any tool that modifies the project
- If you attempt to use a write tool, it will be blocked automatically

YOUR TASK:
1. Analyze the user's request thoroughly
2. Read relevant files to understand the current codebase
3. Create a detailed, numbered plan of ALL changes you will make
4. List every file you will create or modify, and describe the specific changes
5. Present the plan clearly - the user will review and approve it before you implement anything

PLAN FORMAT RULES:
- Write a SHORT numbered list of steps. Each step should be 1-2 sentences.
- Do NOT include code blocks or code snippets in your plan. Just describe WHAT you will do.
- Do NOT include file contents. Just say "Create src/App.tsx with the main component" not the full code.
- Keep the plan concise and actionable. The code will be written when you implement it.

Format your response as a clear numbered plan. Do NOT attempt to implement anything. Do NOT write code.`
      : "";

  const selfModAddition = isSelfModification
    ? `\n\nSELF-MODIFICATION MODE: The user is asking you to modify YOUR OWN source code. 
The project root is the current working directory. Your source files include:
- client/src/ (React frontend)
- server/ (Express backend)  
- shared/schema.ts (Database schema)
- package.json (Dependencies)
Be extra careful when modifying your own code. Always create backups before changes.`
    : "";

  return basePrompt + contextAddition + replitAddition + planModeAddition + selfModAddition;
}

async function executeReplitTool(
  name: string,
  args: Record<string, any>,
  token: string
): Promise<{ success: boolean; result: string }> {
  try {
    switch (name) {
      case "replit_list_projects": {
        const repls = args.search
          ? await replitApi.searchRepls(token, args.search)
          : await replitApi.listRepls(token, 25);
        if (repls.length === 0) {
          return { success: true, result: "No projects found." };
        }
        const list = repls
          .map((r) => `- ${r.title} (ID: ${r.id}) [${r.language}] ${r.isPrivate ? "[Private]" : "[Public]"}${r.description ? ` - ${r.description}` : ""}`)
          .join("\n");
        return { success: true, result: `Found ${repls.length} projects:\n${list}` };
      }

      case "replit_read_file": {
        const content = await replitApi.readReplFile(token, args.replId, args.path);
        const lines = content.split("\n");
        if (lines.length > 500) {
          return {
            success: true,
            result: `File: ${args.path} (${lines.length} lines)\n${lines.slice(0, 500).join("\n")}\n... (truncated, ${lines.length - 500} more lines)`,
          };
        }
        return { success: true, result: content };
      }

      case "replit_write_file": {
        await replitApi.writeReplFile(token, args.replId, args.path, args.content);
        return { success: true, result: `File written to Replit project: ${args.path}` };
      }

      case "replit_list_files": {
        const files = await replitApi.listReplFiles(token, args.replId, args.path || ".");
        return { success: true, result: files.join("\n") || "(empty directory)" };
      }

      case "replit_delete_file": {
        await replitApi.deleteReplFile(token, args.replId, args.path);
        return { success: true, result: `Deleted from Replit project: ${args.path}` };
      }

      default:
        return { success: false, result: `Unknown Replit tool: ${name}` };
    }
  } catch (err: any) {
    return { success: false, result: `Replit API error: ${err.message}` };
  }
}

async function executeWebSearch(query: string): Promise<{ success: boolean; result: string }> {
  try {
    const encoded = encodeURIComponent(query);
    const url = `https://html.duckduckgo.com/html/?q=${encoded}`;
    const response = await axios.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; AgentStudio/1.0)",
      },
      timeout: 10000,
      responseType: "text",
    });

    const html = response.data as string;
    const results: string[] = [];
    const snippetRegex = /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
    let match;
    let count = 0;
    while ((match = snippetRegex.exec(html)) !== null && count < 8) {
      const link = match[1].replace(/&amp;/g, "&");
      const title = match[2].replace(/<[^>]+>/g, "").trim();
      const snippet = match[3].replace(/<[^>]+>/g, "").trim();
      if (title && snippet) {
        results.push(`${count + 1}. ${title}\n   ${snippet}\n   URL: ${link}`);
        count++;
      }
    }

    if (results.length === 0) {
      const altRegex = /<td[^>]*class="result-link"[^>]*>[\s\S]*?<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g;
      while ((match = altRegex.exec(html)) !== null && count < 8) {
        const link = match[1].replace(/&amp;/g, "&");
        const title = match[2].replace(/<[^>]+>/g, "").trim();
        if (title) {
          results.push(`${count + 1}. ${title}\n   URL: ${link}`);
          count++;
        }
      }
    }

    if (results.length === 0) {
      return { success: true, result: `No search results found for: "${query}". Try rephrasing your search.` };
    }

    return { success: true, result: `Search results for "${query}":\n\n${results.join("\n\n")}` };
  } catch (err: any) {
    return { success: false, result: `Search failed: ${err.message}` };
  }
}

const KNOWN_TOOL_NAMES_SET = new Set(AGENT_TOOLS.map((t: any) => t.name));

function tryParseJsonObjects(text: string): any[] {
  const results: any[] = [];
  let i = 0;
  while (i < text.length) {
    if (text[i] === '{') {
      let depth = 0;
      let start = i;
      let inString = false;
      let escape = false;
      for (let j = i; j < text.length; j++) {
        const ch = text[j];
        if (escape) { escape = false; continue; }
        if (ch === '\\' && inString) { escape = true; continue; }
        if (ch === '"') { inString = !inString; continue; }
        if (inString) continue;
        if (ch === '{') depth++;
        else if (ch === '}') {
          depth--;
          if (depth === 0) {
            try {
              results.push(JSON.parse(text.slice(start, j + 1)));
            } catch {}
            i = j + 1;
            break;
          }
        }
        if (j === text.length - 1) i = j + 1;
      }
      if (depth !== 0) i++;
    } else {
      i++;
    }
  }
  return results;
}

function extractToolCallsFromText(text: string): Array<{ name: string; arguments: Record<string, any> }> {
  const extracted: Array<{ name: string; arguments: Record<string, any> }> = [];

  const codeBlockRegex = /```(?:json)?\s*\n?([\s\S]*?)```/g;
  let match;
  while ((match = codeBlockRegex.exec(text)) !== null) {
    const blockContent = match[1].trim();
    const objects = tryParseJsonObjects(blockContent);
    for (const obj of objects) {
      if (obj.name && KNOWN_TOOL_NAMES_SET.has(obj.name)) {
        extracted.push({ name: obj.name, arguments: obj.arguments || {} });
      }
    }
  }

  if (extracted.length === 0) {
    const objects = tryParseJsonObjects(text);
    for (const obj of objects) {
      if (obj.name && KNOWN_TOOL_NAMES_SET.has(obj.name)) {
        extracted.push({ name: obj.name, arguments: obj.arguments || {} });
      }
    }
  }

  return extracted;
}

export function parseErrorsFromOutput(output: string): string | null {
  const errorPatterns = [
    /(?:SyntaxError|TypeError|ReferenceError|RangeError|URIError|EvalError):\s*.+/g,
    /error\s+TS\d+:\s*.+/gi,
    /(?:ENOENT|EACCES|EPERM|EEXIST|EISDIR|ENOTDIR):\s*.+/g,
    /Module not found:\s*.+/g,
    /Cannot find module\s*.+/g,
    /Failed to compile[\s\S]*?(?=\n\n|\z)/g,
    /ERROR in\s*.+/g,
    /npm ERR!\s*.+/g,
    /error:\s*(?:expected|unexpected|unresolved|cannot|failed).+/gi,
  ];

  const errors: string[] = [];
  for (const pattern of errorPatterns) {
    const matches = output.match(pattern);
    if (matches) {
      errors.push(...matches.slice(0, 5));
    }
  }

  if (errors.length === 0) return null;

  const unique = Array.from(new Set(errors)).slice(0, 10);
  return `DETECTED ERRORS:\n${unique.map((e) => `- ${e.trim()}`).join("\n")}`;
}

export function generateUnifiedDiff(filePath: string, before: string, after: string): string {
  if (after === "(deleted)") return `--- ${filePath}\n+++ /dev/null\n@@ -1 +0,0 @@\n-${before.split("\n").slice(0, 20).join("\n-")}${before.split("\n").length > 20 ? "\n... (truncated)" : ""}`;
  if (!before && after) {
    const lines = after.split("\n").slice(0, 50);
    return `--- /dev/null\n+++ ${filePath}\n@@ -0,0 +1,${Math.min(lines.length, 50)} @@\n${lines.map((l) => `+${l}`).join("\n")}${after.split("\n").length > 50 ? "\n... (truncated)" : ""}`;
  }

  const beforeLines = before.split("\n");
  const afterLines = after.split("\n");
  const output: string[] = [`--- ${filePath}`, `+++ ${filePath}`];

  const lcs = (a: string[], b: string[]): Array<[number, number]> => {
    const maxLen = Math.max(a.length, b.length);
    if (maxLen > 2000) {
      return [];
    }
    const n = a.length, m = b.length;
    const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        if (a[i] === b[j]) dp[i][j] = dp[i + 1][j + 1] + 1;
        else dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
    const pairs: Array<[number, number]> = [];
    let i = 0, j = 0;
    while (i < n && j < m) {
      if (a[i] === b[j]) { pairs.push([i, j]); i++; j++; }
      else if (dp[i + 1]?.[j] ?? 0 >= (dp[i]?.[j + 1] ?? 0)) i++;
      else j++;
    }
    return pairs;
  };

  if (beforeLines.length > 2000 || afterLines.length > 2000) {
    output.push(`@@ -1,${beforeLines.length} +1,${afterLines.length} @@`);
    const maxShow = 30;
    for (let i = 0; i < Math.min(maxShow, beforeLines.length); i++) output.push(`-${beforeLines[i]}`);
    if (beforeLines.length > maxShow) output.push(`... (${beforeLines.length - maxShow} more removed lines)`);
    for (let j = 0; j < Math.min(maxShow, afterLines.length); j++) output.push(`+${afterLines[j]}`);
    if (afterLines.length > maxShow) output.push(`... (${afterLines.length - maxShow} more added lines)`);
    return output.join("\n");
  }

  const matches = lcs(beforeLines, afterLines);
  const contextLines = 3;
  type Hunk = { oldStart: number; oldLines: string[]; newStart: number; newLines: string[] };
  const hunks: Hunk[] = [];
  let bi = 0, ai = 0, mi = 0;

  while (bi < beforeLines.length || ai < afterLines.length) {
    if (mi < matches.length && matches[mi][0] === bi && matches[mi][1] === ai) {
      bi++; ai++; mi++;
      continue;
    }

    const hunkOldStart = Math.max(1, bi - contextLines + 1);
    const hunkNewStart = Math.max(1, ai - contextLines + 1);
    const oldL: string[] = [];
    const newL: string[] = [];

    for (let c = hunkOldStart - 1; c < bi; c++) {
      oldL.push(` ${beforeLines[c]}`);
      newL.push(` ${beforeLines[c]}`);
    }

    while (bi < beforeLines.length || ai < afterLines.length) {
      if (mi < matches.length && matches[mi][0] === bi && matches[mi][1] === ai) {
        let contextCount = 0;
        while (mi < matches.length && matches[mi][0] === bi && matches[mi][1] === ai && contextCount < contextLines) {
          oldL.push(` ${beforeLines[bi]}`);
          newL.push(` ${afterLines[ai]}`);
          bi++; ai++; mi++; contextCount++;
        }
        if (mi < matches.length && matches[mi][0] === bi && matches[mi][1] === ai) break;
        continue;
      }
      if (mi < matches.length) {
        while (bi < matches[mi][0]) { oldL.push(`-${beforeLines[bi]}`); bi++; }
        while (ai < matches[mi][1]) { newL.push(`+${afterLines[ai]}`); ai++; }
      } else {
        while (bi < beforeLines.length) { oldL.push(`-${beforeLines[bi]}`); bi++; }
        while (ai < afterLines.length) { newL.push(`+${afterLines[ai]}`); ai++; }
      }
    }

    const merged = oldL.filter(l => l.startsWith(" ") || l.startsWith("-"));
    for (const l of newL) { if (l.startsWith("+")) merged.push(l); }
    const contextAndRemoved = oldL;
    const allLines = [...contextAndRemoved.filter(l => !l.startsWith("+")), ...newL.filter(l => l.startsWith("+"))];

    const removedCount = oldL.filter(l => l.startsWith("-")).length + oldL.filter(l => l.startsWith(" ")).length;
    const addedCount = newL.filter(l => l.startsWith("+")).length + newL.filter(l => l.startsWith(" ")).length;
    output.push(`@@ -${hunkOldStart},${removedCount} +${hunkNewStart},${addedCount} @@`);

    for (const l of oldL) {
      if (l.startsWith(" ") || l.startsWith("-")) output.push(l);
    }
    for (const l of newL) {
      if (l.startsWith("+")) output.push(l);
    }

    if (output.length > 200) {
      output.push("... (diff truncated)");
      break;
    }
  }

  return output.length > 2 ? output.join("\n") : "";
}

function getAllProjectFiles(dir: string, maxFiles: number = 500): string[] {
  const files: string[] = [];
  const walk = (d: string) => {
    if (files.length >= maxFiles) return;
    try {
      const entries = fs.readdirSync(d, { withFileTypes: true });
      for (const entry of entries) {
        if (files.length >= maxFiles) return;
        if (entry.name.startsWith(".") || entry.name === "node_modules" || entry.name === "dist" || entry.name === ".checkpoints") continue;
        const full = path.join(d, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else {
          files.push(full);
        }
      }
    } catch {}
  };
  walk(dir);
  return files;
}

export async function executeTool(
  name: string,
  args: Record<string, any>,
  workingDir: string,
  sandboxed: boolean = false
): Promise<{ success: boolean; result: string }> {
  try {
    const resolvePath = (p: string) => {
      const resolved = path.isAbsolute(p)
        ? p
        : path.join(workingDir, p);
      if (sandboxed) {
        const normalizedResolved = path.resolve(resolved);
        const normalizedWorkingDir = path.resolve(workingDir);
        if (!normalizedResolved.startsWith(normalizedWorkingDir)) {
          throw new Error(`Path "${p}" is outside the project directory. All file operations must stay within your project folder.`);
        }
      }
      return resolved;
    };

    switch (name) {
      case "read_file": {
        const filePath = resolvePath(args.path);
        if (!fs.existsSync(filePath)) {
          return { success: false, result: `File not found: ${args.path}` };
        }
        const content = fs.readFileSync(filePath, "utf-8");
        const lines = content.split("\n");
        if (lines.length > 500) {
          return {
            success: true,
            result: `File: ${args.path} (${lines.length} lines)\n${lines.slice(0, 500).join("\n")}\n... (truncated, ${lines.length - 500} more lines)`,
          };
        }
        return { success: true, result: content };
      }

      case "write_file": {
        const filePath = resolvePath(args.path);
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(filePath, args.content, "utf-8");
        return { success: true, result: `File written: ${args.path}` };
      }

      case "edit_file": {
        const filePath = resolvePath(args.path);
        if (!fs.existsSync(filePath)) {
          return { success: false, result: `File not found: ${args.path}` };
        }
        const content = fs.readFileSync(filePath, "utf-8");
        if (!content.includes(args.old_string)) {
          return { success: false, result: `Could not find the text to replace in ${args.path}. The file may have changed. Try reading the file first to get the current content.` };
        }
        const newContent = content.replace(args.old_string, args.new_string);
        fs.writeFileSync(filePath, newContent, "utf-8");
        return { success: true, result: `File edited: ${args.path}` };
      }

      case "list_files": {
        const dirPath = resolvePath(args.path || ".");
        if (!fs.existsSync(dirPath)) {
          return { success: false, result: `Directory not found: ${args.path}` };
        }
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        const result = entries
          .filter((e) => !e.name.startsWith(".") && e.name !== "node_modules")
          .map((e) => `${e.isDirectory() ? "[DIR]" : "[FILE]"} ${e.name}`)
          .join("\n");
        return { success: true, result: result || "(empty directory)" };
      }

      case "search_files": {
        const searchPath = resolvePath(args.path || ".");
        const fileTypes = args.fileTypes || "";
        const globPattern = args.glob || "";
        
        let includeFlags = '--include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" --include="*.json" --include="*.css" --include="*.html" --include="*.py" --include="*.md" --include="*.yaml" --include="*.yml" --include="*.toml" --include="*.sql" --include="*.sh" --include="*.env"';
        
        if (fileTypes) {
          const types = fileTypes.split(",").map((t: string) => t.trim());
          includeFlags = types.map((t: string) => `--include="*.${t}"`).join(" ");
        }
        
        if (globPattern) {
          includeFlags = `--include="${globPattern}"`;
        }
        
        try {
          const { stdout } = await execAsync(
            `grep -rn ${includeFlags} "${args.pattern}" "${searchPath}" 2>/dev/null | head -80`,
            { timeout: 15000 }
          );
          return { success: true, result: stdout || "No matches found" };
        } catch {
          return { success: true, result: "No matches found" };
        }
      }

      case "execute_command": {
        const cmd = (args.command || "").trim();

        const serverStartPatterns = [
          /^npm\s+(run\s+dev|start|run\s+start|run\s+serve|run\s+preview)/i,
          /^npx\s+(tsx|ts-node)\s+server\//i,
          /^npx\s+(vite|next|nuxt|remix)\s*(dev|start)?$/i,
          /^node\s+server\/(index|main|app)/i,
          /^yarn\s+(dev|start|serve)/i,
          /^pnpm\s+(dev|start|serve)/i,
        ];

        const processManagementPatterns = [
          /^(kill|pkill|killall)\s/i,
          /^fuser\s/i,
          /lsof\s.*-i\s*:/i,
        ];

        const isServerStart = serverStartPatterns.some(p => p.test(cmd));
        const isProcessMgmt = processManagementPatterns.some(p => p.test(cmd));

        if (isServerStart) {
          return {
            success: false,
            result: `BLOCKED: "${cmd}" is not allowed. The development server is ALREADY RUNNING on port 5000 and auto-reloads when files change. You do NOT need to start or restart the server. Just write/edit files directly and the changes take effect automatically. Use execute_command for: npm install <package>, npm test, npm run build, or file utilities (cat, ls, mkdir).`,
          };
        }

        if (isProcessMgmt) {
          return {
            success: false,
            result: `BLOCKED: "${cmd}" is not allowed. Process management tools (kill, lsof, fuser, pkill) are not available in this environment and not needed. The server is managed automatically. Focus on file operations instead.`,
          };
        }

        return new Promise<{ success: boolean; result: string }>((resolve) => {
          const child = spawn("sh", ["-c", cmd], {
            cwd: workingDir,
            env: { ...process.env, FORCE_COLOR: "0" },
            timeout: 60000,
          });

          let stdout = "";
          let stderr = "";

          const onOutput = args._onOutput as ((chunk: string) => void) | undefined;

          child.stdout?.on("data", (data: Buffer) => {
            const chunk = data.toString();
            stdout += chunk;
            if (onOutput) onOutput(chunk);
          });

          child.stderr?.on("data", (data: Buffer) => {
            const chunk = data.toString();
            stderr += chunk;
            if (onOutput) onOutput(chunk);
          });

          child.on("close", (code) => {
            const output = (stdout + (stderr ? `\nSTDERR: ${stderr}` : "")).trim();
            if (code === 0) {
              resolve({ success: true, result: output || "(no output)" });
            } else {
              resolve({ success: false, result: `Command failed (exit code ${code}):\n${output}` });
            }
          });

          child.on("error", (err) => {
            resolve({ success: false, result: `Command error: ${err.message}` });
          });

          setTimeout(() => {
            try { child.kill("SIGTERM"); } catch {}
            resolve({ success: false, result: `Command timed out after 60s.\n${stdout}\n${stderr}`.trim() });
          }, 60000);
        });
      }

      case "create_directory": {
        const dirPath = resolvePath(args.path);
        fs.mkdirSync(dirPath, { recursive: true });
        return { success: true, result: `Directory created: ${args.path}` };
      }

      case "delete_file": {
        const filePath = resolvePath(args.path);
        if (!fs.existsSync(filePath)) {
          return { success: false, result: `Not found: ${args.path}` };
        }
        const stat = fs.statSync(filePath);
        if (stat.isDirectory()) {
          fs.rmSync(filePath, { recursive: true });
        } else {
          fs.unlinkSync(filePath);
        }
        return { success: true, result: `Deleted: ${args.path}` };
      }

      case "read_logs": {
        const { projectRunner } = await import("./project-runner");
        const lines = args.lines || 50;
        const logs = projectRunner.getLogs(path.basename(workingDir));
        const recentLogs = logs.slice(-lines);
        if (recentLogs.length === 0) {
          return { success: true, result: "No logs available. The project server may not be running." };
        }
        return { success: true, result: recentLogs.join("\n") };
      }

      case "web_search": {
        return await executeWebSearch(args.query);
      }

      case "run_test": {
        const testCmd = (args.command || "").trim();
        const desc = args.description || "Running test";

        const dangerousPatterns = [
          /^(rm|rmdir)\s+(-rf?|-fr)\s+\//i,
          /^(kill|pkill|killall)\s/i,
          /^(shutdown|reboot|halt|poweroff)/i,
          /^(chmod|chown)\s.*\//i,
        ];
        const serverStartPatterns = [
          /^npm\s+(run\s+dev|start|run\s+start|run\s+serve|run\s+preview)/i,
          /^npx\s+(tsx|ts-node)\s+server\//i,
          /^npx\s+(vite|next|nuxt|remix)\s*(dev|start)?$/i,
          /^node\s+.*\.(js|ts|mjs)$/i,
          /^yarn\s+(dev|start|serve)/i,
          /^pnpm\s+(dev|start|serve)/i,
        ];
        const isDangerous = dangerousPatterns.some(p => p.test(testCmd));
        const isServerStart = serverStartPatterns.some(p => p.test(testCmd));
        if (isDangerous) {
          return { success: false, result: `BLOCKED: "${testCmd}" is not allowed in tests for safety.` };
        }
        if (isServerStart) {
          return { success: false, result: `BLOCKED: "${testCmd}" is a server-start command. The server is ALREADY RUNNING and auto-reloads on file changes. Do NOT try to start it. To test your code, use curl commands like: curl -s http://localhost:3000/api/health` };
        }

        try {
          const { stdout, stderr } = await execAsync(testCmd, {
            cwd: workingDir,
            timeout: 30000,
            maxBuffer: 1024 * 1024,
          });
          const output = (stdout + (stderr ? `\nSTDERR: ${stderr}` : "")).trim();
          const parsed = parseErrorsFromOutput(output);
          const resultText = parsed
            ? `TEST: ${desc}\nOutput:\n${output}\n\n${parsed}`
            : `TEST: ${desc}\nOutput:\n${output || "(no output)"}`;
          return { success: true, result: resultText };
        } catch (err: any) {
          const errOutput = [err.stdout, err.stderr].filter(Boolean).join("\n");
          const parsed = parseErrorsFromOutput(errOutput || err.message);
          return {
            success: false,
            result: `TEST FAILED: ${desc}\n${errOutput || err.message}${parsed ? `\n\n${parsed}` : ""}`,
          };
        }
      }

      case "install_package": {
        const packages = (args.packages || "").trim();
        if (!packages) {
          return { success: false, result: "No packages specified. Provide package names like 'express cors'" };
        }
        const isDev = args.dev === true;

        const pkgJsonCheck = path.join(workingDir, "package.json");
        if (!fs.existsSync(pkgJsonCheck)) {
          try {
            await execAsync("npm init -y", {
              cwd: workingDir,
              timeout: 30000,
              maxBuffer: 1024 * 1024,
            });
          } catch (initErr: any) {
            return {
              success: false,
              result: `Failed to initialize package.json: ${initErr.message}. Create a package.json manually or use scaffold_project first.`,
            };
          }
        }

        const cmd = `npm install ${isDev ? "--save-dev " : ""}${packages}`;
        try {
          const { stdout, stderr } = await execAsync(cmd, {
            cwd: workingDir,
            timeout: 120000,
            maxBuffer: 2 * 1024 * 1024,
          });
          const output = stdout + (stderr || "");
          const addedMatch = output.match(/added (\d+) package/);
          const addedCount = addedMatch ? addedMatch[1] : "0";
          
          let installedVersions = "";
          try {
            const pkgJsonPath = path.join(workingDir, "package.json");
            if (fs.existsSync(pkgJsonPath)) {
              const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, "utf-8"));
              const deps = isDev ? pkgJson.devDependencies : pkgJson.dependencies;
              if (deps) {
                const pkgNames = packages.split(/\s+/).map((p: string) => p.replace(/@.*$/, ""));
                const versions = pkgNames
                  .filter((p: string) => deps[p])
                  .map((p: string) => `${p}@${deps[p]}`);
                if (versions.length > 0) {
                  installedVersions = `\nInstalled versions: ${versions.join(", ")}`;
                }
              }
            }
          } catch {}
          
          return {
            success: true,
            result: `Successfully installed ${packages} (${addedCount} packages added${isDev ? " as dev dependencies" : ""})${installedVersions}`,
          };
        } catch (err: any) {
          const errOutput = [err.stdout, err.stderr].filter(Boolean).join("\n");
          const parsed = parseErrorsFromOutput(errOutput || err.message);
          return {
            success: false,
            result: `Failed to install ${packages}:\n${errOutput || err.message}${parsed ? `\n\n${parsed}` : ""}`,
          };
        }
      }

      case "run_diagnostics": {
        const specificFile = args.file ? resolvePath(args.file) : null;
        const results: string[] = [];
        
        const hasTsConfig = fs.existsSync(path.join(workingDir, "tsconfig.json"));
        const hasPkgJson = fs.existsSync(path.join(workingDir, "package.json"));
        const hasNodeModules = fs.existsSync(path.join(workingDir, "node_modules"));
        
        if (hasPkgJson) {
          try {
            const pkgJson = JSON.parse(fs.readFileSync(path.join(workingDir, "package.json"), "utf-8"));
            const allDeps = { ...pkgJson.dependencies, ...pkgJson.devDependencies };
            const missingDeps: string[] = [];
            for (const dep of Object.keys(allDeps)) {
              if (!fs.existsSync(path.join(workingDir, "node_modules", dep))) {
                missingDeps.push(dep);
              }
            }
            if (missingDeps.length > 0) {
              results.push(`Missing node_modules: ${missingDeps.join(", ")}. Run install_package or execute_command with 'npm install' first.`);
            }
          } catch {}
        }

        if (hasTsConfig && hasNodeModules) {
          const hasTsc = fs.existsSync(path.join(workingDir, "node_modules", ".bin", "tsc")) ||
                         fs.existsSync(path.join(workingDir, "node_modules", "typescript"));
          if (hasTsc && fs.existsSync(path.join(workingDir, "node_modules", ".bin", "tsc"))) {
            try {
              const tscBin = path.join(workingDir, "node_modules", ".bin", "tsc");
              const tscCmd = specificFile
                ? `${tscBin} --noEmit --pretty ${specificFile} 2>&1`
                : `${tscBin} --noEmit --pretty 2>&1`;
              const { stdout } = await execAsync(tscCmd, {
                cwd: workingDir,
                timeout: 30000,
                maxBuffer: 2 * 1024 * 1024,
              }).catch((err: any) => ({ stdout: err.stdout || err.message, stderr: "" }));
              
              if (stdout.includes("error TS")) {
                const errors = stdout.split("\n").filter((l: string) => l.includes("error TS") || l.trim().startsWith("~")).slice(0, 30);
                results.push(`TypeScript Errors:\n${errors.join("\n")}`);
              } else {
                results.push("TypeScript: No errors found");
              }
            } catch (err: any) {
              results.push(`TypeScript check failed: ${err.message}`);
            }
          } else {
            results.push("TypeScript: tsconfig.json found but typescript is not installed. Run install_package with 'typescript' first.");
          }
        } else if (hasTsConfig && !hasNodeModules) {
          results.push("TypeScript: tsconfig.json found but node_modules missing. Run 'npm install' first before running diagnostics.");
        } else if (specificFile && specificFile.endsWith(".js")) {
          try {
            const { stdout, stderr } = await execAsync(`node --check "${specificFile}" 2>&1`, {
              cwd: workingDir,
              timeout: 10000,
            }).catch((err: any) => ({ stdout: "", stderr: err.stderr || err.message }));
            if (stderr) {
              results.push(`JavaScript Syntax Error:\n${stderr}`);
            } else {
              results.push(`JavaScript: ${specificFile} - No syntax errors`);
            }
          } catch (err: any) {
            results.push(`JS check failed: ${err.message}`);
          }
        }
        
        if (results.length === 0) {
          results.push("No diagnostics available. Project may not have TypeScript or package.json configured.");
        }
        
        return { success: true, result: results.join("\n\n") };
      }

      case "read_multiple_files": {
        const paths: string[] = args.paths || [];
        if (paths.length === 0) {
          return { success: false, result: "No file paths provided." };
        }
        if (paths.length > 20) {
          return { success: false, result: "Too many files. Maximum 20 files at once." };
        }
        
        const results: string[] = [];
        for (const p of paths) {
          const filePath = resolvePath(p);
          try {
            if (!fs.existsSync(filePath)) {
              results.push(`--- ${p} ---\n(file not found)`);
              continue;
            }
            const content = fs.readFileSync(filePath, "utf-8");
            const lines = content.split("\n");
            const truncated = lines.length > 200;
            const shown = truncated ? lines.slice(0, 200).join("\n") + `\n... (${lines.length - 200} more lines)` : content;
            results.push(`--- ${p} (${lines.length} lines) ---\n${shown}`);
          } catch (err: any) {
            results.push(`--- ${p} ---\nError: ${err.message}`);
          }
        }
        
        return { success: true, result: results.join("\n\n") };
      }

      case "task_list": {
        const action = args.action || "get";
        const taskListPath = path.join(workingDir, ".agent-tasks.json");
        
        if (action === "create") {
          const tasks = (args.tasks || []).map((t: any, i: number) => ({
            id: t.id || `task-${i + 1}`,
            title: t.title || `Task ${i + 1}`,
            status: t.status || "pending",
          }));
          fs.writeFileSync(taskListPath, JSON.stringify({ tasks, createdAt: new Date().toISOString() }, null, 2));
          return { success: true, result: `Task list created with ${tasks.length} tasks:\n${tasks.map((t: any) => `  [${t.status}] ${t.id}: ${t.title}`).join("\n")}` };
        }
        
        if (action === "update") {
          try {
            const data = JSON.parse(fs.readFileSync(taskListPath, "utf-8"));
            const task = data.tasks.find((t: any) => t.id === args.taskId);
            if (!task) return { success: false, result: `Task "${args.taskId}" not found` };
            task.status = args.status || task.status;
            let autoAdvanceMsg = "";
            if (task.status === "completed") {
              const nextPending = data.tasks.find((t: any) => t.status === "pending");
              if (nextPending) {
                nextPending.status = "in_progress";
                autoAdvanceMsg = ` Next task auto-started: "${nextPending.id}: ${nextPending.title}"`;
              }
            }
            fs.writeFileSync(taskListPath, JSON.stringify(data, null, 2));
            const completed = data.tasks.filter((t: any) => t.status === "completed").length;
            return { success: true, result: `Updated "${task.title}" to ${task.status}. Progress: ${completed}/${data.tasks.length} done.${autoAdvanceMsg}` };
          } catch {
            return { success: false, result: "No task list found. Create one first." };
          }
        }
        
        if (action === "get") {
          try {
            const data = JSON.parse(fs.readFileSync(taskListPath, "utf-8"));
            const summary = data.tasks.map((t: any) => {
              const icon = t.status === "completed" ? "[DONE]" : t.status === "in_progress" ? "[WORKING]" : "[TODO]";
              return `  ${icon} ${t.id}: ${t.title}`;
            }).join("\n");
            const completed = data.tasks.filter((t: any) => t.status === "completed").length;
            return { success: true, result: `Tasks (${completed}/${data.tasks.length} complete):\n${summary}` };
          } catch {
            return { success: true, result: "No task list exists yet." };
          }
        }
        
        return { success: false, result: `Unknown action: ${action}` };
      }

      case "checkpoint": {
        const action = args.action || "list";
        const checkpointDir = path.join(workingDir, ".checkpoints");
        
        if (action === "create") {
          const name = args.name || `checkpoint-${Date.now()}`;
          const checkpointId = `cp-${Date.now()}`;
          const cpDir = path.join(checkpointDir, checkpointId);
          fs.mkdirSync(cpDir, { recursive: true });
          
          const filesToSnapshot = getAllProjectFiles(workingDir);
          let count = 0;
          const manifest: Array<{ relativePath: string; size: number }> = [];
          
          for (const file of filesToSnapshot) {
            if (count >= 500) break;
            const relativePath = path.relative(workingDir, file);
            if (relativePath.startsWith(".checkpoints") || relativePath.startsWith("node_modules") || relativePath.startsWith(".git")) continue;
            
            const destPath = path.join(cpDir, relativePath);
            const destDir = path.dirname(destPath);
            if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
            
            try {
              const stat = fs.statSync(file);
              if (stat.size > 1024 * 1024) continue;
              fs.copyFileSync(file, destPath);
              manifest.push({ relativePath, size: stat.size });
              count++;
            } catch {}
          }
          
          fs.writeFileSync(path.join(cpDir, ".manifest.json"), JSON.stringify({
            id: checkpointId,
            name,
            createdAt: new Date().toISOString(),
            fileCount: count,
            files: manifest,
          }, null, 2));
          
          return { success: true, result: `Checkpoint "${name}" created (ID: ${checkpointId}, ${count} files saved)` };
        }
        
        if (action === "rollback") {
          const checkpointId = args.checkpointId;
          if (!checkpointId) return { success: false, result: "Provide a checkpointId to rollback to." };
          
          const cpDir = path.join(checkpointDir, checkpointId);
          if (!fs.existsSync(cpDir)) return { success: false, result: `Checkpoint "${checkpointId}" not found.` };
          
          try {
            const manifest = JSON.parse(fs.readFileSync(path.join(cpDir, ".manifest.json"), "utf-8"));
            let restored = 0;
            
            for (const file of manifest.files) {
              const srcPath = path.join(cpDir, file.relativePath);
              const destPath = path.join(workingDir, file.relativePath);
              const destDir = path.dirname(destPath);
              
              if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
              if (fs.existsSync(srcPath)) {
                fs.copyFileSync(srcPath, destPath);
                restored++;
              }
            }
            
            return { success: true, result: `Rolled back to checkpoint "${manifest.name}" (${restored} files restored)` };
          } catch (err: any) {
            return { success: false, result: `Rollback failed: ${err.message}` };
          }
        }
        
        if (action === "list") {
          if (!fs.existsSync(checkpointDir)) return { success: true, result: "No checkpoints exist yet." };
          
          const entries = fs.readdirSync(checkpointDir, { withFileTypes: true })
            .filter(e => e.isDirectory() && e.name.startsWith("cp-"));
          
          if (entries.length === 0) return { success: true, result: "No checkpoints exist yet." };
          
          const checkpoints = entries.map(e => {
            try {
              const manifest = JSON.parse(fs.readFileSync(path.join(checkpointDir, e.name, ".manifest.json"), "utf-8"));
              return `  ${manifest.id}: "${manifest.name}" (${manifest.fileCount} files, ${manifest.createdAt})`;
            } catch {
              return `  ${e.name}: (corrupted)`;
            }
          });
          
          return { success: true, result: `Available checkpoints:\n${checkpoints.join("\n")}` };
        }
        
        return { success: false, result: `Unknown action: ${action}. Use 'create', 'rollback', or 'list'.` };
      }

      case "manage_database": {
        const action = args.action || "list_tables";
        const dbName = args.dbName || "database.sqlite";
        const dbPath = path.join(workingDir, dbName);
        
        const Database = (await import("better-sqlite3")).default;
        
        if (action === "create") {
          const db = new Database(dbPath);
          db.pragma("journal_mode = WAL");
          db.close();
          return { success: true, result: `SQLite database created at ${dbName}. Use 'run_sql' action to create tables and insert data.` };
        }
        
        if (!fs.existsSync(dbPath)) {
          return { success: false, result: `Database "${dbName}" does not exist. Use action 'create' first.` };
        }
        
        const db = new Database(dbPath);
        
        try {
          if (action === "run_sql") {
            if (!args.sql) return { success: false, result: "Provide a 'sql' parameter with the SQL query to execute." };
            const sql = args.sql.trim();
            const isSelect = /^\s*(SELECT|PRAGMA|EXPLAIN)/i.test(sql);
            
            if (isSelect) {
              const rows = db.prepare(sql).all();
              const preview = rows.slice(0, 50);
              let result = `Query returned ${rows.length} row(s)`;
              if (rows.length > 50) result += ` (showing first 50)`;
              result += `:\n${JSON.stringify(preview, null, 2)}`;
              return { success: true, result };
            } else {
              const info = db.prepare(sql).run();
              return { success: true, result: `SQL executed. Changes: ${info.changes}, Last insert ID: ${info.lastInsertRowid}` };
            }
          }
          
          if (action === "list_tables") {
            const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
            if (tables.length === 0) return { success: true, result: "No tables found. Use 'run_sql' with CREATE TABLE to create tables." };
            return { success: true, result: `Tables:\n${(tables as any[]).map((t: any) => `  - ${t.name}`).join("\n")}` };
          }
          
          if (action === "describe_table") {
            if (!args.tableName) return { success: false, result: "Provide a 'tableName' parameter." };
            const columns = db.prepare(`PRAGMA table_info(${args.tableName})`).all();
            if ((columns as any[]).length === 0) return { success: false, result: `Table "${args.tableName}" not found.` };
            const colDescriptions = (columns as any[]).map((c: any) => 
              `  ${c.name} ${c.type}${c.pk ? " PRIMARY KEY" : ""}${c.notnull ? " NOT NULL" : ""}${c.dflt_value !== null ? ` DEFAULT ${c.dflt_value}` : ""}`
            );
            return { success: true, result: `Table "${args.tableName}":\n${colDescriptions.join("\n")}` };
          }
          
          return { success: false, result: `Unknown action: ${action}. Use 'create', 'run_sql', 'list_tables', or 'describe_table'.` };
        } finally {
          db.close();
        }
      }

      case "manage_env": {
        const action = args.action || "list";
        const envPath = path.join(workingDir, ".env");
        
        const readEnvFile = (): Record<string, string> => {
          if (!fs.existsSync(envPath)) return {};
          const content = fs.readFileSync(envPath, "utf-8");
          const vars: Record<string, string> = {};
          for (const line of content.split("\n")) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith("#")) continue;
            const eqIdx = trimmed.indexOf("=");
            if (eqIdx === -1) continue;
            const key = trimmed.slice(0, eqIdx).trim();
            let value = trimmed.slice(eqIdx + 1).trim();
            if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
              value = value.slice(1, -1);
            }
            vars[key] = value;
          }
          return vars;
        }
        
        const writeEnvFile = (vars: Record<string, string>): void => {
          const lines = Object.entries(vars).map(([k, v]) => {
            if (v.includes(" ") || v.includes('"') || v.includes("'") || v.includes("#")) {
              return `${k}="${v.replace(/"/g, '\\"')}"`;
            }
            return `${k}=${v}`;
          });
          fs.writeFileSync(envPath, lines.join("\n") + "\n");
        }
        
        if (action === "set") {
          if (!args.key) return { success: false, result: "Provide a 'key' parameter." };
          if (args.value === undefined) return { success: false, result: "Provide a 'value' parameter." };
          const vars = readEnvFile();
          const existed = args.key in vars;
          vars[args.key] = args.value;
          writeEnvFile(vars);
          return { success: true, result: `${existed ? "Updated" : "Created"} environment variable: ${args.key}` };
        }
        
        if (action === "get") {
          if (!args.key) return { success: false, result: "Provide a 'key' parameter." };
          const vars = readEnvFile();
          if (!(args.key in vars)) return { success: false, result: `Environment variable "${args.key}" not found.` };
          const v = vars[args.key];
          const maskedV = v.length > 4 ? v.slice(0, 2) + "***" + v.slice(-2) : "***";
          return { success: true, result: `${args.key}=${maskedV} (value is set, use in code via process.env.${args.key})` };
        }
        
        if (action === "list") {
          const vars = readEnvFile();
          const keys = Object.keys(vars);
          if (keys.length === 0) return { success: true, result: "No environment variables set. Use 'set' action to add variables." };
          const masked = keys.map(k => {
            const v = vars[k];
            const maskedV = v.length > 4 ? v.slice(0, 2) + "***" + v.slice(-2) : "***";
            return `  ${k}=${maskedV}`;
          });
          return { success: true, result: `Environment variables (${keys.length}):\n${masked.join("\n")}` };
        }
        
        if (action === "delete") {
          if (!args.key) return { success: false, result: "Provide a 'key' parameter." };
          const vars = readEnvFile();
          if (!(args.key in vars)) return { success: false, result: `Environment variable "${args.key}" not found.` };
          delete vars[args.key];
          writeEnvFile(vars);
          return { success: true, result: `Deleted environment variable: ${args.key}` };
        }
        
        return { success: false, result: `Unknown action: ${action}. Use 'set', 'get', 'list', or 'delete'.` };
      }

      case "git": {
        const action = args.action || "status";
        const runGit = async (cmd: string): Promise<{ stdout: string; stderr: string }> => {
          return execAsync(cmd, { cwd: workingDir, timeout: 15000, env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } });
        };

        const ensureGitUser = async () => {
          try {
            await runGit("git config user.email");
          } catch {
            await runGit('git config user.email "agent@agentstudio.local"');
            await runGit('git config user.name "Agent Studio"');
          }
        };

        if (action === "init") {
          const gitDir = path.join(workingDir, ".git");
          if (fs.existsSync(gitDir)) {
            return { success: true, result: "Git repository already initialized." };
          }
          await runGit("git init");
          await ensureGitUser();
          const gitignoreP = path.join(workingDir, ".gitignore");
          if (!fs.existsSync(gitignoreP)) {
            fs.writeFileSync(gitignoreP, "node_modules/\ndist/\n.env\n*.db\n.DS_Store\n");
          }
          await runGit("git add -A");
          await runGit('git commit -m "Initial commit" --allow-empty');
          return { success: true, result: "Initialized git repository with initial commit." };
        }

        if (action === "status") {
          try {
            const { stdout } = await runGit("git status --short");
            if (!stdout.trim()) return { success: true, result: "Working tree clean. No changes." };
            return { success: true, result: `Changed files:\n${stdout.trim()}` };
          } catch {
            return { success: false, result: "Not a git repository. Use git init first." };
          }
        }

        if (action === "add") {
          const files = args.files || ".";
          const safeFiles = files === "." ? "." : files.replace(/[^a-zA-Z0-9_\-\/\.\*\s]/g, "");
          await runGit(`git add -- ${safeFiles}`);
          return { success: true, result: `Staged: ${safeFiles}` };
        }

        if (action === "commit") {
          if (!args.message) return { success: false, result: "Provide a 'message' parameter for the commit." };
          await ensureGitUser();
          await runGit("git add -A");
          const safeMsg = args.message.replace(/[`$\\!"]/g, "").slice(0, 200);
          try {
            const { stdout } = await runGit(`git commit -m '${safeMsg.replace(/'/g, "'\\''")}'`);
            const match = stdout.match(/\[(\S+)\s+([a-f0-9]+)\]/);
            const info = match ? ` (${match[1]} ${match[2]})` : "";
            return { success: true, result: `Committed${info}: ${safeMsg}` };
          } catch (e: any) {
            if (e.stderr?.includes("nothing to commit") || e.stdout?.includes("nothing to commit")) {
              return { success: true, result: "Nothing to commit, working tree clean." };
            }
            throw e;
          }
        }

        if (action === "diff") {
          const { stdout } = await runGit("git diff");
          const { stdout: staged } = await runGit("git diff --staged");
          const combined = [stdout, staged].filter(Boolean).join("\n");
          if (!combined.trim()) return { success: true, result: "No differences found." };
          return { success: true, result: combined.slice(0, 5000) };
        }

        if (action === "log") {
          const n = args.numEntries || 10;
          try {
            const { stdout } = await runGit(`git log --oneline -${n}`);
            if (!stdout.trim()) return { success: true, result: "No commits yet." };
            return { success: true, result: stdout.trim() };
          } catch {
            return { success: true, result: "No commits yet." };
          }
        }

        if (action === "branch") {
          if (args.branch) {
            await runGit(`git checkout -b ${args.branch.replace(/[^a-zA-Z0-9_\-\/]/g, "")}`);
            return { success: true, result: `Created and switched to branch: ${args.branch}` };
          }
          const { stdout } = await runGit("git branch -a");
          return { success: true, result: stdout.trim() || "No branches (repository not initialized)." };
        }

        if (action === "checkout") {
          if (!args.branch) return { success: false, result: "Provide a 'branch' parameter." };
          const safeBranch = args.branch.replace(/[^a-zA-Z0-9_\-\/\.]/g, "");
          await runGit(`git checkout ${safeBranch}`);
          return { success: true, result: `Switched to branch: ${safeBranch}` };
        }

        if (action === "reset") {
          if (!args.ref) return { success: false, result: "Provide a 'ref' parameter (commit hash or HEAD~N)." };
          const safeRef = args.ref.replace(/[^a-zA-Z0-9_\-\~\^\.]/g, "");
          const flag = args.hard ? "--hard" : "--mixed";
          await runGit(`git reset ${flag} ${safeRef}`);
          return { success: true, result: `Reset to ${safeRef} (${args.hard ? "hard" : "mixed"}).` };
        }

        return { success: false, result: `Unknown git action: ${action}. Use 'init', 'status', 'add', 'commit', 'diff', 'log', 'branch', 'checkout', or 'reset'.` };
      }

      case "scaffold_project": {
        const template = args.template || "react";
        const projectName = (args.name || "my-project").replace(/[^a-zA-Z0-9_-]/g, "-");
        const features: string[] = args.features || [];
        const useTs = features.includes("typescript");
        const ext = useTs ? "ts" : "js";
        const extx = useTs ? "tsx" : "jsx";

        const templates: Record<string, Record<string, string>> = {
          "react": {
            [`package.json`]: JSON.stringify({
              name: projectName,
              private: true,
              version: "0.0.0",
              type: "module",
              scripts: {
                dev: "vite",
                build: "vite build",
                preview: "vite preview",
              },
              dependencies: {
                react: "^18.2.0",
                "react-dom": "^18.2.0",
              },
              devDependencies: {
                "@vitejs/plugin-react": "^4.2.0",
                vite: "^5.0.0",
                ...(useTs ? { typescript: "^5.3.0", "@types/react": "^18.2.0", "@types/react-dom": "^18.2.0" } : {}),
              },
            }, null, 2),
            [`vite.config.${ext}`]: `import { defineConfig } from 'vite';\nimport react from '@vitejs/plugin-react';\n\nexport default defineConfig({\n  plugins: [react()],\n  server: { host: '0.0.0.0', port: 3000 },\n});\n`,
            [`index.html`]: `<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8" />\n  <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n  <title>${projectName}</title>\n</head>\n<body>\n  <div id="root"></div>\n  <script type="module" src="/src/main.${extx}"></script>\n</body>\n</html>\n`,
            [`src/main.${extx}`]: `import React from 'react';\nimport ReactDOM from 'react-dom/client';\nimport App from './App';\nimport './index.css';\n\nReactDOM.createRoot(document.getElementById('root')).render(\n  <React.StrictMode>\n    <App />\n  </React.StrictMode>\n);\n`,
            [`src/App.${extx}`]: `import React, { useState } from 'react';\n\nfunction App() {\n  const [count, setCount] = useState(0);\n\n  return (\n    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '2rem', fontFamily: 'system-ui' }}>\n      <h1>${projectName}</h1>\n      <p>Edit <code>src/App.${extx}</code> and save to see changes.</p>\n      <button onClick={() => setCount(c => c + 1)}>Count: {count}</button>\n    </div>\n  );\n}\n\nexport default App;\n`,
            [`src/index.css`]: `* { margin: 0; padding: 0; box-sizing: border-box; }\nbody { min-height: 100vh; display: flex; align-items: center; justify-content: center; }\n`,
          },
          "express-api": {
            [`package.json`]: JSON.stringify({
              name: projectName,
              version: "1.0.0",
              type: "module",
              scripts: {
                dev: useTs ? "tsx watch src/index.ts" : "node --watch src/index.js",
                start: useTs ? "tsx src/index.ts" : "node src/index.js",
              },
              dependencies: {
                express: "^4.18.2",
                cors: "^2.8.5",
              },
              devDependencies: useTs ? { tsx: "^4.7.0", typescript: "^5.3.0", "@types/express": "^4.17.21", "@types/cors": "^2.8.17" } : {},
            }, null, 2),
            [`src/index.${ext}`]: `import express from 'express';\nimport cors from 'cors';\n\nconst app = express();\napp.use(cors());\napp.use(express.json());\n\nconst items = [];\nlet nextId = 1;\n\napp.get('/api/items', (req, res) => {\n  res.json(items);\n});\n\napp.post('/api/items', (req, res) => {\n  const item = { id: nextId++, ...req.body, createdAt: new Date().toISOString() };\n  items.push(item);\n  res.status(201).json(item);\n});\n\napp.delete('/api/items/:id', (req, res) => {\n  const idx = items.findIndex(i => i.id === parseInt(req.params.id));\n  if (idx === -1) return res.status(404).json({ error: 'Not found' });\n  items.splice(idx, 1);\n  res.json({ success: true });\n});\n\nconst PORT = process.env.PORT || 3000;\napp.listen(PORT, '0.0.0.0', () => console.log(\`Server running on port \${PORT}\`));\n`,
          },
          "fullstack": {
            [`package.json`]: JSON.stringify({
              name: projectName,
              private: true,
              version: "0.0.0",
              type: "module",
              scripts: {
                dev: "concurrently \"npm run dev:server\" \"npm run dev:client\"",
                "dev:server": useTs ? "tsx watch server/index.ts" : "node --watch server/index.js",
                "dev:client": "vite",
                build: "vite build",
              },
              dependencies: {
                react: "^18.2.0",
                "react-dom": "^18.2.0",
                express: "^4.18.2",
                cors: "^2.8.5",
              },
              devDependencies: {
                "@vitejs/plugin-react": "^4.2.0",
                vite: "^5.0.0",
                concurrently: "^8.2.0",
                ...(useTs ? { typescript: "^5.3.0", tsx: "^4.7.0", "@types/react": "^18.2.0", "@types/express": "^4.17.21" } : {}),
              },
            }, null, 2),
            [`vite.config.${ext}`]: `import { defineConfig } from 'vite';\nimport react from '@vitejs/plugin-react';\n\nexport default defineConfig({\n  plugins: [react()],\n  server: { host: '0.0.0.0', port: 3000, proxy: { '/api': 'http://localhost:3001' } },\n});\n`,
            [`index.html`]: `<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8" />\n  <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n  <title>${projectName}</title>\n</head>\n<body>\n  <div id="root"></div>\n  <script type="module" src="/src/main.${extx}"></script>\n</body>\n</html>\n`,
            [`src/main.${extx}`]: `import React from 'react';\nimport ReactDOM from 'react-dom/client';\nimport App from './App';\n\nReactDOM.createRoot(document.getElementById('root')).render(\n  <React.StrictMode><App /></React.StrictMode>\n);\n`,
            [`src/App.${extx}`]: `import React, { useState, useEffect } from 'react';\n\nfunction App() {\n  const [items, setItems] = useState([]);\n\n  useEffect(() => {\n    fetch('/api/items').then(r => r.json()).then(setItems);\n  }, []);\n\n  return (\n    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '2rem' }}>\n      <h1>${projectName}</h1>\n      <p>{items.length} items loaded from API</p>\n    </div>\n  );\n}\n\nexport default App;\n`,
            [`server/index.${ext}`]: `import express from 'express';\n\nconst app = express();\napp.use(express.json());\n\nconst items = [{ id: 1, name: 'Example item' }];\n\napp.get('/api/items', (req, res) => res.json(items));\n\napp.listen(3001, '0.0.0.0', () => console.log('API server on port 3001'));\n`,
          },
          "node-cli": {
            [`package.json`]: JSON.stringify({
              name: projectName,
              version: "1.0.0",
              type: "module",
              bin: { [projectName]: `./src/index.${ext}` },
              scripts: {
                start: useTs ? "tsx src/index.ts" : "node src/index.js",
                dev: useTs ? "tsx watch src/index.ts" : "node --watch src/index.js",
              },
              devDependencies: useTs ? { tsx: "^4.7.0", typescript: "^5.3.0" } : {},
            }, null, 2),
            [`src/index.${ext}`]: `#!/usr/bin/env node\n\nconst args = process.argv.slice(2);\nconst command = args[0];\n\nfunction showHelp() {\n  console.log(\`Usage: ${projectName} <command> [options]\n\nCommands:\n  hello    Say hello\n  help     Show this help\`);\n}\n\nswitch (command) {\n  case 'hello':\n    console.log('Hello from ${projectName}!');\n    break;\n  case 'help':\n  default:\n    showHelp();\n}\n`,
          },
          "static": {
            [`index.html`]: `<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8" />\n  <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n  <title>${projectName}</title>\n  <link rel="stylesheet" href="style.css" />\n</head>\n<body>\n  <main>\n    <h1>${projectName}</h1>\n    <p>Edit these files to get started.</p>\n  </main>\n  <script src="script.js"></script>\n</body>\n</html>\n`,
            [`style.css`]: `* { margin: 0; padding: 0; box-sizing: border-box; }\nbody { min-height: 100vh; display: flex; align-items: center; justify-content: center; font-family: system-ui; }\nmain { text-align: center; max-width: 600px; padding: 2rem; }\nh1 { margin-bottom: 1rem; }\n`,
            [`script.js`]: `document.addEventListener('DOMContentLoaded', () => {\n  console.log('${projectName} loaded');\n});\n`,
          },
        };

        const files = templates[template];
        if (!files) {
          return { success: false, result: `Unknown template: ${template}. Available: ${Object.keys(templates).join(", ")}` };
        }

        const created: string[] = [];
        for (const [filePath, content] of Object.entries(files)) {
          const fullPath = path.join(workingDir, filePath);
          const dir = path.dirname(fullPath);
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(fullPath, content, "utf-8");
          created.push(filePath);
        }

        if (features.includes("tailwind") && (template === "react" || template === "fullstack")) {
          const tailwindCss = `@tailwind base;\n@tailwind components;\n@tailwind utilities;\n`;
          fs.writeFileSync(path.join(workingDir, "src/index.css"), tailwindCss, "utf-8");
          const twConfig = `/** @type {import('tailwindcss').Config} */\nexport default {\n  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],\n  theme: { extend: {} },\n  plugins: [],\n};\n`;
          fs.writeFileSync(path.join(workingDir, "tailwind.config.js"), twConfig, "utf-8");
          const postcss = `export default {\n  plugins: {\n    tailwindcss: {},\n    autoprefixer: {},\n  },\n};\n`;
          fs.writeFileSync(path.join(workingDir, "postcss.config.js"), postcss, "utf-8");
          created.push("src/index.css", "tailwind.config.js", "postcss.config.js");
        }

        if (features.includes("docker")) {
          const dockerfile = `FROM node:20-alpine\nWORKDIR /app\nCOPY package*.json ./\nRUN npm install\nCOPY . .\nEXPOSE 3000\nCMD ["npm", "start"]\n`;
          fs.writeFileSync(path.join(workingDir, "Dockerfile"), dockerfile, "utf-8");
          fs.writeFileSync(path.join(workingDir, ".dockerignore"), "node_modules\n.git\n", "utf-8");
          created.push("Dockerfile", ".dockerignore");
        }

        const gitignore = "node_modules/\ndist/\n.env\n*.log\n";
        if (!fs.existsSync(path.join(workingDir, ".gitignore"))) {
          fs.writeFileSync(path.join(workingDir, ".gitignore"), gitignore, "utf-8");
          created.push(".gitignore");
        }

        let npmInstallResult = "";
        try {
          const { stdout, stderr } = await execAsync("npm install", {
            cwd: workingDir,
            timeout: 120000,
            maxBuffer: 2 * 1024 * 1024,
          });
          const output = stdout + (stderr || "");
          const addedMatch = output.match(/added (\d+) package/);
          npmInstallResult = addedMatch ? `\n\nDependencies installed (${addedMatch[1]} packages added). The project will auto-start in the preview panel.` : "\n\nDependencies installed. The project will auto-start in the preview panel.";
        } catch (installErr: any) {
          npmInstallResult = `\n\nNote: npm install failed - you may need to run install_package manually. Error: ${(installErr.stderr || installErr.message || "").slice(0, 200)}`;
        }

        return { success: true, result: `Scaffolded "${template}" project "${projectName}" with ${created.length} files:\n${created.map(f => `  - ${f}`).join("\n")}${npmInstallResult}` };
      }

      case "audit_dependencies": {
        const pkgPath = path.join(workingDir, "package.json");
        if (!fs.existsSync(pkgPath)) {
          return { success: false, result: "No package.json found. This tool only works in Node.js projects." };
        }

        try {
          const cmd = args.fix ? "npm audit fix --json" : "npm audit --json";
          const { stdout } = await execAsync(cmd, { cwd: workingDir, timeout: 30000, maxBuffer: 2 * 1024 * 1024 });
          try {
            const audit = JSON.parse(stdout);
            const total = audit.metadata?.vulnerabilities || {};
            const summary = Object.entries(total)
              .filter(([, count]) => (count as number) > 0)
              .map(([sev, count]) => `${count} ${sev}`)
              .join(", ");

            if (!summary) {
              return { success: true, result: "No vulnerabilities found. Dependencies are clean." };
            }

            const advisories = Object.values(audit.vulnerabilities || {}).slice(0, 10).map((v: any) => {
              return `- ${v.name}: ${v.severity} - ${v.via?.[0]?.title || v.via?.[0] || "unknown"} (fix: ${v.fixAvailable ? "available" : "none"})`;
            }).join("\n");

            return { success: true, result: `Vulnerabilities found: ${summary}\n\n${advisories}${args.fix ? "\n\nAuto-fix was applied where possible." : "\n\nRun audit_dependencies with fix=true to auto-fix."}` };
          } catch {
            return { success: true, result: stdout.slice(0, 2000) };
          }
        } catch (err: any) {
          const output = err.stdout || err.stderr || err.message;
          try {
            const audit = JSON.parse(output);
            const total = audit.metadata?.vulnerabilities || {};
            const summary = Object.entries(total)
              .filter(([, count]) => (count as number) > 0)
              .map(([sev, count]) => `${count} ${sev}`)
              .join(", ");
            const advisories = Object.values(audit.vulnerabilities || {}).slice(0, 10).map((v: any) => {
              return `- ${v.name}: ${v.severity} - ${v.via?.[0]?.title || v.via?.[0] || "unknown"}`;
            }).join("\n");
            return { success: true, result: `Vulnerabilities: ${summary || "see details"}\n\n${advisories}` };
          } catch {
            return { success: true, result: `Audit result:\n${(output || "").slice(0, 2000)}` };
          }
        }
      }

      case "analyze_imports": {
        const direction = args.direction || "both";
        const targetFile = args.file;

        const findSourceFiles = (dir: string, base: string): string[] => {
          const results: string[] = [];
          try {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
              if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "dist" || entry.name === "build") continue;
              const full = path.join(dir, entry.name);
              if (entry.isDirectory()) {
                results.push(...findSourceFiles(full, base));
              } else if (/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(entry.name)) {
                results.push(path.relative(base, full));
              }
            }
          } catch {}
          return results;
        };

        const sourceFiles = findSourceFiles(workingDir, workingDir);
        const importMap: Record<string, string[]> = {};

        for (const file of sourceFiles) {
          const fullPath = path.join(workingDir, file);
          try {
            const content = fs.readFileSync(fullPath, "utf-8");
            const importRegex = /(?:import\s+.*?from\s+['"]([^'"]+)['"]|require\s*\(\s*['"]([^'"]+)['"]\s*\))/g;
            const imports: string[] = [];
            let match;
            while ((match = importRegex.exec(content)) !== null) {
              const imp = match[1] || match[2];
              if (imp.startsWith(".")) {
                const resolved = path.normalize(path.join(path.dirname(file), imp));
                const withExt = sourceFiles.find(f =>
                  f === resolved || f === resolved + ".ts" || f === resolved + ".tsx" ||
                  f === resolved + ".js" || f === resolved + ".jsx" ||
                  f === resolved + "/index.ts" || f === resolved + "/index.tsx" ||
                  f === resolved + "/index.js" || f === resolved + "/index.jsx"
                );
                if (withExt) imports.push(withExt);
              } else {
                imports.push(imp);
              }
            }
            if (imports.length > 0) importMap[file] = imports;
          } catch {}
        }

        if (targetFile) {
          const normalTarget = targetFile.replace(/^\.\//, "");
          let result = "";

          if (direction === "dependencies" || direction === "both") {
            const deps = importMap[normalTarget] || [];
            result += `Dependencies of ${normalTarget} (${deps.length}):\n${deps.map(d => `  -> ${d}`).join("\n") || "  (none)"}\n`;
          }

          if (direction === "dependents" || direction === "both") {
            const dependents = Object.entries(importMap)
              .filter(([, deps]) => deps.some(d => d === normalTarget || normalTarget.startsWith(d)))
              .map(([file]) => file);
            result += `\nFiles that import ${normalTarget} (${dependents.length}):\n${dependents.map(d => `  <- ${d}`).join("\n") || "  (none)"}`;
          }

          return { success: true, result: result.trim() };
        }

        const lines: string[] = [`Import graph (${sourceFiles.length} source files, ${Object.keys(importMap).length} with imports):\n`];
        const localImports = Object.entries(importMap)
          .map(([file, deps]) => {
            const localDeps = deps.filter(d => !d.includes("node_modules") && d.includes("/"));
            return { file, deps: localDeps };
          })
          .filter(({ deps }) => deps.length > 0)
          .slice(0, 30);

        for (const { file, deps } of localImports) {
          lines.push(`${file}:`);
          for (const dep of deps) {
            lines.push(`  -> ${dep}`);
          }
        }

        if (Object.keys(importMap).length > 30) {
          lines.push(`\n... and ${Object.keys(importMap).length - 30} more files. Use 'file' parameter to analyze specific files.`);
        }

        return { success: true, result: lines.join("\n") };
      }

      case "take_screenshot": {
        try {
          const { projectRunner } = await import("./project-runner");
          const projectName = path.basename(workingDir);
          const status = projectRunner.getStatus(projectName);

          if (!status || status.status !== "running" || !status.port) {
            return { success: false, result: "Project is not running. Start it first using the project runner, then try again." };
          }

          const targetUrl = args.url || `http://localhost:${status.port}`;

          try {
            const fetchRes = await fetch(targetUrl, { signal: AbortSignal.timeout(5000) });
            const html = await fetchRes.text();

            const titleMatch = html.match(/<title>(.*?)<\/title>/i);
            const title = titleMatch ? titleMatch[1] : "(no title)";

            const headingMatches: string[] = [];
            const hRegex = /<h[1-6][^>]*>(.*?)<\/h[1-6]>/gi;
            let hMatch;
            while ((hMatch = hRegex.exec(html)) !== null && headingMatches.length < 5) {
              headingMatches.push(hMatch[1].replace(/<[^>]+>/g, "").trim());
            }

            const buttonMatches: string[] = [];
            const btnRegex = /<button[^>]*>(.*?)<\/button>/gi;
            let bMatch;
            while ((bMatch = btnRegex.exec(html)) !== null && buttonMatches.length < 5) {
              buttonMatches.push(bMatch[1].replace(/<[^>]+>/g, "").trim());
            }

            const inputMatches: string[] = [];
            const inputRegex = /<input[^>]*(?:placeholder=["']([^"']+)["']|type=["']([^"']+)["'])[^>]*>/gi;
            let iMatch;
            while ((iMatch = inputRegex.exec(html)) !== null && inputMatches.length < 5) {
              inputMatches.push(iMatch[1] || `[${iMatch[2]} input]`);
            }

            const imgCount = (html.match(/<img\s/gi) || []).length;
            const linkCount = (html.match(/<a\s/gi) || []).length;
            const hasCSS = /<link[^>]*stylesheet/i.test(html) || /<style/i.test(html);
            const hasJS = /<script/i.test(html);
            const bodyText = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 500);

            let description = `Page analysis of ${targetUrl}:\n`;
            description += `- Title: ${title}\n`;
            description += `- Status: ${fetchRes.status} ${fetchRes.statusText}\n`;
            description += `- Has CSS: ${hasCSS}, Has JS: ${hasJS}\n`;
            description += `- Images: ${imgCount}, Links: ${linkCount}\n`;
            if (headingMatches.length > 0) description += `- Headings: ${headingMatches.join(", ")}\n`;
            if (buttonMatches.length > 0) description += `- Buttons: ${buttonMatches.join(", ")}\n`;
            if (inputMatches.length > 0) description += `- Inputs: ${inputMatches.join(", ")}\n`;
            description += `\nVisible text preview:\n${bodyText}`;

            return { success: true, result: description };
          } catch (fetchErr: any) {
            return { success: false, result: `Could not fetch ${targetUrl}: ${fetchErr.message}` };
          }
        } catch (err: any) {
          return { success: false, result: `Screenshot failed: ${err.message}` };
        }
      }

      default:
        return { success: false, result: `Unknown tool: ${name}` };
    }
  } catch (err: any) {
    return { success: false, result: `Tool error: ${err.message}` };
  }
}

export interface StreamChunk {
  type: "content" | "tool_call" | "plan" | "plan_chunk" | "error" | "done" | "iteration_status" | "diff" | "review" | "tasks" | "command_output";
  content?: string;
  toolName?: string;
  toolCallId?: string;
  toolArgs?: Record<string, any>;
  toolResult?: string;
  toolStatus?: "success" | "error";
  iteration?: number;
  maxIterations?: number;
  phase?: string;
  diffs?: Array<{ path: string; diff: string }>;
  tasks?: Array<{ id: string; title: string; status: string }>;
}

export async function* processAgentMessage(
  conversationId: string,
  userMessage: string,
  endpoint: string,
  modelName?: string,
  mode: string = "build",
  maxTokens: number = 4096,
  temperature: number = 0.7,
  projectPath?: string
): AsyncGenerator<StreamChunk> {
  const prevMessages = await storage.getMessages(conversationId);
  const settingsData = await storage.getSettings();

  await storage.createMessage({
    conversationId,
    role: "user",
    content: userMessage,
    status: "complete",
  });

  await storage.updateConversation(conversationId, {
    title:
      prevMessages.length === 0
        ? userMessage.slice(0, 60) + (userMessage.length > 60 ? "..." : "")
        : undefined,
  });

  const isSelfModification = !projectPath && (
    userMessage.toLowerCase().includes("modify yourself") ||
    userMessage.toLowerCase().includes("add feature to yourself") ||
    userMessage.toLowerCase().includes("fix your") ||
    userMessage.toLowerCase().includes("improve yourself") ||
    userMessage.toLowerCase().includes("update your") ||
    userMessage.toLowerCase().includes("change your")
  );

  const workingDir = projectPath
    ? path.resolve(process.cwd(), "projects", projectPath)
    : process.cwd();

  if (projectPath && !fs.existsSync(workingDir)) {
    fs.mkdirSync(workingDir, { recursive: true });
  }

  const replitToken = settingsData.replitToken || "";
  const hasReplitAccess = replitToken.length > 10;
  const conversation = await storage.getConversation(conversationId);
  const activeReplId = conversation?.replId || undefined;
  const activeReplName = conversation?.replName || undefined;

  const projectContext = gatherProjectContext(workingDir);

  yield {
    type: "iteration_status",
    iteration: 0,
    maxIterations: 25,
    phase: "Analyzing project structure...",
  };

  const recentWindow = 20;
  let contextMessages: Array<{ role: string; content: string }> = [];

  if (prevMessages.length > recentWindow) {
    const olderMessages = prevMessages.slice(0, prevMessages.length - recentWindow);
    const recentMessages = prevMessages.slice(-recentWindow);

    const summaryParts: string[] = [];
    for (const m of olderMessages) {
      const role = m.role === "plan" ? "assistant" : m.role;
      const truncated = m.content.slice(0, 200);
      if (role === "user") {
        summaryParts.push(`User asked: ${truncated}`);
      } else {
        const toolInfo = m.toolCalls ? ` (used ${(m.toolCalls as any[]).length} tools)` : "";
        summaryParts.push(`Assistant responded${toolInfo}: ${truncated}`);
      }
    }

    const conversationSummary = `[CONVERSATION HISTORY SUMMARY - ${olderMessages.length} earlier messages]\n${summaryParts.join("\n")}\n[END SUMMARY - Recent ${recentMessages.length} messages follow]`;

    contextMessages = [
      { role: "system", content: conversationSummary },
      ...recentMessages.map((m) => ({
        role: m.role === "plan" ? "assistant" : m.role,
        content: m.content,
      })),
    ];
  } else {
    contextMessages = prevMessages.map((m) => ({
      role: m.role === "plan" ? "assistant" : m.role,
      content: m.content,
    }));
  }

  const chatMessages: any[] = [
    {
      role: "system",
      content: getSystemPrompt(mode, isSelfModification, hasReplitAccess, activeReplId, activeReplName, projectContext),
    },
    ...contextMessages,
    { role: "user", content: userMessage },
  ];

  const apiEndpoint = endpoint.replace(/\/$/, "");

  const PLAN_MODE_ALLOWED_TOOLS = new Set([
    "read_file", "list_files", "search_files", "read_multiple_files", "read_logs",
    "replit_list_files", "replit_read_file", "replit_list_projects",
  ]);

  const allToolDefs = [...AGENT_TOOLS];
  if (hasReplitAccess) {
    allToolDefs.push(...REPLIT_TOOLS);
  }

  const filteredToolDefs = mode === "plan"
    ? allToolDefs.filter((t) => PLAN_MODE_ALLOWED_TOOLS.has(t.name))
    : allToolDefs;

  const toolsForApi = filteredToolDefs.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));

  let iterationCount = 0;
  const maxIterations = 25;
  let fullResponse = "";
  const toolCallsLog: any[] = [];
  let consecutiveErrors = 0;
  const maxConsecutiveErrors = 5;
  let totalErrorRecoveries = 0;
  const maxTotalRecoveries = 8;
  let insideThinkBlock = false;
  let thinkBuffer = "";
  const sessionDiffs: Map<string, { before: string; after: string; path: string }> = new Map();
  const modifiedFiles: Set<string> = new Set();
  let lastTaskUpdateIteration = 0;
  let taskListExists = false;
  let codeInMessageCount = 0;

  try {
    const existingTaskList = path.join(workingDir, ".agent-tasks.json");
    if (fs.existsSync(existingTaskList)) {
      taskListExists = true;
    }
  } catch {}

  const planMatch = userMessage.match(/Approved\.\s*Please implement the following plan:\s*\n\n([\s\S]+)/);
  if (planMatch && mode === "build") {
    const planText = planMatch[1];
    const stepPattern = /^\s*(\d+[\.\)]\s+|[-*]\s+)/;
    const planLines = planText.split("\n").filter((l: string) => stepPattern.test(l));
    if (planLines.length >= 2) {
      const tasks = planLines.map((line: string, i: number) => ({
        id: `step-${i + 1}`,
        title: line.replace(/^\s*\d+[\.\)]\s*|^\s*[-*]\s*/, "").replace(/\*\*/g, "").trim(),
        status: i === 0 ? "in_progress" : "pending",
      }));
      const taskListPath = path.join(workingDir, ".agent-tasks.json");
      fs.writeFileSync(taskListPath, JSON.stringify({ tasks, createdAt: new Date().toISOString() }, null, 2));
      taskListExists = true;
      yield { type: "tasks", tasks };

      try {
        const checkpointDir = path.join(workingDir, ".checkpoints");
        const checkpointId = `cp-pre-build-${Date.now()}`;
        const cpDir = path.join(checkpointDir, checkpointId);
        fs.mkdirSync(cpDir, { recursive: true });
        const filesToSnapshot = getAllProjectFiles(workingDir);
        let count = 0;
        const manifest: Array<{ relativePath: string; size: number }> = [];
        for (const file of filesToSnapshot) {
          if (count >= 500) break;
          const relativePath = path.relative(workingDir, file);
          if (relativePath.startsWith(".checkpoints") || relativePath.startsWith("node_modules")) continue;
          const destFile = path.join(cpDir, relativePath);
          fs.mkdirSync(path.dirname(destFile), { recursive: true });
          fs.copyFileSync(file, destFile);
          manifest.push({ relativePath, size: fs.statSync(file).size });
          count++;
        }
        fs.writeFileSync(path.join(cpDir, ".manifest.json"), JSON.stringify({
          id: checkpointId,
          name: "Pre-build checkpoint (auto)",
          createdAt: new Date().toISOString(),
          files: manifest,
        }, null, 2));
        yield {
          type: "tool_call",
          toolName: "checkpoint",
          toolCallId: `auto-${checkpointId}`,
          toolArgs: { action: "create", name: "Pre-build checkpoint (auto)" },
          content: "Auto-creating checkpoint before build...",
        };
        yield {
          type: "tool_call",
          toolName: "checkpoint",
          toolCallId: `auto-${checkpointId}`,
          toolResult: `Checkpoint created: ${checkpointId} (${count} files saved)`,
          toolStatus: "success",
        };
      } catch {}

      const taskSummary = tasks.map((t: any) => `  - [${t.status}] ${t.id}: ${t.title}`).join("\n");
      chatMessages.push({
        role: "system" as any,
        content: `Task list created from plan. "${tasks[0]?.id}" is already marked in_progress.\n\nTasks:\n${taskSummary}\n\nRules:\n1. When you finish a task, call task_list(action="update", taskId="<id>", status="completed") IMMEDIATELY\n2. The next pending task auto-becomes your current task\n3. Work through ALL tasks in order\n4. After completing the LAST task, call task_list(action="get") to confirm all done`,
      });
    }
  }

  while (iterationCount < maxIterations) {
    iterationCount++;

    const isToolLoop = iterationCount > 1;
    const phase = isToolLoop
      ? `Continuing work (step ${iterationCount}/${maxIterations})...`
      : "Thinking...";

    yield {
      type: "iteration_status",
      iteration: iterationCount,
      maxIterations,
      phase,
    };

    if (taskListExists && mode === "build" && iterationCount > 1 && (iterationCount - lastTaskUpdateIteration) >= 2) {
      try {
        const taskListPath = path.join(workingDir, ".agent-tasks.json");
        if (fs.existsSync(taskListPath)) {
          const data = JSON.parse(fs.readFileSync(taskListPath, "utf-8"));
          const pendingTasks = data.tasks.filter((t: any) => t.status === "pending" || t.status === "in_progress");
          const completedTasks = data.tasks.filter((t: any) => t.status === "completed");
          if (pendingTasks.length > 0) {
            const currentTask = pendingTasks[0];
            const isInProgress = currentTask.status === "in_progress";
            const action = isInProgress
              ? `task_list(action="update", taskId="${currentTask.id}", status="completed")`
              : `task_list(action="update", taskId="${currentTask.id}", status="in_progress")`;
            chatMessages.push({
              role: "system" as any,
              content: `IMPORTANT - UPDATE TASK NOW: Progress ${completedTasks.length}/${data.tasks.length}. Current: "${currentTask.id}: ${currentTask.title}" [${currentTask.status}]. Your NEXT tool call MUST be: ${action}. Do this BEFORE any other tool call.`,
            });
            lastTaskUpdateIteration = iterationCount;
          }
        }
      } catch {}
    }

    try {
      const streamRes = await fetch(`${apiEndpoint}/v1/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "ngrok-skip-browser-warning": "true",
        },
        body: JSON.stringify({
          model: modelName || undefined,
          messages: chatMessages,
          tools: toolsForApi,
          tool_choice: "auto",
          max_tokens: maxTokens,
          temperature,
          stream: true,
        }),
        signal: AbortSignal.timeout(120000),
      });

      if (!streamRes.ok || !streamRes.body) {
        const errText = await streamRes.text().catch(() => "Unknown error");
        throw new Error(`LM Studio returned ${streamRes.status}: ${errText}`);
      }

      let messageContent = "";
      const toolCallDeltas: Map<number, { id: string; name: string; arguments: string }> = new Map();
      let finishReason = "";

      const reader = streamRes.body.getReader();
      const decoder = new TextDecoder();
      let sseBuffer = "";

      const processSSELine = (line: string) => {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data: ")) return;
        const payload = trimmed.slice(6);
        if (payload === "[DONE]") return;

        let chunk: any;
        try {
          chunk = JSON.parse(payload);
        } catch {
          return;
        }

        const delta = chunk.choices?.[0]?.delta;
        const chunkFinish = chunk.choices?.[0]?.finish_reason;
        if (chunkFinish) finishReason = chunkFinish;
        if (!delta) return;

        if (delta.content) {
          thinkBuffer += delta.content;
          let visibleContent = "";
          let safety = 100;
          while (thinkBuffer.length > 0 && --safety > 0) {
            if (insideThinkBlock) {
              const closeMatch = thinkBuffer.match(/<\/(?:think|thinking|reasoning)>|<\|think\|>/i);
              if (closeMatch && closeMatch.index !== undefined) {
                insideThinkBlock = false;
                thinkBuffer = thinkBuffer.slice(closeMatch.index + closeMatch[0].length);
              } else {
                thinkBuffer = "";
                break;
              }
            } else {
              const openMatch = thinkBuffer.match(/<(?:think|thinking|reasoning)>|<\|think\|>/i);
              if (openMatch && openMatch.index !== undefined) {
                visibleContent += thinkBuffer.slice(0, openMatch.index);
                insideThinkBlock = true;
                thinkBuffer = thinkBuffer.slice(openMatch.index + openMatch[0].length);
              } else if (thinkBuffer.length >= 12) {
                visibleContent += thinkBuffer.slice(0, thinkBuffer.length - 11);
                thinkBuffer = thinkBuffer.slice(thinkBuffer.length - 11);
                break;
              } else {
                break;
              }
            }
          }
          if (visibleContent) {
            visibleContent = visibleContent
              .replace(/\[?(?:Task progress|Progress|IMPORTANT - UPDATE TASK)[^\]]*(?:\]|$)/gi, "")
              .replace(/Your NEXT tool call MUST be:.*$/gm, "")
              .replace(/Do this BEFORE any other tool call\.?/g, "")
              .replace(/task_list\(action="update"[^)]*\)/g, "");
            if (visibleContent.trim()) {
              messageContent += visibleContent;
              pendingYields.push({ type: "content", content: visibleContent });
            }
          }
        }

        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index ?? 0;
            if (!toolCallDeltas.has(idx)) {
              toolCallDeltas.set(idx, {
                id: tc.id || `tc-${iterationCount}-${idx}`,
                name: tc.function?.name || "",
                arguments: tc.function?.arguments || "",
              });
            } else {
              const existing = toolCallDeltas.get(idx)!;
              if (tc.id) existing.id = tc.id;
              if (tc.function?.name) existing.name += tc.function.name;
              if (tc.function?.arguments) existing.arguments += tc.function.arguments;
            }
          }
        }
      };

      const pendingYields: StreamChunk[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        sseBuffer += decoder.decode(value, { stream: true });
        const lines = sseBuffer.split("\n");
        sseBuffer = lines.pop() || "";

        for (const line of lines) {
          processSSELine(line);
        }

        for (const chunk of pendingYields) {
          yield chunk;
        }
        pendingYields.length = 0;
      }

      if (sseBuffer.trim()) {
        processSSELine(sseBuffer);
        for (const chunk of pendingYields) {
          yield chunk;
        }
        pendingYields.length = 0;
      }

      if (thinkBuffer && !insideThinkBlock) {
        pendingYields.push({ type: "content", content: thinkBuffer });
        thinkBuffer = "";
      }
      for (const chunk of pendingYields) {
        yield chunk;
      }
      pendingYields.length = 0;

      const assembledToolCalls = Array.from(toolCallDeltas.values()).filter(tc => tc.name);

      if (mode === "build" && assembledToolCalls.length === 0 && messageContent) {
        const extractedCalls = extractToolCallsFromText(messageContent);
        for (const ec of extractedCalls) {
          assembledToolCalls.push({
            id: `tc-extracted-${iterationCount}-${ec.name}`,
            name: ec.name,
            arguments: JSON.stringify(ec.arguments),
          });
        }
      }

      if (!messageContent && assembledToolCalls.length === 0) {
        consecutiveErrors++;
        if (consecutiveErrors >= 3) {
          yield { type: "error", content: "LM Studio returned empty responses repeatedly. The model may be having issues." };
          fullResponse += "\n\n[Agent stopped: model returned empty responses]";
          break;
        }
        yield {
          type: "iteration_status",
          iteration: iterationCount,
          maxIterations,
          phase: `Empty response from model, retrying (attempt ${consecutiveErrors}/3)...`,
        };
        await new Promise((resolve) => setTimeout(resolve, 2000));
        iterationCount = Math.max(0, iterationCount - 1);
        continue;
      }

      consecutiveErrors = 0;

      if (assembledToolCalls.length > 0) {
        const apiToolCalls = assembledToolCalls.map((tc, i) => ({
          id: tc.id,
          type: "function" as const,
          function: { name: tc.name, arguments: tc.arguments },
        }));

        chatMessages.push({
          role: "assistant",
          content: messageContent || "",
          ...({ tool_calls: apiToolCalls } as any),
        });

        if (messageContent) {
          fullResponse += messageContent;
        }

        let hasErrors = false;

        for (const toolCall of assembledToolCalls) {
          const fnName = toolCall.name;
          let fnArgs: Record<string, any> = {};
          try {
            fnArgs = JSON.parse(toolCall.arguments || "{}");
          } catch {
            fnArgs = {};
          }

          const toolCallId = toolCall.id || `tc-${iterationCount}-${fnName}`;

          if (mode === "plan" && !PLAN_MODE_ALLOWED_TOOLS.has(fnName)) {
            const blockMsg = `Tool "${fnName}" is blocked in Plan mode. Only read-only tools are allowed. Please provide your plan as text instead.`;
            yield {
              type: "tool_call",
              toolName: fnName,
              toolCallId,
              toolResult: blockMsg,
              toolStatus: "error",
            };
            chatMessages.push({
              role: "tool" as any,
              content: blockMsg,
              ...({ tool_call_id: toolCall.id } as any),
            });
            continue;
          }

          yield {
            type: "tool_call",
            toolName: fnName,
            toolCallId,
            toolArgs: fnArgs,
            content: `Executing: ${fnName}`,
          };

          const resolvePath = (p: string) => path.isAbsolute(p) ? p : path.join(workingDir, p);
          if (["write_file", "edit_file", "delete_file"].includes(fnName) && fnArgs.path) {
            const fp = resolvePath(fnArgs.path);
            if (!sessionDiffs.has(fp)) {
              try {
                sessionDiffs.set(fp, {
                  before: fs.existsSync(fp) ? fs.readFileSync(fp, "utf-8") : "",
                  after: "",
                  path: fnArgs.path,
                });
              } catch {}
            }
          }

          const commandOutputChunks: string[] = [];
          if (fnName === "execute_command") {
            fnArgs._onOutput = (chunk: string) => {
              commandOutputChunks.push(chunk);
            };
          }

          const toolTimeout = fnName === "execute_command" ? 90000 : 60000;
          let result: { success: boolean; result: string };
          try {
            const toolPromise = fnName.startsWith("replit_")
              ? executeReplitTool(fnName, fnArgs, replitToken)
              : executeTool(fnName, fnArgs, workingDir, !!projectPath);
            let timer: ReturnType<typeof setTimeout> | null = null;
            const timeoutPromise = new Promise<never>((_, reject) => {
              timer = setTimeout(() => reject(new Error(`Tool "${fnName}" timed out after ${toolTimeout / 1000}s`)), toolTimeout);
            });
            try {
              result = await Promise.race([toolPromise, timeoutPromise]);
            } finally {
              if (timer) clearTimeout(timer);
            }
          } catch (toolErr: any) {
            result = { success: false, result: `Tool execution error: ${toolErr.message}` };
          }

          if (fnName === "execute_command" && commandOutputChunks.length > 0) {
            yield {
              type: "command_output",
              toolCallId,
              content: commandOutputChunks.join(""),
            };
          }

          if (["write_file", "edit_file", "delete_file"].includes(fnName) && fnArgs.path && result.success) {
            const fp = resolvePath(fnArgs.path);
            modifiedFiles.add(fp);
            const entry = sessionDiffs.get(fp);
            if (entry) {
              try {
                entry.after = fnName === "delete_file" ? "(deleted)" : (fs.existsSync(fp) ? fs.readFileSync(fp, "utf-8") : "");
              } catch {}
            }
          }

          if (fnName === "execute_command" && !result.success) {
            const parsed = parseErrorsFromOutput(result.result);
            if (parsed) {
              result.result += `\n\n${parsed}\nPlease analyze these errors and fix them.`;
            }

            const errorKey = result.result.slice(0, 100);
            const prevFailures = toolCallsLog.filter(t => t.status === "error" && t.name === "execute_command");
            const similarFailures = prevFailures.filter(t => t.result?.slice(0, 100) === errorKey);
            if (similarFailures.length >= 2) {
              result.result += `\n\n[AUTO-RECOVERY] This same error has occurred ${similarFailures.length + 1} times. You should try a COMPLETELY DIFFERENT approach. Consider:\n1. Use web_search to look up this specific error\n2. Try an alternative library or method\n3. Check if there are missing dependencies\n4. Verify the file paths and configurations are correct\nDo NOT repeat the same approach again.`;
            }
          }

          if (!result.success && fnName !== "execute_command") {
            const sameToolFailures = toolCallsLog.filter(t => t.status === "error" && t.name === fnName);
            if (sameToolFailures.length >= 3) {
              result.result += `\n\n[AUTO-RECOVERY] Tool "${fnName}" has failed ${sameToolFailures.length + 1} times. Try a different approach or use web_search to research the issue.`;
            }
          }

          if (fnName === "task_list" && result.success) {
            lastTaskUpdateIteration = iterationCount;
            taskListExists = true;
            try {
              const taskListPath = path.join(workingDir, ".agent-tasks.json");
              if (fs.existsSync(taskListPath)) {
                const data = JSON.parse(fs.readFileSync(taskListPath, "utf-8"));
                yield { type: "tasks", tasks: data.tasks };
              }
            } catch {}
          }

          if (!result.success) {
            hasErrors = true;
          }

          toolCallsLog.push({
            name: fnName,
            args: fnArgs,
            status: result.success ? "success" : "error",
            result: result.result.slice(0, 500),
          });

          let toolResultForLLM = result.result;
          if (taskListExists && mode === "build" && fnName !== "task_list") {
            try {
              const taskListPath = path.join(workingDir, ".agent-tasks.json");
              if (fs.existsSync(taskListPath)) {
                const data = JSON.parse(fs.readFileSync(taskListPath, "utf-8"));
                const pending = data.tasks.filter((t: any) => t.status === "pending" || t.status === "in_progress");
                const completed = data.tasks.filter((t: any) => t.status === "completed");
                if (pending.length > 0) {
                  const cur = pending[0];
                  toolResultForLLM += `\n\n[Task progress: ${completed.length}/${data.tasks.length} done | Current: "${cur.id}: ${cur.title}" (${cur.status})]`;
                }
              }
            } catch {}
          }

          yield {
            type: "tool_call",
            toolName: fnName,
            toolCallId,
            toolResult: result.result.slice(0, 300),
            toolStatus: result.success ? "success" : "error",
          };

          chatMessages.push({
            role: "tool" as any,
            content: toolResultForLLM,
            ...({ tool_call_id: toolCall.id } as any),
          });
        }

        if (hasErrors) {
          consecutiveErrors++;
          totalErrorRecoveries++;
          if (totalErrorRecoveries >= maxTotalRecoveries) {
            yield {
              type: "iteration_status",
              iteration: iterationCount,
              maxIterations,
              phase: "Too many total errors, wrapping up...",
            };
            chatMessages.push({
              role: "user" as any,
              content: "You've hit too many errors overall. Summarize what you accomplished and what still needs fixing, then stop.",
            });
          } else if (consecutiveErrors >= maxConsecutiveErrors) {
            yield {
              type: "iteration_status",
              iteration: iterationCount,
              maxIterations,
              phase: "Multiple errors encountered, attempting recovery...",
            };
            chatMessages.push({
              role: "user" as any,
              content: `You've had ${consecutiveErrors} consecutive errors. Try a COMPLETELY DIFFERENT approach:\n1. Use web_search to look up the error\n2. Read the relevant files to understand the current state\n3. Try a simpler fix or alternative method\nDo NOT give up. Do NOT ask the user what to do. Keep working.`,
            });
            consecutiveErrors = Math.max(0, consecutiveErrors - 2);
          }
        }

        continue;
      }

      if (messageContent) {
        messageContent = messageContent
          .replace(/\[?(?:Task progress|Progress|IMPORTANT - UPDATE TASK)[^\]]*(?:\]|$)/gi, "")
          .replace(/Your NEXT tool call MUST be:.*$/gm, "")
          .replace(/Do this BEFORE any other tool call\.?/g, "")
          .replace(/task_list\(action="update"[^)]*\)/g, "")
          .replace(/\n{3,}/g, "\n\n")
          .trim();
      }

      if (messageContent) {
        const hasCodeBlocks = /```[\w]*\s*\n?[\s\S]{30,}?```/.test(messageContent);
        if (hasCodeBlocks) {
          if (mode === "build" && assembledToolCalls.length === 0) {
            codeInMessageCount++;
            if (codeInMessageCount <= 2) {
              chatMessages.push({
                role: "assistant",
                content: messageContent,
              });
              chatMessages.push({
                role: "user" as any,
                content: `You wrote code in your message instead of using tools. Call write_file(path, content) for each file you need to create. Do NOT write code in text. Do NOT repeat files you already wrote.`,
              });
              fullResponse += messageContent;
              continue;
            }
          }
          messageContent = messageContent.replace(/```[\w]*\s*\n?[\s\S]*?```/g, "").replace(/\n{3,}/g, "\n\n").trim();
        }
      }

      if (messageContent) {
        fullResponse += messageContent;
      }

      if (finishReason === "tool_calls") {
        continue;
      }

      if (mode === "build" && taskListExists && iterationCount < maxIterations) {
        try {
          const taskListPath = path.join(workingDir, ".agent-tasks.json");
          if (fs.existsSync(taskListPath)) {
            const data = JSON.parse(fs.readFileSync(taskListPath, "utf-8"));
            const pendingTasks = data.tasks.filter((t: any) => t.status === "pending" || t.status === "in_progress");
            if (pendingTasks.length > 0) {
              const completedCount = data.tasks.filter((t: any) => t.status === "completed").length;
              const currentTask = pendingTasks[0];
              chatMessages.push({
                role: "assistant",
                content: messageContent || "",
              });
              chatMessages.push({
                role: "user" as any,
                content: `DO NOT STOP. You still have ${pendingTasks.length} pending tasks (${completedCount}/${data.tasks.length} completed). Current task: "${currentTask.id}: ${currentTask.title}". Use your tools NOW to implement this. Call write_file, edit_file, execute_command, etc. Do NOT explain what you will do - just DO it. Do NOT ask the user anything.`,
              });
              continue;
            }
          }
        } catch {}
      }

      if (mode === "build" && assembledToolCalls.length === 0 && messageContent && iterationCount < maxIterations) {
        const looksLikeExplanation = (
          messageContent.includes("I'll") || messageContent.includes("I will") ||
          messageContent.includes("Let me") || messageContent.includes("Here's what") ||
          messageContent.includes("First,") || messageContent.includes("To fix") ||
          messageContent.includes("would you like") || messageContent.includes("Should I") ||
          messageContent.includes("you can") || messageContent.includes("you should") ||
          messageContent.includes("try running") || messageContent.includes("you may need")
        );
        if (looksLikeExplanation) {
          codeInMessageCount++;
          if (codeInMessageCount <= 3) {
            chatMessages.push({
              role: "assistant",
              content: messageContent || "",
            });
            chatMessages.push({
              role: "user" as any,
              content: `You explained what you'd do instead of doing it. STOP EXPLAINING. Use your tools NOW. Call read_file, write_file, edit_file, execute_command to make the changes. Do NOT write code in messages. Do NOT ask me to do anything. Just DO it.`,
            });
            continue;
          }
        }
      }

      break;
    } catch (err: any) {
      consecutiveErrors++;
      const errMsg = err.response?.data?.error?.message || err.message || "Unknown error";
      const isTimeout = errMsg.includes("timeout") || errMsg.includes("AbortError") || errMsg.includes("ETIMEDOUT");
      const isContextLength = errMsg.includes("context length") || errMsg.includes("maximum context") || errMsg.includes("too long") || errMsg.includes("token limit");
      const isConnectionRefused = errMsg.includes("ECONNREFUSED") || errMsg.includes("fetch failed") || errMsg.includes("ENOTFOUND");
      const isServerError = /returned (500|502|503|504):/.test(errMsg) || errMsg.includes("Internal Server Error") || errMsg.includes("Bad Gateway") || errMsg.includes("Service Unavailable");
      const maxRetries = isConnectionRefused ? 5 : isServerError ? 6 : 4;

      if (isContextLength && chatMessages.length > 4) {
        const systemMsg = chatMessages[0];
        const lastFew = chatMessages.slice(-4);
        chatMessages.length = 0;
        chatMessages.push(systemMsg);
        chatMessages.push({
          role: "system" as any,
          content: "[Context was trimmed due to length limits. Earlier conversation history has been removed. Continue working on the current task based on the remaining context.]",
        });
        chatMessages.push(...lastFew);
        consecutiveErrors = Math.max(0, consecutiveErrors - 1);

        yield {
          type: "iteration_status",
          iteration: iterationCount,
          maxIterations,
          phase: "Context too long, trimming history and retrying...",
        };
        await new Promise((resolve) => setTimeout(resolve, 1000));
        continue;
      }

      if (consecutiveErrors >= maxRetries) {
        const recoveryMsg = isConnectionRefused
          ? `Cannot reach LM Studio at the configured endpoint. Please check that LM Studio is running and the endpoint URL is correct.`
          : isTimeout
          ? `LM Studio is not responding (timed out after ${consecutiveErrors} attempts). The model may be overloaded.`
          : isServerError
          ? `LM Studio server error after ${consecutiveErrors} attempts. The model may be overloaded or crashed. Try restarting LM Studio or loading a smaller model.`
          : `Error communicating with LM Studio after ${consecutiveErrors} attempts: ${errMsg}`;

        yield { type: "error", content: recoveryMsg };

        if (fullResponse) {
          fullResponse += `\n\n[Agent paused due to error: ${errMsg}. Send a message to resume.]`;
        } else {
          fullResponse = `I encountered an error while working: ${recoveryMsg}\n\nSend any message (like "keep going") to retry.`;
        }
        break;
      }

      const baseBackoff = isServerError ? 3000 : 2000;
      const backoffMs = Math.min(baseBackoff * Math.pow(1.5, consecutiveErrors - 1), 20000);

      yield {
        type: "iteration_status",
        iteration: iterationCount,
        maxIterations,
        phase: isConnectionRefused
          ? `LM Studio unreachable, retrying in ${Math.round(backoffMs / 1000)}s (attempt ${consecutiveErrors}/${maxRetries})...`
          : isTimeout
          ? `Request timed out, retrying (attempt ${consecutiveErrors}/${maxRetries})...`
          : isServerError
          ? `Server error (500), retrying in ${Math.round(backoffMs / 1000)}s (attempt ${consecutiveErrors}/${maxRetries})...`
          : `Error occurred, retrying (attempt ${consecutiveErrors}/${maxRetries})...`,
      };

      await new Promise((resolve) => setTimeout(resolve, backoffMs));
      iterationCount = Math.max(0, iterationCount - 1);
      continue;
    }
  }

  if (iterationCount >= maxIterations) {
    yield {
      type: "iteration_status",
      iteration: iterationCount,
      maxIterations,
      phase: "Reached maximum iterations",
    };
    if (!fullResponse.includes("reached the maximum")) {
      const limitMsg = "\n\nI've reached my iteration limit. Here's a summary of what was accomplished and what may still need attention.";
      fullResponse += limitMsg;
      yield { type: "content", content: limitMsg };
    }
  }

  if (taskListExists && mode === "build" && modifiedFiles.size > 0) {
    try {
      const checkpointDir = path.join(workingDir, ".checkpoints");
      const checkpointId = `cp-post-build-${Date.now()}`;
      const cpDir = path.join(checkpointDir, checkpointId);
      fs.mkdirSync(cpDir, { recursive: true });
      const filesToSnapshot = getAllProjectFiles(workingDir);
      let count = 0;
      const manifest: Array<{ relativePath: string; size: number }> = [];
      for (const file of filesToSnapshot) {
        if (count >= 500) break;
        const relativePath = path.relative(workingDir, file);
        if (relativePath.startsWith(".checkpoints") || relativePath.startsWith("node_modules")) continue;
        const destFile = path.join(cpDir, relativePath);
        fs.mkdirSync(path.dirname(destFile), { recursive: true });
        fs.copyFileSync(file, destFile);
        manifest.push({ relativePath, size: fs.statSync(file).size });
        count++;
      }
      fs.writeFileSync(path.join(cpDir, ".manifest.json"), JSON.stringify({
        id: checkpointId,
        name: "Post-build checkpoint (auto)",
        createdAt: new Date().toISOString(),
        files: manifest,
      }, null, 2));
      yield {
        type: "tool_call",
        toolName: "checkpoint",
        toolCallId: `auto-${checkpointId}`,
        toolArgs: { action: "create", name: "Post-build checkpoint (auto)" },
        content: "Auto-creating checkpoint after build...",
      };
      yield {
        type: "tool_call",
        toolName: "checkpoint",
        toolCallId: `auto-${checkpointId}`,
        toolResult: `Checkpoint created: ${checkpointId} (${count} files saved)`,
        toolStatus: "success",
      };
    } catch {}
  }

  if (sessionDiffs.size > 0) {
    const diffEntries: Array<{ path: string; diff: string }> = [];
    for (const [fp, entry] of Array.from(sessionDiffs.entries())) {
      if (entry.after === "" && entry.before === "") continue;
      const diff = generateUnifiedDiff(entry.path, entry.before, entry.after || entry.before);
      if (diff) {
        diffEntries.push({ path: entry.path, diff });
      }
    }
    if (diffEntries.length > 0) {
      yield { type: "diff", diffs: diffEntries };
    }
  }

  if (modifiedFiles.size > 0 && mode === "build" && toolCallsLog.length >= 3) {
    yield {
      type: "iteration_status",
      iteration: iterationCount,
      maxIterations,
      phase: "Reviewing changes...",
    };

    try {
      const changedFileSummary = toolCallsLog
        .filter((t) => ["write_file", "edit_file", "delete_file"].includes(t.name))
        .map((t) => `${t.name}: ${t.args?.path || "unknown"} (${t.status})`)
        .join("\n");

      const reviewPrompt = `You are a code reviewer. Review the following changes made by an AI coding agent and provide brief, actionable feedback.

TASK: ${userMessage.slice(0, 500)}

CHANGES MADE:
${changedFileSummary}

AGENT'S RESPONSE:
${fullResponse.slice(0, 2000)}

Provide a brief review (2-4 sentences):
1. Are the changes correct and complete?
2. Any bugs, missing imports, or security issues?
3. Any suggestions for improvement?

If everything looks good, say "Changes look correct." Otherwise, list specific issues.`;

      const reviewResponse = await axios.post(
        `${apiEndpoint}/v1/chat/completions`,
        {
          model: modelName || undefined,
          messages: [{ role: "user", content: reviewPrompt }],
          max_tokens: 500,
          temperature: 0.3,
          stream: false,
        },
        {
          headers: {
            "Content-Type": "application/json",
            "ngrok-skip-browser-warning": "true",
          },
          timeout: 30000,
        }
      );

      const reviewContent = reviewResponse.data.choices?.[0]?.message?.content;
      if (reviewContent) {
        yield { type: "review", content: reviewContent };
      }
    } catch {
    }
  }

  fullResponse = fullResponse.replace(/<(?:think|thinking|reasoning)>[\s\S]*?<\/(?:think|thinking|reasoning)>/gi, "").replace(/<\|think\|>[\s\S]*?<\|think\|>/gi, "").replace(/<(?:think|thinking|reasoning)>[\s\S]*$/gi, "").replace(/<\|think\|>[\s\S]*$/gi, "").trim();

  if (mode === "plan") {
    fullResponse = fullResponse.replace(/```[\w]*\s*\n?[\s\S]*?```/g, "").replace(/\n{3,}/g, "\n\n").trim();
  }

  let detectedPlan = false;
  if (mode === "plan" && fullResponse) {
    const allLines = fullResponse.split("\n");
    const stepPattern = /^\s*(\d+[\.\)]\s+|[-*]\s+)/;
    let bestRun: string[] = [];
    let currentRun: string[] = [];
    for (const line of allLines) {
      if (stepPattern.test(line)) {
        currentRun.push(line);
      } else {
        if (currentRun.length > bestRun.length) bestRun = currentRun;
        currentRun = [];
      }
    }
    if (currentRun.length > bestRun.length) bestRun = currentRun;
    if (bestRun.length >= 2) {
      detectedPlan = true;
      yield { type: "plan", content: bestRun.join("\n") };
    }
  }

  let finalContent = fullResponse || "I could not generate a response.";
  finalContent = finalContent
    .replace(/\[?(?:Task progress|Progress|IMPORTANT - UPDATE TASK)[^\]]*(?:\]|$)/gi, "")
    .replace(/Your NEXT tool call MUST be:.*$/gm, "")
    .replace(/Do this BEFORE any other tool call\.?/g, "")
    .replace(/task_list\(action="update"[^)]*\)/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (detectedPlan || (mode === "plan")) {
    finalContent = finalContent.replace(/```[\w]*\s*\n?[\s\S]*?```/g, "").replace(/\n{3,}/g, "\n\n").trim();
  }

  await storage.createMessage({
    conversationId,
    role: detectedPlan ? "plan" : "assistant",
    content: finalContent || "I could not generate a response.",
    toolCalls: toolCallsLog.length > 0 ? toolCallsLog : null,
    status: "complete",
  });

  if (isSelfModification && toolCallsLog.length > 0) {
    const filesChanged = toolCallsLog
      .filter((t) => ["write_file", "edit_file", "delete_file"].includes(t.name))
      .map((t) => t.args?.path || "unknown");

    if (filesChanged.length > 0) {
      await storage.createChangeLog({
        description: userMessage.slice(0, 200),
        filesChanged,
        changeType: "self-modification",
      });
    }
  }

  yield { type: "done" };
}

export async function testLmStudioConnection(
  endpoint: string
): Promise<{ success: boolean; model?: string; error?: string }> {
  try {
    const apiEndpoint = endpoint.replace(/\/$/, "");
    const response = await axios.get(`${apiEndpoint}/v1/models`, {
      headers: { "ngrok-skip-browser-warning": "true" },
      timeout: 10000,
    });
    const models = response.data?.data;
    if (models && models.length > 0) {
      return { success: true, model: models[0].id };
    }
    return { success: true, model: "Unknown" };
  } catch (err: any) {
    return {
      success: false,
      error: err.message || "Could not connect to endpoint",
    };
  }
}

export function getProjectFileTree(dir: string, depth: number = 0, maxDepth: number = 4, baseDir?: string): any[] {
  if (depth > maxDepth) return [];
  const root = baseDir || dir;
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    return entries
      .filter(
        (e) =>
          !e.name.startsWith(".") &&
          e.name !== "node_modules" &&
          e.name !== "dist" &&
          e.name !== "migrations" &&
          e.name !== ".git"
      )
      .sort((a, b) => {
        if (a.isDirectory() && !b.isDirectory()) return -1;
        if (!a.isDirectory() && b.isDirectory()) return 1;
        return a.name.localeCompare(b.name);
      })
      .map((entry) => {
        const fullPath = path.join(dir, entry.name);
        const relativePath = path.relative(root, fullPath);
        if (entry.isDirectory()) {
          return {
            name: entry.name,
            path: relativePath,
            type: "directory" as const,
            children: getProjectFileTree(fullPath, depth + 1, maxDepth, root),
          };
        }
        return {
          name: entry.name,
          path: relativePath,
          type: "file" as const,
        };
      });
  } catch {
    return [];
  }
}
