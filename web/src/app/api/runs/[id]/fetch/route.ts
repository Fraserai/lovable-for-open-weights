import { startFetch } from "@/lib/runs";

export const runtime = "nodejs";

// POST -> download the trained model and publish it to a private Hugging Face repo
export async function POST(_req: Request, ctx: RouteContext<"/api/runs/[id]/fetch">) {
  const { id } = await ctx.params;
  try {
    await startFetch(id);
    return Response.json({ started: true }, { status: 202 });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Could not start." }, { status: 400 });
  }
}
