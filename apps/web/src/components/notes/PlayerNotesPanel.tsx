"use client";

interface PlayerNotesPanelProps {
  notes: string;
  saveState: "saved" | "saving" | "unsaved";
  onChange: (content: string) => void;
  onClose: () => void;
  sidebarCollapsed?: boolean;
}

export function PlayerNotesPanel({
  notes,
  saveState,
  onChange,
  onClose,
  sidebarCollapsed,
}: PlayerNotesPanelProps) {
  return (
    <div className={`absolute bottom-4 ${sidebarCollapsed ? "right-14" : "right-76"} z-40 w-80 max-h-[70vh] flex flex-col
                    bg-gray-800/95 backdrop-blur-sm border border-gray-700 rounded-xl shadow-2xl`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-200">Notes</span>
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded-full ${
              saveState === "saved"
                ? "text-green-400/70 bg-green-400/10"
                : saveState === "saving"
                  ? "text-yellow-400/70 bg-yellow-400/10"
                  : "text-gray-500 bg-gray-700"
            }`}
          >
            {saveState === "saved" ? "Saved" : saveState === "saving" ? "Saving..." : "Unsaved"}
          </span>
        </div>
        <button
          onClick={onClose}
          className="text-gray-500 hover:text-gray-300 transition-colors text-lg leading-none"
          title="Close notes"
        >
          &times;
        </button>
      </div>

      {/* Textarea */}
      <textarea
        value={notes}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Track NPCs, quest objectives, loot, plans..."
        className="flex-1 min-h-[200px] max-h-[60vh] px-4 py-3 bg-transparent text-sm text-gray-300
                   placeholder-gray-600 resize-y focus:outline-none font-mono leading-relaxed"
        spellCheck={false}
      />
    </div>
  );
}
