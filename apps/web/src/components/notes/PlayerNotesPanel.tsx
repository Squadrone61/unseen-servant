"use client";

import { usePanelGeometry } from "../../hooks/usePanelGeometry";

interface PlayerNotesPanelProps {
  notes: string;
  saveState: "saved" | "saving" | "unsaved";
  onChange: (content: string) => void;
  onClose: () => void;
}

export function PlayerNotesPanel({ notes, saveState, onChange, onClose }: PlayerNotesPanelProps) {
  const { geometry, dragHandleProps, resizeHandleProps, isInteracting } = usePanelGeometry();

  return (
    <div
      className="fixed z-40 flex flex-col bg-gray-900/80 backdrop-blur-sm border border-gray-700/50 rounded-xl shadow-2xl"
      style={{
        left: geometry.x,
        top: geometry.y,
        width: geometry.width,
        height: geometry.height,
      }}
    >
      {/* Header — drag handle */}
      <div
        {...dragHandleProps}
        className="flex items-center justify-between px-4 py-2.5 border-b border-gray-700/50 select-none"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-200 font-cinzel tracking-wide">Notes</span>
          <span
            className={`text-xs px-1.5 py-0.5 rounded-full ${
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
          onMouseDown={(e) => e.stopPropagation()}
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
        className={`flex-1 px-4 py-3 bg-transparent text-sm text-gray-300
                   placeholder-gray-600 resize-none focus:outline-none font-mono leading-relaxed overflow-y-auto
                   ${isInteracting ? "pointer-events-none" : ""}`}
        spellCheck={false}
      />

      {/* Resize handles — edges */}
      <div {...resizeHandleProps("n")} className="absolute top-0 left-2 right-2 h-1.5" />
      <div {...resizeHandleProps("s")} className="absolute bottom-0 left-2 right-2 h-1.5" />
      <div {...resizeHandleProps("w")} className="absolute left-0 top-2 bottom-2 w-1.5" />
      <div {...resizeHandleProps("e")} className="absolute right-0 top-2 bottom-2 w-1.5" />

      {/* Resize handles — corners */}
      <div {...resizeHandleProps("nw")} className="absolute top-0 left-0 w-3 h-3" />
      <div {...resizeHandleProps("ne")} className="absolute top-0 right-0 w-3 h-3" />
      <div {...resizeHandleProps("sw")} className="absolute bottom-0 left-0 w-3 h-3" />
      <div
        {...resizeHandleProps("se")}
        className="absolute bottom-0 right-0 w-4 h-4 flex items-end justify-end pr-1 pb-1"
      >
        {/* Visible grip icon */}
        <svg width="8" height="8" viewBox="0 0 8 8" className="text-gray-500">
          <path
            d="M6 0v2H4V0h2zm0 4v2H4V4h2zM2 4v2H0V4h2zm4 0z"
            fill="currentColor"
            opacity="0.6"
          />
          <path d="M6 4v2H4V4h2zM2 4v2H0V4h2zM2 0v2H0V0h2z" fill="currentColor" opacity="0.3" />
        </svg>
      </div>
    </div>
  );
}
