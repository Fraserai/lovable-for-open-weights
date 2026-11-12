import type { TrainingRequest, TrainingStage, TrainedModelResult } from "@/lib/types";

/**
 * The dataset itself is unusable, as judged by the bridge after reading every
 * line of it.
 *
 * Distinguished from every other failure because it must NOT trigger the
 * simulated-run fallback. Falling back here would hand someone a fake model in
 * response to a real problem with their data — the single most damaging thing
 * this tool could do quietly.
 */
export class DatasetRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DatasetRejectedError";
  }
}

/**
 * Runs a post-training job and reports progress.
 *
 * The UI only depends on this interface — `startRun` returning a cancel
 * handle and reporting stage changes through callbacks. Three
 * implementations exist below:
 *  - `MockTrainingProvider`: the original fully-simulated run.
 *  - `TinkerTrainingProvider`: a real run, via the local Tinker bridge
 *    service (services/tinker-bridge) — never called directly by the UI.
 *  - `FallbackTrainingProvider`: what's actually exported as
 *    `trainingProvider`. Prefers Tinker when a request is eligible
 *    (dataset present, in the one supported chat-JSONL shape) and the
 *    bridge is configured; otherwise transparently uses the mock —
 *    exactly the same fallback shape as `FallbackModelProvider` in
 *    model-provider.ts.
 */
export interface TrainingProvider {
  startRun(request: TrainingRequest, handlers: TrainingRunHandlers): TrainingRunHandle;
}

/** Why a run failed — decides what the UI offers next, and whether falling back is honest. */
export interface TrainingFailure {
  /**
   * Training already finished (and was already paid for) and only the publish
   * leg failed. The UI must offer a free republish rather than a button that
   * re-trains and bills a second time.
   */
  canRetryPublish?: boolean;
  /**
   * The dataset itself is unusable. Never fall back to a simulated run on
   * this — the customer needs to see the real problem with their data.
   */
  datasetRejected?: boolean;
}

export interface TrainingRunHandlers {
  onProgress: (stage: TrainingStage, progressPercent: number) => void;
  onComplete: (result: TrainedModelResult) => void;
  onError: (message: string, failure: TrainingFailure) => void;
}

export interface TrainingRunHandle {
  cancel: () => void;
  /**
   * Republishes an already-trained checkpoint. Present only on runs that can
   * actually do this; the mock run has no checkpoint to republish.
   */
  retryPublish?: () => void;
}

interface StageDefinition {
  stage: TrainingStage;
  /** Base duration in ms; jittered slightly per run for a less robotic feel. */
  baseDurationMs: number;
}

const STAGES: StageDefinition[] = [
  { stage: "preparing_data", baseDurationMs: 1300 },
  { stage: "preparing_environment", baseDurationMs: 1500 },
  { stage: "training", baseDurationMs: 3200 },
  { stage: "finalizing", baseDurationMs: 1100 },
];

const TICK_MS = 90;

function jitter(ms: number): number {
  return Math.round(ms * (0.85 + Math.random() * 0.3));
}

function slugifyFamily(family: string): string {
  return family.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

/** Stand-in for the authenticated user's namespace until auth exists. */
const MOCK_USER_NAMESPACE = "caesey";

let runCounter = 0;

function buildMockResult(request: TrainingRequest): TrainedModelResult {
  runCounter += 1;
  const slug = slugifyFamily(request.baseModel.family);
  const ordinal = String(runCounter).padStart(3, "0");
  return {
    id: `${MOCK_USER_NAMESPACE}/${slug}-posttrained-${ordinal}`,
    isSimulated: true,
    baseModel: request.baseModel,
    instruction: request.instruction,
    datasetName: request.dataset?.fileName ?? null,
    createdAt: new Date().toISOString(),
  };
}

class MockTrainingProvider implements TrainingProvider {
  startRun(request: TrainingRequest, handlers: TrainingRunHandlers): TrainingRunHandle {
    let cancelled = false;
    const durations = STAGES.map((s) => jitter(s.baseDurationMs));
    const totalDuration = durations.reduce((sum, d) => sum + d, 0);

    const run = async () => {
      let elapsedBeforeStage = 0;

      for (let i = 0; i < STAGES.length; i += 1) {
        if (cancelled) return;
        const { stage } = STAGES[i]!;
        const duration = durations[i]!;
        const stageStart = performance.now();

        // eslint-disable-next-line no-constant-condition
        while (true) {
          if (cancelled) return;
          const stageElapsed = Math.min(performance.now() - stageStart, duration);
          const overallElapsed = elapsedBeforeStage + stageElapsed;
          const progress = Math.min(99, Math.round((overallElapsed / totalDuration) * 100));
          handlers.onProgress(stage, progress);
          if (stageElapsed >= duration) break;
          await new Promise((resolve) => setTimeout(resolve, TICK_MS));
        }
        elapsedBeforeStage += duration;
      }

      if (cancelled) return;
      handlers.onProgress("complete", 100);
      handlers.onComplete(buildMockResult(request));
    };

    run().catch((error: unknown) => {
      if (cancelled) return;
      const message = error instanceof Error ? error.message : "Post-training failed unexpectedly.";
      handlers.onError(message, {}); // a simulated run has no checkpoint to republish
    });

    return {
      cancel: () => {
        cancelled = true;
      },
    };
  }
}

const POLL_INTERVAL_MS = 2000;

interface BridgeJobStatus {
  status: "running" | "complete" | "error";
  stage: TrainingStage;
  progress: number;
  result?: { id: string; url: string };
  error?: string;
  canRetryPublish?: boolean;
}

/**
 * Real training run. Talks only to our own `/api/training-runs` routes
 * (never the bridge directly), which proxy to services/tinker-bridge.
 */
class TinkerTrainingProvider implements TrainingProvider {
  startRun(request: TrainingRequest, handlers: TrainingRunHandlers): TrainingRunHandle {
    let cancelled = false;
    let jobId: string | null = null;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;

    const start = async () => {
      const file = request.dataset!.file!;
      // The file is sent as the raw request body, not wrapped in JSON. The
      // browser streams it from disk, so a several-hundred-megabyte dataset
      // never has to fit in a JavaScript string. Metadata rides in the query
      // string, which keeps the body a pure byte stream end to end.
      const params = new URLSearchParams({
        baseModelId: request.baseModel.id,
        fileName: request.dataset!.fileName,
      });
      const response = await fetch(`/api/training-runs?${params}`, {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: file,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        // 422 means the bridge read the dataset and it is genuinely unusable.
        // That is the customer's problem to fix, not a reason to fall back to
        // a simulated run — see DatasetRejectedError.
        if (response.status === 422) {
          throw new DatasetRejectedError(payload.error ?? "That dataset can't be used for training.");
        }
        throw new Error(payload.error ?? `Couldn't start a live training run (${response.status}).`);
      }
      jobId = payload.id;
      if (cancelled) return;
      await poll();
    };

    const poll = async (): Promise<void> => {
      if (cancelled || !jobId) return;
      const response = await fetch(`/api/training-runs/${jobId}`);
      const job = (await response.json().catch(() => ({}))) as Partial<BridgeJobStatus> & { error?: string };
      if (cancelled) return;

      if (!response.ok) {
        throw new Error(job.error ?? `Lost track of the training run (${response.status}).`);
      }
      // Report whatever stage/progress the job reached even if this same
      // poll also carries an error — a job that got as far as
      // "preparing_environment" before failing made genuine real progress
      // and must not look, to FallbackTrainingProvider, like no real
      // attempt happened at all (which would wrongly trigger a fallback).
      if (job.stage && typeof job.progress === "number") {
        handlers.onProgress(job.stage, job.progress);
      }
      if (job.status === "error") {
        handlers.onError(job.error ?? "The training run failed.", { canRetryPublish: job.canRetryPublish === true });
        return;
      }
      if (job.status === "complete" && job.result) {
        handlers.onComplete({
          id: job.result.id,
          url: job.result.url,
          isSimulated: false,
          baseModel: request.baseModel,
          instruction: request.instruction,
          datasetName: request.dataset?.fileName ?? null,
          createdAt: new Date().toISOString(),
        });
        return;
      }
      pollTimer = setTimeout(() => {
        poll().catch((error: unknown) => {
          if (!cancelled) {
            handlers.onError(
              error instanceof Error ? error.message : "The training run failed.",
              {}
            );
          }
        });
      }, POLL_INTERVAL_MS);
    };

    start().catch((error: unknown) => {
      if (cancelled) return;
      handlers.onError(
        error instanceof Error ? error.message : "Couldn't reach the training service.",
        { datasetRejected: error instanceof DatasetRejectedError }
      );
    });

    return {
      cancel: () => {
        cancelled = true;
        if (pollTimer) clearTimeout(pollTimer);
        if (jobId) {
          fetch(`/api/training-runs/${jobId}`, { method: "DELETE" }).catch(() => {});
        }
      },
      retryPublish: () => {
        if (!jobId) return;
        cancelled = false;
        fetch(`/api/training-runs/${jobId}/publish`, { method: "POST" })
          .then(async (response) => {
            if (!response.ok) {
              const payload = await response.json().catch(() => ({}));
              throw new Error(payload.error ?? "Couldn't republish this model.");
            }
            await poll();
          })
          .catch((error: unknown) => {
            handlers.onError(
              error instanceof Error ? error.message : "Couldn't republish this model.",
              { canRetryPublish: true } // the checkpoint is untouched
            );
          });
      },
    };
  }
}

/**
 * Cheap, synchronous check for whether a real run is even worth attempting.
 *
 * Only tests what can be known without reading the file: is there a dataset,
 * is it JSONL, do we still have a handle to stream. Whether the *contents* are
 * valid is the bridge's call — it reads every line, and a dataset it rejects
 * surfaces as an error rather than quietly becoming a simulated run.
 */
function isEligibleForRealTraining(request: TrainingRequest): boolean {
  const dataset = request.dataset;
  return dataset !== null && dataset.format === "jsonl" && dataset.file !== undefined;
}

/**
 * Prefers a real Tinker run; falls back to the simulated one whenever the
 * request can't go live — an unsupported dataset shape (checked locally,
 * no network call), the bridge not running, or Tinker not configured
 * (checked via the first network round-trip). Once real progress has been
 * reported even once, a later failure is a genuine error, not a fallback
 * trigger — see the module doc comment above.
 */
class FallbackTrainingProvider implements TrainingProvider {
  constructor(
    private readonly primary: TrainingProvider,
    private readonly fallback: TrainingProvider
  ) {}

  startRun(request: TrainingRequest, handlers: TrainingRunHandlers): TrainingRunHandle {
    if (!isEligibleForRealTraining(request)) {
      return this.fallback.startRun(request, handlers);
    }

    let cancelled = false;
    let activeHandle: TrainingRunHandle | null = null;
    let realProgressStarted = false;

    activeHandle = this.primary.startRun(request, {
      onProgress: (stage, progress) => {
        realProgressStarted = true;
        handlers.onProgress(stage, progress);
      },
      onComplete: handlers.onComplete,
      onError: (message, failure) => {
        if (cancelled) return;
        // Fall back ONLY when the service was unreachable before doing any real
        // work. Never fall back once training has started (a real model exists),
        // never on a publish failure (it is already paid for), and never on a
        // rejected dataset — handing someone a simulated model in response to a
        // genuine problem with their data is the worst thing this could do.
        const serviceUnavailable =
          !realProgressStarted && !failure.canRetryPublish && !failure.datasetRejected;
        if (serviceUnavailable) {
          console.warn("[training-provider] Live training unavailable before start, using a simulated run.", message);
          activeHandle = this.fallback.startRun(request, handlers);
          return;
        }
        handlers.onError(message, failure);
      },
    });

    return {
      cancel: () => {
        cancelled = true;
        activeHandle?.cancel();
      },
      retryPublish: () => activeHandle?.retryPublish?.(),
    };
  }
}

export const trainingProvider: TrainingProvider = new FallbackTrainingProvider(
  new TinkerTrainingProvider(),
  new MockTrainingProvider()
);
