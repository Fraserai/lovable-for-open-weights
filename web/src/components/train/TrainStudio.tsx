"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { clearDraft, loadModels, peekDraft, useRun } from "@/lib/client";
import { ACCEPTED_FILES, DEFAULT_MODEL, DOC_TYPES, TRAINERS, type ModelOption } from "@/lib/models";
import type { HubSource, RunSettings, TrainPlan } from "@/lib/runs";
import { formatBytes } from "../Composer";
import { Close, Database, Doc, Eye, FileCog, Layers, Sliders, Target, Upload } from "../icons";
import ModelPicker, { TrainerBadge, trainerChoices } from "../ModelPicker";
import { btn, Card, Dot, ErrorNote, Field, input, Pill, Segmented, Select } from "../ui";
import HubDataset from "./HubDataset";
import RunPreview from "./RunPreview";
import TrainTabs from "./TrainTabs";

export type TrainInitial = { runId: string; goal: string; model: ModelOption; settings: RunSettings };

type Settings = { epochs: number; loraRank: number; learningRate: string }; // 0 / "" = sized for the data
const AUTO: Settings = { epochs: 0, loraRank: 0, learningRate: "" };

const parseLr = (s: string) => {
  if (!s.trim()) return null;
  const n = Number(s);
  return Number.isFinite(n) && n > 0 && n < 0.1 ? n : NaN;
};

export default function TrainStudio({ initial, startModel }: { initial?: TrainInitial; startModel?: ModelOption }) {
  const router = useRouter();
  const draft = initial ? null : peekDraft();
  const [goal, setGoal] = useState(initial?.goal ?? draft?.goal ?? "");
  const [model, setModel] = useState<ModelOption>(initial?.model ?? startModel ?? draft?.model ?? DEFAULT_MODEL);
  const [allModels, setAllModels] = useState<ModelOption[]>([]);
  const [source, setSource] = useState<"upload" | "hub">("upload");
  const [files, setFiles] = useState<File[]>(draft?.files ?? []);
  const [hub, setHub] = useState<HubSource | null>(null);
  const [runId, setRunId] = useState<string | null>(initial?.runId ?? null);
  const [preparing, setPreparing] = useState(false);
  const [prepError, setPrepError] = useState<string | null>(null);
  const [settings, setSettings] = useState<Settings>(() => initial ? {
    epochs: initial.settings.epochs ?? 0, loraRank: initial.settings.loraRank ?? 0,
    learningRate: initial.settings.learningRate ? String(initial.settings.learningRate) : "",
  } : AUTO);
  const [mode, setMode] = useState<"simple" | "advanced">("simple");
  const [plan, setPlan] = useState<TrainPlan | null>(null);
  const [planFor, setPlanFor] = useState<string | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [showData, setShowData] = useState(false);
  const { run } = useRun(runId);

  useEffect(() => { loadModels().then(setAllModels); }, []);

  const lr = parseLr(settings.learningRate);
  const prepared = run?.status === "done" && (run.train.state === "waiting" || run.train.state === "failed");
  const docs = files.some((f) => !f.name.toLowerCase().endsWith(".jsonl"));
  const settingsKey = JSON.stringify([runId, model.id, settings.epochs, settings.loraRank, lr]);
  const planning = prepared && planFor !== settingsKey && !Number.isNaN(lr);

  // Re-plan (free) whenever the model or a setting changes on a prepared run
  const planSeq = useRef(0);
  useEffect(() => {
    if (!prepared || !runId || Number.isNaN(lr)) return;
    const seq = ++planSeq.current;
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/runs/${runId}/configure`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model: model.id, epochs: settings.epochs, loraRank: settings.loraRank, learningRate: lr }),
        });
        const body = await res.json();
        if (seq !== planSeq.current) return;
        if (!res.ok) throw new Error(body.error ?? "Could not work out the cost.");
        setPlan(body);
        setPlanError(null);
      } catch (e) {
        if (seq !== planSeq.current) return;
        setPlan(null);
        setPlanError(e instanceof Error ? e.message : "Could not work out the cost.");
      }
      setPlanFor(settingsKey);
    }, 500);
    return () => clearTimeout(t);
  }, [prepared, runId, model.id, settings.epochs, settings.loraRank, lr, settingsKey]);

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const allowed = ACCEPTED_FILES.split(",");
    const ok = Array.from(list).filter((f) => allowed.some((ext) => f.name.toLowerCase().endsWith(ext)));
    setFiles((prev) => {
      const seen = new Set(prev.map((f) => f.name + f.size));
      return [...prev, ...ok.filter((f) => !seen.has(f.name + f.size))];
    });
  };

  const prepare = async () => {
    setPreparing(true);
    setPrepError(null);
    const form = new FormData();
    form.set("goal", goal.trim());
    form.set("model", model.id);
    if (source === "hub" && hub) {
      form.set("hf", hub.id);
      form.set("limit", String(hub.limit));
      for (const k of ["config", "split", "userField", "assistantField"] as const) if (hub[k]) form.set(k, hub[k]!);
    } else {
      files.forEach((f) => form.append("files", f));
    }
    try {
      const res = await fetch("/api/runs", { method: "POST", body: form });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Could not start.");
      setRunId(body.id);
      clearDraft();
      window.history.replaceState(null, "", `/train?run=${body.id}`);
    } catch (e) {
      setPrepError(e instanceof Error ? e.message : "Could not start.");
    } finally {
      setPreparing(false);
    }
  };

  const resetData = () => {
    setRunId(null);
    setPlan(null);
    setPlanFor(null);
    setPlanError(null);
    setShowData(false);
    window.history.replaceState(null, "", "/train");
  };

  const start = async () => {
    if (!runId) return;
    setStarting(true);
    setStartError(null);
    try {
      const res = await fetch(`/api/runs/${runId}/train`, { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Could not start training.");
      router.push(`/runs/${runId}?started=1`);
    } catch (e) {
      setStartError(e instanceof Error ? e.message : "Could not start training.");
      setStarting(false);
    }
  };

  const choices = useMemo(() => trainerChoices(model, allModels), [model, allModels]);
  const dataLabel = run?.status === "done"
    ? `${run.sourceLabel ?? (run.files.length === 1 ? run.files[0].name : `${run.files.length} files`)} · ${run.rows?.toLocaleString()} examples`
    : null;
  const checklist = [
    { label: "Say what the model should do", done: goal.trim().length > 0 },
    { label: "Pick a model", done: model.ready },
    { label: "Prepare the training data", done: !!prepared },
  ];
  const canPrepare = goal.trim().length > 0 && model.ready && !preparing && (source === "hub" ? !!hub : files.length > 0);

  return (
    <main className="mx-auto w-full max-w-[1240px] px-4 py-8 sm:px-8">
      <TrainTabs active="configure" runId={runId ?? undefined} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px] xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-5">
          <Card step={1} icon={<Target className="size-5" />} title="Goal" subtitle="What the model should do. It becomes the model's instructions.">
            <label htmlFor="goal" className="sr-only">What should the model do?</label>
            <textarea id="goal" rows={3} value={goal} onChange={(e) => setGoal(e.target.value)} disabled={!!runId}
                      placeholder="e.g. Answer member questions about our PDS and insurance terms, and stay inside general advice"
                      className={`${input} resize-y text-[15px] leading-relaxed`} />
            {runId && (
              <p className="mt-2 text-xs text-faint">
                Built into the training examples. <button type="button" onClick={resetData} className="underline hover:text-ink">Start the data again</button> to change it.
              </p>
            )}
          </Card>

          <Card step={2} icon={<Layers className="size-5" />} title="Model" subtitle="Any open model. We show which trainer can run it.">
            <div className="grid gap-4 @md:grid-cols-2 @2xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,0.8fr)]">
              <div className="@md:col-span-2 @2xl:col-span-1"><Field label="Model" htmlFor="model"><ModelPicker id="model" value={model} onChange={setModel} /></Field></div>
              <Field label="Trainer" htmlFor="trainer" hint="The same model can often train in more than one place. We start with the one proven end to end.">
                <Select id="trainer" value={model.id} onChange={(id) => { const m = choices.find((c) => c.id === id); if (m) setModel(m); }}
                        options={choices.map((c) => ({ value: c.id, label: `${c.trainer ? TRAINERS[c.trainer].label : "None"}${c.ready ? "" : " (not connected)"}`, disabled: !c.ready }))} />
              </Field>
              <Field label="Method" htmlFor="method" hint="All connected trainers tune LoRA adapters in 16-bit. Full fine-tuning arrives with Together.">
                <Select id="method" value="lora" onChange={() => {}} options={[
                  { value: "lora", label: "LoRA" },
                  { value: "qlora", label: "QLoRA (not offered)", disabled: true },
                  { value: "full", label: "Full (with Together)", disabled: true },
                ]} />
              </Field>
            </div>
            <p className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-faint">
              {model.note}
              {model.trainer && <><span>·</span>{TRAINERS[model.trainer].runsOn}</>}
              {choices.length > 1 && <><span>·</span>also on {choices.filter((c) => c.id !== model.id).map((c) => <TrainerBadge key={c.id} m={c} />)}</>}
            </p>
          </Card>

          <Card step={3} icon={<Database className="size-5" />} title="Dataset" subtitle="Your documents, a dataset of examples, or one from Hugging Face."
                action={!runId ? (
                  <Segmented label="Data source" value={source} onChange={setSource}
                             options={[{ value: "upload", label: "Upload" }, { value: "hub", label: "Hugging Face" }]} />
                ) : undefined}>
            {runId ? (
              <PreparedData run={run} docs={docs} showData={showData} setShowData={setShowData} onReset={resetData} />
            ) : (
              <div className="space-y-4">
                {source === "upload" ? (
                  <Dropzone files={files} onAdd={addFiles} onRemove={(f) => setFiles((p) => p.filter((x) => x !== f))} />
                ) : (
                  <HubDataset value={hub} onChange={setHub} />
                )}
                {prepError && <ErrorNote>{prepError}</ErrorNote>}
                <div className="flex flex-wrap items-center gap-3">
                  <button type="button" onClick={prepare} disabled={!canPrepare} className={btn.primary}>
                    {preparing ? "Uploading…" : source === "upload" && docs ? "Write training examples" : "Import dataset"}
                  </button>
                  <p className="text-xs text-faint">
                    {source === "upload" && docs
                      ? "Reads up to 20 sections on this first pass and writes question/answer pairs for your goal, using an open model with zero data retention."
                      : "Every row is checked before anything is paid for."}
                  </p>
                </div>
              </div>
            )}
          </Card>

          <Card step={4} icon={<Sliders className="size-5" />} title="Parameters" subtitle="Leave on Auto and we size them to your data."
                action={<Segmented label="Detail" value={mode} onChange={setMode} options={[{ value: "simple", label: "Simple" }, { value: "advanced", label: "Advanced" }]} />}>
            <div className="grid gap-5 @lg:grid-cols-2">
              <Field label="Epochs" hint="Passes over your data. Auto aims for about 250 training steps, up to 4 passes.">
                <Segmented label="Epochs" value={settings.epochs} onChange={(epochs) => setSettings((s) => ({ ...s, epochs }))}
                           options={[{ value: 0, label: plan && !settings.epochs ? `Auto · ${plan.epochs}` : "Auto" }, ...[1, 2, 3, 4, 5].map((n) => ({ value: n, label: String(n) }))]} />
              </Field>
              <Field label="Learning rate" htmlFor="lr" hint="Leave blank for the value tuned for this model family.">
                <input id="lr" inputMode="decimal" value={settings.learningRate}
                       onChange={(e) => setSettings((s) => ({ ...s, learningRate: e.target.value }))}
                       placeholder={plan?.learning_rate ? `Auto · ${plan.learning_rate.toExponential(1)}` : "Auto"}
                       className={`${input} font-mono ${Number.isNaN(lr) ? "border-red-400" : ""}`} />
                {Number.isNaN(lr) && <p className="mt-1 text-xs text-red-500">Use a number like 2e-4.</p>}
              </Field>
            </div>
            {mode === "advanced" && (
              <div className="mt-5 grid gap-5 border-t border-line pt-5 @lg:grid-cols-2">
                <Field label="LoRA rank" hint="Size of the adapter. Higher learns more; 32 is the most Fireworks allows and our default.">
                  <Segmented label="LoRA rank" value={settings.loraRank} onChange={(loraRank) => setSettings((s) => ({ ...s, loraRank }))}
                             options={[{ value: 0, label: "Auto · 32" }, ...[8, 16, 32].map((n) => ({ value: n, label: String(n) }))]} />
                </Field>
                <div className="grid grid-cols-2 gap-4">
                  <ReadOnly label="Batch size" value={plan?.batch_size} by={model.trainer} />
                  <ReadOnly label="Context" value={plan?.max_length?.toLocaleString()} by={model.trainer} />
                </div>
                <p className="text-xs text-faint @lg:col-span-2">
                  Optimiser, schedule and warm-up are set by each trainer&apos;s tuned recipe, so results stay comparable across runs.
                </p>
              </div>
            )}
          </Card>

          <ConfigCard model={model} settings={settings} hub={source === "hub" ? hub : null}
                      onLoad={(m, s, h) => {
                        if (m) setModel(m);
                        setSettings(s);
                        if (h && !runId) { setSource("hub"); setHub(h); }
                      }}
                      onReset={() => setSettings(AUTO)} allModels={allModels} />
        </div>

        <div>
          <RunPreview model={model} dataLabel={dataLabel} plan={planFor === settingsKey ? plan : null} planning={!!planning}
                      planError={planFor === settingsKey ? planError : null} checklist={checklist}
                      starting={starting} startError={startError} onStart={start} />
        </div>
      </div>
    </main>
  );
}

function ReadOnly({ label, value, by }: { label: string; value: React.ReactNode; by: ModelOption["trainer"] }) {
  return (
    <Field label={label} hint={`Set by ${by ? TRAINERS[by].label : "the trainer"} for this model.`}>
      <p className="rounded-xl border border-dashed border-line px-3.5 py-2.5 font-mono text-sm text-muted">{value ?? "—"}</p>
    </Field>
  );
}

function Dropzone({ files, onAdd, onRemove }: { files: File[]; onAdd: (l: FileList | null) => void; onRemove: (f: File) => void }) {
  const [dragging, setDragging] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  return (
    <div>
      <input ref={picker} type="file" multiple accept={ACCEPTED_FILES} className="hidden" aria-label="Choose files"
             onChange={(e) => { onAdd(e.target.files); e.target.value = ""; }} />
      <button type="button" onClick={() => picker.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)}
              onDrop={(e) => { e.preventDefault(); setDragging(false); onAdd(e.dataTransfer.files); }}
              className={`flex w-full flex-col items-center gap-1 rounded-2xl border-2 border-dashed px-4 py-7 text-center transition ${
                dragging ? "border-accent bg-accent/5" : "border-line hover:border-faint hover:bg-ground"}`}>
        <Upload className="size-6 text-faint" />
        <span className="text-sm font-medium">Drop files or click to upload</span>
        <span className="text-xs text-faint">Documents ({DOC_TYPES}) or a dataset (.jsonl)</span>
      </button>
      {files.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2" aria-label="Files">
          {files.map((f) => (
            <li key={f.name + f.size} className="flex max-w-full items-center gap-2 rounded-xl border border-line bg-ground py-1.5 pr-1.5 pl-2.5 text-sm">
              <Doc className="size-4 shrink-0 text-accent" />
              <span className="truncate">{f.name}</span>
              <span className="shrink-0 text-faint tabular-nums">{formatBytes(f.size)}</span>
              <button type="button" aria-label={`Remove ${f.name}`} onClick={() => onRemove(f)} className="rounded-md p-0.5 text-faint hover:bg-line hover:text-ink">
                <Close className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PreparedData({ run, docs, showData, setShowData, onReset }: {
  run: ReturnType<typeof useRun>["run"]; docs: boolean; showData: boolean; setShowData: (v: boolean) => void; onReset: () => void;
}) {
  if (!run) return <p className="flex items-center gap-2 text-sm text-muted"><Dot /> Uploading…</p>;
  if (run.status === "running") {
    return (
      <div className="space-y-2">
        <p className="flex items-center gap-2 text-sm"><Dot />
          {run.stages.read !== "done" ? (docs ? "Reading your documents…" : "Reading the dataset…") : "Writing training examples…"}
        </p>
        <p className="text-xs text-faint">Documents take a few minutes. You can leave this page; the run keeps going.</p>
      </div>
    );
  }
  if (run.status === "failed") {
    return (
      <div className="space-y-3">
        <ErrorNote>{run.error}</ErrorNote>
        {run.error?.includes("is not set") && <p className="text-sm text-muted">API keys go in <code className="font-mono">.env</code> at the project root (see <code className="font-mono">.env.example</code>).</p>}
        <button type="button" onClick={onReset} className={btn.ghost}>Try different data</button>
      </div>
    );
  }
  const passed = run.stages.check === "done";
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-line bg-ground px-4 py-3">
        <Database className="size-5 shrink-0 text-accent" />
        <div className="min-w-[12rem] flex-1">
          <p className="truncate font-mono text-sm">{run.sourceLabel ?? run.files.map((f) => f.name).join(", ")}</p>
          <p className="text-xs text-faint">
            {run.rows?.toLocaleString()} examples · ~{run.estTokens?.toLocaleString()} tokens · {run.source === "dataset" ? "imported as-is" : "written from your documents"}
          </p>
        </div>
        <div className="flex items-center gap-1">
          {passed ? <Pill tone="accent">All rows pass</Pill> : <Pill tone="bad">Rows failed checks</Pill>}
          <button type="button" onClick={() => setShowData(!showData)} className={btn.quiet} aria-expanded={showData}><Eye className="size-4" /> View</button>
          <button type="button" onClick={onReset} className={btn.quiet}>Replace</button>
        </div>
      </div>
      {!passed && <pre className="overflow-x-auto rounded-xl bg-ink/5 p-3 font-mono text-xs">{run.report.join("\n")}</pre>}
      {showData && (
        <div className="space-y-2">
          {run.sample.map((ex, i) => (
            <figure key={i} className="rounded-2xl border border-line p-4 text-sm">
              <p className="font-medium">{ex.user}</p>
              <p className="mt-2 whitespace-pre-wrap text-muted">{ex.assistant}</p>
            </figure>
          ))}
          {run.systemPrompt && <p className="text-xs text-faint">Instructions: {run.systemPrompt}</p>}
        </div>
      )}
    </div>
  );
}

// ---- Save / load settings as a small YAML file, like Unsloth's configs ----

function toYaml(model: ModelOption, s: Settings, hub: HubSource | null) {
  const lines = [
    "# Weightroom training config",
    `model: ${model.id}`,
    `trainer: ${model.trainer ?? "none"}`,
    `method: lora`,
    `epochs: ${s.epochs || "auto"}`,
    `lora_rank: ${s.loraRank || "auto"}`,
    `learning_rate: ${s.learningRate.trim() || "auto"}`,
  ];
  if (hub) {
    lines.push("dataset:", `  hf: ${hub.id}`, `  limit: ${hub.limit}`);
    for (const [k, v] of [["config", hub.config], ["split", hub.split], ["user_field", hub.userField], ["assistant_field", hub.assistantField]]) {
      if (v) lines.push(`  ${k}: ${v}`);
    }
  }
  return lines.join("\n") + "\n";
}

function fromYaml(text: string) {
  const top: Record<string, string> = {}, ds: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const m = line.match(/^(\s*)([a-z_]+):\s*(.*?)\s*$/);
    if (!m || line.trimStart().startsWith("#")) continue;
    (m[1] ? ds : top)[m[2]] = m[3];
  }
  const n = (v?: string) => (v && v !== "auto" && Number(v) > 0 ? Number(v) : 0);
  const settings: Settings = { epochs: n(top.epochs), loraRank: n(top.lora_rank), learningRate: top.learning_rate && top.learning_rate !== "auto" ? top.learning_rate : "" };
  const hub: HubSource | null = ds.hf ? { id: ds.hf, limit: n(ds.limit) || 1000, config: ds.config, split: ds.split, userField: ds.user_field, assistantField: ds.assistant_field } : null;
  return { modelId: top.model, settings, hub };
}

function ConfigCard({ model, settings, hub, onLoad, onReset, allModels }: {
  model: ModelOption; settings: Settings; hub: HubSource | null; allModels: ModelOption[];
  onLoad: (m: ModelOption | null, s: Settings, h: HubSource | null) => void; onReset: () => void;
}) {
  const picker = useRef<HTMLInputElement>(null);
  const [note, setNote] = useState<string | null>(null);
  const save = () => {
    const url = URL.createObjectURL(new Blob([toYaml(model, settings, hub)], { type: "text/yaml" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `${model.name.replace(/\W+/g, "-").toLowerCase()}_lora_${new Date().toISOString().slice(0, 10)}.yaml` });
    a.click();
    URL.revokeObjectURL(url);
  };
  const load = async (f: File | undefined) => {
    if (!f) return;
    const { modelId, settings: s, hub: h } = fromYaml(await f.text());
    const m = modelId ? allModels.find((x) => x.id === modelId)
      ?? (modelId.startsWith("unsloth:") ? { id: modelId, name: modelId.slice(8), trainer: "Unsloth" as const, hfRepo: modelId.slice(8), note: "cloud GPU · LoRA", ready: true } : null) : null;
    onLoad(m ?? null, s, h);
    setNote(modelId && !m ? `Loaded settings. ${modelId} isn't on a connected trainer, so the model is unchanged.` : `Loaded ${f.name}.`);
  };
  return (
    <Card icon={<FileCog className="size-5" />} title="Configuration" subtitle="Save these settings to reuse, or load a saved file.">
      <div className="flex flex-wrap gap-2">
        <input ref={picker} type="file" accept=".yaml,.yml" className="hidden" aria-label="Load config" onChange={(e) => { load(e.target.files?.[0]); e.target.value = ""; }} />
        <button type="button" onClick={() => picker.current?.click()} className={btn.ghost}>Load YAML</button>
        <button type="button" onClick={save} className={btn.ghost}>Save YAML</button>
        <button type="button" onClick={() => { onReset(); setNote("Back to Auto."); }} className={btn.ghost}>Reset to defaults</button>
      </div>
      {note && <p className="mt-3 text-sm text-muted" aria-live="polite">{note}</p>}
    </Card>
  );
}
