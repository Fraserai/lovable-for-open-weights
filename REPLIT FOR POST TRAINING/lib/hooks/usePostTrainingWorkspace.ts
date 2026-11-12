"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { analyzeDatasetFile, readDatasetSample, validateChatJsonlSample } from "@/lib/dataset";
import { estimateRun, type RunEstimate } from "@/lib/cost";
import { trainingProvider, type TrainingRunHandle } from "@/lib/providers/training-provider";
import type { OpenModel, TrainedModelResult, TrainingStage, UploadedDataset } from "@/lib/types";

export interface PostTrainingWorkspaceState {
  // Selected base model (the catalog/search itself lives in ModelSelector via useModelSearch)
  selectedModel: OpenModel | null;
  selectModel: (model: OpenModel) => void;

  // Training input
  instruction: string;
  setInstruction: (value: string) => void;
  dataset: UploadedDataset | null;
  datasetError: string | null;
  attachDataset: (file: File) => Promise<void>;
  removeDataset: () => void;

  // Run lifecycle
  stage: TrainingStage;
  progress: number;
  result: TrainedModelResult | null;
  runError: string | null;
  canStart: boolean;
  isRunning: boolean;
  /**
   * Set when a run is ready but not yet confirmed. A real run spends money, so
   * it never starts on the first click — the user sees the size and cost first.
   * Null for simulated runs, which cost nothing and start immediately.
   */
  pendingEstimate: RunEstimate | null;
  startRun: () => void;
  confirmRun: () => void;
  cancelPending: () => void;
  startNewRun: () => void;
  /**
   * True when training already finished (and was already billed) and only
   * publishing failed. Retrying then is free; restarting the whole run would
   * charge for the same training twice.
   */
  canRetryPublish: boolean;
  retryPublish: () => void;
}

const RUNNING_STAGES: ReadonlySet<TrainingStage> = new Set([
  "preparing_data",
  "preparing_environment",
  "training",
  "finalizing",
]);

export function usePostTrainingWorkspace(): PostTrainingWorkspaceState {
  const [selectedModel, setSelectedModel] = useState<OpenModel | null>(null);

  const [instruction, setInstruction] = useState("");
  const [dataset, setDataset] = useState<UploadedDataset | null>(null);
  const [datasetError, setDatasetError] = useState<string | null>(null);

  const [stage, setStage] = useState<TrainingStage>("idle");
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<TrainedModelResult | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [canRetryPublish, setCanRetryPublish] = useState(false);
  const [pendingEstimate, setPendingEstimate] = useState<RunEstimate | null>(null);

  const runHandleRef = useRef<TrainingRunHandle | null>(null);

  useEffect(() => {
    return () => {
      runHandleRef.current?.cancel();
    };
  }, []);

  const attachDataset = useCallback(async (file: File) => {
    setDatasetError(null);
    try {
      const analyzed = await analyzeDatasetFile(file);
      setDataset(analyzed);

      // Sanity-check the head of the file straight away, so an obviously
      // malformed dataset is flagged at upload rather than after a run starts.
      // Only advisory — the bridge reads every line and has the final say.
      if (analyzed.format === "jsonl") {
        const sample = await readDatasetSample(analyzed);
        if (sample) {
          const check = validateChatJsonlSample(sample, analyzed.format);
          if (!check.supported) setDatasetError(check.reason ?? "That dataset can't be used.");
        }
      }
    } catch (error) {
      setDataset(null);
      setDatasetError(error instanceof Error ? error.message : "Couldn't read that file.");
    }
  }, []);

  const removeDataset = useCallback(() => {
    setDataset(null);
    setDatasetError(null);
  }, []);

  const isRunning = RUNNING_STAGES.has(stage);
  const hasTrainingInput = instruction.trim().length > 0 || dataset !== null;
  const canStart = selectedModel !== null && hasTrainingInput && !isRunning;

  /** Does the actual work. Only reached once a real run has been confirmed. */
  const beginRun = useCallback(() => {
    if (!selectedModel) return;

    setPendingEstimate(null);
    setResult(null);
    setRunError(null);
    setCanRetryPublish(false);
    setStage("preparing_data");
    setProgress(0);

    const handle = trainingProvider.startRun(
      { baseModel: selectedModel, instruction: instruction.trim(), dataset },
      {
        onProgress: (nextStage, nextProgress) => {
          setStage(nextStage);
          setProgress(nextProgress);
        },
        onComplete: (trainedModel) => {
          setResult(trainedModel);
          setStage("complete");
          setProgress(100);
        },
        onError: (message, failure) => {
          setRunError(message);
          setCanRetryPublish(failure.canRetryPublish === true);
          setStage("error");
        },
      }
    );
    runHandleRef.current = handle;
  }, [selectedModel, instruction, dataset]);

  /**
   * First click. A run that will actually spend money stops here and shows what
   * it will cost; a simulated run has nothing to warn about, so it just goes.
   */
  const startRun = useCallback(() => {
    if (!selectedModel || !hasTrainingInput || isRunning) return;

    const willSpendMoney = dataset !== null && dataset.format === "jsonl" && dataset.file !== undefined;
    if (willSpendMoney) {
      setRunError(null);
      setPendingEstimate(estimateRun(selectedModel, dataset));
      return;
    }
    beginRun();
  }, [selectedModel, dataset, hasTrainingInput, isRunning, beginRun]);

  const confirmRun = useCallback(() => beginRun(), [beginRun]);
  const cancelPending = useCallback(() => setPendingEstimate(null), []);

  const retryPublish = useCallback(() => {
    if (!canRetryPublish) return;
    setRunError(null);
    setStage("finalizing");
    runHandleRef.current?.retryPublish?.();
  }, [canRetryPublish]);

  const startNewRun = useCallback(() => {
    runHandleRef.current?.cancel();
    setStage("idle");
    setProgress(0);
    setResult(null);
    setRunError(null);
    setCanRetryPublish(false);
    setPendingEstimate(null);
    setInstruction("");
    setDataset(null);
    setDatasetError(null);
  }, []);

  return {
    selectedModel,
    selectModel: setSelectedModel,
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
    pendingEstimate,
    startRun,
    confirmRun,
    cancelPending,
    startNewRun,
    canRetryPublish,
    retryPublish,
  };
}
