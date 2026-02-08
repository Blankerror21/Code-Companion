import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { FolderGit2, Search, Loader2, Globe, Lock, X } from "lucide-react";

interface ReplInfo {
  id: string;
  title: string;
  slug: string;
  url: string;
  language: string;
  description: string;
  isPrivate: boolean;
}

interface ProjectPickerProps {
  conversationId: string;
  currentReplId?: string | null;
  currentReplName?: string | null;
  onSelect: (replId: string, replName: string) => void;
  onClear: () => void;
}

export function ProjectPicker({ conversationId, currentReplId, currentReplName, onSelect, onClear }: ProjectPickerProps) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const { data: repls = [], isLoading } = useQuery<ReplInfo[]>({
    queryKey: ["/api/replit/repls", debouncedSearch],
    queryFn: async () => {
      const url = debouncedSearch
        ? `/api/replit/repls?search=${encodeURIComponent(debouncedSearch)}`
        : "/api/replit/repls";
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to load projects");
      return res.json();
    },
    enabled: open,
  });

  const handleSelect = (repl: ReplInfo) => {
    onSelect(repl.id, repl.title);
    setOpen(false);
    setSearchQuery("");
  };

  if (currentReplId) {
    return (
      <div className="flex items-center gap-1.5">
        <Badge variant="outline" className="gap-1 text-[10px] shrink-0">
          <FolderGit2 className="h-2.5 w-2.5" />
          {currentReplName || "Project"}
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
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 text-xs"
          data-testid="button-open-project-picker"
        >
          <FolderGit2 className="h-3.5 w-3.5" />
          Connect Project
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Select Replit Project</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search projects..."
              className="pl-8 text-sm"
              data-testid="input-search-projects"
            />
          </div>
          <ScrollArea className="h-72">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : repls.length === 0 ? (
              <div className="text-center py-8">
                <FolderGit2 className="mx-auto h-8 w-8 text-muted-foreground/40 mb-2" />
                <p className="text-sm text-muted-foreground">
                  {debouncedSearch ? "No projects match your search" : "No projects found. Add your Replit token in Settings first."}
                </p>
              </div>
            ) : (
              <div className="space-y-1">
                {repls.map((repl) => (
                  <button
                    key={repl.id}
                    onClick={() => handleSelect(repl)}
                    className="w-full text-left rounded-md p-2.5 hover-elevate transition-colors"
                    data-testid={`button-select-project-${repl.id}`}
                  >
                    <div className="flex items-center gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-medium truncate">{repl.title}</span>
                          {repl.isPrivate ? (
                            <Lock className="h-3 w-3 text-muted-foreground shrink-0" />
                          ) : (
                            <Globe className="h-3 w-3 text-muted-foreground shrink-0" />
                          )}
                        </div>
                        {repl.description && (
                          <p className="text-xs text-muted-foreground truncate mt-0.5">{repl.description}</p>
                        )}
                      </div>
                      <Badge variant="secondary" className="text-[10px] shrink-0">
                        {repl.language}
                      </Badge>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}
