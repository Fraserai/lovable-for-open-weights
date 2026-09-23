"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { loadModels } from "@/lib/client";
import { TRAINERS, type ModelOption, type Trainer } from "@/lib/models";
import { Search } from "./icons";
import { groupModels, TrainerBadge } from "./ModelPicker";
import { btn, Segmented } from "./ui";

type Filter = "all" | Trainer;

/** Every open model a connected trainer can tune, with where each one trains. */
export default function ModelHub() {
  const [models, setModels] = useState<ModelOption[] | null>(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  useEffect(() => { loadModels().then(setModels); }, []);

  const groups = useMemo(() => groupModels(models ?? []).filter((g) =>
    (filter === "all" || g.options.some((o) => o.trainer === filter))
    && (!q.trim() || `${g.name} ${g.key}`.toLowerCase().includes(q.trim().toLowerCase()))), [models, q, filter]);

  return (
    <main className="mx-auto w-full max-w-[1240px] px-4 py-8 sm:px-8">
      <h1 className="font-display text-[clamp(28px,4vw,40px)] leading-tight font-extrabold tracking-[-0.03em]">Models</h1>
      <p className="mt-1 max-w-2xl text-muted">
        Open models you can tune today, and the trainers that run them. Anything else on Hugging Face trains with Unsloth on a rented GPU: search for it on the Train page.
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="flex min-w-[240px] flex-1 items-center gap-2 rounded-xl border border-line bg-surface px-3.5 focus-within:border-accent">
          <Search className="size-4 text-faint" />
          <label htmlFor="hub-q" className="sr-only">Filter models</label>
          <input id="hub-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter models"
                 className="w-full bg-transparent py-2.5 text-sm outline-none placeholder:text-faint" />
        </div>
        <Segmented label="Trainer" value={filter} onChange={setFilter}
                   options={[{ value: "all", label: "All" }, { value: "Tinker", label: "Tinker" }, { value: "Fireworks", label: "Fireworks" }]} />
      </div>

      {models === null ? <p className="mt-8 text-faint">Loading models…</p> : (
        <>
          <p className="mt-4 text-sm text-faint">{groups.length} models</p>
          <ul className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {groups.map((g) => {
              const best = g.options.find((o) => o.ready) ?? g.options[0];
              return (
                <li key={g.key} className="flex flex-col rounded-2xl border border-line bg-surface p-4">
                  <p className="font-medium break-words">{g.name}</p>
                  <p className="mt-0.5 truncate font-mono text-xs text-faint">{best.hfRepo ?? best.id}</p>
                  <p className="mt-2 text-xs text-muted">{g.note}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    {g.options.map((o) => <TrainerBadge key={o.id} m={o} />)}
                  </div>
                  <div className="mt-4 flex items-center justify-between gap-2 border-t border-line pt-3">
                    <span className="truncate text-xs text-faint">{best.trainer ? TRAINERS[best.trainer].runsOn : ""}</span>
                    {best.ready && <Link href={`/train?model=${encodeURIComponent(best.id)}`} className={btn.ghost}>Train</Link>}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </main>
  );
}
