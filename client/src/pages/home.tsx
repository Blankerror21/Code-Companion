import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Bot,
  Plus,
  FolderOpen,
  Loader2,
  Clock,
} from "lucide-react";

interface Project {
  name: string;
  path: string;
  conversationId: string | null;
  conversationTitle: string | null;
  updatedAt: string | null;
}

export default function HomePage() {
  const [, setLocation] = useLocation();
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [createError, setCreateError] = useState("");

  const { data: projects = [], isLoading } = useQuery<Project[]>({
    queryKey: ["/api/local-projects"],
  });

  const createProject = useMutation({
    mutationFn: async (name: string) => {
      const res = await apiRequest("POST", "/api/local-projects", { name });
      return res.json();
    },
    onSuccess: (data: { name: string; path: string; conversationId: string }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/local-projects"] });
      setCreateOpen(false);
      setNewName("");
      setCreateError("");
      setLocation(`/project/${data.name}`);
    },
    onError: (err: any) => {
      setCreateError(err.message || "Failed to create project");
    },
  });

  const handleCreate = () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
      setCreateError("Use only letters, numbers, hyphens, and underscores");
      return;
    }
    setCreateError("");
    createProject.mutate(trimmed);
  };

  const formatTime = (dateStr: string | null) => {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString();
  };

  return (
    <div className="flex flex-col min-h-full p-6">
      <div className="max-w-4xl w-full mx-auto">
        <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-semibold" data-testid="text-home-title">
              Your Projects
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Select a project to continue working, or create a new one
            </p>
          </div>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2" data-testid="button-create-project">
                <Plus className="h-4 w-4" />
                New Project
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle>Create New Project</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <Input
                  placeholder="my-awesome-app"
                  value={newName}
                  onChange={(e) => { setNewName(e.target.value); setCreateError(""); }}
                  onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                  data-testid="input-new-project-name"
                  autoFocus
                />
                {createError && (
                  <p className="text-xs text-destructive">{createError}</p>
                )}
                <Button
                  onClick={handleCreate}
                  disabled={!newName.trim() || createProject.isPending}
                  className="w-full gap-2"
                  data-testid="button-confirm-create"
                >
                  {createProject.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                  Create Project
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" data-testid="loading-projects" />
          </div>
        )}

        {!isLoading && projects.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
              <Bot className="h-8 w-8 text-primary" />
            </div>
            <h2 className="text-lg font-medium mb-1">No projects yet</h2>
            <p className="text-sm text-muted-foreground mb-4 max-w-sm">
              Create your first project and start building with your AI coding assistant.
            </p>
            <Button onClick={() => setCreateOpen(true)} className="gap-2" data-testid="button-create-first-project">
              <Plus className="h-4 w-4" />
              Create Your First Project
            </Button>
          </div>
        )}

        {!isLoading && projects.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {projects.map((project) => (
              <Card
                key={project.path}
                className="p-4 cursor-pointer hover-elevate active-elevate-2 transition-colors"
                onClick={() => setLocation(`/project/${project.name}`)}
                data-testid={`card-project-${project.name}`}
              >
                <div className="flex items-start gap-3">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <FolderOpen className="h-5 w-5 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm truncate" data-testid={`text-project-name-${project.name}`}>
                      {project.name}
                    </p>
                    {project.updatedAt && (
                      <div className="flex items-center gap-1 mt-1">
                        <Clock className="h-3 w-3 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">
                          {formatTime(project.updatedAt)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
