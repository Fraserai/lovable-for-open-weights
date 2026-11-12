"use client";

import { Button } from "@/components/ui/Button";
import { formatCost, formatDuration, type RunEstimate } from "@/lib/cost";
import type { OpenModel } from "@/lib/types";

interface RunConfirmationProps {
  estimate: RunEstimate;
  model: OpenModel;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Shown before a run that will actually spend money.
 *
 * The tool previously started training the instant you clicked, with no
 * indication of size or cost — a single drag-and-drop once kicked off a
 * 62,500-step job unannounced.
 *
 * Where a figure isn't grounded in something measured it says so rather than
 * showing a number. A confident wrong estimate is worse than an honest gap:
 * quote someone "$1,588" and be wrong tenfold, and they stop believing the
 * panel at all.
 */
export function RunConfirmation({ estimate, model, onConfirm, onCancel }: RunConfirmationProps) {
  const costNote =
    estimate.confidence === "published"
      ? `Based on Tinker's list price for this model, $${estimate.ratePerMillion?.toFixed(2)} per million training tokens. The token count is estimated from your file, so the total will move a little.`
      : "Tinker doesn't publish a rate for this model, and guessing from its size would be badly wrong. Watch Usage in the Tinker console while it runs.";

  return (
    <div className="rounded-xl border border-accent/40 bg-surface p-5">
      <p className="text-sm font-medium text-fg">Ready to start — this will cost money</p>
      <p className="mt-1 text-sm text-fg-muted">
        Training <span className="font-mono text-fg">{model.id}</span>
        {model.parameterCount ? ` (${model.parameterCount})` : ""}.
      </p>

      <dl className="mt-4 grid gap-3 border-t border-border pt-4 sm:grid-cols-4">
        <div>
          <dt className="text-xs text-fg-subtle">Examples</dt>
          <dd className="mt-1 font-mono text-sm text-fg">{estimate.examples.toLocaleString()}</dd>
          {estimate.examplesEstimated ? (
            <dd className="text-xs text-fg-subtle">estimated from a sample</dd>
          ) : null}
        </div>

        <div>
          <dt className="text-xs text-fg-subtle">Training steps</dt>
          <dd className="mt-1 font-mono text-sm text-fg">{estimate.steps.toLocaleString()}</dd>
        </div>

        <div>
          <dt className="text-xs text-fg-subtle">Time</dt>
          <dd className="mt-1 font-mono text-sm text-fg">
            {estimate.minutes === null ? (
              <span className="text-fg-subtle">not yet measured</span>
            ) : (
              formatDuration(estimate.minutes)
            )}
          </dd>
        </div>

        <div>
          <dt className="text-xs text-fg-subtle">
            {estimate.confidence === "published" ? "Estimated cost" : "Cost"}
          </dt>
          <dd className="mt-1 font-mono text-sm text-accent-hover">
            {estimate.cost === null ? (
              <span className="text-fg-subtle">unknown</span>
            ) : (
              formatCost(estimate.cost)
            )}
          </dd>
        </div>
      </dl>

      <p className="mt-4 text-xs leading-relaxed text-fg-subtle">{costNote}</p>

      <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-border pt-4">
        <Button variant="primary" onClick={onConfirm}>
          Start training
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
