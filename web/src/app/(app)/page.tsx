"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Composer from "@/components/Composer";
import { ArrowRight } from "@/components/icons";
import { ago } from "@/components/ui";
import { setDraft, shortModel, useRuns } from "@/lib/client";
import { VERTICALS } from "@/lib/verticals";

// Our own Banking77 runs (README "Status"): 200 held-out messages, exact-match accuracy.
const PROOF = { model: "Kimi K2.6", before: 76.0, after: 92.0, detail: "1,540 examples · $4.12 · 55 min on Tinker" };

const STEPS = [
  { n: "1", title: "Describe it", body: "Say what the model should do. That becomes its training goal and instructions." },
  { n: "2", title: "Set up training", body: "Pick a model and its data. We show which trainer runs it and what it costs." },
  { n: "3", title: "Own the weights", body: "Watch it train, test it against the original, then take it to your Hugging Face." },
];

const STATE_LABEL = { preparing: "Preparing data", ready: "Ready to train", training: "Training", trained: "Trained", failed: "Stopped" } as const;

export default function Home() {
  const router = useRouter();
  const [vertical, setVertical] = useState(VERTICALS[0]);
  const [preset, setPreset] = useState<{ text: string; n: number }>();
  const runs = useRuns();

  return (
    <main className="mx-auto w-full max-w-[880px] px-4 pb-20 sm:px-8">
      <section className="relative pt-12 text-center sm:pt-20">
        <div className="halo" aria-hidden />
        <div className="relative">
          <p className="inline-flex rounded-full border border-line bg-surface/80 px-3.5 py-1 text-sm text-muted backdrop-blur">
            Fine-tune open models in the cloud. You keep the weights.
          </p>
          <h1 className="mt-5 font-display text-[clamp(36px,6vw,64px)] leading-[1.02] font-extrabold tracking-[-0.035em] text-balance">
            What should your model do?
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-lg text-balance text-muted">
            Describe it and attach what it learns from. Next you&apos;ll set up training: model, data and settings, with the cost shown before you start.
          </p>

          <div className="mt-9">
            <Composer onSubmit={(b) => { setDraft(b); router.push("/train"); }} placeholders={vertical.prompts} preset={preset} />
          </div>
        </div>
      </section>

      <section aria-labelledby="examples" className="mt-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="examples" className="mr-1 text-sm font-medium text-muted">Start from an example</h2>
          {VERTICALS.map((v) => (
            <button key={v.id} type="button" aria-pressed={v.id === vertical.id} onClick={() => setVertical(v)}
                    className="rounded-full border border-line bg-surface px-3 py-1 text-sm text-muted transition hover:text-ink aria-pressed:border-ink aria-pressed:bg-ink aria-pressed:text-ground">
              {v.name}
            </button>
          ))}
        </div>
        <ul className="mt-3 grid gap-2 sm:grid-cols-3">
          {vertical.prompts.map((p) => (
            <li key={p}>
              <button type="button" onClick={() => setPreset((prev) => ({ text: p, n: (prev?.n ?? 0) + 1 }))}
                      className="h-full w-full rounded-2xl border border-line bg-surface p-4 text-left text-sm leading-snug transition hover:border-faint">
                {p}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <ol className="mt-12 grid gap-3 sm:grid-cols-3" aria-label="How it works">
        {STEPS.map((s, i) => (
          <li key={s.n} className="relative rounded-2xl border border-line bg-surface p-5">
            <span className="grid size-7 place-items-center rounded-full bg-accent/10 font-mono text-sm text-accent">{s.n}</span>
            <h3 className="mt-3 font-display font-bold tracking-tight">{s.title}</h3>
            <p className="mt-1 text-sm text-muted">{s.body}</p>
            {i < STEPS.length - 1 && <ArrowRight className="absolute top-1/2 -right-3 z-10 hidden size-5 -translate-y-1/2 rounded-full bg-ground text-faint sm:block" />}
          </li>
        ))}
      </ol>

      <div className="mt-12 grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
        <section aria-labelledby="recent" className="min-w-0">
          <div className="flex items-baseline justify-between">
            <h2 id="recent" className="font-display text-lg font-bold tracking-tight">Recent runs</h2>
            <Link href="/runs" className="text-sm text-muted hover:text-ink">See all</Link>
          </div>
          <ul className="mt-3 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
            {runs === null && <li className="p-4 text-sm text-faint">Loading…</li>}
            {runs?.length === 0 && <li className="p-4 text-sm text-faint">Nothing yet. Describe a model above to start.</li>}
            {runs?.slice(0, 5).map((r) => (
              <li key={r.id}>
                <Link href={`/runs/${r.id}`} className="flex items-center gap-3 px-4 py-3 transition hover:bg-ground">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{r.goal ?? r.id}</span>
                    <span className="block truncate text-xs text-faint">
                      {shortModel(r.baseModel)}{r.rows ? ` · ${r.rows.toLocaleString()} examples` : ""} · {ago(r.updated)}
                    </span>
                  </span>
                  <span className={`shrink-0 text-xs ${r.state === "trained" ? "text-accent" : r.state === "failed" ? "text-red-500" : "text-muted"}`}>
                    {STATE_LABEL[r.state]}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <aside className="rounded-2xl border border-line bg-surface p-5" aria-label="Proof">
          <p className="text-xs font-medium tracking-wide text-accent uppercase">Measured, not claimed</p>
          <p className="mt-2 font-display text-4xl font-extrabold tracking-tight tabular-nums">
            {PROOF.before.toFixed(0)}%<span className="mx-1.5 text-faint">→</span>{PROOF.after.toFixed(0)}%
          </p>
          <p className="mt-2 text-sm text-muted">
            {PROOF.model} routing bank messages to 77 intents, scored on 200 held-out messages after one run.
          </p>
          <p className="mt-3 text-xs text-faint">{PROOF.detail}</p>
        </aside>
      </div>
    </main>
  );
}
