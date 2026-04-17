import { GUIDE_TOPICS } from "./topics";

interface GuideContentProps {
  activeTopicId: string;
}

export function GuideContent({ activeTopicId }: GuideContentProps) {
  const topic = GUIDE_TOPICS.find((t) => t.id === activeTopicId);
  if (!topic) return null;

  const TopicComponent = topic.component;

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="mb-5 flex items-center gap-3">
        <h3
          className="text-base font-semibold text-amber-200/90"
          style={{ fontFamily: "var(--font-cinzel)" }}
        >
          {topic.title}
        </h3>
        {topic.role === "host" && (
          <span className="rounded border border-amber-500/25 bg-amber-500/8 px-1.5 py-0.5 text-xs font-bold tracking-wider text-amber-400/70">
            HOST
          </span>
        )}
      </div>
      <TopicComponent />
    </div>
  );
}
