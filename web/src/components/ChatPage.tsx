"use client";

import Link from "next/link";
import { useState } from "react";
import { shortModel, trainerOf, useRuns } from "@/lib/client";
import CompareChat from "./CompareChat";
import { btn, Select } from "./ui";

/** Talk to any trained model next to the model it started from. */
export default function ChatPage({ initialRun }: { initialRun: string | null }) {
  const runs = useRuns();
  // Side-by-side chat samples through Tinker, so only Tinker runs can answer here today
  const trained = (runs ?? []).filter((r) => r.state === "trained" && trainerOf(r.baseModel) === "Tinker");
  const [picked, setPicked] = useState(initialRun);
  const current = trained.find((r) => r.id === picked) ?? trained[0];

  return (
    <main className="mx-auto w-full max-w-[1000px] px-4 py-8 sm:px-8">
      <h1 className="font-display text-[clamp(28px,4vw,40px)] leading-tight font-extrabold tracking-[-0.03em]">Chat</h1>
      <p className="mt-1 text-muted">Ask your trained model and the original the same question.</p>

      <div className="mt-6">
        {runs === null && <p className="text-faint">Loading…</p>}
        {runs && trained.length === 0 && (
          <div className="rounded-3xl border border-dashed border-line p-10 text-center">
            <p className="text-muted">No trained models to talk to yet.</p>
            <Link href="/train" className={`${btn.primary} mt-4`}>Train one</Link>
          </div>
        )}
        {current && (
          <div className="space-y-6">
            <div className="max-w-md">
              <Select value={current.id} onChange={setPicked}
                      options={trained.map((r) => ({ value: r.id, label: `${r.goal ?? r.id} · ${shortModel(r.baseModel)}` }))} />
            </div>
            <CompareChat key={current.id} runId={current.id} baseName={shortModel(current.baseModel)} />
          </div>
        )}
      </div>
    </main>
  );
}
