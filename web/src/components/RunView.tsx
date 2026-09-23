"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { ModelOption } from "@/lib/models";
import type { RunStatus } from "@/lib/runs";
import Studio, { type StudioBrief } from "./Studio";

/** Reopens a run (including ones started from the terminal) in the workspace. */
export default function RunView({ id }: { id: string }) {
  const router = useRouter();
  const [brief, setBrief] = useState<StudioBrief | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/runs/${id}`, { cache: "no-store" });
      if (!res.ok) return setMissing(true);
      const run: RunStatus = await res.json();
      const base = run.baseModel ?? "";
      const trainable: ModelOption[] = await fetch("/api/models").then((r) => r.json()).then((d) => d.trainable).catch(() => []);
      const model = trainable.find((m) => m.id === base) ?? {
        id: base, name: base.split("/").pop() || "Your model",
        trainer: base.startsWith("accounts/") ? "Fireworks" : base.startsWith("unsloth:") ? "Unsloth" : "Tinker",
        hfRepo: null, note: "", ready: true,
      };
      setBrief({ goal: run.goal ?? "", files: run.files, model });
    })();
  }, [id]);

  if (missing) return <p className="p-8 text-muted">There&apos;s no run called {id}.</p>;
  if (!brief) return <p className="p-8 text-faint">Loading…</p>;
  return <Studio brief={brief} existingRunId={id} onReset={() => router.push("/")} />;
}
