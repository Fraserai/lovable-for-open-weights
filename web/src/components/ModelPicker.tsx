"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ModelOption } from "@/lib/models";
import { Check, Chevron } from "./icons";

type Lists = { trainable: ModelOption[]; hub: ModelOption[] };

// Fetched once per page load; the server caches the trainer lists too.
let trainableCache: Promise<ModelOption[]> | null = null;
const loadTrainable = () =>
  (trainableCache ??= fetch("/api/models").then((r) => r.json()).then((d: Lists) => d.trainable).catch(() => {
    trainableCache = null;
    return [];
  }));

export default function ModelPicker({ value, onChange }: { value: ModelOption; onChange: (m: ModelOption) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [trainable, setTrainable] = useState<ModelOption[] | null>(null);
  const [hub, setHub] = useState<ModelOption[]>([]);
  const root = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next) loadTrainable().then(setTrainable);
  };

  // Focus the search box when the list opens
  useEffect(() => {
    if (open) search.current?.focus();
  }, [open]);

  // Close on outside click / Escape
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Search all of Hugging Face as you type (debounced)
  useEffect(() => {
    const q = query.trim();
    if (!open || q.length < 2) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/models?q=${encodeURIComponent(q)}`, { signal: ctrl.signal })
        .then((r) => r.json())
        .then((d: Lists) => setHub(d.hub))
        .catch(() => {});
    }, 250);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [query, open]);

  const q = query.trim().toLowerCase();
  const shown = useMemo(
    () => (trainable ?? []).filter((m) => !q || `${m.name} ${m.hfRepo ?? ""} ${m.trainer}`.toLowerCase().includes(q)),
    [trainable, q],
  );
  const shownIds = new Set(shown.map((m) => m.id));
  const hubOnly = q.length >= 2 ? hub.filter((m) => !shownIds.has(m.id)) : [];

  const pick = (m: ModelOption) => {
    onChange(m);
    setOpen(false);
    setQuery("");
  };

  return (
    <div ref={root} className="relative">
      <button type="button" onClick={toggle} aria-haspopup="listbox" aria-expanded={open}
              className="flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-2 text-sm text-muted transition hover:bg-ground hover:text-ink">
        <span className="font-medium text-ink">{value.name}</span>
        {value.trainer && <span className="hidden sm:inline">on {value.trainer}</span>}
        <Chevron className="size-4" />
      </button>

      {open && (
        <div className="absolute top-full right-0 z-30 mt-2 flex max-h-[min(480px,60vh)] w-[min(400px,calc(100vw-48px))] flex-col overflow-hidden rounded-2xl border border-line bg-surface text-left shadow-[var(--shadow)]">
          <div className="border-b border-line p-2">
            <label htmlFor="model-search" className="sr-only">Search models</label>
            <input id="model-search" ref={search} value={query} onChange={(e) => setQuery(e.target.value)}
                   placeholder="Search any open model…"
                   className="w-full rounded-xl bg-ground px-3 py-2 text-sm outline-none placeholder:text-faint" />
          </div>

          <div role="listbox" aria-label="Base model" className="overflow-y-auto p-1.5">
            {trainable === null && <p className="px-3 py-3 text-sm text-faint">Loading models…</p>}

            {trainable !== null && (
              <Section title={`Ready to fine-tune · ${shown.length}`}>
                {shown.length === 0 && <p className="px-3 py-2 text-sm text-faint">No trainable match.</p>}
                {shown.map((m) => <Row key={m.id} m={m} selected={m.id === value.id} onPick={pick} />)}
              </Section>
            )}

            {hubOnly.length > 0 && (
              <Section title="On Hugging Face · no trainer yet">
                {hubOnly.map((m) => <Row key={m.id} m={m} selected={false} onPick={pick} disabled />)}
              </Section>
            )}

            {q.length < 2 && trainable !== null && (
              <p className="px-3 pt-2 pb-2 text-xs text-faint">Type to search every open model on Hugging Face.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="pb-1">
      <p className="px-3 pt-2 pb-1.5 text-xs font-medium tracking-wide text-faint uppercase">{title}</p>
      {children}
    </div>
  );
}

function Row({ m, selected, onPick, disabled }: { m: ModelOption; selected: boolean; onPick: (m: ModelOption) => void; disabled?: boolean }) {
  return (
    <button type="button" role="option" aria-selected={selected} aria-disabled={disabled} disabled={disabled}
            onClick={() => onPick(m)}
            className="flex w-full items-start gap-3 rounded-xl px-3 py-2 text-left transition enabled:hover:bg-ground disabled:cursor-default">
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className={`truncate font-medium ${disabled ? "text-muted" : ""}`}>{m.name}</span>
          {m.trainer && <span className="rounded-md border border-line px-1.5 py-px text-[11px] text-muted">{m.trainer}</span>}
          {m.trainer && !m.ready && <span className="text-[11px] text-faint">coming soon</span>}
        </span>
        <span className="block truncate text-xs text-faint">{m.note}</span>
      </span>
      {selected && <Check className="mt-1 size-4 shrink-0 text-accent" />}
    </button>
  );
}
