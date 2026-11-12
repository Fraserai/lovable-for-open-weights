import { CURATED_MODELS } from "@/lib/curated-models";
import { MOCK_MODELS } from "@/lib/mock-data";
import type { OpenModel } from "@/lib/types";

/**
 * Source of browsable base models.
 *
 * The UI (see `components/workspace/ModelSelector.tsx`) only ever depends
 * on this interface, so the real Hugging Face-backed implementation below
 * can be swapped or extended without touching any component.
 */
export interface ModelProvider {
  searchModels(options: ModelSearchOptions): Promise<OpenModel[]>;
}

export interface ModelSearchOptions {
  /** Free-text search, e.g. "qwen coder". Empty string = default/browse listing. */
  query: string;
  /** Roughly how many results to return. */
  limit?: number;
  /** Lets callers cancel an in-flight search (e.g. a superseded debounced query). */
  signal?: AbortSignal;
}

const DEFAULT_LIMIT = 20;

/** Small fixed delay so the UI's loading state is exercised even in the mock. */
function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Offline fallback. Filters the small hard-coded catalog in `lib/mock-data.ts`.
 * Used directly in tests/offline dev, and as the fallback target inside
 * `FallbackModelProvider` below.
 */
class MockModelProvider implements ModelProvider {
  async searchModels({ query, limit = DEFAULT_LIMIT }: ModelSearchOptions): Promise<OpenModel[]> {
    await delay(150);
    const needle = query.trim().toLowerCase();
    const matches = needle
      ? MOCK_MODELS.filter((model) => `${model.id} ${model.family}`.toLowerCase().includes(needle))
      : MOCK_MODELS;
    return matches.slice(0, limit);
  }
}

/**
 * Real catalog. Calls our own `/api/models` route rather than the Hugging
 * Face Hub directly — that keeps the `@huggingface/hub` SDK and an optional
 * `HUGGINGFACE_TOKEN` entirely server-side (see `app/api/models/route.ts`).
 */
class HuggingFaceModelProvider implements ModelProvider {
  async searchModels({ query, limit = DEFAULT_LIMIT, signal }: ModelSearchOptions): Promise<OpenModel[]> {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    params.set("limit", String(limit));

    const response = await fetch(`/api/models?${params.toString()}`, { signal });
    if (!response.ok) {
      throw new Error(`Hugging Face search failed (${response.status}).`);
    }

    const payload = (await response.json()) as { models?: OpenModel[]; error?: string };
    if (payload.error) throw new Error(payload.error);
    return payload.models ?? [];
  }
}

/**
 * Wraps a primary provider with a fallback for when it throws (network
 * outage, Hugging Face downtime, etc) — NOT for legitimate zero-result
 * searches, which should still surface as an empty state.
 *
 * This is the one place fallback behavior lives; remove this wrapper (and
 * export `new HuggingFaceModelProvider()` directly) once a fallback catalog
 * is no longer wanted.
 */
class FallbackModelProvider implements ModelProvider {
  constructor(
    private readonly primary: ModelProvider,
    private readonly fallback: ModelProvider
  ) {}

  async searchModels(options: ModelSearchOptions): Promise<OpenModel[]> {
    try {
      return await this.primary.searchModels(options);
    } catch (error) {
      if (options.signal?.aborted) throw error; // a cancelled request isn't a failure
      console.warn("[model-provider] Hugging Face search failed, using the offline fallback catalog.", error);
      return this.fallback.searchModels(options);
    }
  }
}

/**
 * Small, hand-picked catalog of today's leading open-weight models (see
 * `lib/curated-models.ts` for how it was chosen and verified). Filters the
 * same way `MockModelProvider` does — it's the same shape of provider,
 * just backing the primary experience instead of a fallback.
 */
class CuratedModelProvider implements ModelProvider {
  async searchModels({ query, limit = DEFAULT_LIMIT }: ModelSearchOptions): Promise<OpenModel[]> {
    const needle = query.trim().toLowerCase();
    const matches = needle
      ? CURATED_MODELS.filter((model) => `${model.id} ${model.family}`.toLowerCase().includes(needle))
      : CURATED_MODELS;
    return matches.slice(0, limit);
  }
}

/**
 * Currently backed by the small curated catalog above rather than live
 * Hugging Face search — browsing the full Hub felt overwhelming for
 * picking a base model. The full-catalog path (`HuggingFaceModelProvider`
 * wrapped in `FallbackModelProvider`) is untouched above; to bring back
 * live search, swap this line for:
 *
 *   new FallbackModelProvider(new HuggingFaceModelProvider(), new MockModelProvider())
 */
export const modelProvider: ModelProvider = new CuratedModelProvider();
