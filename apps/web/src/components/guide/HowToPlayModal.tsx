"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { GuideSidebar } from "./GuideSidebar";
import { GuideContent } from "./GuideContent";

interface HowToPlayModalProps {
  onClose: () => void;
}

export function HowToPlayModal({ onClose }: HowToPlayModalProps) {
  const [activeTopicId, setActiveTopicId] = useState("character");

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-gray-800/95 backdrop-blur-sm rounded-xl w-full max-w-3xl h-[80vh] flex flex-col mx-4 border border-gray-700/40 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700/40">
          <div>
            <h2
              className="text-base font-semibold text-amber-200/90"
              style={{
                fontFamily: "var(--font-cinzel)",
                textShadow: "0 0 20px rgba(245,158,11,0.15)",
              }}
            >
              Tome of Knowledge
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">How to play Unseen Servant</p>
          </div>
          <Button variant="icon" onClick={onClose}>
            <span className="text-lg leading-none">&times;</span>
          </Button>
        </div>

        {/* Body: Sidebar + Content */}
        <div className="flex-1 flex min-h-0">
          <GuideSidebar activeTopicId={activeTopicId} onSelectTopic={setActiveTopicId} />
          <GuideContent activeTopicId={activeTopicId} />
        </div>
      </div>
    </div>
  );
}
