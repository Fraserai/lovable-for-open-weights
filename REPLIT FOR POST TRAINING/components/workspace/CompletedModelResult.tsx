"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { CheckIcon, CopyIcon, ExternalLinkIcon } from "@/components/ui/icons";
import type { TrainedModelResult } from "@/lib/types";

interface CompletedModelResultProps {
  result: TrainedModelResult;
  onStartNewRun: () => void;
}

export function CompletedModelResult({ result, onStartNewRun }: CompletedModelResultProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(result.id);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access can fail silently (e.g. insecure context) — not worth surfacing.
    }
  };

  return (
    <div className="rounded-xl border border-success/30 bg-surface p-5">
      <div className="flex items-center gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-success-muted text-success">
          <CheckIcon className="h-4 w-4" />
        </span>
        <div>
          <p className="flex items-center gap-2 text-sm font-medium text-fg">
            Your model is ready.
            {result.isSimulated ? <Badge>Simulated run</Badge> : null}
          </p>
          <p className="text-xs text-fg-muted">
            {result.isSimulated
              ? "Post-training finished successfully."
              : "Post-training finished successfully — published to Hugging Face."}
          </p>
        </div>
      </div>

      <dl className="mt-5 flex flex-col gap-4 border-t border-border pt-4">
        <div>
          <dt className="text-xs text-fg-subtle">Resulting model</dt>
          <dd className="mt-1 flex items-center gap-2">
            {result.isSimulated ? (
              <code className="truncate rounded-md bg-surface-raised px-2 py-1 font-mono text-sm text-accent-hover">
                {result.id}
              </code>
            ) : (
              <a
                href={result.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex min-w-0 items-center gap-1.5 truncate rounded-md bg-surface-raised px-2 py-1 font-mono text-sm text-accent-hover hover:underline"
              >
                <span className="truncate">{result.id}</span>
                <ExternalLinkIcon className="h-3.5 w-3.5 shrink-0" />
              </a>
            )}
            <button
              type="button"
              onClick={handleCopy}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-fg-subtle transition-colors hover:bg-surface-raised hover:text-fg"
              aria-label="Copy model identifier"
            >
              {copied ? <CheckIcon className="h-3.5 w-3.5 text-success" /> : <CopyIcon className="h-3.5 w-3.5" />}
            </button>
          </dd>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs text-fg-subtle">Base model</dt>
            <dd className="mt-1 flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm text-fg">{result.baseModel.name}</span>
              {result.baseModel.parameterCount ? <Badge>{result.baseModel.parameterCount}</Badge> : null}
              {result.baseModel.gated ? <Badge tone="accent">Gated</Badge> : null}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-fg-subtle">Dataset</dt>
            <dd className="mt-1 text-sm text-fg">{result.datasetName ?? "None provided"}</dd>
          </div>
        </div>

        <div>
          <dt className="text-xs text-fg-subtle">Training instruction</dt>
          <dd className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap rounded-lg bg-surface-raised px-3 py-2 text-sm leading-relaxed text-fg-muted">
            {result.instruction || "No instruction provided — trained on the dataset alone."}
          </dd>
        </div>
      </dl>

      <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-border pt-4">
        <div>
          <Button variant="primary" disabled title="Model inference isn't available in this preview">
            Use model
          </Button>
          <p className="mt-1 text-xs text-fg-subtle">Inference isn&apos;t available in this preview.</p>
        </div>
        <Button variant="ghost" onClick={onStartNewRun} className="sm:ml-auto">
          Start a new run
        </Button>
      </div>
    </div>
  );
}
