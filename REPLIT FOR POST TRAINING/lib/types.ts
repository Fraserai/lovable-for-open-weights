/**
 * Core domain types for the post-training workspace.
 *
 * These types are intentionally provider-agnostic: they describe the shapes
 * the UI depends on, not any particular backend. Swapping the mock
 * implementations in `lib/providers/*` for real integrations (Hugging Face,
 * OpenRouter, Tinker) should not require changing these types or the
 * components that consume them.
 */

/**
 * A base open-weight model available to post-train.
 *
 * For the real catalog, `id`/`name` are the Hugging Face repository id
 * (e.g. "Qwen/Qwen3-8B") — the repo id is the canonical identity and is
 * what flows through the training request and result screen. Fields beyond
 * `id`/`name`/`family` are best-effort metadata from the Hub API and are
 * omitted rather than guessed when unavailable.
 */
export interface OpenModel {
  /** Hugging Face repo id, e.g. "Qwen/Qwen3-8B". The canonical identity. */
  id: string;
  /** Display name — for real models this equals `id`. */
  name: string;
  /** Owning organization/namespace, e.g. "Qwen". Derived from the repo id. */
  family: string;
  /** Human-readable parameter count, e.g. "8B". Omitted when not reliably known. */
  parameterCount?: string;
  /** One-line description. Only populated for the offline fallback catalog. */
  description?: string;
  /** True if the repo requires accepting Hugging Face's gated-access terms. */
  gated?: boolean;
  /**
   * True for base (not chat/instruct-tuned) models. They train fine, but
   * they have no chat format of their own, so conversation-style data gets
   * rendered generically — worth surfacing so a chat-shaped dataset isn't
   * pointed at one by accident.
   */
  isBaseModel?: boolean;
  /** Recent download count, when known. */
  downloads?: number;
  /** Like count, when known. */
  likes?: number;
}

/** File formats accepted for training data uploads. */
export type DatasetFormat = "json" | "jsonl" | "csv" | "txt";

/** A dataset the user has attached to a training run. */
export interface UploadedDataset {
  fileName: string;
  sizeBytes: number;
  format: DatasetFormat;
  /**
   * Row/example count. Exact for small files; estimated from a sample for
   * large ones, since counting 100M lines in the browser would freeze the tab.
   */
  rowCount?: number;
  /** True when `rowCount` was extrapolated rather than counted. */
  rowCountEstimated?: boolean;
  /**
   * The file itself. Kept as a handle rather than as text so a training run
   * can stream it — a vertical-scale dataset is hundreds of megabytes, and
   * reading one into a string would cap how much data a customer can train on.
   */
  file?: File;
}

/** Everything needed to kick off a post-training run. */
export interface TrainingRequest {
  baseModel: OpenModel;
  instruction: string;
  dataset: UploadedDataset | null;
}

/** Coarse-grained lifecycle of a post-training run. */
export type TrainingStage =
  | "idle"
  | "preparing_data"
  | "preparing_environment"
  | "training"
  | "finalizing"
  | "complete"
  | "error";

/** The model produced by a completed run. */
export interface TrainedModelResult {
  /**
   * Resulting model identifier. For a simulated run this is a fake slug
   * (e.g. "caesey/qwen-posttrained-001"); for a real run this is the actual
   * Hugging Face repo id the trained adapter was published to.
   */
  id: string;
  /** Real, clickable Hugging Face URL — only present when `isSimulated` is false. */
  url?: string;
  /**
   * False only when this result came from a real Tinker training run that
   * actually completed. The UI must never blur this distinction — see
   * CompletedModelResult.
   */
  isSimulated: boolean;
  baseModel: OpenModel;
  instruction: string;
  datasetName: string | null;
  createdAt: string;
}
