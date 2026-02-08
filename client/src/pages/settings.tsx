import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { type Settings } from "@shared/schema";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  Settings as SettingsIcon,
  Server,
  Wifi,
  WifiOff,
  Save,
  RotateCcw,
  Loader2,
  Zap,
  Shield,
  Wrench,
  Brain,
} from "lucide-react";
import { useState, useEffect } from "react";

export default function SettingsPage() {
  const { toast } = useToast();
  const [testStatus, setTestStatus] = useState<"idle" | "testing" | "success" | "error">("idle");
  const [replitStatus, setReplitStatus] = useState<"idle" | "testing" | "success" | "error">("idle");
  const [replitUser, setReplitUser] = useState<string>("");

  const { data: settings, isLoading } = useQuery<Settings>({
    queryKey: ["/api/settings"],
  });

  const form = useForm({
    defaultValues: {
      lmStudioEndpoint: "",
      modelName: "",
      mode: "build",
      replitToken: "",
      maxTokens: 4096,
      temperature: "0.7",
      dualModelEnabled: false,
      plannerModelName: "",
      coderModelName: "",
    },
  });

  useEffect(() => {
    if (settings) {
      form.reset({
        lmStudioEndpoint: settings.lmStudioEndpoint,
        modelName: settings.modelName || "",
        mode: settings.mode,
        replitToken: settings.replitToken || "",
        maxTokens: settings.maxTokens || 4096,
        temperature: settings.temperature || "0.7",
        dualModelEnabled: settings.dualModelEnabled ?? false,
        plannerModelName: settings.plannerModelName || "",
        coderModelName: settings.coderModelName || "",
      });
    }
  }, [settings, form]);

  const updateSettings = useMutation({
    mutationFn: async (data: any) => {
      await apiRequest("PATCH", "/api/settings", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      toast({ title: "Settings saved", description: "Your configuration has been updated." });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const testConnection = async () => {
    setTestStatus("testing");
    try {
      const res = await apiRequest("POST", "/api/test-connection", {
        endpoint: form.getValues("lmStudioEndpoint"),
      });
      const data = await res.json();
      if (data.success) {
        setTestStatus("success");
        toast({ title: "Connection successful", description: `Connected to ${data.model || "LM Studio"}` });
      } else {
        setTestStatus("error");
        toast({ title: "Connection failed", description: data.error, variant: "destructive" });
      }
    } catch {
      setTestStatus("error");
      toast({ title: "Connection failed", description: "Could not reach the endpoint", variant: "destructive" });
    }
  };

  const verifyReplitToken = async () => {
    setReplitStatus("testing");
    try {
      await updateSettings.mutateAsync({ replitToken: form.getValues("replitToken") });
      const res = await apiRequest("POST", "/api/replit/verify-token");
      const data = await res.json();
      if (data.valid) {
        setReplitStatus("success");
        setReplitUser(data.username || "");
        toast({ title: "Replit connected", description: `Logged in as @${data.username}` });
      } else {
        setReplitStatus("error");
        toast({ title: "Verification failed", description: data.error, variant: "destructive" });
      }
    } catch {
      setReplitStatus("error");
      toast({ title: "Verification failed", description: "Could not verify token", variant: "destructive" });
    }
  };

  const onSubmit = form.handleSubmit((data) => {
    updateSettings.mutate(data);
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto py-8 px-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <SettingsIcon className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-lg font-semibold" data-testid="text-settings-title">Settings</h1>
          <p className="text-sm text-muted-foreground">Configure your AI agent and endpoints</p>
        </div>
      </div>

      <form onSubmit={onSubmit} className="space-y-6">
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <Server className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-medium">LM Studio Endpoint</h3>
          </div>

          <div className="space-y-3">
            <div>
              <Label htmlFor="endpoint" className="text-xs text-muted-foreground">
                API Endpoint URL
              </Label>
              <div className="flex items-center gap-2 mt-1">
                <Input
                  id="endpoint"
                  {...form.register("lmStudioEndpoint")}
                  placeholder="https://your-endpoint.ngrok-free.dev/"
                  className="font-mono text-sm"
                  data-testid="input-endpoint"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={testConnection}
                  disabled={testStatus === "testing"}
                  className="shrink-0 gap-1.5"
                  data-testid="button-test-connection"
                >
                  {testStatus === "testing" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : testStatus === "success" ? (
                    <Wifi className="h-3.5 w-3.5 text-green-500" />
                  ) : testStatus === "error" ? (
                    <WifiOff className="h-3.5 w-3.5 text-destructive" />
                  ) : (
                    <Wifi className="h-3.5 w-3.5" />
                  )}
                  Test
                </Button>
              </div>
            </div>

            <div>
              <Label htmlFor="model" className="text-xs text-muted-foreground">
                Model Name (optional - auto-detected)
              </Label>
              <Input
                id="model"
                {...form.register("modelName")}
                placeholder="Auto-detect from LM Studio"
                className="mt-1 font-mono text-sm"
                data-testid="input-model-name"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="maxTokens" className="text-xs text-muted-foreground">
                  Max Tokens
                </Label>
                <Input
                  id="maxTokens"
                  type="number"
                  {...form.register("maxTokens", { valueAsNumber: true })}
                  className="mt-1 font-mono text-sm"
                  data-testid="input-max-tokens"
                />
              </div>
              <div>
                <Label htmlFor="temperature" className="text-xs text-muted-foreground">
                  Temperature
                </Label>
                <Input
                  id="temperature"
                  {...form.register("temperature")}
                  className="mt-1 font-mono text-sm"
                  data-testid="input-temperature"
                />
              </div>
            </div>
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <Zap className="h-4 w-4 text-amber-500" />
            <h3 className="text-sm font-medium">Agent Mode</h3>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm">Plan Mode</p>
              <p className="text-xs text-muted-foreground">
                When enabled, the agent presents a plan for approval before making changes
              </p>
            </div>
            <Switch
              checked={form.watch("mode") === "plan"}
              onCheckedChange={(checked) =>
                form.setValue("mode", checked ? "plan" : "build")
              }
              data-testid="switch-plan-mode"
            />
          </div>

          <Separator className="my-3" />

          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className={
                form.watch("mode") === "plan"
                  ? "border-amber-500/30 text-amber-500"
                  : "border-primary/30 text-primary"
              }
            >
              {form.watch("mode") === "plan" ? "Plan Mode" : "Build Mode"}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {form.watch("mode") === "plan"
                ? "Agent will present plans before implementing"
                : "Agent will implement changes directly"}
            </span>
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <Brain className="h-4 w-4 text-blue-500" />
            <h3 className="text-sm font-medium">Dual-Model Mode</h3>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm">Enable Dual-Model</p>
              <p className="text-xs text-muted-foreground">
                Use separate Planner and Coder models for better results with smaller models
              </p>
            </div>
            <Switch
              checked={form.watch("dualModelEnabled")}
              onCheckedChange={(checked) =>
                form.setValue("dualModelEnabled", checked)
              }
              data-testid="switch-dual-model"
            />
          </div>

          {form.watch("dualModelEnabled") && (
            <>
              <Separator className="my-3" />
              <div className="space-y-3">
                <div>
                  <Label htmlFor="plannerModel" className="text-xs text-muted-foreground">
                    Planner Model (conversation, planning, task coordination)
                  </Label>
                  <Input
                    id="plannerModel"
                    {...form.register("plannerModelName")}
                    placeholder="e.g. qwen2.5-14b-instruct (leave empty for default)"
                    className="mt-1 font-mono text-sm"
                    data-testid="input-planner-model"
                  />
                </div>
                <div>
                  <Label htmlFor="coderModel" className="text-xs text-muted-foreground">
                    Coder Model (code generation, tool execution)
                  </Label>
                  <Input
                    id="coderModel"
                    {...form.register("coderModelName")}
                    placeholder="e.g. qwen2.5-coder-14b-instruct (leave empty for default)"
                    className="mt-1 font-mono text-sm"
                    data-testid="input-coder-model"
                  />
                </div>
                <p className="text-[10px] text-muted-foreground">
                  The Planner handles conversation and creates focused tasks. The Coder receives each task
                  with only the relevant file context - no conversation history. This keeps both models
                  within context limits of smaller 14B parameter models.
                </p>
              </div>
            </>
          )}
        </Card>

        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <Shield className="h-4 w-4 text-green-500" />
            <h3 className="text-sm font-medium">Replit Integration</h3>
          </div>

          <div className="space-y-3">
            <div>
              <Label htmlFor="replitToken" className="text-xs text-muted-foreground">
                Replit Session Token (connect.sid)
              </Label>
              <div className="flex items-center gap-2 mt-1">
                <Input
                  id="replitToken"
                  type="password"
                  {...form.register("replitToken")}
                  placeholder="Paste your connect.sid cookie value"
                  className="font-mono text-sm"
                  data-testid="input-replit-token"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={verifyReplitToken}
                  disabled={replitStatus === "testing" || !form.watch("replitToken")}
                  className="shrink-0 gap-1.5"
                  data-testid="button-verify-replit-token"
                >
                  {replitStatus === "testing" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : replitStatus === "success" ? (
                    <Wifi className="h-3.5 w-3.5 text-green-500" />
                  ) : replitStatus === "error" ? (
                    <WifiOff className="h-3.5 w-3.5 text-destructive" />
                  ) : (
                    <Shield className="h-3.5 w-3.5" />
                  )}
                  Verify
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">
                Find this in your browser DevTools under Application &gt; Cookies for replit.com
              </p>
            </div>

            {replitStatus === "success" && replitUser && (
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="border-green-500/30 text-green-500">
                  Connected
                </Badge>
                <span className="text-xs text-muted-foreground">
                  Logged in as @{replitUser}
                </span>
              </div>
            )}

            <Separator />

            <div>
              <p className="text-xs text-muted-foreground">
                With a valid token, the agent can access your Replit projects.
                Use "Connect Project" in the chat header to link a specific project to a conversation.
              </p>
            </div>
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <Wrench className="h-4 w-4 text-purple-500" />
            <h3 className="text-sm font-medium">Self-Modification</h3>
          </div>

          <p className="text-xs text-muted-foreground mb-3">
            This agent can modify its own code. Ask it to add features, fix bugs, or
            improve itself. All self-modifications are backed up automatically.
          </p>

          <div className="flex items-center gap-2">
            <Badge variant="outline" className="border-purple-500/30 text-purple-500">
              Enabled
            </Badge>
            <span className="text-xs text-muted-foreground">
              Agent can read and modify its own source code
            </span>
          </div>
        </Card>

        <div className="flex items-center gap-2">
          <Button
            type="submit"
            disabled={updateSettings.isPending}
            className="gap-1.5"
            data-testid="button-save-settings"
          >
            {updateSettings.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            Save Settings
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => settings && form.reset({
              lmStudioEndpoint: settings.lmStudioEndpoint,
              modelName: settings.modelName || "",
              mode: settings.mode,
              replitToken: settings.replitToken || "",
              maxTokens: settings.maxTokens || 4096,
              temperature: settings.temperature || "0.7",
              dualModelEnabled: settings.dualModelEnabled ?? false,
              plannerModelName: settings.plannerModelName || "",
              coderModelName: settings.coderModelName || "",
            })}
            className="gap-1.5"
            data-testid="button-reset-settings"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset
          </Button>
        </div>
      </form>
    </div>
  );
}
