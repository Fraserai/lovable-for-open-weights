"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { loadModels } from "@/lib/client";
import { modelKey, type ModelOption, type Trainer } from "@/lib/models";
import { Check, Chevron, Search } from "./icons";

/** One open model and every trainer that can tune it. */
export type ModelGroup = { key: string; name: string; note: string; options: ModelOption[] };

// When a model is on several trainers, start with the one proven end to end.
const PREFERENCE: Trainer[] = ["Tinker", "Fireworks", "Unsloth"];
const rank = (m: ModelOption) => (m.ready ? 0 : 10) + PREFERENCE.indexOf(m.trainer ?? "Unsloth");

export function groupModels(models: ModelOption[]): ModelGroup[] {
  const groups = new Map<string, ModelGroup>();
  for (const m of models) {
    const k = modelKey(m);
    const g = groups.get(k);
    if (!g) groups.set(k, { key: k, name: m.name, note: m.note, options: [m] });
    else if (!g.options.some((o) => o.id === m.id)) g.options.push(m);
  }
  for (const g of groups.values()) g.options.sort((a, b) => rank(a) - rank(b));
  return [...groups.values()];
}

/** Every way to train the chosen model: its trainer listings, plus Unsloth on a rented GPU for any Hub model. */
export function trainerChoices(value: ModelOption, all: ModelOption[]): ModelOption[] {
  const k = modelKey(value);
  const same = all.filter((m) => modelKey(m) === k);
  const withValue = same.some((m) => m.id === value.id) ? same : [value, ...same];
  const unsloth = value.hfRepo && !withValue.some((m) => m.trainer === "Unsloth")
    ? [{ id: `unsloth:${value.hfRepo}`, name: value.name, trainer: "Unsloth" as const, hfRepo: value.hfRepo, note: "cloud GPU · LoRA", ready: true }]
    : [];
  return [...withValue, ...unsloth].sort((a, b) => rank(a) - rank(b));
}

export default function ModelPicker({ value, onChange, variant = "field", id }: {
  value: ModelOption; onChange: (m: ModelOption) => void; variant?: "field" | "chip"; id?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [trainable, setTrainable] = useState<ModelOption[] | null>(null);
  const [hub, setHub] = useState<ModelOption[]>([]);
  const root = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next) loadModels().then(setTrainable);
  };

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
        .then((d: { hub: ModelOption[] }) => setHub(d.hub))
        .catch(() => {});
    }, 250);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [query, open]);

  const q = query.trim().toLowerCase();
  const groups = useMemo(() => groupModels(trainable ?? []), [trainable]);
  const shown = groups.filter((g) => !q || `${g.name} ${g.key} ${g.options.map((o) => o.trainer).join(" ")}`.toLowerCase().includes(q));
  const shownKeys = new Set(shown.map((g) => g.key));
  const hubOnly = q.length >= 2 ? groupModels(hub).filter((g) => !shownKeys.has(g.key)) : [];
  const selectedKey = modelKey(value);

  const pick = (g: ModelGroup) => {
    // Keep the current trainer if this model is on it too
    onChange(g.options.find((o) => o.ready && o.trainer === value.trainer) ?? g.options.find((o) => o.ready) ?? g.options[0]);
    setOpen(false);
    setQuery("");
  };

  return (
    <div ref={root} className="relative">
      {variant === "chip" ? (
        <button type="button" onClick={toggle} aria-haspopup="listbox" aria-expanded={open}
                className="flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-2 text-sm text-muted transition hover:bg-ground hover:text-ink">
          <span className="font-medium text-ink">{value.name}</span>
          <Chevron className="size-4" />
        </button>
      ) : (
        <button id={id} type="button" onClick={toggle} aria-haspopup="listbox" aria-expanded={open}
                className="flex w-full items-center gap-3 rounded-xl border border-line bg-ground px-3.5 py-2.5 text-left transition hover:border-faint">
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{value.name}</span>
            <span className="block truncate text-xs text-faint">{value.hfRepo ?? value.id}</span>
          </span>
          <Chevron className="size-4 shrink-0 text-faint" />
        </button>
      )}

      {open && (
        <div className={`absolute top-full z-30 mt-2 flex max-h-[min(520px,65vh)] w-[min(460px,calc(100vw-32px))] flex-col overflow-hidden rounded-2xl border border-line bg-surface text-left shadow-[var(--shadow)] ${
          variant === "chip" ? "right-0" : "left-0"}`}>
          <div className="border-b border-line p-2">
            <label htmlFor="model-search" className="sr-only">Search models</label>
            <div className="flex items-center gap-2 rounded-xl bg-ground px-3">
              <Search className="size-4 text-faint" />
              <input id="model-search" ref={search} value={query} onChange={(e) => setQuery(e.target.value)}
                     placeholder="Search or paste a Hugging Face id…"
                     className="w-full bg-transparent py-2 text-sm outline-none placeholder:text-faint" />
            </div>
          </div>

          <div role="listbox" aria-label="Base model" className="overflow-y-auto p-1.5">
            {trainable === null && <p className="px-3 py-3 text-sm text-faint">Loading models…</p>}

            {trainable !== null && (
              <Section title={`Tunable on a connected trainer · ${shown.length}`}>
                {shown.length === 0 && <p className="px-3 py-2 text-sm text-faint">No match. Keep typing to search Hugging Face.</p>}
                {shown.map((g) => <Row key={g.key} g={g} selected={g.key === selectedKey} onPick={pick} />)}
              </Section>
            )}

            {hubOnly.length > 0 && (
              <Section title="Anything else on Hugging Face">
                {hubOnly.map((g) => <Row key={g.key} g={g} selected={g.key === selectedKey} onPick={pick} />)}
              </Section>
            )}

            {q.length < 2 && trainable !== null && (
              <p className="px-3 pt-2 pb-2 text-xs text-faint">Type to search every open model on Hugging Face. Anything not on a trainer&apos;s list trains with Unsloth on a rented GPU.</p>
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

export function TrainerBadge({ m }: { m: ModelOption }) {
  if (!m.trainer) return null;
  return (
    <span className={`rounded-md border px-1.5 py-px text-[11px] ${m.ready ? "border-line text-muted" : "border-dashed border-line text-faint"}`}
          title={m.ready ? `Trains on ${m.trainer}` : `${m.trainer} isn't connected yet`}>
      {m.trainer}
    </span>
  );
}

function Row({ g, selected, onPick }: { g: ModelGroup; selected: boolean; onPick: (g: ModelGroup) => void }) {
  const ready = g.options.some((o) => o.ready);
  return (
    <button type="button" role="option" aria-selected={selected} disabled={!ready} onClick={() => onPick(g)}
            className="flex w-full items-start gap-3 rounded-xl px-3 py-2 text-left transition enabled:hover:bg-ground disabled:cursor-default">
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
          <span className={`mr-0.5 truncate font-medium ${ready ? "" : "text-muted"}`}>{g.name}</span>
          {g.options.map((o) => <TrainerBadge key={o.id} m={o} />)}
        </span>
        <span className="block truncate text-xs text-faint">{g.note}</span>
      </span>
      {selected && <Check className="mt-1 size-4 shrink-0 text-accent" />}
    </button>
  );
}
