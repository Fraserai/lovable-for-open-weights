"use client";

import { useEffect, useRef, useState } from "react";
import { ACCEPTED_FILES, DEFAULT_MODEL, type ModelOption } from "@/lib/models";
import { ArrowRight, Close, Doc, Mic, Plus } from "./icons";
import ModelPicker from "./ModelPicker";

export type Brief = { goal: string; files: File[]; model: ModelOption };

const DEFAULT_PLACEHOLDERS = ["Describe what your model should do"];

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 ** 2).toFixed(1)} MB`;
}

/** `preset` fills the box from outside (an example); `n` changes on every pick so repeats still apply. */
export default function Composer({ onSubmit, placeholders = DEFAULT_PLACEHOLDERS, preset, initialModel = DEFAULT_MODEL }:
  { onSubmit: (b: Brief) => void; placeholders?: string[]; preset?: { text: string; n: number }; initialModel?: ModelOption }) {
  const [goal, setGoal] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [model, setModel] = useState<ModelOption>(initialModel);
  const [dragging, setDragging] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [ph, setPh] = useState(0);
  const text = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // Rotate the example placeholder while the box is empty
  useEffect(() => {
    if (goal) return;
    const t = setInterval(() => setPh((i) => (i + 1) % placeholders.length), 3500);
    return () => clearInterval(t);
  }, [goal, placeholders]);

  // Take a new preset as soon as it arrives, then put the cursor in the box
  const [applied, setApplied] = useState(preset);
  if (preset !== applied) {
    setApplied(preset);
    if (preset) setGoal(preset.text);
  }
  useEffect(() => {
    if (preset) text.current?.focus();
  }, [preset]);

  // Grow the textarea with its content (or with the example placeholder while it's empty)
  useEffect(() => {
    const el = text.current;
    if (!el) return;
    if (!goal) el.value = el.placeholder;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
    el.style.overflowY = el.scrollHeight > 240 ? "auto" : "hidden";
    if (!goal) el.value = "";
  }, [goal, ph, placeholders]);

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const allowed = ACCEPTED_FILES.split(",");
    const incoming = Array.from(list);
    const ok = incoming.filter((f) => allowed.some((ext) => f.name.toLowerCase().endsWith(ext)));
    const skipped = incoming.length - ok.length;
    setHint(skipped ? `Skipped ${skipped} file${skipped > 1 ? "s" : ""}: we take PDF, Word, PowerPoint, HTML, Markdown, text and JSONL.` : null);
    setFiles((prev) => {
      const seen = new Set(prev.map((f) => f.name + f.size));
      return [...prev, ...ok.filter((f) => !seen.has(f.name + f.size))];
    });
  };

  const canSend = goal.trim().length > 0;
  // Documents are optional here: the Train page's Dataset card also takes files or a Hugging Face dataset.
  const send = () => canSend && onSubmit({ goal: goal.trim(), files, model });

  return (
    <div className="w-full">
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files); }}
        className={`relative rounded-[28px] bg-surface text-left shadow-[var(--shadow)] ring-1 transition ${
          dragging ? "ring-2 ring-accent" : "ring-line focus-within:ring-faint"
        }`}
      >
        {files.length > 0 && (
          <ul className="flex flex-wrap gap-2 px-5 pt-4" aria-label="Attached files">
            {files.map((f) => (
              <li key={f.name + f.size}
                  className="flex max-w-full items-center gap-2 rounded-xl border border-line bg-ground py-1.5 pl-2.5 pr-1.5 text-sm">
                <Doc className="size-4 shrink-0 text-accent" />
                <span className="truncate">{f.name}</span>
                <span className="shrink-0 text-faint tabular-nums">{formatBytes(f.size)}</span>
                <button type="button" aria-label={`Remove ${f.name}`}
                        onClick={() => setFiles((p) => p.filter((x) => x !== f))}
                        className="rounded-md p-0.5 text-faint hover:bg-line hover:text-ink">
                  <Close className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}

        <label htmlFor="goal" className="sr-only">Describe the model you want to build</label>
        <textarea
          id="goal"
          ref={text}
          rows={2}
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
          }}
          placeholder={`${placeholders[ph % placeholders.length]}…`}
          className="block w-full resize-none bg-transparent px-6 pt-5 pb-2 text-[17px] leading-relaxed text-ink outline-none focus-visible:outline-none placeholder:text-faint"
        />

        <div className="flex items-center gap-2 px-3 pb-3">
          <input ref={fileInput} id="files" type="file" multiple accept={ACCEPTED_FILES} className="hidden"
                 onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
          <button type="button" onClick={() => fileInput.current?.click()} aria-label="Add documents or a dataset"
                  title="Add documents (PDF, Word, PowerPoint, HTML, Markdown, text) or a dataset (.jsonl)"
                  className="grid size-9 place-items-center rounded-full border border-line text-muted transition hover:bg-ground hover:text-ink">
            <Plus className="size-5" />
          </button>

          <div className="ml-auto flex items-center gap-1">
            <ModelPicker value={model} onChange={setModel} variant="chip" />

            <button type="button" aria-label="Voice input (coming soon)" title="Voice input is coming soon" disabled
                    className="grid size-9 place-items-center rounded-full text-faint disabled:cursor-not-allowed">
              <Mic className="size-5" />
            </button>

            <button type="button" onClick={send} disabled={!canSend} aria-label="Set up training"
                    className="flex h-9 items-center gap-1.5 rounded-full bg-ink pr-3 pl-3.5 text-sm font-medium text-ground transition disabled:opacity-25">
              <span className="hidden sm:inline">Set up training</span> <ArrowRight className="size-4" />
            </button>
          </div>
        </div>

        {dragging && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center rounded-[28px] bg-surface/85 text-sm font-medium text-accent">
            Drop documents or a dataset (.jsonl)
          </div>
        )}
      </div>
      <p className="mt-3 min-h-5 text-center text-sm text-muted" aria-live="polite">{hint}</p>
    </div>
  );
}
