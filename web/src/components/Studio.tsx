"use client";

import { BRAND } from "@/lib/brand";
import type { Brief } from "./Composer";
import { formatBytes } from "./Composer";
import { Doc, Logo } from "./icons";

// The loop the worker runs (worker/src/trainloop), in the words a customer would use.
const STAGES = [
  { title: "Read your documents", detail: "Pull the text, headings and tables out of every file." },
  { title: "Write training examples", detail: "Turn each section into realistic questions and ideal answers for your goal." },
  { title: "Check every example", detail: "Catch broken or duplicate rows before anything is paid for." },
  { title: "Train", detail: "Fine-tune the base model on your examples." },
  { title: "Hand back your model", detail: "Download it, or get it in a private Hugging Face repo." },
];

export default function Studio({ brief, onReset }: { brief: Brief; onReset: () => void }) {
  const { goal, files, model } = brief;
  const totalBytes = files.reduce((n, f) => n + f.size, 0);

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center gap-3 border-b border-line px-4 py-3 sm:px-6">
        <button type="button" onClick={onReset} className="flex items-center gap-2 rounded-lg" aria-label="Back to start">
          <Logo className="size-6" />
          <span className="font-display text-lg font-bold tracking-tight">{BRAND.name}</span>
        </button>
        <span className="text-faint">/</span>
        <span className="truncate text-sm text-muted">New model</span>
      </header>

      <div className="grid flex-1 lg:grid-cols-[minmax(0,1fr)_420px]">
        {/* Chat */}
        <section className="flex flex-col gap-6 px-4 py-8 sm:px-8" aria-label="Conversation">
          <div className="ml-auto max-w-[560px] rounded-3xl rounded-br-lg bg-ink px-5 py-4 text-ground">
            <p className="leading-relaxed whitespace-pre-wrap">{goal}</p>
            <ul className="mt-3 flex flex-wrap gap-1.5">
              {files.map((f) => (
                <li key={f.name + f.size} className="flex items-center gap-1.5 rounded-lg bg-ground/10 px-2 py-1 text-xs">
                  <Doc className="size-3.5" /> {f.name}
                </li>
              ))}
            </ul>
          </div>

          <div className="flex max-w-[640px] gap-3">
            <Logo className="mt-1 size-6 shrink-0" />
            <div className="space-y-4 leading-relaxed">
              <p>
                Got it. Here&apos;s the plan for training <b>{model.name}</b> on your{" "}
                {files.length === 1 ? "document" : `${files.length} documents`} ({formatBytes(totalBytes)}).
              </p>
              <ol className="list-decimal space-y-1.5 pl-5 marker:text-faint">
                {STAGES.map((s) => (
                  <li key={s.title}><b className="font-medium">{s.title}.</b> <span className="text-muted">{s.detail}</span></li>
                ))}
              </ol>
              <p className="text-muted">
                I&apos;ll show you a sample of the training examples and the cost before anything paid starts.
                Your documents only go to providers that don&apos;t keep data.
              </p>
              {!model.ready && (
                <p className="rounded-xl border border-line bg-surface px-4 py-3 text-sm">
                  Training {model.name} on {model.trainer} isn&apos;t connected yet. GLM-5.3-Flash on Fireworks is ready now.
                </p>
              )}
              <div className="flex flex-wrap items-center gap-3 pt-1">
                <button type="button" disabled title="Connecting the page to the training pipeline is the next build step"
                        className="rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-ground disabled:opacity-40">
                  Write training examples
                </button>
                <span className="text-sm text-faint">Not connected to the pipeline yet</span>
              </div>
            </div>
          </div>
        </section>

        {/* Run panel */}
        <aside className="border-t border-line bg-surface px-4 py-8 sm:px-8 lg:border-t-0 lg:border-l" aria-label="Your model">
          <p className="text-xs font-medium tracking-wide text-faint uppercase">Your model</p>
          <h2 className="mt-2 font-display text-2xl font-bold tracking-tight">{model.name}, tuned for your goal</h2>

          <dl className="mt-6 grid grid-cols-2 gap-x-4 gap-y-4 text-sm">
            <div><dt className="text-faint">Base model</dt><dd className="mt-0.5 font-medium">{model.name}</dd></div>
            <div><dt className="text-faint">Trainer</dt><dd className="mt-0.5 font-medium">{model.trainer}</dd></div>
            <div><dt className="text-faint">Method</dt><dd className="mt-0.5 font-medium">LoRA, rank 8</dd></div>
            <div><dt className="text-faint">Passes over data</dt><dd className="mt-0.5 font-medium">1 epoch</dd></div>
          </dl>

          <ol className="mt-8 space-y-0" aria-label="Progress">
            {STAGES.map((s, i) => (
              <li key={s.title} className="relative flex gap-4 pb-6 last:pb-0">
                {i < STAGES.length - 1 && <span className="absolute top-7 left-[13px] h-[calc(100%-28px)] w-px bg-line" aria-hidden />}
                <span className="grid size-7 shrink-0 place-items-center rounded-full border border-line bg-ground text-xs text-faint tabular-nums">
                  {i + 1}
                </span>
                <div className="pt-0.5">
                  <p className="font-medium">{s.title}</p>
                  <p className="text-sm text-faint">Waiting</p>
                </div>
              </li>
            ))}
          </ol>
        </aside>
      </div>
    </div>
  );
}
