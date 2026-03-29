import type { ReactNode } from "react";

type CalloutType = "tip" | "note" | "host";

const styles: Record<CalloutType, { border: string; bg: string; icon: string; label: string }> = {
  tip: {
    border: "border-amber-500/20",
    bg: "bg-amber-500/5",
    icon: "🎲",
    label: "Tip",
  },
  note: {
    border: "border-blue-500/20",
    bg: "bg-blue-500/5",
    icon: "📝",
    label: "Note",
  },
  host: {
    border: "border-purple-500/20",
    bg: "bg-purple-500/5",
    icon: "👑",
    label: "Host Only",
  },
};

interface GuideCalloutProps {
  type: CalloutType;
  children: ReactNode;
}

export function GuideCallout({ type, children }: GuideCalloutProps) {
  const s = styles[type];
  return (
    <div className={`${s.bg} ${s.border} border rounded-lg px-4 py-3`}>
      <div className="flex items-start gap-2.5">
        <span className="text-sm shrink-0 mt-0.5">{s.icon}</span>
        <div>
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            {s.label}
          </span>
          <div className="text-sm text-gray-300 mt-1 leading-relaxed">{children}</div>
        </div>
      </div>
    </div>
  );
}
