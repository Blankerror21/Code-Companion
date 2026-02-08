import { useEffect, useState } from "react";
import { useRoute, useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { type Conversation } from "@shared/schema";
import { Loader2 } from "lucide-react";
import ChatPage from "./chat";

export default function ProjectPage() {
  const [, params] = useRoute("/project/:name");
  const projectName = params?.name;
  const [, setLocation] = useLocation();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [resolvedProject, setResolvedProject] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const resolveConversation = useMutation({
    mutationFn: async (name: string) => {
      const res = await apiRequest("POST", `/api/local-projects/${name}/conversation`, {});
      return res.json() as Promise<Conversation>;
    },
    onSuccess: (conv: Conversation) => {
      setConversationId(conv.id);
      setResolvedProject(projectName || null);
    },
    onError: (err: any) => {
      setError(err.message || "Failed to load project");
    },
  });

  useEffect(() => {
    if (projectName && projectName !== resolvedProject) {
      setConversationId(null);
      setError(null);
      setResolvedProject(null);
      resolveConversation.mutate(projectName);
    }
  }, [projectName]);

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <p className="text-sm text-destructive mb-2">{error}</p>
          <button
            onClick={() => setLocation("/")}
            className="text-sm text-primary underline"
            data-testid="link-back-home"
          >
            Back to projects
          </button>
        </div>
      </div>
    );
  }

  if (!conversationId || resolvedProject !== projectName) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-6 w-6 animate-spin text-primary" data-testid="loading-project" />
          <p className="text-sm text-muted-foreground">Loading project...</p>
        </div>
      </div>
    );
  }

  return <ChatPage key={conversationId} projectConversationId={conversationId} projectName={projectName || undefined} />;
}
