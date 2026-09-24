import type { NextRequest } from "next/server";
import { datasetInfo, searchDatasets } from "@/lib/hub";

export const runtime = "nodejs";

// GET /api/datasets?q=legal                 -> matching Hugging Face datasets (no q: trending ones)
// GET /api/datasets?id=owner/name[&config&split] -> subsets, splits, columns and first rows
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const id = p.get("id")?.trim();
  if (id) {
    try {
      return Response.json(await datasetInfo(id, p.get("config") ?? undefined, p.get("split") ?? undefined));
    } catch (e) {
      return Response.json({ error: e instanceof Error ? e.message : "Couldn't read that dataset." }, { status: 400 });
    }
  }
  const q = p.get("q")?.trim() ?? "";
  return Response.json(q.length === 1 ? [] : await searchDatasets(q).catch(() => []));
}
