"use client";

import { useState } from "react";
import { ArrowUp } from "./icons";
import { Dot } from "./ui";

type Turn = { q: string; original?: string; trained?: string; error?: string };

/** Ask the original and the trained model the same question, side by side. */
export default function CompareChat({ runId, baseName }: { runId: string; baseName: string }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);

  const ask = async () => {
    const q = question.trim();
    if (!q || asking) return;
    setAsking(true);
    setQuestion("");
    setTurns((t) => [...t, { q }]);
    const settle = (patch: Partial<Turn>) =>
      setTurns((t) => t.map((turn, i) => (i === t.length - 1 ? { ...turn, ...patch } : turn)));
    try {
      const res = await fetch(`/api/runs/${runId}/chat`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: q }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "The models didn't answer.");
      settle({ original: body.original, trained: body.trained });
    } catch (e) {
      settle({ error: e instanceof Error ? e.message : "The models didn't answer." });
    } finally {
      setAsking(false);
    }
  };

  return (
    <div className="space-y-5">
      {turns.length === 0 && (
        <p className="rounded-2xl border border-dashed border-line p-6 text-center text-sm text-muted">
          Ask something from your data. The original {baseName} and your trained model answer side by side.
        </p>
      )}
      {turns.map((t, i) => (
        <div key={i} className="space-y-3">
          <p className="ml-auto w-fit max-w-[560px] rounded-3xl rounded-br-lg bg-ink px-5 py-3 text-ground">{t.q}</p>
          {t.error ? (
            <p className="text-sm text-red-600 dark:text-red-400">{t.error}</p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {([[`Original · ${baseName}`, t.original, false], ["Yours", t.trained, true]] as const).map(([label, text, mine]) => (
                <figure key={label} className={`rounded-2xl border p-4 text-sm ${mine ? "border-accent bg-surface" : "border-line bg-surface/60"}`}>
                  <figcaption className={`mb-2 text-xs font-medium tracking-wide uppercase ${mine ? "text-accent" : "text-faint"}`}>{label}</figcaption>
                  {text === undefined
                    ? <p className="flex items-center gap-2 text-faint"><Dot /> Thinking…</p>
                    : <p className="leading-relaxed whitespace-pre-wrap">{text || "(no answer)"}</p>}
                </figure>
              ))}
            </div>
          )}
        </div>
      ))}

      <form onSubmit={(e) => { e.preventDefault(); ask(); }} className="flex items-center gap-2 rounded-full border border-line bg-surface p-1.5 pl-5 focus-within:border-accent">
        <label htmlFor="ask" className="sr-only">Ask your model</label>
        <input id="ask" value={question} onChange={(e) => setQuestion(e.target.value)} disabled={asking}
               placeholder={asking ? "Both models are answering (about 30 seconds)…" : "Ask your model something…"}
               className="min-w-0 flex-1 bg-transparent py-1.5 text-[15px] outline-none disabled:opacity-60" />
        <button type="submit" disabled={asking || !question.trim()} aria-label="Ask"
                className="grid size-9 place-items-center rounded-full bg-ink text-ground transition disabled:opacity-25">
          <ArrowUp className="size-4" />
        </button>
      </form>
    </div>
  );
}
