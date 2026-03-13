"use client";

import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { panelSlide } from "./animations";

interface SelectionDetailPanelProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export function SelectionDetailPanel({
  isOpen,
  onClose,
  title,
  children,
}: SelectionDetailPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Mobile backdrop */}
          <motion.div
            className="fixed inset-0 bg-gray-950/60 backdrop-blur-sm z-40 lg:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            ref={panelRef}
            variants={panelSlide}
            initial="initial"
            animate="animate"
            exit="exit"
            className="fixed right-0 top-0 bottom-0 w-[400px] max-w-[90vw] z-50 lg:sticky lg:top-0 lg:z-auto lg:w-[380px] lg:shrink-0 lg:self-start lg:max-h-[calc(100vh-140px)]"
          >
            <div className="h-full bg-gray-800/95 lg:bg-gray-800/60 border-l border-gray-700/50 lg:border lg:border-gray-700/40 lg:rounded-lg overflow-hidden flex flex-col backdrop-blur-md lg:backdrop-blur-none">
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700/40 shrink-0">
                <h3
                  className="text-sm font-semibold text-amber-300/90 truncate"
                  style={{ fontFamily: "var(--font-cinzel)" }}
                >
                  {title}
                </h3>
                <button
                  onClick={onClose}
                  className="text-gray-500 hover:text-gray-300 transition-colors p-1 -mr-1 rounded-md hover:bg-gray-700/50"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {children}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
