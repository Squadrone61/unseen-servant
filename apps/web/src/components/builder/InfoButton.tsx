"use client";

/**
 * Small info icon button for opening detail popovers.
 * Calls e.stopPropagation() to avoid triggering parent card selection.
 */
export function InfoButton({
  onClick,
  className = "",
}: {
  onClick: (e: React.MouseEvent) => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick(e);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.stopPropagation();
          onClick(e as unknown as React.MouseEvent);
        }
      }}
      className={`shrink-0 w-5 h-5 rounded-full border border-gray-600/40 bg-gray-800/60 flex items-center justify-center text-gray-500 hover:text-amber-400 hover:border-amber-500/40 transition-colors ${className}`}
      title="View details"
      aria-label="View details"
    >
      <svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3" aria-hidden="true">
        <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1Zm0 2.5a1 1 0 1 1 0 2 1 1 0 0 1 0-2ZM6.75 7h1.5v4.5h-1.5V7Z" />
      </svg>
    </button>
  );
}
