import { evidencePage } from "@/lib/runs";

export const runtime = "nodejs";

// GET -> the run's Scorecard and evidence pack as one page to send a buyer or file with a risk team
export async function GET(_req: Request, ctx: RouteContext<"/api/runs/[id]/evidence">) {
  const { id } = await ctx.params;
  try {
    return new Response(await evidencePage(id), { headers: { "Content-Type": "text/html; charset=utf-8" } });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Could not build the evidence pack." }, { status: 400 });
  }
}
