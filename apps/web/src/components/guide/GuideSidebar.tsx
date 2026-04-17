import { GUIDE_TOPICS } from "./topics";

interface GuideSidebarProps {
  activeTopicId: string;
  onSelectTopic: (id: string) => void;
}

export function GuideSidebar({ activeTopicId, onSelectTopic }: GuideSidebarProps) {
  return (
    <nav className="w-52 shrink-0 overflow-y-auto border-r border-gray-700/40 py-2">
      {GUIDE_TOPICS.map((topic) => {
        const isActive = topic.id === activeTopicId;
        return (
          <button
            key={topic.id}
            onClick={() => onSelectTopic(topic.id)}
            className={`w-full px-4 py-2.5 text-left transition-colors ${
              isActive ? "border-r-2 border-amber-500 bg-amber-500/10" : "hover:bg-gray-800/40"
            }`}
          >
            <div className="flex items-center gap-2">
              <span
                className={`text-xs leading-tight font-medium ${
                  isActive ? "text-amber-200/90" : "text-gray-400"
                }`}
              >
                {topic.title}
              </span>
              {topic.role === "host" && (
                <span className="shrink-0 rounded border border-amber-500/25 bg-amber-500/8 px-1 py-0.5 text-xs font-bold tracking-wider text-amber-400/70">
                  HOST
                </span>
              )}
            </div>
            <span className="text-xs leading-tight text-gray-600">{topic.subtitle}</span>
          </button>
        );
      })}
    </nav>
  );
}
