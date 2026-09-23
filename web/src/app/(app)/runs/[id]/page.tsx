import RunView from "@/components/RunView";

export default async function RunPage({ params, searchParams }: PageProps<"/runs/[id]">) {
  const { id } = await params;
  const { started } = await searchParams;
  return <RunView key={id} id={id} justStarted={started === "1"} />;
}
