import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ArrowUp, Square } from "lucide-react";

interface ChatInputProps {
  onSend: (message: string) => void;
  isStreaming: boolean;
  onStop: () => void;
  disabled?: boolean;
  mode?: "plan" | "build";
  onModeToggle?: (mode: "plan" | "build") => void;
}

export function ChatInput({ onSend, isStreaming, onStop, disabled, mode, onModeToggle }: ChatInputProps) {
  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!isStreaming && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isStreaming]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      const scrollHeight = textareaRef.current.scrollHeight;
      textareaRef.current.style.height = Math.min(scrollHeight, 160) + "px";
    }
  }, [input]);

  const handleSubmit = () => {
    const trimmed = input.trim();
    if (!trimmed || isStreaming) return;
    onSend(trimmed);
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="p-3 pb-4">
      <div className="max-w-3xl mx-auto">
        <div className="relative bg-muted/50 border border-border rounded-xl focus-within:border-primary/40 focus-within:ring-1 focus-within:ring-primary/20 transition-all">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={mode === "plan" ? "Describe what you want to plan..." : "Describe what you want to build or change..."}
            className="w-full bg-transparent text-sm leading-relaxed resize-none px-4 pt-3 pb-10 min-h-[52px] max-h-[160px] focus:outline-none placeholder:text-muted-foreground/60"
            rows={1}
            disabled={isStreaming || disabled}
            data-testid="input-chat-message"
          />
          <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between">
            {mode && onModeToggle ? (
              <div className="flex items-center gap-0.5 bg-muted rounded-lg p-0.5" data-testid="toggle-mode">
                <button
                  onClick={() => onModeToggle("plan")}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                    mode === "plan"
                      ? "bg-amber-500/20 text-amber-500"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  data-testid="button-plan-mode"
                >
                  Plan
                </button>
                <button
                  onClick={() => onModeToggle("build")}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                    mode === "build"
                      ? "bg-primary/20 text-primary"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  data-testid="button-build-mode"
                >
                  Build
                </button>
              </div>
            ) : (
              <div />
            )}
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-muted-foreground/40 mr-1 select-none hidden sm:inline">
                Enter to send
              </span>
              {isStreaming ? (
                <Button
                  variant="destructive"
                  size="icon"
                  onClick={onStop}
                  className="h-7 w-7 rounded-lg"
                  data-testid="button-stop-streaming"
                >
                  <Square className="h-3 w-3" />
                </Button>
              ) : (
                <Button
                  size="icon"
                  onClick={handleSubmit}
                  disabled={!input.trim() || disabled}
                  className="h-7 w-7 rounded-lg"
                  data-testid="button-send-message"
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
