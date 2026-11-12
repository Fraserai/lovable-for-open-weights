import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const BRIDGE_URL = process.env.TINKER_BRIDGE_URL ?? "http://localhost:8000";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const response = await fetch(`${BRIDGE_URL}/jobs/${encodeURIComponent(id)}`, {
      signal: AbortSignal.timeout(10_000),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return NextResponse.json({ error: payload.detail ?? "Lost track of the training run." }, { status: response.status });
    }
    return NextResponse.json(payload);
  } catch (error) {
    console.warn("[api/training-runs/:id] Tinker bridge unreachable:", error);
    return NextResponse.json({ error: "The training service isn't running." }, { status: 503 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await fetch(`${BRIDGE_URL}/jobs/${encodeURIComponent(id)}`, {
      method: "DELETE",
      signal: AbortSignal.timeout(5_000),
    });
  } catch {
    // Best-effort — cancellation isn't guaranteed to reach the bridge, and
    // the client already stops polling regardless.
  }
  return new NextResponse(null, { status: 204 });
}
