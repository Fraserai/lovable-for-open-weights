import type { DatasetFormat, UploadedDataset } from "@/lib/types";

export const ACCEPTED_DATASET_EXTENSIONS: DatasetFormat[] = ["json", "jsonl", "csv", "txt"];

/**
 * How much of a file to actually read in the browser.
 *
 * Everything here works from this first slice: format validation, row-count
 * estimation, all of it. Datasets for a serious vertical run into hundreds of
 * megabytes, and reading one fully would freeze the tab and cap how much data
 * a customer can bring — so the browser never reads the whole file, and the
 * file is streamed to the bridge, which validates every line authoritatively.
 *
 * A previous version read whole files into a string and refused anything over
 * 5MB. Worse, refusing was silent: an oversized dataset was judged "ineligible"
 * and quietly ran as a *simulation*, so a customer could upload 50,000 examples
 * and be handed a fake model without ever being told.
 */
const SAMPLE_BYTES = 512 * 1024;

/** Beyond this, `rowCount` is extrapolated from the sample rather than counted. */
const EXACT_COUNT_LIMIT_BYTES = SAMPLE_BYTES;

export function formatFromFileName(fileName: string): DatasetFormat | null {
  const ext = fileName.split(".").pop()?.toLowerCase();
  if (ext === "json" || ext === "jsonl" || ext === "csv" || ext === "txt") {
    return ext;
  }
  return null;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/**
 * Reads the first slice of a dataset file to describe it, keeping a handle to
 * the file itself for the run. Never reads the whole thing.
 */
export async function analyzeDatasetFile(file: File): Promise<UploadedDataset> {
  const format = formatFromFileName(file.name);
  if (!format) {
    throw new Error(`Unsupported file type. Use ${ACCEPTED_DATASET_EXTENSIONS.join(", ")}.`);
  }

  const dataset: UploadedDataset = {
    fileName: file.name,
    sizeBytes: file.size,
    format,
    file,
  };

  if (file.size === 0) return dataset;

  try {
    const sample = await file.slice(0, SAMPLE_BYTES).text();
    const isWholeFile = file.size <= EXACT_COUNT_LIMIT_BYTES;
    const counted = countRows(sample, format, isWholeFile);

    if (counted !== undefined) {
      if (isWholeFile) {
        dataset.rowCount = counted;
      } else {
        // Extrapolate: rows in the sample, scaled by how much of the file it is.
        dataset.rowCount = Math.max(1, Math.round((counted * file.size) / sample.length));
        dataset.rowCountEstimated = true;
      }
    }
  } catch {
    // The count is a nicety, not a requirement — the run doesn't depend on it.
  }

  return dataset;
}

function countRows(text: string, format: DatasetFormat, isWholeFile: boolean): number | undefined {
  // A partial read almost always ends mid-line; drop the last one so the
  // per-row average isn't skewed by a fragment.
  const lines = text.split(/\r?\n/);
  if (!isWholeFile) lines.pop();
  const nonEmpty = lines.filter((line) => line.trim().length > 0);

  switch (format) {
    case "jsonl":
    case "txt":
      return nonEmpty.length;
    case "csv":
      return Math.max(nonEmpty.length - (isWholeFile ? 1 : 0), 0); // exclude header
    case "json": {
      if (!isWholeFile) return undefined; // can't count an array from a fragment
      try {
        const parsed: unknown = JSON.parse(text);
        return Array.isArray(parsed) ? parsed.length : undefined;
      } catch {
        return undefined;
      }
    }
    default:
      return undefined;
  }
}

export interface ChatDatasetValidation {
  supported: boolean;
  /** Human-readable reason, set only when `supported` is false. */
  reason?: string;
}

/**
 * Fast structural check of the sampled head of a chat-JSONL dataset:
 * `{"messages": [{"role": "...", "content": "..."}]}` per line.
 *
 * Deliberately only inspects what was sampled. Its job is instant feedback on
 * an obviously-wrong file, not a guarantee — the bridge validates every line
 * while streaming the upload to disk, and that check is the authoritative one.
 */
export function validateChatJsonlSample(sample: string, format: DatasetFormat): ChatDatasetValidation {
  if (format !== "jsonl") {
    return { supported: false, reason: "Live training needs a JSONL chat-format dataset." };
  }

  const lines = sample.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) {
    return { supported: false, reason: "Dataset is empty." };
  }

  // The final line of a sampled read is usually a fragment, not bad data.
  const checkable = lines.length > 1 ? lines.slice(0, -1) : lines;

  for (let i = 0; i < checkable.length; i += 1) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(checkable[i]!);
    } catch {
      return { supported: false, reason: `Line ${i + 1} isn't valid JSON.` };
    }
    const messages = (parsed as { messages?: unknown } | null)?.messages;
    if (!Array.isArray(messages) || messages.length === 0) {
      return { supported: false, reason: `Line ${i + 1} is missing a non-empty "messages" array.` };
    }
    const hasInvalidMessage = messages.some(
      (message) =>
        typeof message !== "object" ||
        message === null ||
        typeof (message as { role?: unknown }).role !== "string" ||
        typeof (message as { content?: unknown }).content !== "string"
    );
    if (hasInvalidMessage) {
      return { supported: false, reason: `Line ${i + 1} has a message missing a string "role" or "content".` };
    }
    const hasAssistantReply = messages.some(
      (message) => (message as { role?: unknown }).role === "assistant"
    );
    if (!hasAssistantReply) {
      return { supported: false, reason: `Line ${i + 1} has no "assistant" reply to learn from.` };
    }
  }

  return { supported: true };
}

/** Reads the sampled head of a dataset for validation, without loading the file. */
export async function readDatasetSample(dataset: UploadedDataset): Promise<string | null> {
  if (!dataset.file) return null;
  try {
    return await dataset.file.slice(0, SAMPLE_BYTES).text();
  } catch {
    return null;
  }
}
