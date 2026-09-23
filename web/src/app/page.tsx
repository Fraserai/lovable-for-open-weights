"use client";

import Link from "next/link";
import { useState } from "react";
import Composer, { type Brief } from "@/components/Composer";
import Studio from "@/components/Studio";
import { Logo } from "@/components/icons";
import { BRAND } from "@/lib/brand";
import { VERTICALS } from "@/lib/verticals";

const NAV = [
  { label: "Industries", href: "#industries" },
  { label: "Results", href: "#results" },
  { label: "How it works", href: "#how" },
];

// Our own Banking77 runs (README "Status"): 200 held-out messages, exact-match accuracy.
const RESULTS = [
  { model: "Kimi K2.6", size: "1T parameters", before: 76.0, after: 92.0, detail: "1,540 examples · $4.12 · 55 min" },
  { model: "Qwen 3.5 4B", size: "4B parameters", before: 67.5, after: 82.5, detail: "1,000 examples · 41¢ · 11 min" },
];

const STEPS = [
  {
    title: "Describe the model",
    body: "Say what it has to do, in plain English: route, classify, triage, draft, answer. That becomes the training goal.",
  },
  {
    title: "Bring what it learns from",
    body: "Policy documents, manuals, past cases, or a dataset of examples. We turn it into training data and check every row before anything is paid for.",
  },
  {
    title: "Own the weights",
    body: "We train on the right trainer for the model you picked, show the cost first, and hand back weights in your private Hugging Face repo.",
  },
];

export default function Home() {
  const [brief, setBrief] = useState<Brief | null>(null);
  const [vertical, setVertical] = useState(VERTICALS[0]);
  const [preset, setPreset] = useState<{ text: string; n: number }>();

  if (brief) return <Studio brief={brief} onReset={() => setBrief(null)} />;

  return (
    <div className="flex min-h-dvh flex-col">
      <section className="relative overflow-hidden">
        <div className="glow" aria-hidden />

        <header className="relative z-10 mx-auto flex w-full max-w-6xl items-center gap-4 px-4 py-4 sm:gap-8 sm:px-6">
          <Link href="/" className="flex items-center gap-2">
            <Logo className="size-7" />
            <span className="font-display text-xl font-bold tracking-tight">{BRAND.name}</span>
          </Link>
          <nav className="hidden items-center gap-7 text-[15px] text-muted md:flex" aria-label="Main">
            {NAV.map((n) => <a key={n.href} href={n.href} className="transition hover:text-ink">{n.label}</a>)}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <a href="#" className="hidden whitespace-nowrap rounded-xl border border-line bg-surface/70 px-3.5 py-2 text-sm backdrop-blur sm:inline-block transition hover:bg-surface">Log in</a>
            <a href="#" className="whitespace-nowrap rounded-xl bg-ink px-3.5 py-2 text-sm font-medium text-ground transition hover:opacity-90">Get started</a>
          </div>
        </header>

        <main id="industries" className="relative z-10 mx-auto flex w-full max-w-[860px] flex-col items-center px-4 pt-14 pb-24 text-center sm:px-6 sm:pt-20">
          <p className="rounded-full border border-line bg-surface/70 px-3.5 py-1 text-sm text-muted backdrop-blur">
            Open-weights models, built for your industry
          </p>
          <h1 className="mt-5 font-display text-[clamp(40px,7vw,76px)] leading-[1.02] font-extrabold tracking-[-0.035em] text-balance">
            Your industry&apos;s model. Your&nbsp;weights.
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-balance text-muted sm:text-xl">
            Take Kimi K2.6, GLM 5.3, Qwen or any open model and train it on how your business actually works.
            Describe the model you need. We build it, and the weights are yours.
          </p>

          <div className="mt-10 w-full">
            <Composer onSubmit={setBrief} placeholders={vertical.prompts} preset={preset} />
          </div>

          <div className="mt-2 w-full">
            <div className="flex flex-wrap justify-center gap-2" aria-label="Industry">
              {VERTICALS.map((v) => (
                <button key={v.id} type="button" aria-pressed={v.id === vertical.id} onClick={() => setVertical(v)}
                        className="rounded-full border border-line bg-surface/70 px-3.5 py-1.5 text-sm text-muted backdrop-blur transition hover:bg-surface hover:text-ink aria-pressed:border-ink aria-pressed:bg-ink aria-pressed:text-ground">
                  {v.name}
                </button>
              ))}
            </div>
            <ul className="mt-4 grid gap-2 text-left sm:grid-cols-3" aria-label={`${vertical.name} models`}>
              {vertical.prompts.map((p) => (
                <li key={p}>
                  <button type="button" onClick={() => setPreset((prev) => ({ text: p, n: (prev?.n ?? 0) + 1 }))}
                          className="h-full w-full rounded-2xl border border-line bg-surface/75 p-4 text-left text-sm leading-snug text-ink backdrop-blur transition hover:border-faint hover:bg-surface">
                    {p}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <a href="#results" className="mt-8 inline-flex flex-wrap items-center justify-center gap-x-2 rounded-full bg-surface/80 px-4 py-2 text-sm shadow-[var(--shadow)] ring-1 ring-line backdrop-blur transition hover:bg-surface">
            <span className="font-medium">Kimi K2.6: 76.0% → 92.0%</span>
            <span className="text-muted">on held-out banking messages after one training run</span>
          </a>
        </main>
      </section>

      <section id="results" className="mx-auto w-full max-w-6xl scroll-mt-6 px-4 py-20 sm:px-6">
        <p className="text-sm font-medium tracking-wide text-accent uppercase">Results</p>
        <h2 className="mt-2 max-w-3xl font-display text-[clamp(28px,4vw,44px)] leading-tight font-bold tracking-tight text-balance">
          Trained on the task, small models beat giant ones. We measured it.
        </h2>
        <p className="mt-4 max-w-2xl text-muted">
          Banking77: route a bank customer&apos;s message to the right one of 77 intents. Scored on 200 held-out
          messages no model trained on, exact match only.
        </p>

        <div className="mt-10 grid gap-4 md:grid-cols-2">
          {RESULTS.map((r) => (
            <article key={r.model} className="rounded-3xl border border-line bg-surface p-6 sm:p-8">
              <div className="flex items-baseline justify-between gap-4">
                <h3 className="font-display text-2xl font-bold tracking-tight">{r.model}</h3>
                <span className="text-sm text-faint">{r.size}</span>
              </div>
              <p className="mt-6 font-display text-5xl font-extrabold tracking-tight tabular-nums">
                +{(r.after - r.before).toFixed(1)}<span className="text-2xl text-muted"> pts</span>
              </p>
              <dl className="mt-6 space-y-3 text-sm">
                <Bar label="Original" value={r.before} tone="bg-faint/50" />
                <Bar label="Trained" value={r.after} tone="bg-accent" />
              </dl>
              <p className="mt-6 text-sm text-muted">{r.detail} of training</p>
            </article>
          ))}
        </div>

        <p className="mt-6 max-w-3xl text-lg text-balance">
          A 4-billion-parameter model trained for 41¢ beat the untrained 1-trillion-parameter Kimi K2.6:{" "}
          <b className="tabular-nums">82.5%</b> against <b className="tabular-nums">76.0%</b>.
        </p>
      </section>

      <section id="how" className="border-t border-line">
        <div className="mx-auto w-full max-w-6xl scroll-mt-6 px-4 py-20 sm:px-6">
          <p className="text-sm font-medium tracking-wide text-accent uppercase">How it works</p>
          <h2 className="mt-2 max-w-3xl font-display text-[clamp(28px,4vw,44px)] leading-tight font-bold tracking-tight text-balance">
            You describe the model. We do the machine learning.
          </h2>
          <ol className="mt-10 grid gap-4 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <li key={s.title} className="rounded-3xl border border-line bg-surface p-6">
                <span className="font-mono text-sm text-faint">0{i + 1}</span>
                <h3 className="mt-3 font-display text-xl font-bold tracking-tight">{s.title}</h3>
                <p className="mt-2 text-muted">{s.body}</p>
              </li>
            ))}
          </ol>
          <p className="mt-8 max-w-3xl text-muted">
            For regulated teams: the weights are yours to run anywhere, so there&apos;s no lock-in to a model vendor
            and a credible exit plan from day one.
          </p>
        </div>
      </section>

      <footer className="border-t border-line">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-6 text-sm text-muted sm:px-6">
          <Logo className="size-5" />
          <span className="font-display font-bold text-ink">{BRAND.name}</span>
          <span>{BRAND.tagline}</span>
        </div>
      </footer>
    </div>
  );
}

function Bar({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="grid grid-cols-[72px_1fr_52px] items-center gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className="h-2.5 overflow-hidden rounded-full bg-line" aria-hidden>
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${value}%` }} />
      </dd>
      <dd className="text-right font-medium tabular-nums">{value.toFixed(1)}%</dd>
    </div>
  );
}
