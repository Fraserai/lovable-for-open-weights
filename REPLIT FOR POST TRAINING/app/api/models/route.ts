import { listModels } from "@huggingface/hub";
import { NextResponse } from "next/server";
import { formatCompactNumber } from "@/lib/format";
import type { OpenModel } from "@/lib/types";

/**
 * Server-side Hugging Face model search.
 *
 * This is the only place that talks to the Hugging Face Hub — it exists so
 * `HUGGINGFACE_TOKEN` (optional) never reaches the browser, and so the
 * `@huggingface/hub` SDK isn't imported into client components. The client
 * calls this route via `HuggingFaceModelProvider` (lib/providers/model-provider.ts).
 *
 * GET /api/models?q=<query>&limit=<n>
 */
export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 20;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = (searchParams.get("q") ?? "").trim();
  const limit = clampLimit(searchParams.get("limit"));

  try {
    const models = await searchTextGenerationModels(query, limit);
    return NextResponse.json({ models });
  } catch (error) {
    console.error("[api/models] Hugging Face search failed:", error);
    return NextResponse.json({ error: "Hugging Face search failed." }, { status: 502 });
  }
}

function clampLimit(raw: string | null): number {
  const parsed = raw ? Number(raw) : DEFAULT_LIMIT;
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIMIT;
  return Math.min(Math.round(parsed), MAX_LIMIT);
}

async function searchTextGenerationModels(query: string, limit: number): Promise<OpenModel[]> {
  const accessToken = process.env.HUGGINGFACE_TOKEN;

  const iterator = listModels({
    search: {
      query: query || undefined,
      task: "text-generation",
    },
    limit,
    // With no query, rank by popularity; with a query, use the Hub's own
    // relevance ranking rather than overriding it.
    sort: query ? undefined : "downloads",
    additionalFields: ["safetensors"],
    ...(accessToken ? { accessToken } : {}),
  });

  const models: OpenModel[] = [];
  for await (const entry of iterator) {
    // NOTE: @huggingface/hub's `ModelEntry.id` is the Hub's internal database
    // id (e.g. "680da79d48c19d19cf82ab5e") — `.name` is the actual repo slug
    // (e.g. "Qwen/Qwen3-8B"), which is what we treat as the canonical id.
    const repoId = entry.name;
    models.push({
      id: repoId,
      name: repoId,
      family: repoId.split("/")[0] ?? repoId,
      parameterCount: entry.safetensors ? formatCompactNumber(entry.safetensors.total) : undefined,
      gated: entry.gated !== false,
      downloads: entry.downloads,
      likes: entry.likes,
    });
    if (models.length >= limit) break;
  }
  return models;
}
