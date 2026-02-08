import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { FolderOpen, Plus, FolderClosed, X, Loader2, Lock } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";

interface LocalProject {
  name: string;
  path: string;
  linkedConversation?: { conversationId: string; title: string } | null;
}

interface LocalProjectPickerProps {
  conversationId: string;
  currentProjectPath?: string | null;
  onSelect: (projectPath: string) => void;
  onClear: () => void;
}

export function LocalProjectPicker({
  conversationId,
  currentProjectPath,
  onSelect,
  onClear,
}: LocalProjectPickerProps) {
  const [open, setOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [createError, setCreateError] = useState("");
  const { toast } = useToast();

  const { data: projects = [], isLoading } = useQuery<LocalProject[]>({
    queryKey: ["/api/local-projects"],
    enabled: open,
  });

  const createProject = useMutation({
    mutationFn: async (name: string) => {
      const res = await apiRequest("POST", "/api/local-projects", { name });
      return res.json();
    },
    onSuccess: (data: LocalProject) => {
      queryClient.invalidateQueries({ queryKey: ["/api/local-projects"] });
      onSelect(data.path);
      setNewProjectName("");
      setCreateError("");
      setOpen(false);
    },
    onError: (err: any) => {
      setCreateError(err.message || "Failed to create project");
    },
  });

  const handleCreateProject = () => {
    const trimmed = newProjectName.trim();
    if (!trimmed) return;
    if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
      setCreateError("Use only letters, numbers, hyphens, and underscores");
      return;
    }
    setCreateError("");
    createProject.mutate(trimmed);
  };

  const handleSelectExisting = (project: LocalProject) => {
    if (project.linkedConversation && project.linkedConversation.conversationId !== conversationId) {
      toast({
        title: "Project in use",
        description: `This project is linked to "${project.linkedConversation.title}". Create a new project instead.`,
        variant: "destructive",
      });
      return;
    }
    onSelect(project.path);
    setOpen(false);
  };

  if (currentProjectPath) {
    return (
      <div className="flex items-center gap-1">
        <Badge variant="secondary" className="gap-1 text-xs" data-testid="badge-local-project">
          <FolderOpen className="h-3 w-3" />
          {currentProjectPath}
        </Badge>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClear}
          data-testid="button-clear-project"
        >
          <X className="h-3 w-3" />
        </Button>
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5" data-testid="button-select-project">
          <FolderOpen className="h-3.5 w-3.5" />
          Select Project
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Select or Create Project</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Create New Project</label>
            <div className="flex gap-2">
              <Input
                placeholder="my-project"
                value={newProjectName}
                onChange={(e) => {
                  setNewProjectName(e.target.value);
                  setCreateError("");
                }}
                onKeyDown={(e) => e.key === "Enter" && handleCreateProject()}
                data-testid="input-new-project-name"
              />
              <Button
                onClick={handleCreateProject}
                disabled={!newProjectName.trim() || createProject.isPending}
                data-testid="button-create-project"
              >
                {createProject.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
              </Button>
            </div>
            {createError && (
              <p className="text-xs text-destructive">{createError}</p>
            )}
          </div>

          {projects.length > 0 && (
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Existing Projects</label>
              <ScrollArea className="max-h-48">
                <div className="space-y-1">
                  {projects.map((project) => {
                    const isOwnedByOther = project.linkedConversation && 
                      project.linkedConversation.conversationId !== conversationId;
                    const isOwnedBySelf = project.linkedConversation && 
                      project.linkedConversation.conversationId === conversationId;
                    return (
                      <Button
                        key={project.path}
                        variant="ghost"
                        className={`w-full justify-start gap-2 ${isOwnedByOther ? "opacity-50" : ""}`}
                        onClick={() => handleSelectExisting(project)}
                        data-testid={`button-project-${project.name}`}
                      >
                        {isOwnedByOther ? (
                          <Lock className="h-4 w-4 text-muted-foreground shrink-0" />
                        ) : (
                          <FolderClosed className="h-4 w-4 text-muted-foreground shrink-0" />
                        )}
                        <span className="truncate">{project.name}</span>
                        {isOwnedByOther && (
                          <Badge variant="outline" className="ml-auto text-[10px] shrink-0 no-default-hover-elevate no-default-active-elevate">
                            In use
                          </Badge>
                        )}
                        {isOwnedBySelf && (
                          <Badge variant="secondary" className="ml-auto text-[10px] shrink-0 no-default-hover-elevate no-default-active-elevate">
                            Current
                          </Badge>
                        )}
                      </Button>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>
          )}

          {isLoading && (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          )}

          {!isLoading && projects.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-2">
              No projects yet. Create one above to get started.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
