import { useState } from "react";
import { type Message } from "@shared/schema";
import ReactMarkdown from "react-markdown";
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
  Stethoscope,
  Files,
  ListTodo,
  Save,
  RefreshCw,
  Database,
  KeyRound,
  Copy,
  Check,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";

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
  return Wrench;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      size="icon"
      variant="ghost"
      data-testid="button-copy-code"
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
    >
      {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
    </Button>
  );
}

function ToolCallItem({ tool, idx }: { tool: any; idx: number }) {
  const [expanded, setExpanded] = useState(false);
  const Icon = getToolIcon(tool.name || "");
  const hasDetails = tool.args || tool.result;

  return (
    <div className="group" data-testid={`saved-tool-${idx}`}>
      <button
        onClick={() => hasDetails && setExpanded(!expanded)}
        className={`flex items-center gap-2 w-full text-left text-xs text-muted-foreground rounded-md px-2 py-1 ${hasDetails ? "hover-elevate cursor-pointer" : ""}`}
        data-testid={`button-expand-saved-tool-${idx}`}
      >
        {tool.status === "success" ? (
          <CheckCircle2 className="h-3 w-3 text-green-500 shrink-0" />
        ) : tool.status === "error" ? (
          <AlertCircle className="h-3 w-3 text-destructive shrink-0" />
        ) : (
          <Icon className="h-3 w-3 shrink-0" />
        )}
        <span className="font-mono truncate flex-1">{tool.name}</span>
        {hasDetails && (
          expanded ? (
            <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100" />
          )
        )}
      </button>

      {expanded && hasDetails && (
        <div className="ml-5 mr-1 mt-0.5 mb-1 rounded-md bg-muted/30 border border-border overflow-hidden">
          {tool.args && (
            <div className="px-2.5 py-1.5 border-b border-border">
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Input</span>
              <pre className="text-[11px] font-mono mt-1 whitespace-pre-wrap break-all text-foreground/80 max-h-[100px] overflow-y-auto">
                {Object.entries(tool.args as Record<string, unknown>).map(([k, v]) => {
                  const val = typeof v === "string" ? (v.length > 150 ? v.slice(0, 150) + "..." : v) : JSON.stringify(v);
                  return `${k}: ${val}`;
                }).join("\n")}
              </pre>
            </div>
          )}
          {tool.result && (
            <div className="px-2.5 py-1.5">
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Output</span>
              <pre className="text-[11px] font-mono mt-1 whitespace-pre-wrap break-all text-foreground/80 max-h-[120px] overflow-y-auto">
                {(tool.result as string).length > 400 ? (tool.result as string).slice(0, 400) + "..." : tool.result}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ToolCallDisplay({ toolCalls }: { toolCalls: any[] }) {
  const [expanded, setExpanded] = useState(false);
  if (!toolCalls || toolCalls.length === 0) return null;

  const successCount = toolCalls.filter((t: any) => t.status === "success").length;
  const errorCount = toolCalls.filter((t: any) => t.status === "error").length;

  return (
    <div className="mt-2" data-testid="tool-calls-summary">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-xs text-muted-foreground hover-elevate rounded-md px-2 py-1.5 w-full text-left"
        data-testid="button-toggle-tool-calls"
      >
        <Wrench className="h-3 w-3 shrink-0" />
        <span>{toolCalls.length} tool call{toolCalls.length === 1 ? "" : "s"}</span>
        {successCount > 0 && <span className="text-green-500">{successCount} done</span>}
        {errorCount > 0 && <span className="text-destructive">{errorCount} err</span>}
        {expanded ? (
          <ChevronDown className="h-3 w-3 shrink-0 ml-auto" />
        ) : (
          <ChevronRight className="h-3 w-3 shrink-0 ml-auto" />
        )}
      </button>
      {expanded && (
        <div className="mt-1 border border-border rounded-lg bg-muted/20 p-1.5 space-y-0.5">
          {toolCalls.map((tool: any, idx: number) => (
            <ToolCallItem key={idx} tool={tool} idx={idx} />
          ))}
        </div>
      )}
    </div>
  );
}

function CollapsibleCodeBlock({ lang, codeText, lineCount, defaultCollapsed, children }: { lang: string; codeText: string; lineCount: number; defaultCollapsed: boolean; children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  return (
    <div className="my-2 rounded-lg overflow-hidden border border-border group/code relative">
      <div className="flex items-center justify-between gap-1 px-3 py-1 bg-muted/70 border-b border-border">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex items-center gap-1.5 text-[11px] font-mono text-muted-foreground hover:text-foreground"
          data-testid="button-toggle-code-block"
        >
          {collapsed ? <ChevronRight className="h-3 w-3 shrink-0" /> : <ChevronDown className="h-3 w-3 shrink-0" />}
          <span>{lang || "code"}</span>
          <span className="opacity-60">({lineCount} lines)</span>
        </button>
        <CopyButton text={codeText} />
      </div>
      {!collapsed && (
        <pre className="p-3 overflow-x-auto bg-muted/30">
          <code className="text-xs font-mono leading-relaxed">{children}</code>
        </pre>
      )}
    </div>
  );
}

function stripThinkBlocks(text: string): string {
  return text
    .replace(/<(?:think|thinking|reasoning)>[\s\S]*?<\/(?:think|thinking|reasoning)>/gi, "")
    .replace(/<\|think\|>[\s\S]*?<\|think\|>/gi, "")
    .replace(/<(?:think|thinking|reasoning)>[\s\S]*$/gi, "")
    .replace(/<\|think\|>[\s\S]*$/gi, "")
    .trim();
}

function stripCodeBlocks(text: string): string {
  return text
    .replace(/```[\w]*\s*\n?[\s\S]*?```/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function stripTaskHints(text: string): string {
  return text
    .replace(/\[?(?:Task progress|Progress|IMPORTANT - UPDATE TASK)[^\]]*(?:\]|$)/gi, "")
    .replace(/Your NEXT tool call MUST be:.*$/gm, "")
    .replace(/Do this BEFORE any other tool call\.?/g, "")
    .replace(/task_list\(action="update"[^)]*\)/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function MarkdownContent({ content, filterThink = true, filterCode = false }: { content: string; filterThink?: boolean; filterCode?: boolean }) {
  let cleaned = filterThink ? stripThinkBlocks(content) : content;
  cleaned = stripTaskHints(cleaned);
  if (filterCode) cleaned = stripCodeBlocks(cleaned);
  if (!cleaned) return null;
  return (
    <ReactMarkdown
      components={{
        h1: ({ children }) => <h1 className="text-lg font-bold mt-3 mb-1">{children}</h1>,
        h2: ({ children }) => <h2 className="text-base font-bold mt-3 mb-1">{children}</h2>,
        h3: ({ children }) => <h3 className="text-sm font-bold mt-2 mb-1">{children}</h3>,
        p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
        strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
        em: ({ children }) => <em className="italic">{children}</em>,
        ul: ({ children }) => <ul className="list-disc pl-5 mb-2 space-y-0.5">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal pl-5 mb-2 space-y-0.5">{children}</ol>,
        li: ({ children }) => <li>{children}</li>,
        a: ({ href, children }) => (
          <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2 hover:opacity-80">
            {children}
          </a>
        ),
        blockquote: ({ children }) => (
          <blockquote className="border-l-2 border-primary/40 pl-3 my-2 text-muted-foreground italic">{children}</blockquote>
        ),
        hr: () => <hr className="my-3 border-border" />,
        code: ({ className, children, node, ...props }) => {
          const hasLangClass = className?.includes("language-");
          const codeText = String(children).replace(/\n$/, "");
          const lineCount = codeText.split("\n").length;
          const isMultiLine = lineCount > 1;
          const isBlock = hasLangClass || isMultiLine;
          if (isBlock) {
            const lang = className?.replace("language-", "") || "";
            const isLarge = lineCount > 12;
            return <CollapsibleCodeBlock lang={lang} codeText={codeText} lineCount={lineCount} defaultCollapsed={isLarge}>{children}</CollapsibleCodeBlock>;
          }
          return (
            <code className="px-1 py-0.5 rounded bg-muted font-mono text-xs" {...props}>
              {children}
            </code>
          );
        },
        pre: ({ children }) => <>{children}</>,
      }}
    >
      {cleaned}
    </ReactMarkdown>
  );
}

export function ChatMessage({ message }: { message: Message }) {
  const isUser = message.role === "user";
  const isStreaming = message.status === "streaming";
  const isPlan = message.role === "plan";

  if (isUser) {
    return (
      <div className="flex justify-end" data-testid={`message-${message.id}`}>
        <div className="bg-primary text-primary-foreground rounded-2xl rounded-br-md px-4 py-2.5 max-w-[85%] text-sm leading-relaxed">
          <MarkdownContent content={message.content} filterThink={false} />
        </div>
      </div>
    );
  }

  return (
    <div data-testid={`message-${message.id}`}>
      <div className="flex items-center gap-1.5 mb-1.5">
        <Sparkles className="h-3 w-3 text-primary" />
        <span className="text-xs font-medium text-muted-foreground">
          Agent
        </span>
        {isStreaming && (
          <Loader2 className="h-3 w-3 animate-spin text-primary" />
        )}
      </div>

      <div className="text-sm leading-relaxed pl-[18px]">
        <MarkdownContent
          content={message.content}
          filterCode={isPlan || (!isStreaming && Array.isArray(message.toolCalls) && message.toolCalls.length > 0)}
        />
        {isStreaming && (
          <span className="inline-block w-1.5 h-4 bg-primary/60 ml-0.5 animate-pulse rounded-sm" />
        )}
      </div>

      {!isUser && Array.isArray(message.toolCalls) && message.toolCalls.length > 0 && (
        <div className="pl-[18px]">
          <ToolCallDisplay toolCalls={message.toolCalls} />
        </div>
      )}
    </div>
  );
}
