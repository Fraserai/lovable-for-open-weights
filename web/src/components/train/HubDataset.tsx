"use client";

import { useEffect, useRef, useState } from "react";
import type { DatasetHit, DatasetInfo } from "@/lib/hub";
import type { HubSource } from "@/lib/runs";
import { Close, Database, Search } from "../icons";
import { btn, Dot, ErrorNote, Field, input, Select } from "../ui";

const AUTO = "__auto";

/** Pick a Hugging Face dataset: search, subset/split, which columns are the question and answer, and a preview. */
export default function HubDataset({ value, onChange }: { value: HubSource | null; onChange: (v: HubSource | null) => void }) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<DatasetHit[]>([]);
  const [open, setOpen] = useState(false);
  const [info, setInfo] = useState<DatasetInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/datasets?q=${encodeURIComponent(q)}`, { signal: ctrl.signal })
        .then((r) => r.json()).then((d: DatasetHit[]) => { setHits(d); setOpen(true); }).catch(() => {});
    }, 250);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => root.current && !root.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // Read subsets, splits, columns and sample rows whenever the dataset or split changes
  const id = value?.id, config = value?.config, split = value?.split;
  useEffect(() => {
    if (!id) return;
    let alive = true;
    const qs = new URLSearchParams({ id, ...(config ? { config } : {}), ...(split ? { split } : {}) });
    fetch(`/api/datasets?${qs}`).then(async (r) => {
      const body = await r.json();
      if (!alive) return;
      if (!r.ok) throw new Error(body.error);
      setInfo(body);
    }).catch((e) => alive && setError(e instanceof Error ? e.message : "Couldn't read that dataset."))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [id, config, split]);

  const choose = (dataset: string) => {
    setOpen(false);
    setQuery("");
    setInfo(null);
    setError(null);
    setLoading(true);
    onChange({ id: dataset, limit: 1000 });
  };

  if (!value) {
    return (
      <div ref={root} className="relative">
        <div className="flex items-center gap-2 rounded-xl border border-line bg-ground px-3.5 focus-within:border-accent">
          <Search className="size-4 text-faint" />
          <label htmlFor="hub-search" className="sr-only">Search Hugging Face datasets</label>
          <input id="hub-search" value={query} onChange={(e) => setQuery(e.target.value)} onFocus={() => hits.length && setOpen(true)}
                 onKeyDown={(e) => { if (e.key === "Enter" && /^[\w.-]+\/[\w.-]+$/.test(query.trim())) choose(query.trim()); }}
                 placeholder="Search Hugging Face datasets, or paste owner/name"
                 className="w-full bg-transparent py-2.5 text-sm outline-none placeholder:text-faint" />
        </div>
        {open && hits.length > 0 && (
          <ul className="absolute top-full right-0 left-0 z-20 mt-2 max-h-72 overflow-y-auto rounded-2xl border border-line bg-surface p-1.5 shadow-[var(--shadow)]">
            {hits.map((h) => (
              <li key={h.id}>
                <button type="button" onClick={() => choose(h.id)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm hover:bg-ground">
                  <Database className="size-4 shrink-0 text-faint" />
                  <span className="min-w-0 flex-1 truncate font-mono">{h.id}</span>
                  <span className="shrink-0 text-xs text-faint">{h.downloads.toLocaleString()} ↓</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-faint">Imported as-is: no example writing, no cost. Needs question and answer columns, or chat messages.</p>
      </div>
    );
  }

  const splitKey = info ? `${info.picked.config}\u0000${info.picked.split}` : "";
  const mapping = value.userField && value.assistantField ? `${value.userField}\u0000${value.assistantField}` : AUTO;
  const autoWorks = !!info && (info.chat || !!info.guess);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 rounded-2xl border border-line bg-ground px-4 py-3">
        <Database className="size-5 shrink-0 text-accent" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-mono text-sm">{value.id}</p>
          <p className="text-xs text-faint">Hugging Face dataset{info ? ` · ${info.picked.config} / ${info.picked.split}` : ""}</p>
        </div>
        <a href={`https://huggingface.co/datasets/${value.id}`} target="_blank" rel="noreferrer" className={btn.quiet}>View</a>
        <button type="button" onClick={() => { onChange(null); setInfo(null); setError(null); }} aria-label="Clear dataset" className={btn.quiet}>
          <Close className="size-4" />
        </button>
      </div>

      {loading && <p className="flex items-center gap-2 text-sm text-muted"><Dot /> Reading the dataset…</p>}
      {error && <ErrorNote>{error}</ErrorNote>}

      {info && (
        <>
          <div className="grid gap-4 @xl:grid-cols-3">
            <Field label="Subset / split" htmlFor="hub-split">
              <Select id="hub-split" value={splitKey}
                      onChange={(v) => { const [c, s] = v.split("\u0000"); onChange({ ...value, config: c, split: s, userField: undefined, assistantField: undefined }); }}
                      options={info.splits.map((s) => ({ value: `${s.config}\u0000${s.split}`, label: s.config === "default" ? s.split : `${s.config} / ${s.split}` }))} />
            </Field>
            <Field label="Rows" hint="How many rows to import. Start small; more rows cost more to train." htmlFor="hub-limit">
              <input id="hub-limit" type="number" min={10} max={20000} step={100} value={value.limit}
                     onChange={(e) => onChange({ ...value, limit: Number(e.target.value) || 1000 })} className={input} />
            </Field>
            <Field label="Question → answer" hint="Which columns are what the user says and what the model should reply." htmlFor="hub-map">
              <Select id="hub-map" value={mapping}
                      onChange={(v) => {
                        if (v === AUTO) return onChange({ ...value, userField: undefined, assistantField: undefined });
                        const [u, a] = v.split("\u0000");
                        onChange({ ...value, userField: u, assistantField: a });
                      }}
                      options={[
                        { value: AUTO, label: info.chat ? "Chat messages (auto)" : info.guess ? `${info.guess.user} → ${info.guess.assistant} (auto)` : "Choose columns…", disabled: !autoWorks },
                        ...info.columns.flatMap((u) => info.columns.filter((a) => a !== u).map((a) => ({ value: `${u}\u0000${a}`, label: `${u} → ${a}` }))),
                      ]} />
            </Field>
          </div>
          {!autoWorks && mapping === AUTO && (
            <p className="text-sm text-amber-700 dark:text-amber-300">Pick which column is the question and which is the answer.</p>
          )}

          <details className="group rounded-2xl border border-line">
            <summary className="cursor-pointer px-4 py-2.5 text-sm text-muted">Preview the first rows</summary>
            <div className="overflow-x-auto border-t border-line">
              <table className="w-full text-left text-xs">
                <thead className="text-faint">
                  <tr>{info.columns.slice(0, 6).map((c) => <th key={c} className="px-3 py-2 font-medium">{c}</th>)}</tr>
                </thead>
                <tbody>
                  {info.rows.slice(0, 3).map((r, i) => (
                    <tr key={i} className="border-t border-line align-top">
                      {info.columns.slice(0, 6).map((c) => <td key={c} className="max-w-[240px] px-3 py-2"><p className="line-clamp-4">{r[c]}</p></td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </div>
  );
}

export const hubReady = (v: HubSource | null) => !!v?.id;
