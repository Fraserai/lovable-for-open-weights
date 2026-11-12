"use client";

import { useCallback, useRef, useState } from "react";
import { FileIcon, UploadIcon } from "@/components/ui/icons";
import { formatFileSize } from "@/lib/dataset";
import { cn } from "@/lib/cn";
import type { UploadedDataset } from "@/lib/types";

interface DatasetUploadProps {
  dataset: UploadedDataset | null;
  error: string | null;
  onAttach: (file: File) => void;
  onRemove: () => void;
  disabled?: boolean;
}

const INPUT_ID = "dataset-file-input";

export function DatasetUpload({ dataset, error, onAttach, onRemove, disabled }: DatasetUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      const file = files?.[0];
      if (file) onAttach(file);
    },
    [onAttach]
  );

  return (
    <div>
      <input
        ref={inputRef}
        id={INPUT_ID}
        type="file"
        className="hidden"
        accept=".json,.jsonl,.csv,.txt"
        disabled={disabled}
        onChange={(event) => {
          handleFiles(event.target.files);
          event.target.value = "";
        }}
      />

      {dataset ? (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <FileIcon className="h-8 w-8 shrink-0 text-fg-subtle" />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-fg">{dataset.fileName}</p>
              <p className="mt-0.5 truncate text-xs text-fg-muted">
                {formatFileSize(dataset.sizeBytes)} · {dataset.format.toUpperCase()}
                {typeof dataset.rowCount === "number"
                  ? ` · ~${dataset.rowCount.toLocaleString()} examples`
                  : ""}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={disabled}
              className="rounded-md px-2 py-1 text-xs font-medium text-fg-muted transition-colors hover:bg-surface-raised hover:text-fg disabled:pointer-events-none disabled:opacity-60"
            >
              Replace
            </button>
            <button
              type="button"
              onClick={onRemove}
              disabled={disabled}
              className="rounded-md px-2 py-1 text-xs font-medium text-fg-muted transition-colors hover:bg-danger-muted hover:text-danger disabled:pointer-events-none disabled:opacity-60"
            >
              Remove
            </button>
          </div>
        </div>
      ) : (
        <label
          htmlFor={INPUT_ID}
          onDragEnter={(event) => {
            event.preventDefault();
            if (disabled) return;
            dragDepth.current += 1;
            setIsDragging(true);
          }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={(event) => {
            event.preventDefault();
            dragDepth.current = Math.max(0, dragDepth.current - 1);
            if (dragDepth.current === 0) setIsDragging(false);
          }}
          onDrop={(event) => {
            event.preventDefault();
            dragDepth.current = 0;
            setIsDragging(false);
            if (!disabled) handleFiles(event.dataTransfer.files);
          }}
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-8 text-center transition-colors",
            isDragging ? "border-accent bg-accent-muted" : "border-border-strong hover:border-fg-subtle",
            disabled && "pointer-events-none opacity-60"
          )}
        >
          <UploadIcon className="h-6 w-6 text-fg-subtle" />
          <p className="text-sm text-fg">
            <span className="font-medium text-accent-hover">Click to upload</span> or drag and drop
          </p>
          <p className="text-xs text-fg-subtle">JSON, JSONL, CSV, or TXT</p>
        </label>
      )}

      {error ? <p className="mt-2 text-xs text-danger">{error}</p> : null}
    </div>
  );
}
