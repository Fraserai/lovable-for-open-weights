import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const BRIDGE_URL = process.env.TINKER_BRIDGE_URL ?? "http://localhost:8000";

/**
 * Republishes an already-trained checkpoint. Distinct from POST /training-runs
 * (which trains) precisely so a failed publish can be retried without paying
 * for training a second time.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const response = await fetch(`${BRIDGE_URL}/jobs/${encodeURIComponent(id)}/publish`, {
      method: "POST",
      signal: AbortSignal.timeout(15_000),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return NextResponse.json(
        { error: payload.detail ?? "Couldn't republish this model." },
        { status: response.status }
      );
    }
    return NextResponse.json(payload, { status: 202 });
  } catch (error) {
    console.warn("[api/training-runs/:id/publish] Tinker bridge unreachable:", error);
    return NextResponse.json({ error: "The training service isn't running." }, { status: 503 });
  }
}
