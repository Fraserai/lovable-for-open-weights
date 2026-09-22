import { getStatus } from "@/lib/runs";

export const runtime = "nodejs";

export async function GET(_req: Request, ctx: RouteContext<"/api/runs/[id]">) {
  const { id } = await ctx.params;
  let status;
  try {
    status = await getStatus(id);
  } catch {
    return Response.json({ error: "Bad run id." }, { status: 400 });
  }
  if (!status) return Response.json({ error: "No such run." }, { status: 404 });
  return Response.json(status);
}
