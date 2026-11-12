"use client";

import { Button } from "@/components/ui/Button";
import { AlertIcon } from "@/components/ui/icons";
import { usePostTrainingWorkspace } from "@/lib/hooks/usePostTrainingWorkspace";
import { CompletedModelResult } from "./CompletedModelResult";
import { DatasetUpload } from "./DatasetUpload";
import { InstructionInput } from "./InstructionInput";
import { ModelSelector } from "./ModelSelector";
import { RunConfirmation } from "./RunConfirmation";
import { StepHeader } from "./StepHeader";
import { TrainingProgress } from "./TrainingProgress";

export function PostTrainingWorkspace() {
  const {
    selectedModel,
    selectModel,
    instruction,
    setInstruction,
    dataset,
    datasetError,
    attachDataset,
    removeDataset,
    stage,
    progress,
    result,
    runError,
    canStart,
    isRunning,
    startRun,
    startNewRun,
    canRetryPublish,
    retryPublish,
    pendingEstimate,
    confirmRun,
    cancelPending,
  } = usePostTrainingWorkspace();

  if (stage === "complete" && result) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-4 py-10 sm:py-14">
        <header>
          <h1 className="text-lg font-medium text-fg">Run complete</h1>
          <p className="mt-1 text-sm text-fg-muted">Your post-trained model is ready to use.</p>
        </header>
        <CompletedModelResult result={result} onStartNewRun={startNewRun} />
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-4 py-10 sm:py-14">
      <header>
        <h1 className="text-lg font-medium text-fg">New post-training run</h1>
        <p className="mt-1 text-sm text-fg-muted">
          Choose a base model, describe what it should learn, and start a run.
        </p>
      </header>

      <section className="flex flex-col gap-3">
        <StepHeader index={1} title="Choose a base model" />
        <ModelSelector selected={selectedModel} onSelect={selectModel} disabled={isRunning} />
      </section>

      <section className="flex flex-col gap-3">
        <StepHeader
          index={2}
          title="Describe the training"
          description="Write what the model should learn, attach data to teach it, or both."
        />
        <InstructionInput value={instruction} onChange={setInstruction} disabled={isRunning} />
        <DatasetUpload
          dataset={dataset}
          error={datasetError}
          onAttach={attachDataset}
          onRemove={removeDataset}
          disabled={isRunning}
        />
      </section>

      <section className="flex flex-col gap-3">
        <StepHeader index={3} title="Post-train" />

        {pendingEstimate && selectedModel ? (
          <RunConfirmation
            estimate={pendingEstimate}
            model={selectedModel}
            onConfirm={confirmRun}
            onCancel={cancelPending}
          />
        ) : stage === "error" ? (
          <div className="flex items-start gap-3 rounded-xl border border-danger/30 bg-surface p-4">
            <AlertIcon className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
            <div className="flex-1">
              <p className="text-sm font-medium text-fg">
                {canRetryPublish ? "Training finished — publishing failed" : "Post-training failed"}
              </p>
              <p className="mt-1 text-sm text-fg-muted">{runError}</p>
              {canRetryPublish ? (
                <p className="mt-2 text-xs text-fg-subtle">
                  Your trained model is safe. Publishing again is free — starting over would
                  train it a second time.
                </p>
              ) : null}
            </div>
            {/* Only ever offer the free republish when training already
                succeeded. Offering "Try again" there would retrain a model
                that already exists, and bill for it twice. */}
            {canRetryPublish ? (
              <Button variant="secondary" size="sm" onClick={retryPublish}>
                Publish again
              </Button>
            ) : (
              <Button variant="secondary" size="sm" onClick={startRun} disabled={!canStart}>
                Try again
              </Button>
            )}
          </div>
        ) : isRunning ? (
          <TrainingProgress stage={stage} progress={progress} />
        ) : (
          <div className="flex flex-col items-start gap-2">
            <Button
              variant="primary"
              size="lg"
              onClick={startRun}
              disabled={!canStart}
              className="w-full sm:w-auto"
            >
              Post-train model
            </Button>
            {!canStart ? (
              <p className="text-xs text-fg-subtle">
                {selectedModel ? "Add an instruction or a dataset to continue." : "Choose a base model to continue."}
              </p>
            ) : null}
          </div>
        )}
      </section>
    </div>
  );
}
