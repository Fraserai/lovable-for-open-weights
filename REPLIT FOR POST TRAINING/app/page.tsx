import { PostTrainingWorkspace } from "@/components/workspace/PostTrainingWorkspace";

export default function Home() {
  return (
    <div className="min-h-screen bg-bg">
      <header className="border-b border-border">
        <div className="mx-auto flex h-14 w-full max-w-2xl items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-accent text-[13px] font-semibold text-accent-fg">
              P
            </span>
            <span className="text-sm font-medium text-fg">Post Trainer</span>
          </div>
          <span className="text-xs text-fg-subtle">Post-training studio</span>
        </div>
      </header>
      <main>
        <PostTrainingWorkspace />
      </main>
    </div>
  );
}
