import { ProgressBar } from "@/components/ui/ProgressBar";
import { CheckIcon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import { STAGE_DETAIL, STAGE_LABELS, STAGE_SEQUENCE } from "@/lib/stage-copy";
import type { TrainingStage } from "@/lib/types";

interface TrainingProgressProps {
  stage: TrainingStage;
  progress: number;
}

type StepStatus = "done" | "active" | "pending";

function stepStatus(currentStage: TrainingStage, stepStage: TrainingStage): StepStatus {
  if (currentStage === "complete") return "done";
  const currentIndex = STAGE_SEQUENCE.indexOf(currentStage as (typeof STAGE_SEQUENCE)[number]);
  const stepIndex = STAGE_SEQUENCE.indexOf(stepStage as (typeof STAGE_SEQUENCE)[number]);
  if (currentIndex === -1) return "pending";
  if (stepIndex < currentIndex) return "done";
  if (stepIndex === currentIndex) return "active";
  return "pending";
}

export function TrainingProgress({ stage, progress }: TrainingProgressProps) {
  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-fg">Post-training in progress</p>
        <span className="font-mono text-xs text-fg-subtle">{progress}%</span>
      </div>
      <ProgressBar value={progress} className="mt-3" />

      <ul className="mt-5 flex flex-col gap-4">
        {STAGE_SEQUENCE.map((stepStage) => {
          const status = stepStatus(stage, stepStage);
          return (
            <li key={stepStage} className="flex items-start gap-3">
              <StepIcon status={status} />
              <div className="min-w-0 pt-0.5">
                <p className={cn("text-sm", status === "pending" ? "text-fg-subtle" : "text-fg")}>
                  {STAGE_LABELS[stepStage]}
                </p>
                {status === "active" ? (
                  <p className="mt-0.5 font-mono text-xs text-fg-subtle">{STAGE_DETAIL[stepStage]}</p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function StepIcon({ status }: { status: StepStatus }) {
  if (status === "done") {
    return (
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-success-muted text-success">
        <CheckIcon className="h-3 w-3" />
      </span>
    );
  }
  if (status === "active") {
    return (
      <span className="relative flex h-5 w-5 shrink-0 items-center justify-center">
        <span className="absolute h-5 w-5 rounded-full border-2 border-accent-muted" />
        <span className="h-2 w-2 rounded-full bg-accent animate-pulse-dot" />
      </span>
    );
  }
  return <span className="h-5 w-5 shrink-0 rounded-full border border-border-strong" />;
}
