"use client";

import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { CheckIcon, LockIcon, SearchIcon, SpinnerIcon, XIcon } from "@/components/ui/icons";
import { useModelSearch } from "@/lib/hooks/useModelSearch";
import { cn } from "@/lib/cn";
import { formatCompactNumber } from "@/lib/format";
import type { OpenModel } from "@/lib/types";

interface ModelSelectorProps {
  selected: OpenModel | null;
  onSelect: (model: OpenModel) => void;
  disabled?: boolean;
}

/**
 * Searchable model picker. Search state lives entirely in `useModelSearch`,
 * which talks to `ModelProvider` — this component has no idea whether the
 * catalog behind it is the small curated list (current default) or live
 * Hugging Face search; either can be swapped in behind the provider
 * without touching this file. See `lib/providers/model-provider.ts`.
 */
export function ModelSelector({ selected, onSelect, disabled }: ModelSelectorProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const { query, setQuery, results, loading, error, isInitialLoad, retry } = useModelSearch(open);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  // Focus the search field on open; reset the query on close so the next
  // open starts from the default browse list again.
  useEffect(() => {
    if (open) {
      searchInputRef.current?.focus();
    } else {
      setQuery("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          "flex w-full items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-3 text-left transition-colors hover:border-border-strong disabled:cursor-not-allowed disabled:opacity-60",
          open && "border-border-strong"
        )}
      >
        {selected ? (
          <span className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="truncate font-mono text-sm text-fg">{selected.id}</span>
            <Badge>{selected.family}</Badge>
            {selected.parameterCount ? <Badge>{selected.parameterCount}</Badge> : null}
            {selected.gated ? (
              <Badge tone="accent">
                <LockIcon className="mr-1 inline h-2.5 w-2.5" />
                Gated
              </Badge>
            ) : null}
          </span>
        ) : (
          <span className="text-sm text-fg-subtle">Choose a base model</span>
        )}
        <SearchIcon className="h-4 w-4 shrink-0 text-fg-subtle" />
      </button>

      {open && (
        <Card
          role="listbox"
          className="absolute z-20 mt-2 w-full overflow-hidden p-0 shadow-lg shadow-black/40"
        >
          <div className="border-b border-border p-2">
            <div className="flex items-center gap-2 rounded-lg border border-border-strong bg-surface-raised px-3 py-2">
              <SearchIcon className="h-4 w-4 shrink-0 text-fg-subtle" />
              <input
                ref={searchInputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search models…"
                className="w-full bg-transparent text-sm text-fg placeholder:text-fg-subtle outline-none"
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-fg-subtle hover:text-fg"
                  aria-label="Clear search"
                >
                  <XIcon className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </div>
          </div>

          <div className="max-h-80 overflow-auto p-1">
            {error ? (
              <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
                <p className="text-sm text-fg-muted">{error}</p>
                <Button variant="secondary" size="sm" onClick={retry}>
                  Try again
                </Button>
              </div>
            ) : loading ? (
              <div className="flex items-center justify-center gap-2 px-4 py-8 text-sm text-fg-subtle">
                <SpinnerIcon className="h-4 w-4 animate-spin" />
                {isInitialLoad ? "Loading models…" : "Searching…"}
              </div>
            ) : results.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-fg-subtle">
                {query ? `No models found for "${query}".` : "No models available right now."}
              </p>
            ) : (
              results.map((model) => {
                const isSelected = selected?.id === model.id;
                return (
                  <button
                    key={model.id}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => {
                      onSelect(model);
                      setOpen(false);
                    }}
                    className={cn(
                      "flex w-full items-start justify-between gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-surface-raised",
                      isSelected && "bg-surface-raised"
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-mono text-sm text-fg">{model.id}</span>
                      <span className="mt-1 flex flex-wrap items-center gap-1.5">
                        <Badge>{model.family}</Badge>
                        {model.parameterCount ? <Badge>{model.parameterCount}</Badge> : null}
                        {model.isBaseModel ? (
                          <Badge tone="accent" title="Not chat-tuned — conversation data trains generically">
                            Base
                          </Badge>
                        ) : null}
                        {model.gated ? (
                          <Badge tone="accent">
                            <LockIcon className="mr-1 inline h-2.5 w-2.5" />
                            Gated
                          </Badge>
                        ) : null}
                        {typeof model.downloads === "number" ? (
                          <span className="text-xs text-fg-subtle">
                            {formatCompactNumber(model.downloads)} downloads
                          </span>
                        ) : null}
                      </span>
                    </span>
                    {isSelected ? (
                      <CheckIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent-hover" />
                    ) : null}
                  </button>
                );
              })
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
