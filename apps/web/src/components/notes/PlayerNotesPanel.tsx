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
      className="fixed z-40 flex flex-col rounded-xl border border-gray-700/50 bg-gray-900/80 shadow-2xl backdrop-blur-sm"
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
        className="flex items-center justify-between border-b border-gray-700/50 px-4 py-2.5 select-none"
      >
        <div className="flex items-center gap-2">
          <span className="font-cinzel text-sm font-medium tracking-wide text-gray-200">Notes</span>
          <span
            className={`rounded-full px-1.5 py-0.5 text-xs ${
              saveState === "saved"
                ? "bg-green-400/10 text-green-400/70"
                : saveState === "saving"
                  ? "bg-yellow-400/10 text-yellow-400/70"
                  : "bg-gray-700 text-gray-500"
            }`}
          >
            {saveState === "saved" ? "Saved" : saveState === "saving" ? "Saving..." : "Unsaved"}
          </span>
        </div>
        <button
          onClick={onClose}
          onMouseDown={(e) => e.stopPropagation()}
          className="text-lg leading-none text-gray-500 transition-colors hover:text-gray-300"
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
        className={`flex-1 resize-none overflow-y-auto bg-transparent px-4 py-3
                   font-mono text-sm leading-relaxed text-gray-300 placeholder-gray-600 focus:outline-none
                   ${isInteracting ? "pointer-events-none" : ""}`}
        spellCheck={false}
      />

      {/* Resize handles — edges */}
      <div {...resizeHandleProps("n")} className="absolute top-0 right-2 left-2 h-1.5" />
      <div {...resizeHandleProps("s")} className="absolute right-2 bottom-0 left-2 h-1.5" />
      <div {...resizeHandleProps("w")} className="absolute top-2 bottom-2 left-0 w-1.5" />
      <div {...resizeHandleProps("e")} className="absolute top-2 right-0 bottom-2 w-1.5" />

      {/* Resize handles — corners */}
      <div {...resizeHandleProps("nw")} className="absolute top-0 left-0 h-3 w-3" />
      <div {...resizeHandleProps("ne")} className="absolute top-0 right-0 h-3 w-3" />
      <div {...resizeHandleProps("sw")} className="absolute bottom-0 left-0 h-3 w-3" />
      <div
        {...resizeHandleProps("se")}
        className="absolute right-0 bottom-0 flex h-4 w-4 items-end justify-end pr-1 pb-1"
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
