import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Globe,
  Rocket,
  RotateCcw,
  Square,
  Trash2,
  ExternalLink,
  Loader2,
  Server,
  FileCode,
} from "lucide-react";

interface PublishedAppInfo {
  id: string;
  name: string;
  projectPath: string;
  type: string;
  port: number | null;
  status: string;
  liveStatus: string;
  buildLog: string | null;
  url: string;
  publishedAt: string;
  updatedAt: string;
}

export default function PublishedAppsPage() {
  const { toast } = useToast();
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [buildLogOpen, setBuildLogOpen] = useState<string | null>(null);

  const { data: apps = [], isLoading } = useQuery<PublishedAppInfo[]>({
    queryKey: ["/api/published-apps"],
    refetchInterval: 5000,
  });

  const restartApp = useMutation({
    mutationFn: async (name: string) => {
      await apiRequest("POST", `/api/published-apps/${name}/restart`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/published-apps"] });
      toast({ title: "App restarted" });
    },
    onError: (err: any) => {
      toast({ title: "Restart failed", description: err.message, variant: "destructive" });
    },
  });

  const stopApp = useMutation({
    mutationFn: async (name: string) => {
      await apiRequest("POST", `/api/published-apps/${name}/stop`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/published-apps"] });
      toast({ title: "App stopped" });
    },
    onError: (err: any) => {
      toast({ title: "Stop failed", description: err.message, variant: "destructive" });
    },
  });

  const republishApp = useMutation({
    mutationFn: async (app: PublishedAppInfo) => {
      const res = await apiRequest("POST", "/api/published-apps/publish", {
        projectPath: app.projectPath,
        appName: app.name,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/published-apps"] });
      toast({ title: "Republished successfully" });
    },
    onError: (err: any) => {
      toast({ title: "Republish failed", description: err.message, variant: "destructive" });
    },
  });

  const deleteApp = useMutation({
    mutationFn: async (name: string) => {
      await apiRequest("DELETE", `/api/published-apps/${name}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/published-apps"] });
      setDeleteConfirm(null);
      toast({ title: "App unpublished" });
    },
    onError: (err: any) => {
      toast({ title: "Delete failed", description: err.message, variant: "destructive" });
    },
  });

  const statusColor = (status: string) => {
    switch (status) {
      case "running": return "bg-green-500";
      case "building": return "bg-yellow-500";
      case "stopped": case "crashed": return "bg-zinc-400";
      case "error": return "bg-red-500";
      default: return "bg-zinc-400";
    }
  };

  const formatTime = (dateStr: string) => {
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

  const viewBuildLog = apps.find(a => a.name === buildLogOpen);

  return (
    <div className="flex flex-col min-h-full p-6">
      <div className="max-w-4xl w-full mx-auto">
        <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-semibold" data-testid="text-published-title">
              Published Apps
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Manage your deployed applications
            </p>
          </div>
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" data-testid="loading-published" />
          </div>
        )}

        {!isLoading && apps.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
              <Rocket className="h-8 w-8 text-primary" />
            </div>
            <h2 className="text-lg font-medium mb-1">No published apps yet</h2>
            <p className="text-sm text-muted-foreground mb-4 max-w-sm">
              Open a project and click the Publish button to make it available at a public URL.
            </p>
          </div>
        )}

        {!isLoading && apps.length > 0 && (
          <div className="space-y-3">
            {apps.map((app) => (
              <Card key={app.id} className="p-4" data-testid={`card-published-${app.name}`}>
                <div className="flex items-start gap-4 flex-wrap">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    {app.type === "static" ? (
                      <FileCode className="h-5 w-5 text-primary" />
                    ) : (
                      <Server className="h-5 w-5 text-primary" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-sm" data-testid={`text-app-name-${app.name}`}>
                        {app.name}
                      </p>
                      <Badge variant="secondary" className="text-[10px]">
                        {app.type === "static" ? "Static" : "Full-stack"}
                      </Badge>
                      <div className="flex items-center gap-1.5">
                        <span className={`h-2 w-2 rounded-full ${statusColor(app.liveStatus)}`} />
                        <span className="text-xs text-muted-foreground capitalize">{app.liveStatus}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 mt-1.5">
                      <a
                        href={app.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-mono text-primary hover:underline truncate"
                        data-testid={`link-app-url-${app.name}`}
                      >
                        {window.location.origin}{app.url}
                      </a>
                    </div>

                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-xs text-muted-foreground">
                        Published {formatTime(app.publishedAt)}
                      </span>
                      {app.updatedAt !== app.publishedAt && (
                        <span className="text-xs text-muted-foreground">
                          Updated {formatTime(app.updatedAt)}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => window.open(app.url, "_blank")}
                      data-testid={`button-open-app-${app.name}`}
                    >
                      <ExternalLink className="h-4 w-4" />
                    </Button>

                    {app.type === "fullstack" && app.liveStatus === "running" && (
                      <>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => restartApp.mutate(app.name)}
                          disabled={restartApp.isPending}
                          data-testid={`button-restart-app-${app.name}`}
                        >
                          <RotateCcw className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => stopApp.mutate(app.name)}
                          disabled={stopApp.isPending}
                          data-testid={`button-stop-app-${app.name}`}
                        >
                          <Square className="h-4 w-4" />
                        </Button>
                      </>
                    )}

                    {app.type === "fullstack" && (app.liveStatus === "stopped" || app.liveStatus === "crashed") && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => restartApp.mutate(app.name)}
                        disabled={restartApp.isPending}
                        data-testid={`button-start-app-${app.name}`}
                      >
                        {restartApp.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Globe className="h-4 w-4" />
                        )}
                      </Button>
                    )}

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => republishApp.mutate(app)}
                      disabled={republishApp.isPending}
                      data-testid={`button-republish-${app.name}`}
                      className="gap-1"
                    >
                      {republishApp.isPending ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Rocket className="h-3 w-3" />
                      )}
                      Republish
                    </Button>

                    {app.buildLog && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setBuildLogOpen(app.name)}
                        data-testid={`button-build-log-${app.name}`}
                        className="text-xs"
                      >
                        Log
                      </Button>
                    )}

                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeleteConfirm(app.name)}
                      data-testid={`button-delete-app-${app.name}`}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Unpublish App</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will stop the app and remove it from public access. Your project files will not be deleted.
          </p>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setDeleteConfirm(null)} data-testid="button-cancel-delete">
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirm && deleteApp.mutate(deleteConfirm)}
              disabled={deleteApp.isPending}
              data-testid="button-confirm-delete"
            >
              {deleteApp.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Unpublish"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!buildLogOpen} onOpenChange={() => setBuildLogOpen(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Build Log - {buildLogOpen}</DialogTitle>
          </DialogHeader>
          <pre className="bg-muted rounded-md p-3 overflow-x-auto text-xs text-muted-foreground max-h-80 overflow-y-auto whitespace-pre-wrap">
            {viewBuildLog?.buildLog || "No log available"}
          </pre>
        </DialogContent>
      </Dialog>
    </div>
  );
}
