import { findTrainable } from "@/lib/catalog";
import { configure } from "@/lib/runs";

export const runtime = "nodejs";

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null);

// POST { model, epochs, loraRank, learningRate } -> the plan with those settings (free)
export async function POST(req: Request, ctx: RouteContext<"/api/runs/[id]/configure">) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const model = await findTrainable(String(body.model ?? ""));
  if (!model?.ready) return Response.json({ error: "No connected trainer can fine-tune that model yet." }, { status: 400 });
  try {
    return Response.json(await configure(id, model.id,
      { epochs: num(body.epochs), loraRank: num(body.loraRank), learningRate: num(body.learningRate) }));
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Could not plan this run." }, { status: 400 });
  }
}
