import { NextResponse } from "next/server";

/**
 * Proxies to the local Tinker bridge service (services/tinker-bridge) —
 * the only thing allowed to hold TINKER_API_KEY / a write-scoped Hugging
 * Face token. This route passes through job data only, never secrets.
 *
 * The dataset arrives as a raw body and is piped straight through without
 * being read here. A vertical-scale dataset is hundreds of megabytes;
 * buffering one in this process (as the previous JSON contract did) would put
 * a ceiling on how much data a customer can train on, which is precisely the
 * wrong limit for a post-training tool to have.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const BRIDGE_URL = process.env.TINKER_BRIDGE_URL ?? "http://localhost:8000";

export async function POST(request: Request) {
  const { searchParams } = new URL(request.url);
  const baseModelId = searchParams.get("baseModelId");
  const fileName = searchParams.get("fileName") ?? "dataset.jsonl";

  if (!baseModelId) {
    return NextResponse.json({ error: "No model was selected." }, { status: 400 });
  }
  if (!request.body) {
    return NextResponse.json({ error: "No dataset was uploaded." }, { status: 400 });
  }

  const target =
    `${BRIDGE_URL}/jobs?baseModelId=${encodeURIComponent(baseModelId)}` +
    `&fileName=${encodeURIComponent(fileName)}`;

  try {
    const response = await fetch(target, {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      body: request.body,
      // Required by fetch when the body is a stream: we finish sending before
      // reading the response, rather than doing both at once.
      // @ts-expect-error -- `duplex` is valid at runtime but missing from the DOM types
      duplex: "half",
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return NextResponse.json(
        { error: payload.detail ?? "The training service rejected the request." },
        { status: response.status }
      );
    }
    return NextResponse.json(payload, { status: 201 });
  } catch (error) {
    console.warn("[api/training-runs] Tinker bridge unreachable:", error);
    return NextResponse.json({ error: "The training service isn't running." }, { status: 503 });
  }
}
