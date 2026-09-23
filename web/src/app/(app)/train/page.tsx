import { redirect } from "next/navigation";
import TrainStudio, { type TrainInitial } from "@/components/train/TrainStudio";
import { findTrainable } from "@/lib/catalog";
import { getStatus } from "@/lib/runs";

// /train starts fresh (or from the home prompt); ?model=<id> preselects a model (from Models);
// ?run=<id> reopens a prepared run's settings.
export default async function TrainPage({ searchParams }: PageProps<"/train">) {
  const { run, model: modelId } = await searchParams;
  if (typeof run !== "string") {
    const start = typeof modelId === "string" ? await findTrainable(modelId) : undefined;
    return <TrainStudio key={start?.id ?? "new"} startModel={start?.ready ? start : undefined} />;
  }

  const status = await getStatus(run).catch(() => null);
  if (!status) redirect("/train");
  if (status.train.state === "running" || status.train.state === "done") redirect(`/runs/${run}`);
  const base = status.baseModel ?? "";
  const model = (base && await findTrainable(base)) || {
    id: base, name: base.split("/").pop() || "Your model", trainer: null, hfRepo: null, note: "", ready: false,
  };
  const initial: TrainInitial = { runId: run, goal: status.goal ?? "", model, settings: status.settings };
  return <TrainStudio key={run} initial={initial} />;
}
