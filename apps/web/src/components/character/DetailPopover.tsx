"use client";

import { useEffect, useLayoutEffect, useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";

interface DetailPopoverProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  position: { x: number; y: number };
  /** Optional sticky footer rendered below scrollable content */
  footer?: React.ReactNode;
}

export function DetailPopover({ title, onClose, children, position, footer }: DetailPopoverProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ left: number; top: number } | null>(null);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose],
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // Click-outside detection
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    // Delay to avoid closing from the same click that opened it
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
    }, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [onClose]);

  // Measure actual card size after render and position within viewport
  useLayoutEffect(() => {
    const card = cardRef.current;
    if (!card) return;

    const margin = 12;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const rect = card.getBoundingClientRect();
    const cardWidth = rect.width;
    const cardHeight = rect.height;

    // Try placing to the right of click, flip left if it overflows
    let left = position.x + margin;
    if (left + cardWidth > vw - margin) {
      left = position.x - cardWidth - margin;
    }
    left = Math.max(margin, Math.min(left, vw - cardWidth - margin));

    // Try placing below click, flip above if it overflows
    let top = position.y + margin;
    if (top + cardHeight > vh - margin) {
      top = position.y - cardHeight - margin;
    }
    // Final clamp: ensure card stays fully within viewport
    top = Math.max(margin, Math.min(top, vh - cardHeight - margin));

    setCoords({ left, top });
  }, [position]);

  return (
    <div
      ref={cardRef}
      className="fixed z-50 bg-gray-800/60 border border-gray-700/40 rounded-lg shadow-xl max-w-sm w-[384px] max-h-[70vh] flex flex-col backdrop-blur-sm"
      style={{
        left: coords?.left ?? -9999,
        top: coords?.top ?? -9999,
        visibility: coords ? "visible" : "hidden",
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700/40 shrink-0">
        <h3
          className="text-base font-semibold text-amber-200/90 pr-2"
          style={{ fontFamily: "var(--font-cinzel)" }}
        >
          {title}
        </h3>
        <Button variant="icon" onClick={onClose} className="shrink-0">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </Button>
      </div>

      {/* Scrollable content */}
      <div className="overflow-y-auto p-4">{children}</div>

      {/* Optional sticky footer */}
      {footer && <div className="shrink-0 border-t border-gray-700/40 px-4 py-3">{footer}</div>}
    </div>
  );
}
