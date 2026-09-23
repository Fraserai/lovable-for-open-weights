import ChatPage from "@/components/ChatPage";

export default async function Chat({ searchParams }: PageProps<"/chat">) {
  const { run } = await searchParams;
  return <ChatPage initialRun={typeof run === "string" ? run : null} />;
}
