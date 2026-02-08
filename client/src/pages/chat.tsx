import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { type Message, type Conversation, type Settings } from "@shared/schema";
import { ChatMessage } from "@/components/chat-message";
import { ChatInput } from "@/components/chat-input";
import { PlanApproval } from "@/components/plan-approval";
import { AgentActivity, type ToolStep, type IterationInfo } from "@/components/agent-activity";
import { FileTree, type FileNode } from "@/components/file-tree";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  Bot,
  Code,
  Loader2,
  Play,
  Square,
  RotateCcw,
  Monitor,
  Terminal,
  FolderTree,
  X,
  PanelRightClose,
  PanelRightOpen,
  FileCode,
  ChevronDown,
  ChevronRight,
  ShieldCheck,
  GitCompare,
  ListTodo,
  CheckCircle2,
  Circle,
  Eye,
  ExternalLink,
  Rocket,
  Globe,
  Wrench,
  Sparkles,
  MessageSquare,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useRoute } from "wouter";

function DiffViewer({ diffs, onDismiss }: { diffs: Array<{ path: string; diff: string }>; onDismiss: () => void }) {
  const [expanded, setExpanded] = useState(true);
  const [expandedFiles, setExpandedFiles] = useState<Record<string, boolean>>({});

  if (diffs.length === 0) return null;

  return (
    <div className="border border-border rounded-xl bg-background/80 backdrop-blur-xl shadow-sm overflow-hidden" data-testid="diff-viewer">
      <div className="flex items-center justify-between gap-2 px-4 py-2.5">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-2 hover-elevate rounded-md flex-1 text-left"
          data-testid="button-toggle-diffs"
        >
          <div className="h-5 w-5 rounded-md bg-primary/15 flex items-center justify-center shrink-0">
            <GitCompare className="h-3 w-3 text-primary" />
          </div>
          <span className="text-xs font-medium">Changes ({diffs.length} file{diffs.length > 1 ? "s" : ""})</span>
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground ml-auto" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground ml-auto" />
          )}
        </button>
        <Button variant="ghost" size="icon" onClick={onDismiss} data-testid="button-dismiss-diffs">
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
      {expanded && (
        <div className="border-t border-border px-2 py-1.5 space-y-0.5">
          {diffs.map((d, i) => (
            <div key={i}>
              <button
                className="flex items-center gap-2 w-full text-left px-2 py-1 rounded-md hover-elevate text-xs"
                onClick={() => setExpandedFiles((prev) => ({ ...prev, [d.path]: !prev[d.path] }))}
                data-testid={`button-diff-file-${i}`}
              >
                <FileCode className="h-3 w-3 shrink-0 text-muted-foreground" />
                <span className="font-mono truncate flex-1">{d.path}</span>
                {expandedFiles[d.path] ? (
                  <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                )}
              </button>
              {expandedFiles[d.path] && (
                <div className="ml-5 mr-1 mt-1 mb-2 rounded-md bg-zinc-950 dark:bg-zinc-950 border border-border overflow-hidden">
                  <pre className="p-2 text-[11px] font-mono leading-relaxed overflow-x-auto max-h-[300px] overflow-y-auto">
                    {d.diff.split("\n").map((line, li) => (
                      <div
                        key={li}
                        className={
                          line.startsWith("+") && !line.startsWith("+++")
                            ? "text-green-400 bg-green-950/30"
                            : line.startsWith("-") && !line.startsWith("---")
                              ? "text-red-400 bg-red-950/30"
                              : line.startsWith("@@")
                                ? "text-cyan-400"
                                : "text-zinc-400"
                        }
                      >
                        {line}
                      </div>
                    ))}
                  </pre>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TaskListPanel({ tasks, isStreaming }: { tasks: Array<{ id: string; title: string; status: string }>; isStreaming?: boolean }) {
  const [expanded, setExpanded] = useState(true);
  if (tasks.length === 0) return null;
  const isCompleted = (s: string) => s === "completed" || s.startsWith("completed");
  const completed = tasks.filter(t => isCompleted(t.status)).length;
  const allDone = completed === tasks.length;
  const progressPct = tasks.length > 0 ? (completed / tasks.length) * 100 : 0;
  const activeTask = tasks.find(t => t.status === "in_progress");

  return (
    <div className="sticky top-0 z-30 mx-auto w-full max-w-3xl px-4 pt-2" data-testid="task-list-panel">
      <div className={`bg-background/95 backdrop-blur-xl border rounded-xl shadow-lg overflow-visible transition-colors duration-300 ${
        isStreaming && !allDone ? "border-primary/30 shadow-primary/10" : allDone ? "border-green-500/30" : "border-border"
      }`}>
        <div className="absolute inset-x-0 top-0 h-1 bg-muted overflow-hidden rounded-t-xl">
          <div
            className={`h-full transition-all duration-700 ease-out ${allDone ? "bg-green-500" : "bg-primary"}`}
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-3 w-full text-left px-4 py-3 hover-elevate rounded-xl"
          data-testid="button-toggle-tasks"
        >
          <div className={`h-6 w-6 rounded-lg flex items-center justify-center shrink-0 ${
            allDone ? "bg-green-500/15 text-green-500" : isStreaming ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
          }`}>
            {allDone ? (
              <CheckCircle2 className="h-3.5 w-3.5" />
            ) : (
              <ListTodo className="h-3.5 w-3.5" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <span className="text-sm font-medium">
              {allDone ? "All tasks complete" : `Tasks ${completed}/${tasks.length}`}
            </span>
            {activeTask && !allDone && (
              <div className="text-[11px] text-muted-foreground truncate mt-0.5">
                Working on: {activeTask.title}
              </div>
            )}
          </div>
          <span className={`text-xs font-medium tabular-nums px-2 py-0.5 rounded-md ${
            allDone ? "bg-green-500/10 text-green-500" : "bg-muted text-muted-foreground"
          }`}>
            {Math.round(progressPct)}%
          </span>
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
        </button>
        {expanded && (
          <div className="border-t border-border px-4 py-2.5 space-y-1.5">
            {tasks.map((task) => {
              const active = task.status === "in_progress";
              const done = isCompleted(task.status);
              return (
                <div
                  key={task.id}
                  className={`flex items-center gap-2.5 text-sm py-1 px-2 rounded-md transition-colors ${
                    active ? "bg-primary/5" : ""
                  }`}
                  data-testid={`task-item-${task.id}`}
                >
                  {done ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500" />
                  ) : active ? (
                    <Loader2 className="h-4 w-4 shrink-0 text-primary animate-spin" />
                  ) : (
                    <Circle className="h-4 w-4 shrink-0 text-muted-foreground/40" />
                  )}
                  <span className={`flex-1 ${done ? "line-through text-muted-foreground" : active ? "text-foreground font-medium" : "text-foreground/70"}`}>
                    {task.title}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function ReviewPanel({ content, onDismiss }: { content: string; onDismiss: () => void }) {
  const [expanded, setExpanded] = useState(true);
  return (
    <div className="border border-border rounded-xl bg-background/80 backdrop-blur-xl shadow-sm overflow-hidden" data-testid="review-panel">
      <div className="flex items-center justify-between gap-2 px-4 py-2.5">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-2 hover-elevate rounded-md flex-1 text-left"
          data-testid="button-toggle-review"
        >
          <div className="h-5 w-5 rounded-md bg-primary/15 flex items-center justify-center shrink-0">
            <ShieldCheck className="h-3 w-3 text-primary" />
          </div>
          <span className="text-xs font-medium">Code Review</span>
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground ml-auto" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground ml-auto" />
          )}
        </button>
        <Button variant="ghost" size="icon" onClick={onDismiss} data-testid="button-dismiss-review">
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
      {expanded && (
        <div className="border-t border-border px-4 py-3">
          <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">{content}</p>
        </div>
      )}
    </div>
  );
}

interface ConversationRound {
  id: string;
  userMessage: Message | null;
  agentMessages: Message[];
}

function groupMessagesIntoRounds(messages: Message[]): ConversationRound[] {
  const rounds: ConversationRound[] = [];
  let currentRound: ConversationRound | null = null;

  for (const msg of messages) {
    if (msg.role === "user") {
      if (currentRound) {
        rounds.push(currentRound);
      }
      currentRound = {
        id: `round-${msg.id}`,
        userMessage: msg,
        agentMessages: [],
      };
    } else {
      if (!currentRound) {
        currentRound = {
          id: `round-orphan-${msg.id}`,
          userMessage: null,
          agentMessages: [],
        };
      }
      currentRound.agentMessages.push(msg);
    }
  }

  if (currentRound) {
    rounds.push(currentRound);
  }

  return rounds;
}

function CollapsedRoundSummary({ round, onExpand }: { round: ConversationRound; onExpand: () => void }) {
  const userText = round.userMessage?.content || "";
  const preview = userText.length > 80 ? userText.slice(0, 80) + "..." : userText;
  const totalTools = round.agentMessages.reduce((sum, m) => {
    return sum + (Array.isArray(m.toolCalls) ? m.toolCalls.length : 0);
  }, 0);

  return (
    <button
      onClick={onExpand}
      className="w-full text-left px-3 py-2.5 rounded-xl border border-border/60 hover-elevate transition-all group"
      data-testid={`button-expand-round-${round.id}`}
    >
      <div className="flex items-center gap-2.5">
        <div className="h-6 w-6 rounded-lg bg-muted flex items-center justify-center shrink-0">
          <MessageSquare className="h-3 w-3 text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium truncate">{preview || "Agent response"}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[10px] text-muted-foreground">
              {round.agentMessages.length} response{round.agentMessages.length !== 1 ? "s" : ""}
            </span>
            {totalTools > 0 && (
              <span className="text-[10px] text-muted-foreground">
                {totalTools} action{totalTools !== 1 ? "s" : ""}
              </span>
            )}
          </div>
        </div>
        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0 group-hover:text-foreground transition-colors" />
      </div>
    </button>
  );
}

function ConversationRounds({
  messages,
  isStreaming,
  streamingContent,
  conversationId,
  liveToolSteps,
  iterationInfo,
}: {
  messages: Message[];
  isStreaming: boolean;
  streamingContent: string;
  conversationId?: string;
  liveToolSteps: ToolStep[];
  iterationInfo: IterationInfo | null;
}) {
  const rounds = groupMessagesIntoRounds(messages);
  const [collapsedRounds, setCollapsedRounds] = useState<Record<string, boolean>>({});

  const autoCollapseThreshold = 2;
  const shouldAutoCollapse = (roundIdx: number) => {
    if (isStreaming && roundIdx < rounds.length - 1) return true;
    if (!isStreaming && rounds.length > autoCollapseThreshold && roundIdx < rounds.length - 1) return true;
    return false;
  };

  const isCollapsed = (roundIdx: number, roundId: string) => {
    if (collapsedRounds[roundId] !== undefined) return collapsedRounds[roundId];
    return shouldAutoCollapse(roundIdx);
  };

  const toggleRound = (roundId: string, collapsed: boolean) => {
    setCollapsedRounds((prev) => ({ ...prev, [roundId]: collapsed }));
  };

  return (
    <div className="space-y-4">
      {rounds.map((round, idx) => {
        const collapsed = isCollapsed(idx, round.id);

        if (collapsed) {
          return (
            <CollapsedRoundSummary
              key={round.id}
              round={round}
              onExpand={() => toggleRound(round.id, false)}
            />
          );
        }

        return (
          <div key={round.id} className="space-y-4" data-testid={`round-${round.id}`}>
            {rounds.length > 1 && idx < rounds.length - 1 && (
              <button
                onClick={() => toggleRound(round.id, true)}
                className="flex items-center gap-1.5 text-[10px] text-muted-foreground/60 hover:text-muted-foreground transition-colors"
                data-testid={`button-collapse-round-${round.id}`}
              >
                <ChevronDown className="h-3 w-3" />
                <span>Collapse</span>
              </button>
            )}
            {round.userMessage && (
              <ChatMessage key={round.userMessage.id} message={round.userMessage} />
            )}
            {round.agentMessages.map((msg) => (
              <ChatMessage key={msg.id} message={msg} />
            ))}
          </div>
        );
      })}

      {isStreaming && (
        <div className="space-y-3" data-testid="streaming-container">
          {(liveToolSteps.length > 0 || iterationInfo) && (
            <AgentActivity
              isThinking={isStreaming}
              steps={liveToolSteps}
              hasContent={streamingContent.length > 0}
              iterationInfo={iterationInfo}
            />
          )}
          {streamingContent && (
            <ChatMessage
              message={{
                id: "streaming",
                conversationId: conversationId!,
                role: "assistant",
                content: streamingContent,
                toolCalls: null,
                status: "streaming",
                createdAt: new Date(),
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}

export interface ChatPageProps {
  projectConversationId?: string;
  projectName?: string;
  [key: string]: any;
}

export default function ChatPage(props: ChatPageProps = {}) {
  const [, params] = useRoute("/chat/:id");
  const conversationId = props.projectConversationId || params?.id;
  const { toast } = useToast();
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [selectedFile, setSelectedFile] = useState<string>();
  const [fileContent, setFileContent] = useState<string>();
  const [pendingPlan, setPendingPlan] = useState<string | null>(null);
  const [liveToolSteps, setLiveToolSteps] = useState<ToolStep[]>([]);
  const [iterationInfo, setIterationInfo] = useState<IterationInfo | null>(null);
  const toolStepCounter = useRef(0);

  const [showPanel, setShowPanel] = useState(true);
  const [activeTab, setActiveTab] = useState("preview");
  const [projectLogs, setProjectLogs] = useState<string[]>([]);
  const [projectStatus, setProjectStatus] = useState<string>("stopped");
  const [projectPort, setProjectPort] = useState<number | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [fileDiffs, setFileDiffs] = useState<Array<{ path: string; diff: string }>>([]);
  const [reviewContent, setReviewContent] = useState<string | null>(null);
  const [agentTasks, setAgentTasks] = useState<Array<{ id: string; title: string; status: string }>>([]);
  const [fileChanges, setFileChanges] = useState<Array<{ filename: string; eventType: string; timestamp: number }>>([]);
  const [agentError, setAgentError] = useState(false);
  const [publishDialogOpen, setPublishDialogOpen] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState<{ success?: boolean; error?: string; url?: string; buildLog?: string } | null>(null);

  const { data: conversation } = useQuery<Conversation>({
    queryKey: ["/api/conversations", conversationId],
    enabled: !!conversationId,
  });

  const { data: messages = [], isLoading: messagesLoading } = useQuery<Message[]>({
    queryKey: ["/api/conversations", conversationId, "messages"],
    enabled: !!conversationId,
  });

  const { data: settings } = useQuery<Settings>({
    queryKey: ["/api/settings"],
  });

  const { data: files, refetch: refetchFiles } = useQuery<FileNode[]>({
    queryKey: ["/api/conversations", conversationId, "files"],
    enabled: !!conversationId && showPanel && activeTab === "code",
  });

  const mode = settings?.mode || "build";

  const updateMode = useMutation({
    mutationFn: async (newMode: "plan" | "build") => {
      await apiRequest("PATCH", "/api/settings", { mode: newMode });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
    },
  });


  useEffect(() => {
    setAgentTasks([]);
    if (!conversationId) return;
    fetch(`/api/conversations/${conversationId}/tasks`, { credentials: "include" })
      .then((r) => {
        if (!r.ok) return { tasks: [] };
        return r.json();
      })
      .then((data) => {
        setAgentTasks(data.tasks || []);
      })
      .catch(() => setAgentTasks([]));
  }, [conversationId]);

  useEffect(() => {
    if (!conversation?.localProjectPath) return;

    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let reconnectDelay = 1000;
    let disposed = false;

    const connect = () => {
      if (disposed) return;
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
      wsRef.current = ws;

      ws.onopen = () => {
        reconnectDelay = 1000;
        ws.send(JSON.stringify({ type: "subscribe", projectPath: conversation.localProjectPath }));
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === "log") {
            setProjectLogs((prev) => {
              const next = [...prev, msg.line];
              return next.length > 500 ? next.slice(-500) : next;
            });
          } else if (msg.type === "logs_batch") {
            setProjectLogs(msg.logs || []);
          } else if (msg.type === "status") {
            setProjectStatus(msg.status);
          } else if (msg.type === "port_changed") {
            setProjectPort(msg.port);
          } else if (msg.type === "file_change") {
            setFileChanges((prev) => {
              const next = [...prev, { filename: msg.filename, eventType: msg.eventType, timestamp: msg.timestamp }];
              return next.length > 50 ? next.slice(-50) : next;
            });
          }
        } catch {}
      };

      ws.onclose = () => {
        wsRef.current = null;
        if (!disposed) {
          reconnectTimer = setTimeout(() => {
            reconnectDelay = Math.min(reconnectDelay * 1.5, 10000);
            connect();
          }, reconnectDelay);
        }
      };

      ws.onerror = () => {
        ws.close();
      };
    };

    connect();

    fetch(`/api/project-runner/status/${conversation.localProjectPath}`)
      .then((r) => r.json())
      .then((info) => {
        setProjectStatus(info.status || "stopped");
        if (info.port) setProjectPort(info.port);
        if (info.logs) setProjectLogs(info.logs);
      })
      .catch(() => {});

    return () => {
      disposed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (wsRef.current) wsRef.current.close();
      wsRef.current = null;
    };
  }, [conversation?.localProjectPath]);

  useEffect(() => {
    if (logsEndRef.current && activeTab === "shell") {
      logsEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [projectLogs, activeTab]);

  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    const el = scrollRef.current;
    const threshold = 100;
    isNearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
  }, []);

  useEffect(() => {
    if (isNearBottomRef.current && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, streamingContent, liveToolSteps]);

  const startProject = useCallback(async () => {
    if (!conversation?.localProjectPath) return;
    try {
      setProjectStatus("starting");
      const res = await apiRequest("POST", "/api/project-runner/start", {
        projectPath: conversation.localProjectPath,
      });
      const data = await res.json();
      if (data.port) setProjectPort(data.port);
      setActiveTab("shell");
    } catch (err: any) {
      console.error("Failed to start project:", err);
      setProjectStatus("error");
    }
  }, [conversation?.localProjectPath]);

  const stopProject = useCallback(async () => {
    if (!conversation?.localProjectPath) return;
    try {
      await apiRequest("POST", "/api/project-runner/stop", {
        projectPath: conversation.localProjectPath,
      });
      setProjectStatus("stopped");
      setProjectPort(null);
    } catch (err: any) {
      console.error("Failed to stop project:", err);
    }
  }, [conversation?.localProjectPath]);

  const handlePublish = useCallback(async () => {
    if (!conversation?.localProjectPath) return;
    const appName = conversation.localProjectPath.replace(/[^a-zA-Z0-9_-]/g, "-");
    if (!appName) return;
    setIsPublishing(true);
    setPublishResult(null);
    try {
      const res = await apiRequest("POST", "/api/published-apps/publish", {
        projectPath: conversation.localProjectPath,
        appName,
      });
      const data = await res.json();
      if (data.success) {
        setPublishResult({
          success: true,
          url: `${window.location.origin}/apps/${appName}/`,
          buildLog: data.buildLog,
        });
        toast({ title: "Published!", description: `Your app is live at /apps/${appName}/` });
      } else {
        setPublishResult({ error: data.error || "Publish failed" });
      }
    } catch (err: any) {
      setPublishResult({ error: err.message || "Publish failed" });
    } finally {
      setIsPublishing(false);
    }
  }, [conversation?.localProjectPath, toast]);

  const sendMessage = useCallback(
    async (content: string) => {
      if (!conversationId) return;

      setIsStreaming(true);
      setStreamingContent("");
      setLiveToolSteps([]);
      setIterationInfo(null);
      setFileDiffs([]);
      setReviewContent(null);
      setAgentTasks([]);
      setAgentError(false);
      toolStepCounter.current = 0;
      isNearBottomRef.current = true;

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conversationId, content }),
        });

        if (!res.ok) {
          throw new Error(await res.text());
        }

        const reader = res.body?.getReader();
        const decoder = new TextDecoder();
        let fullContent = "";
        let sseBuffer = "";

        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            sseBuffer += decoder.decode(value, { stream: true });
            const lines = sseBuffer.split("\n");
            sseBuffer = lines.pop() || "";

            for (const line of lines) {
              if (line.startsWith("data: ")) {
                const data = line.slice(6);
                if (data === "[DONE]") continue;
                try {
                  const parsed = JSON.parse(data);
                  if (parsed.type === "content") {
                    fullContent += parsed.content;
                    setStreamingContent(fullContent);
                  } else if (parsed.type === "plan") {
                    setPendingPlan(parsed.content);
                  } else if (parsed.type === "iteration_status") {
                    setIterationInfo({
                      iteration: parsed.iteration,
                      maxIterations: parsed.maxIterations,
                      phase: parsed.phase || "",
                    });
                  } else if (parsed.type === "diff") {
                    if (parsed.diffs) {
                      setFileDiffs(parsed.diffs);
                    }
                  } else if (parsed.type === "review") {
                    if (parsed.content) {
                      setReviewContent(parsed.content);
                    }
                  } else if (parsed.type === "tasks") {
                    if (parsed.tasks) {
                      setAgentTasks(parsed.tasks);
                    }
                  } else if (parsed.type === "command_output") {
                    const matchId = parsed.toolCallId;
                    if (matchId) {
                      setLiveToolSteps((prev) =>
                        prev.map((s) =>
                          s.id === matchId
                            ? { ...s, result: (s.result || "") + parsed.content }
                            : s
                        )
                      );
                    }
                  } else if (parsed.type === "error") {
                    fullContent += `\n\n${parsed.content}`;
                    setStreamingContent(fullContent);
                    setAgentError(true);
                  } else if (parsed.type === "auto_start") {
                    if (parsed.port) {
                      setProjectPort(parsed.port);
                      setProjectStatus("running");
                    }
                  } else if (parsed.type === "tool_call") {
                    if (parsed.toolStatus) {
                      const matchId = parsed.toolCallId;
                      setLiveToolSteps((prev) =>
                        prev.map((s) =>
                          s.id === matchId
                            ? {
                                ...s,
                                status: parsed.toolStatus as "success" | "error",
                                result: parsed.toolResult || undefined,
                              }
                            : s
                        )
                      );
                    } else {
                      const stepId = parsed.toolCallId || `step-${++toolStepCounter.current}`;
                      let args: Record<string, any> | undefined;
                      if (parsed.toolArgs) {
                        try {
                          args = typeof parsed.toolArgs === "string" ? JSON.parse(parsed.toolArgs) : parsed.toolArgs;
                        } catch {
                          args = undefined;
                        }
                      }
                      setLiveToolSteps((prev) => [
                        ...prev,
                        {
                          id: stepId,
                          name: parsed.toolName || "unknown",
                          status: "running",
                          args,
                        },
                      ]);
                    }
                  }
                } catch {
                }
              }
            }
          }
        }

        queryClient.invalidateQueries({
          queryKey: ["/api/conversations", conversationId, "messages"],
        });
        queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
        if (showPanel && activeTab === "code") {
          refetchFiles();
        }
      } catch (err: any) {
        console.error("Chat error:", err);
        const errorMsg = err?.message || "Connection lost. Please try again.";
        setStreamingContent("");
        setLiveToolSteps([]);
        setIterationInfo(null);
        setIsStreaming(false);
        setAgentError(true);
        queryClient.invalidateQueries({
          queryKey: ["/api/conversations", conversationId, "messages"],
        });
        queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
      } finally {
        setIsStreaming(false);
        setStreamingContent("");
        setLiveToolSteps([]);
        setIterationInfo(null);
      }
    },
    [conversationId, showPanel, activeTab, refetchFiles]
  );

  const dismissDiffs = useCallback(() => setFileDiffs([]), []);
  const dismissReview = useCallback(() => setReviewContent(null), []);

  const approvePlan = useCallback(
    async (editedPlan: string) => {
      if (!conversationId) return;
      setPendingPlan(null);
      if (mode === "plan") {
        try {
          await apiRequest("PATCH", "/api/settings", { mode: "build" });
          await queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
        } catch (err) {
          console.error("Failed to switch to build mode:", err);
        }
      }
      await sendMessage(`Approved. Please implement the following plan:\n\n${editedPlan}`);
    },
    [conversationId, sendMessage, mode]
  );

  const rejectPlan = useCallback(() => {
    setPendingPlan(null);
  }, []);

  const loadFileContent = useCallback(
    async (filePath: string) => {
      if (!conversationId) return;
      setSelectedFile(filePath);
      try {
        const res = await apiRequest(
          "POST",
          `/api/conversations/${conversationId}/read-file`,
          { path: filePath }
        );
        const data = await res.json();
        setFileContent(data.content);
      } catch {
        setFileContent("// Error loading file");
      }
    },
    [conversationId]
  );

  if (!conversationId) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center max-w-md">
          <div className="flex justify-center mb-4">
            <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Bot className="h-8 w-8 text-primary" />
            </div>
          </div>
          <h2 className="text-xl font-semibold mb-2" data-testid="text-welcome-title">
            Agent Studio
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            Your personal AI coding assistant. Describe what you want to build or
            change, and the agent will analyze, plan, and implement it for you.
          </p>
          <div className="grid grid-cols-2 gap-2 text-left">
            {[
              "Read & modify project files",
              "Debug errors automatically",
              "Install packages",
              "Live project preview",
              "Run tests & commands",
              "Real-time logs & output",
            ].map((feature) => (
              <div
                key={feature}
                className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-md px-2.5 py-2"
              >
                <Code className="h-3 w-3 shrink-0 text-primary" />
                {feature}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const projectPath = conversation?.localProjectPath;
  const previewUrl = projectPath && projectPort
    ? `/api/project-preview/${projectPath}/`
    : null;
  const publicPreviewUrl = previewUrl
    ? `${window.location.origin}${previewUrl}`
    : null;

  const rightPanel = (
    <div className="flex flex-col h-full min-w-0 bg-background" data-testid="right-panel">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full">
        <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border shrink-0">
          <TabsList className="h-8">
            <TabsTrigger value="preview" className="text-xs gap-1.5 px-2.5" data-testid="tab-preview">
              <Monitor className="h-3 w-3" />
              Preview
            </TabsTrigger>
            <TabsTrigger value="code" className="text-xs gap-1.5 px-2.5" data-testid="tab-code">
              <FolderTree className="h-3 w-3" />
              Code
            </TabsTrigger>
            <TabsTrigger value="shell" className="text-xs gap-1.5 px-2.5" data-testid="tab-shell">
              <Terminal className="h-3 w-3" />
              Shell
              {projectStatus === "running" && (
                <span className="ml-1 h-1.5 w-1.5 rounded-full bg-green-500" />
              )}
            </TabsTrigger>
          </TabsList>

          {projectPath && (
            <div className="flex items-center gap-1.5">
              {projectStatus === "stopped" || projectStatus === "error" ? (
                <Button
                  variant="default"
                  size="sm"
                  onClick={startProject}
                  data-testid="button-run-project"
                  className="h-7 text-xs gap-1"
                >
                  <Play className="h-3 w-3" />
                  Run
                </Button>
              ) : projectStatus === "starting" ? (
                <Button variant="secondary" size="sm" disabled className="h-7 text-xs gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Starting...
                </Button>
              ) : (
                <>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      stopProject().then(() => startProject());
                    }}
                    data-testid="button-restart-project"
                    className="h-7 w-7"
                  >
                    <RotateCcw className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={stopProject}
                    data-testid="button-stop-project"
                    className="h-7 text-xs gap-1"
                  >
                    <Square className="h-3 w-3" />
                    Stop
                  </Button>
                </>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setPublishResult(null); setPublishDialogOpen(true); }}
                data-testid="button-publish"
                className="h-7 text-xs gap-1"
              >
                <Rocket className="h-3 w-3" />
                Publish
              </Button>
            </div>
          )}
        </div>

        <TabsContent value="preview" className="flex-1 m-0 overflow-hidden">
          <div className="h-full flex flex-col">
            {previewUrl && projectStatus === "running" ? (
              <>
                <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border bg-muted/30">
                  <div className="flex-1 flex items-center gap-2 bg-muted rounded-md px-2.5 py-1 min-w-0">
                    <span className="h-1.5 w-1.5 rounded-full bg-green-500 shrink-0" />
                    <span className="text-xs font-mono text-muted-foreground truncate" data-testid="text-preview-url">
                      {publicPreviewUrl || `localhost:${projectPort}`}
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      const iframe = document.querySelector("[data-testid='preview-iframe']") as HTMLIFrameElement;
                      if (iframe) iframe.src = iframe.src;
                    }}
                    data-testid="button-refresh-preview"
                  >
                    <RotateCcw className="h-3 w-3" />
                  </Button>
                  {publicPreviewUrl && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => window.open(publicPreviewUrl, "_blank")}
                      data-testid="button-open-preview-external"
                    >
                      <ExternalLink className="h-3 w-3" />
                    </Button>
                  )}
                </div>
                <iframe
                  src={previewUrl}
                  className="flex-1 w-full border-0 bg-white"
                  data-testid="preview-iframe"
                  title="Project Preview"
                  sandbox="allow-scripts allow-forms allow-same-origin allow-popups"
                />
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center space-y-3">
                  <Monitor className="mx-auto h-10 w-10 text-muted-foreground/30" />
                  {!projectPath ? (
                    <>
                      <p className="text-sm text-muted-foreground">No project selected</p>
                      <p className="text-xs text-muted-foreground">Select a project to see a live preview</p>
                    </>
                  ) : projectStatus === "starting" ? (
                    <>
                      <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" />
                      <p className="text-sm text-muted-foreground">Starting project...</p>
                    </>
                  ) : (
                    <>
                      <p className="text-sm text-muted-foreground">Project is not running</p>
                      <Button
                        onClick={startProject}
                        size="sm"
                        className="gap-1.5"
                        data-testid="button-run-project-empty"
                      >
                        <Play className="h-3.5 w-3.5" />
                        Run Project
                      </Button>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="code" className="flex-1 m-0 overflow-hidden">
          <div className="h-full flex flex-col">
            {fileChanges.length > 0 && (
              <div className="flex items-center justify-between gap-2 px-3 py-1.5 bg-amber-500/10 border-b border-amber-500/20 shrink-0" data-testid="banner-file-changes">
                <div className="flex items-center gap-1.5 min-w-0">
                  <Eye className="h-3 w-3 text-amber-500 shrink-0" />
                  <span className="text-xs text-amber-600 dark:text-amber-400 truncate">
                    {fileChanges.length} file {fileChanges.length === 1 ? "change" : "changes"} detected
                  </span>
                  <span className="text-[10px] text-muted-foreground truncate">
                    {fileChanges[fileChanges.length - 1]?.filename}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5 shrink-0"
                  onClick={() => setFileChanges([])}
                  data-testid="button-dismiss-file-changes"
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            )}
            {selectedFile && fileContent !== undefined ? (
              <div className="flex-1 flex flex-col min-h-0">
                <div className="flex items-center justify-between px-3 py-1.5 bg-muted/30 border-b border-border shrink-0">
                  <span className="text-xs font-mono truncate text-muted-foreground">
                    {selectedFile}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => {
                      setSelectedFile(undefined);
                      setFileContent(undefined);
                    }}
                    data-testid="button-close-file-viewer"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
                <ScrollArea className="flex-1">
                  <pre className="p-3 text-xs font-mono leading-relaxed whitespace-pre-wrap break-all">
                    {fileContent}
                  </pre>
                </ScrollArea>
              </div>
            ) : (
              <FileTree
                files={files || []}
                onFileSelect={loadFileContent}
                selectedFile={selectedFile}
              />
            )}
          </div>
        </TabsContent>

        <TabsContent value="shell" className="flex-1 m-0 overflow-hidden">
          <div className="h-full flex flex-col bg-zinc-950">
            <div className="flex items-center gap-2 px-3 py-1.5 border-b border-zinc-800 shrink-0">
              <Terminal className="h-3 w-3 text-zinc-400" />
              <span className="text-xs text-zinc-400">Output</span>
              <div className="flex-1" />
              <Badge
                variant={projectStatus === "running" ? "default" : "secondary"}
                className="text-[10px] h-5"
                data-testid="badge-project-status"
              >
                {projectStatus}
              </Badge>
              {projectLogs.length > 0 && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-zinc-400"
                  onClick={() => setProjectLogs([])}
                  data-testid="button-clear-logs"
                >
                  <X className="h-3 w-3" />
                </Button>
              )}
            </div>
            <ScrollArea className="flex-1">
              <div className="p-3 font-mono text-xs leading-relaxed">
                {projectLogs.length === 0 ? (
                  <div className="text-zinc-600">
                    {projectPath
                      ? "No output yet. Run the project to see logs here."
                      : "Select a project to see logs here."}
                  </div>
                ) : (
                  projectLogs.map((line, i) => (
                    <div
                      key={i}
                      className={`whitespace-pre-wrap break-all ${
                        line.startsWith("[stderr]")
                          ? "text-red-400"
                          : line.toLowerCase().includes("error")
                            ? "text-red-300"
                            : line.toLowerCase().includes("warn")
                              ? "text-yellow-300"
                              : "text-zinc-300"
                      }`}
                    >
                      {line}
                    </div>
                  ))
                )}
                <div ref={logsEndRef} />
              </div>
            </ScrollArea>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );

  const suggestions = [
    { label: "Build a React app", text: "Build a modern React landing page with a hero section, features list, and footer" },
    { label: "Create an API", text: "Create a REST API with Express that has CRUD endpoints for managing a todo list" },
    { label: "Add a database", text: "Set up a SQLite database with user and posts tables, and create the models" },
    { label: "Fix a bug", text: "Check my project for any errors or issues and fix them automatically" },
  ];

  const chatContent = (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between gap-2 px-3 py-1.5 border-b border-border shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <h2 className="text-sm font-medium truncate" data-testid="text-conversation-title">
            {props.projectName || conversation?.localProjectPath || conversation?.title || "Loading..."}
          </h2>
        </div>
        <div className="flex items-center gap-1 shrink-0 flex-wrap">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowPanel(!showPanel)}
            data-testid="button-toggle-panel"
          >
            {showPanel ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto relative" onScroll={handleScroll}>
        {agentTasks.length > 0 && (
          <TaskListPanel tasks={agentTasks} isStreaming={isStreaming} />
        )}
        <div className={`max-w-3xl mx-auto py-4 px-4 space-y-4 ${agentTasks.length > 0 ? "pt-2" : ""}`}>
          {messagesLoading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}

          <ConversationRounds
            messages={messages}
            isStreaming={isStreaming}
            streamingContent={streamingContent}
            conversationId={conversationId}
            liveToolSteps={liveToolSteps}
            iterationInfo={iterationInfo}
          />

          {pendingPlan && (
            <PlanApproval
              plan={pendingPlan}
              onApprove={approvePlan}
              onReject={rejectPlan}
            />
          )}

          {fileDiffs.length > 0 && (
            <DiffViewer diffs={fileDiffs} onDismiss={dismissDiffs} />
          )}

          {reviewContent && (
            <ReviewPanel content={reviewContent} onDismiss={dismissReview} />
          )}

          {!messagesLoading && messages.length === 0 && !isStreaming && (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                <Bot className="h-6 w-6 text-primary" />
              </div>
              {!projectPath ? (
                <div className="text-center space-y-2 max-w-sm">
                  <p className="text-sm font-medium">Select or create a project</p>
                  <p className="text-xs text-muted-foreground">
                    Use the project picker above to get started
                  </p>
                </div>
              ) : (
                <div className="text-center space-y-4 max-w-md">
                  <p className="text-sm text-muted-foreground">
                    What would you like to build?
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {suggestions.map((s) => (
                      <button
                        key={s.label}
                        onClick={() => sendMessage(s.text)}
                        className="text-left px-3 py-2.5 rounded-xl border border-border text-xs text-muted-foreground hover-elevate transition-colors"
                        data-testid={`button-suggestion-${s.label.toLowerCase().replace(/\s+/g, '-')}`}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      {agentError && !isStreaming && (
        <div className="flex items-center justify-center gap-3 py-2 px-4 border-t border-destructive/20 bg-destructive/5">
          <span className="text-sm text-muted-foreground">Agent paused due to an error.</span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => sendMessage("keep going")}
            data-testid="button-retry-agent"
          >
            <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
            Retry
          </Button>
        </div>
      )}
      <ChatInput
        onSend={sendMessage}
        isStreaming={isStreaming}
        onStop={() => setIsStreaming(false)}
        mode={mode as "plan" | "build"}
        onModeToggle={(m) => updateMode.mutate(m)}
      />
    </div>
  );

  return (
    <div className="h-full" data-testid="chat-page-layout">
      {showPanel ? (
        <ResizablePanelGroup direction="horizontal" className="h-full">
          <ResizablePanel defaultSize={45} minSize={30}>
            {chatContent}
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize={55} minSize={30}>
            {rightPanel}
          </ResizablePanel>
        </ResizablePanelGroup>
      ) : (
        chatContent
      )}

      <Dialog open={publishDialogOpen} onOpenChange={setPublishDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Rocket className="h-5 w-5" />
              Publish App
            </DialogTitle>
            <DialogDescription>
              Build and deploy your project to a public URL.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {!publishResult && !isPublishing && (
              <>
                <p className="text-sm text-muted-foreground">
                  This will build your project and make it available at a public URL on this server.
                </p>
                <div className="flex items-center gap-2 bg-muted rounded-md px-3 py-2">
                  <Globe className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="text-sm font-mono truncate" data-testid="text-publish-url">
                    {window.location.origin}/apps/{(projectPath || "").replace(/[^a-zA-Z0-9_-]/g, "-")}/
                  </span>
                </div>
                <Button
                  onClick={handlePublish}
                  className="w-full gap-2"
                  data-testid="button-confirm-publish"
                >
                  <Rocket className="h-4 w-4" />
                  Publish Now
                </Button>
              </>
            )}

            {isPublishing && (
              <div className="flex flex-col items-center gap-3 py-4">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Building and publishing...</p>
                <p className="text-xs text-muted-foreground">This may take a minute</p>
              </div>
            )}

            {publishResult?.success && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-green-500">
                  <CheckCircle2 className="h-5 w-5" />
                  <span className="text-sm font-medium">Published successfully!</span>
                </div>
                <div className="flex items-center gap-2 bg-muted rounded-md px-3 py-2">
                  <Globe className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="text-sm font-mono truncate">{publishResult.url}</span>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1 gap-2"
                    onClick={() => window.open(publishResult.url, "_blank")}
                    data-testid="button-visit-published"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Visit App
                  </Button>
                  <Button
                    variant="default"
                    className="flex-1 gap-2"
                    onClick={() => setPublishDialogOpen(false)}
                    data-testid="button-close-publish"
                  >
                    Done
                  </Button>
                </div>
                {publishResult.buildLog && (
                  <details className="text-xs">
                    <summary className="text-muted-foreground cursor-pointer hover:text-foreground">Build log</summary>
                    <pre className="mt-2 bg-muted rounded-md p-2 overflow-x-auto text-muted-foreground max-h-40 overflow-y-auto whitespace-pre-wrap">
                      {publishResult.buildLog}
                    </pre>
                  </details>
                )}
              </div>
            )}

            {publishResult?.error && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-destructive">
                  <X className="h-5 w-5" />
                  <span className="text-sm font-medium">Publish failed</span>
                </div>
                <div className="bg-muted rounded-md p-3 max-h-48 overflow-y-auto">
                  <pre className="text-xs whitespace-pre-wrap break-words font-mono text-muted-foreground" data-testid="text-publish-error">{publishResult.error}</pre>
                </div>
                <Button
                  onClick={() => {
                    const errorText = publishResult.error || "Unknown build error";
                    setPublishDialogOpen(false);
                    setPublishResult(null);
                    sendMessage(`The project failed to publish with the following build error. Please diagnose and fix the issue:\n\n${errorText}`);
                  }}
                  className="w-full gap-2"
                  data-testid="button-diagnose-publish"
                >
                  <Wrench className="h-4 w-4" />
                  Diagnose & Fix
                </Button>
                <Button
                  onClick={handlePublish}
                  variant="outline"
                  className="w-full gap-2"
                  data-testid="button-retry-publish"
                >
                  <RotateCcw className="h-4 w-4" />
                  Try Again
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
