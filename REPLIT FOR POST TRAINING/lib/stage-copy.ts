import type { TrainingStage } from "@/lib/types";

/** The ordered, user-facing run stages (excludes the terminal "idle"/"error"/"complete" states). */
export const STAGE_SEQUENCE = [
  "preparing_data",
  "preparing_environment",
  "training",
  "finalizing",
] as const satisfies readonly TrainingStage[];

export const STAGE_LABELS: Record<(typeof STAGE_SEQUENCE)[number], string> = {
  preparing_data: "Preparing data",
  preparing_environment: "Preparing training environment",
  training: "Post-training model",
  finalizing: "Finalising model",
};

/** Small flavor line shown under whichever stage is currently active. */
export const STAGE_DETAIL: Record<(typeof STAGE_SEQUENCE)[number], string> = {
  preparing_data: "Validating format and tokenizing examples",
  preparing_environment: "Allocating compute and loading base weights",
  training: "Running post-training updates on your instructions",
  finalizing: "Packaging weights and saving the checkpoint",
};
