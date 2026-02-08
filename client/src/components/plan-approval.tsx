import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Check,
  X,
  Plus,
  Trash2,
  GripVertical,
  ArrowUp,
  ArrowDown,
  ClipboardList,
  Pencil,
  MessageSquarePlus,
  Bot,
} from "lucide-react";

interface PlanApprovalProps {
  plan: string;
  onApprove: (editedPlan: string) => void;
  onReject: () => void;
  isPending?: boolean;
}

function parsePlanSteps(plan: string): string[] {
  const lines = plan.split("\n").filter(Boolean);
  const steps = lines.filter((l) => l.match(/^\s*(\d+[\.\)]\s|[-*]\s)/));
  if (steps.length > 0) {
    return steps
      .map((s) => s.replace(/^\s*\d+[\.\)]\s*|^\s*[-*]\s*/, "").trim())
      .map((s) => s.replace(/\*\*/g, "").trim())
      .filter(Boolean);
  }
  return lines.map((l) => l.replace(/\*\*/g, "").trim()).filter(Boolean);
}

export function PlanApproval({ plan, onApprove, onReject, isPending }: PlanApprovalProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [steps, setSteps] = useState<string[]>(() => parsePlanSteps(plan));
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const [additionalNotes, setAdditionalNotes] = useState("");
  const [newStepText, setNewStepText] = useState("");
  useEffect(() => {
    setSteps(parsePlanSteps(plan));
    setAdditionalNotes("");
    setEditingIdx(null);
    setEditText("");
    setNewStepText("");
  }, [plan]);

  const handleApproveDirectly = () => {
    onApprove(plan);
  };

  const handleApproveEdited = () => {
    let editedPlan = steps
      .map((s, i) => `${i + 1}. ${s}`)
      .join("\n");
    if (additionalNotes.trim()) {
      editedPlan += `\n\nAdditional instructions from user:\n${additionalNotes.trim()}`;
    }
    setDialogOpen(false);
    onApprove(editedPlan);
  };

  const startEditing = (idx: number) => {
    setEditingIdx(idx);
    setEditText(steps[idx]);
  };

  const saveEdit = () => {
    if (editingIdx === null) return;
    const updated = [...steps];
    updated[editingIdx] = editText.trim() || steps[editingIdx];
    setSteps(updated);
    setEditingIdx(null);
    setEditText("");
  };

  const cancelEdit = () => {
    setEditingIdx(null);
    setEditText("");
  };

  const addStep = () => {
    if (!newStepText.trim()) return;
    setSteps([...steps, newStepText.trim()]);
    setNewStepText("");
  };

  const removeStep = (idx: number) => {
    setSteps(steps.filter((_, i) => i !== idx));
  };

  const moveStep = (idx: number, direction: "up" | "down") => {
    const newIdx = direction === "up" ? idx - 1 : idx + 1;
    if (newIdx < 0 || newIdx >= steps.length) return;
    const updated = [...steps];
    [updated[idx], updated[newIdx]] = [updated[newIdx], updated[idx]];
    setSteps(updated);
  };

  return (
    <>
      <div className="flex gap-3" data-testid="plan-approval-card">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-amber-500/20 text-amber-500">
          <Bot className="h-3.5 w-3.5" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-medium text-amber-500">Plan</span>
          </div>

          <Card className="border-amber-500/20 bg-amber-500/5 p-4">
            <div className="flex items-center gap-2 mb-3">
              <ClipboardList className="h-4 w-4 text-amber-500" />
              <span className="text-sm font-medium">Plan Requires Approval</span>
            </div>

            <div className="space-y-1.5 mb-4">
              {steps.map((step, i) => (
                <div
                  key={i}
                  className="flex items-start gap-2 text-sm text-foreground/80"
                  data-testid={`plan-step-${i}`}
                >
                  <span className="text-xs font-mono text-muted-foreground mt-0.5 shrink-0 w-5 text-right">
                    {i + 1}.
                  </span>
                  <span className="flex-1">{step}</span>
                </div>
              ))}
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <Button
                onClick={handleApproveDirectly}
                disabled={isPending}
                className="gap-1.5"
                data-testid="button-approve-plan"
              >
                <Check className="h-3.5 w-3.5" />
                Approve & Build
              </Button>
              <Button
                variant="outline"
                onClick={() => setDialogOpen(true)}
                disabled={isPending}
                className="gap-1.5"
                data-testid="button-edit-plan"
              >
                <Pencil className="h-3.5 w-3.5" />
                Edit Plan
              </Button>
              <Button
                variant="outline"
                onClick={onReject}
                disabled={isPending}
                className="gap-1.5"
                data-testid="button-reject-plan"
              >
                <X className="h-3.5 w-3.5" />
                Reject
              </Button>
            </div>
          </Card>
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-amber-500" />
              Edit Plan
            </DialogTitle>
            <DialogDescription>
              Reorder, edit, add, or remove steps before approving. You can also add extra instructions.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-2 py-2" data-testid="plan-edit-steps">
            {steps.map((step, idx) => (
              <div
                key={idx}
                className="flex items-start gap-1.5 group rounded-md border border-border p-2"
                data-testid={`plan-edit-step-${idx}`}
              >
                <div className="flex flex-col items-center shrink-0 pt-0.5">
                  <GripVertical className="h-3.5 w-3.5 text-muted-foreground/40" />
                </div>

                <span className="text-xs font-mono text-muted-foreground mt-1 shrink-0 w-5 text-right">
                  {idx + 1}.
                </span>

                {editingIdx === idx ? (
                  <div className="flex-1 space-y-1.5">
                    <Textarea
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      className="text-sm min-h-[60px]"
                      data-testid={`input-edit-step-${idx}`}
                    />
                    <div className="flex items-center gap-1">
                      <Button size="sm" onClick={saveEdit} className="gap-1" data-testid={`button-save-step-${idx}`}>
                        <Check className="h-3 w-3" />
                        Save
                      </Button>
                      <Button size="sm" variant="ghost" onClick={cancelEdit} data-testid={`button-cancel-edit-${idx}`}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <span
                    className="flex-1 text-sm text-foreground/80 mt-0.5 cursor-pointer"
                    onClick={() => startEditing(idx)}
                  >
                    {step}
                  </span>
                )}

                <div className="flex items-center gap-0.5 shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => moveStep(idx, "up")}
                    disabled={idx === 0}
                    className="px-1"
                    data-testid={`button-move-up-${idx}`}
                  >
                    <ArrowUp className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => moveStep(idx, "down")}
                    disabled={idx === steps.length - 1}
                    className="px-1"
                    data-testid={`button-move-down-${idx}`}
                  >
                    <ArrowDown className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeStep(idx)}
                    className="px-1 text-muted-foreground"
                    data-testid={`button-remove-step-${idx}`}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))}

            <div className="flex items-center gap-2 pt-1">
              <input
                type="text"
                value={newStepText}
                onChange={(e) => setNewStepText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addStep();
                  }
                }}
                placeholder="Add a new step..."
                className="flex-1 text-sm bg-transparent border border-dashed border-border rounded-md px-3 py-2 focus:outline-none focus:border-primary placeholder:text-muted-foreground/50"
                data-testid="input-add-step"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={addStep}
                disabled={!newStepText.trim()}
                className="gap-1"
                data-testid="button-add-step"
              >
                <Plus className="h-3 w-3" />
                Add
              </Button>
            </div>
          </div>

          <div className="space-y-1.5 pt-2 border-t border-border">
            <div className="flex items-center gap-1.5">
              <MessageSquarePlus className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground">Additional Instructions</span>
            </div>
            <Textarea
              value={additionalNotes}
              onChange={(e) => setAdditionalNotes(e.target.value)}
              placeholder="Any extra changes, preferences, or notes for the agent..."
              className="text-sm min-h-[60px]"
              data-testid="input-additional-notes"
            />
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              data-testid="button-cancel-edit-dialog"
            >
              Cancel
            </Button>
            <Button
              onClick={handleApproveEdited}
              disabled={isPending || steps.length === 0}
              className="gap-1.5"
              data-testid="button-approve-edited-plan"
            >
              <Check className="h-3.5 w-3.5" />
              Approve Edited Plan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
