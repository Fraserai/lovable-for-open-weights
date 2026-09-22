import { MODELS } from "@/lib/models";
import { newRunId, startPrepare } from "@/lib/runs";

export const runtime = "nodejs";

const MAX_TOTAL_BYTES = 200 * 1024 * 1024;

// Start a run: save the uploads, then have the worker write and check training examples.
export async function POST(req: Request) {
  const form = await req.formData();
  const goal = String(form.get("goal") ?? "").trim();
  const modelId = String(form.get("model") ?? "");
  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);

  const model = MODELS.find((m) => m.id === modelId);
  if (!goal) return Response.json({ error: "Describe what the model should do." }, { status: 400 });
  if (!model) return Response.json({ error: "Unknown base model." }, { status: 400 });
  if (!model.ready) return Response.json({ error: `${model.name} on ${model.trainer} isn't connected yet.` }, { status: 400 });
  if (files.length === 0) return Response.json({ error: "Add at least one document." }, { status: 400 });
  if (files.reduce((n, f) => n + f.size, 0) > MAX_TOTAL_BYTES) {
    return Response.json({ error: "Uploads are over 200 MB in total. Start with fewer documents." }, { status: 413 });
  }

  const id = newRunId(goal);
  await startPrepare(id, goal, model.id, files);
  return Response.json({ id }, { status: 202 });
}
