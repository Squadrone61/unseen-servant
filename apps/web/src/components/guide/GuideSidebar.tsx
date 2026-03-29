import { GUIDE_TOPICS } from "./topics";

interface GuideSidebarProps {
  activeTopicId: string;
  onSelectTopic: (id: string) => void;
}

export function GuideSidebar({ activeTopicId, onSelectTopic }: GuideSidebarProps) {
  return (
    <nav className="w-52 shrink-0 border-r border-gray-700/40 py-2 overflow-y-auto">
      {GUIDE_TOPICS.map((topic) => {
        const isActive = topic.id === activeTopicId;
        return (
          <button
            key={topic.id}
            onClick={() => onSelectTopic(topic.id)}
            className={`w-full text-left px-4 py-2.5 transition-colors ${
              isActive ? "bg-amber-500/10 border-r-2 border-amber-500" : "hover:bg-gray-800/40"
            }`}
          >
            <div className="flex items-center gap-2">
              <span
                className={`text-xs font-medium leading-tight ${
                  isActive ? "text-amber-200/90" : "text-gray-400"
                }`}
              >
                {topic.title}
              </span>
              {topic.role === "host" && (
                <span className="px-1 py-0.5 bg-amber-500/8 border border-amber-500/25 rounded text-[10px] font-bold tracking-wider text-amber-400/70 shrink-0">
                  HOST
                </span>
              )}
            </div>
            <span className="text-[11px] text-gray-600 leading-tight">{topic.subtitle}</span>
          </button>
        );
      })}
    </nav>
  );
}
