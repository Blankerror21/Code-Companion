import { Badge } from "@/components/ui/badge";

interface ModeToggleProps {
  mode: "plan" | "build";
  onToggle: (mode: "plan" | "build") => void;
}

export function ModeToggle({ mode, onToggle }: ModeToggleProps) {
  return (
    <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5" data-testid="toggle-mode">
      <button
        onClick={() => onToggle("plan")}
        className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
          mode === "plan"
            ? "bg-amber-500/20 text-amber-500"
            : "text-muted-foreground"
        }`}
        data-testid="button-plan-mode"
      >
        Plan
      </button>
      <button
        onClick={() => onToggle("build")}
        className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
          mode === "build"
            ? "bg-primary/20 text-primary"
            : "text-muted-foreground"
        }`}
        data-testid="button-build-mode"
      >
        Build
      </button>
    </div>
  );
}
