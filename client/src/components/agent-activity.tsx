import { useState } from "react";
import {
  Loader2,
  CheckCircle2,
  AlertCircle,
  FileCode,
  Terminal,
  Search,
  Package,
  GitBranch,
  ChevronDown,
  ChevronRight,
  Wrench,
  Globe,
  RefreshCw,
  Stethoscope,
  Files,
  ListTodo,
  Save,
  Database,
  KeyRound,
  Zap,
} from "lucide-react";

export interface ToolStep {
  id: string;
  name: string;
  status: "running" | "success" | "error";
  args?: Record<string, any>;
  result?: string;
}

export interface IterationInfo {
  iteration: number;
  maxIterations: number;
  phase: string;
}

function getToolIcon(name: string) {
  if (name === "web_search") return Globe;
  if (name === "run_test") return RefreshCw;
  if (name === "install_package") return Package;
  if (name === "run_diagnostics") return Stethoscope;
  if (name === "read_multiple_files") return Files;
  if (name === "task_list") return ListTodo;
  if (name === "checkpoint") return Save;
  if (name === "manage_database") return Database;
  if (name === "manage_env") return KeyRound;
  if (name === "git") return GitBranch;
  if (name.includes("read") || name.includes("write") || name.includes("edit") || name.includes("file") || name.includes("delete_file")) return FileCode;
  if (name.includes("execute") || name.includes("command") || name.includes("shell")) return Terminal;
  if (name.includes("search") || name.includes("grep") || name.includes("find") || name.includes("list_files")) return Search;
  if (name.includes("install") || name.includes("package")) return Package;
  if (name.includes("git")) return GitBranch;
  if (name.includes("replit")) return Globe;
  if (name.includes("directory")) return FileCode;
  return Wrench;
}

function getToolLabel(name: string, args?: Record<string, any>): string {
  const filePath = args?.path || args?.file || "";
  switch (name) {
    case "read_file": return `Reading ${filePath}`;
    case "write_file": return `Writing ${filePath}`;
    case "edit_file": return `Editing ${filePath}`;
    case "list_files": return `Listing ${filePath || "files"}`;
    case "search_files": return `Searching for "${args?.pattern || "..."}"`;
    case "execute_command": return `Running command`;
    case "create_directory": return `Creating directory ${filePath}`;
    case "delete_file": return `Deleting ${filePath}`;
    case "replit_list_projects": return "Listing Replit projects";
    case "replit_read_file": return `Reading ${filePath} from Replit`;
    case "replit_write_file": return `Writing ${filePath} to Replit`;
    case "replit_list_files": return `Listing files in Replit project`;
    case "replit_delete_file": return `Deleting ${filePath} from Replit`;
    case "web_search": return `Searching web for "${args?.query || "..."}"`;
    case "run_test": return `Testing: ${args?.description || "running test"}`;
    case "install_package": return `Installing ${args?.packages || "packages"}${args?.dev ? " (dev)" : ""}`;
    case "run_diagnostics": return `Running diagnostics${args?.file ? ` on ${args.file}` : ""}`;
    case "read_multiple_files": return `Reading ${args?.paths?.length || 0} files`;
    case "task_list": return `${args?.action === "create" ? "Creating task list" : args?.action === "update" ? "Updating task" : "Checking tasks"}`;
    case "checkpoint": return `${args?.action === "create" ? `Saving checkpoint "${args?.name || ""}"` : args?.action === "rollback" ? "Rolling back" : "Listing checkpoints"}`;
    case "manage_database": return `${args?.action === "run_sql" ? "Running SQL query" : args?.action === "create" ? "Creating database" : args?.action === "describe_table" ? `Describing ${args?.tableName || "table"}` : "Listing tables"}`;
    case "manage_env": return `${args?.action === "set" ? `Setting ${args?.key || "env var"}` : args?.action === "get" ? `Reading ${args?.key || "env var"}` : args?.action === "delete" ? `Deleting ${args?.key || "env var"}` : "Listing env vars"}`;
    case "read_logs": return `Reading project logs`;
    default: return name.replace(/_/g, " ");
  }
}

function ToolStepItem({ step }: { step: ToolStep }) {
  const [expanded, setExpanded] = useState(false);
  const Icon = getToolIcon(step.name);
  const label = getToolLabel(step.name, step.args);

  return (
    <div className="group" data-testid={`tool-step-${step.id}`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full text-left px-2 py-1 rounded-md hover-elevate transition-colors"
        data-testid={`button-expand-step-${step.id}`}
      >
        {step.status === "running" ? (
          <Loader2 className="h-3 w-3 animate-spin text-primary shrink-0" />
        ) : step.status === "success" ? (
          <CheckCircle2 className="h-3 w-3 text-green-500 shrink-0" />
        ) : (
          <AlertCircle className="h-3 w-3 text-destructive shrink-0" />
        )}
        <Icon className="h-3 w-3 shrink-0 text-muted-foreground" />
        <span className="text-xs truncate flex-1 text-muted-foreground">{label}</span>
        {(step.args || step.result) && (
          expanded ? (
            <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100" />
          )
        )}
      </button>

      {expanded && (step.args || step.result) && (
        <div className="ml-7 mr-2 mt-0.5 mb-1.5 rounded-md bg-muted/50 border border-border overflow-hidden">
          {step.args && (
            <div className="px-2.5 py-1.5 border-b border-border">
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Input</span>
              <pre className="text-[11px] font-mono mt-1 whitespace-pre-wrap break-all text-foreground/80 max-h-[120px] overflow-y-auto">
                {Object.entries(step.args).map(([k, v]) => {
                  const val = typeof v === "string" ? (v.length > 200 ? v.slice(0, 200) + "..." : v) : JSON.stringify(v);
                  return `${k}: ${val}`;
                }).join("\n")}
              </pre>
            </div>
          )}
          {step.result && (
            <div className="px-2.5 py-1.5">
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Output</span>
              <pre className="text-[11px] font-mono mt-1 whitespace-pre-wrap break-all text-foreground/80 max-h-[150px] overflow-y-auto">
                {step.result.length > 500 ? step.result.slice(0, 500) + "..." : step.result}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface AgentActivityProps {
  isThinking: boolean;
  steps: ToolStep[];
  hasContent: boolean;
  iterationInfo?: IterationInfo | null;
}

export function AgentActivity({ isThinking, steps, hasContent, iterationInfo }: AgentActivityProps) {
  const [expanded, setExpanded] = useState(true);

  if (!isThinking && steps.length === 0) return null;

  const completedSteps = steps.filter(s => s.status === "success").length;
  const errorSteps = steps.filter(s => s.status === "error").length;
  const runningSteps = steps.filter(s => s.status === "running").length;
  const latestRunning = steps.filter(s => s.status === "running").pop();

  const progressPct = iterationInfo
    ? (iterationInfo.maxIterations > 0
        ? (iterationInfo.iteration / iterationInfo.maxIterations) * 100
        : Math.min(iterationInfo.iteration * 5, 95))
    : steps.length > 0
      ? (completedSteps / steps.length) * 100
      : 0;

  return (
    <div
      className="mx-auto w-full"
      data-testid="agent-activity-panel"
    >
      <div className="bg-background/80 backdrop-blur-xl border border-border rounded-xl shadow-sm overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-[2px] bg-muted overflow-hidden rounded-t-xl">
          <div
            className="h-full bg-primary transition-all duration-500 ease-out"
            style={{ width: `${progressPct}%` }}
          />
        </div>

        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-3 w-full text-left px-4 py-2.5 hover-elevate"
          data-testid="button-toggle-activity"
        >
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {runningSteps > 0 ? (
              <div className="h-5 w-5 rounded-md bg-primary/15 flex items-center justify-center shrink-0">
                <Loader2 className="h-3 w-3 animate-spin text-primary" />
              </div>
            ) : (
              <div className="h-5 w-5 rounded-md bg-green-500/15 flex items-center justify-center shrink-0">
                <Zap className="h-3 w-3 text-green-500" />
              </div>
            )}

            <span className="text-xs font-medium truncate">
              {isThinking && !hasContent && steps.length === 0
                ? (iterationInfo?.phase
                    ? iterationInfo.phase.replace(/^(?:Planner|Coder):\s*/i, "")
                    : "Thinking...")
                : runningSteps > 0
                  ? (latestRunning ? getToolLabel(latestRunning.name, latestRunning.args) : "Working...")
                  : `Completed ${completedSteps} step${completedSteps === 1 ? "" : "s"}`
              }
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {iterationInfo && iterationInfo.iteration > 1 && (
              <span className="text-[10px] text-muted-foreground tabular-nums">
                {iterationInfo.maxIterations > 0
                  ? `${iterationInfo.iteration}/${iterationInfo.maxIterations}`
                  : `Step ${iterationInfo.iteration}`}
              </span>
            )}
            {completedSteps > 0 && (
              <span className="text-[10px] text-green-500 tabular-nums">{completedSteps} done</span>
            )}
            {errorSteps > 0 && (
              <span className="text-[10px] text-destructive tabular-nums">{errorSteps} err</span>
            )}
            {steps.length > 0 && (
              expanded ? (
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
              )
            )}
          </div>
        </button>

        {expanded && steps.length > 0 && (
          <div className="border-t border-border px-2 py-1.5 max-h-[240px] overflow-y-auto">
            <div className="space-y-0.5">
              {steps.map((step) => (
                <ToolStepItem key={step.id} step={step} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
