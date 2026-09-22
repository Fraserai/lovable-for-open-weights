"use client";

import { useEffect, useRef, useState } from "react";
import { ACCEPTED_FILES, DEFAULT_MODEL, MODELS, type ModelOption } from "@/lib/models";
import { ArrowUp, Check, Chevron, Close, Doc, Mic, Plus } from "./icons";

export type Brief = { goal: string; files: File[]; model: ModelOption };

const PLACEHOLDERS = [
  "Train a model that answers member questions from our PDS…",
  "Teach GLM to draft complaint responses in our tone…",
  "Turn our policy manuals into an internal support assistant…",
  "Make a model that explains our investment options in plain English…",
];

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 ** 2).toFixed(1)} MB`;
}

export default function Composer({ onSubmit, examples = [] }: { onSubmit: (b: Brief) => void; examples?: string[] }) {
  const [goal, setGoal] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [model, setModel] = useState<ModelOption>(DEFAULT_MODEL);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [ph, setPh] = useState(0);
  const text = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const picker = useRef<HTMLDivElement>(null);

  // Rotate the example placeholder while the box is empty
  useEffect(() => {
    if (goal) return;
    const t = setInterval(() => setPh((i) => (i + 1) % PLACEHOLDERS.length), 3500);
    return () => clearInterval(t);
  }, [goal]);

  // Grow the textarea with its content
  useEffect(() => {
    const el = text.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
  }, [goal]);

  // Close the model picker on outside click / Escape
  useEffect(() => {
    if (!pickerOpen) return;
    const onDown = (e: MouseEvent) => {
      if (picker.current && !picker.current.contains(e.target as Node)) setPickerOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setPickerOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [pickerOpen]);

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
  const send = () => {
    if (!canSend) return;
    if (files.length === 0) {
      setHint("Add the documents you want the model to learn from. Use + or drop them here.");
      return;
    }
    onSubmit({ goal: goal.trim(), files, model });
  };

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

        <label htmlFor="goal" className="sr-only">Describe what you want your model to do</label>
        <textarea
          id="goal"
          ref={text}
          rows={2}
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
          }}
          placeholder={PLACEHOLDERS[ph]}
          className="block w-full resize-none bg-transparent px-6 pt-5 pb-2 text-[17px] leading-relaxed text-ink outline-none focus-visible:outline-none placeholder:text-faint"
        />

        <div className="flex items-center gap-2 px-3 pb-3">
          <input ref={fileInput} id="files" type="file" multiple accept={ACCEPTED_FILES} className="hidden"
                 onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
          <button type="button" onClick={() => fileInput.current?.click()} aria-label="Add documents"
                  title="Add documents (PDF, Word, PowerPoint, HTML, Markdown, text, JSONL)"
                  className="grid size-9 place-items-center rounded-full border border-line text-muted transition hover:bg-ground hover:text-ink">
            <Plus className="size-5" />
          </button>

          <div className="ml-auto flex items-center gap-1">
            <div ref={picker} className="relative">
              <button type="button" onClick={() => setPickerOpen((o) => !o)} aria-haspopup="listbox"
                      aria-expanded={pickerOpen}
                      className="flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-2 text-sm text-muted transition hover:bg-ground hover:text-ink">
                <span className="font-medium text-ink">{model.name}</span>
                <span className="hidden sm:inline">on {model.trainer}</span>
                <Chevron className="size-4" />
              </button>
              {pickerOpen && (
                <div role="listbox" aria-label="Base model"
                     className="absolute right-0 bottom-full z-20 mb-2 w-[min(340px,calc(100vw-48px))] overflow-hidden rounded-2xl border border-line bg-surface p-1.5 shadow-[var(--shadow)]">
                  <p className="px-3 pt-2 pb-1.5 text-xs font-medium tracking-wide text-faint uppercase">Base model</p>
                  {MODELS.map((m) => (
                    <button key={m.id} type="button" role="option" aria-selected={m.id === model.id}
                            onClick={() => { setModel(m); setPickerOpen(false); }}
                            className="flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-ground">
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="font-medium">{m.name}</span>
                          <span className="rounded-md border border-line px-1.5 py-px text-[11px] text-muted">{m.trainer}</span>
                          {!m.ready && <span className="text-[11px] text-faint">coming soon</span>}
                        </span>
                        <span className="block text-xs text-faint">{m.maker} · {m.note}</span>
                      </span>
                      {m.id === model.id && <Check className="mt-1 size-4 text-accent" />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button type="button" aria-label="Voice input (coming soon)" title="Voice input is coming soon" disabled
                    className="grid size-9 place-items-center rounded-full text-faint disabled:cursor-not-allowed">
              <Mic className="size-5" />
            </button>

            <button type="button" onClick={send} disabled={!canSend} aria-label="Start"
                    className="grid size-9 place-items-center rounded-full bg-ink text-ground transition disabled:opacity-25">
              <ArrowUp className="size-4" />
            </button>
          </div>
        </div>

        {dragging && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center rounded-[28px] bg-surface/85 text-sm font-medium text-accent">
            Drop documents to add them
          </div>
        )}
      </div>
      <p className="mt-3 min-h-5 text-center text-sm text-muted" aria-live="polite">{hint}</p>
      {examples.length > 0 && (
        <div className="mt-2 flex flex-wrap justify-center gap-2">
          {examples.map((e) => (
            <button key={e} type="button" onClick={() => { setGoal(e); text.current?.focus(); }}
                    className="rounded-full border border-line bg-surface/70 px-3.5 py-1.5 text-sm text-muted backdrop-blur transition hover:bg-surface hover:text-ink">
              {e}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
