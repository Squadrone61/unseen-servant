"use client";

import { useState, useEffect } from "react";
import type { EncounterLength, PacingProfile } from "@aidnd/shared/types";

interface CampaignInfo {
  slug: string;
  name: string;
  lastPlayedAt: string;
  sessionCount: number;
}

interface CampaignConfigModalProps {
  campaigns: CampaignInfo[];
  onSubmit: (config: {
    campaignName: string;
    systemPrompt?: string;
    pacingProfile: PacingProfile;
    encounterLength: EncounterLength;
    existingCampaignSlug?: string;
  }) => void;
  onClose: () => void;
}

export function CampaignConfigModal({
  campaigns,
  onSubmit,
  onClose,
}: CampaignConfigModalProps) {
  const [mode, setMode] = useState<"new" | "existing">(
    campaigns.length > 0 ? "existing" : "new"
  );
  const [campaignName, setCampaignName] = useState("");
  const [selectedSlug, setSelectedSlug] = useState(campaigns[0]?.slug || "");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [pacingProfile, setPacingProfile] = useState<PacingProfile>("balanced");
  const [encounterLength, setEncounterLength] =
    useState<EncounterLength>("standard");
  const [showPrompt, setShowPrompt] = useState(false);

  const hasCustomPrompt = systemPrompt.trim().length > 0;

  // Close on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const handleSubmit = () => {
    if (mode === "new" && !campaignName.trim()) return;
    if (mode === "existing" && !selectedSlug) return;

    const name =
      mode === "existing"
        ? campaigns.find((c) => c.slug === selectedSlug)?.name || selectedSlug
        : campaignName.trim();

    onSubmit({
      campaignName: name,
      systemPrompt: hasCustomPrompt ? systemPrompt : undefined,
      pacingProfile,
      encounterLength,
      existingCampaignSlug: mode === "existing" ? selectedSlug : undefined,
    });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-gray-800 rounded-xl w-full max-w-lg max-h-[85vh] flex flex-col mx-4 border border-gray-700 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700">
          <div>
            <h2 className="text-base font-semibold text-gray-200">
              Configure Campaign
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Set up your campaign before starting the adventure
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 transition-colors text-lg leading-none px-1"
          >
            &times;
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Campaign Selection */}
          <div className="space-y-2">
            {campaigns.length > 0 && (
              <div className="flex gap-2">
                <button
                  onClick={() => setMode("existing")}
                  className={`flex-1 py-1.5 text-sm rounded-lg border transition-colors ${
                    mode === "existing"
                      ? "border-purple-500 bg-purple-600/20 text-purple-300"
                      : "border-gray-700 text-gray-400 hover:border-gray-600"
                  }`}
                >
                  Load Existing
                </button>
                <button
                  onClick={() => setMode("new")}
                  className={`flex-1 py-1.5 text-sm rounded-lg border transition-colors ${
                    mode === "new"
                      ? "border-purple-500 bg-purple-600/20 text-purple-300"
                      : "border-gray-700 text-gray-400 hover:border-gray-600"
                  }`}
                >
                  New Campaign
                </button>
              </div>
            )}

            {mode === "existing" && campaigns.length > 0 ? (
              <select
                value={selectedSlug}
                onChange={(e) => setSelectedSlug(e.target.value)}
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2
                           text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-purple-500"
              >
                {campaigns.map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {c.name} ({c.sessionCount} sessions)
                  </option>
                ))}
              </select>
            ) : (
              <div>
                <label className="text-[11px] text-gray-500 block mb-1">
                  Campaign Name
                </label>
                <input
                  type="text"
                  value={campaignName}
                  onChange={(e) => setCampaignName(e.target.value)}
                  placeholder="e.g. The Lost Mines of Phandelver"
                  autoFocus
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2
                             text-sm text-gray-100 placeholder-gray-500 focus:outline-none
                             focus:ring-1 focus:ring-purple-500"
                />
              </div>
            )}
          </div>

          {/* Pacing */}
          <div>
            <label className="text-[11px] text-gray-500 block mb-1">
              Pacing
            </label>
            <select
              value={pacingProfile}
              onChange={(e) =>
                setPacingProfile(e.target.value as PacingProfile)
              }
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2
                         text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-purple-500"
            >
              <option value="story-heavy">Story-Heavy</option>
              <option value="balanced">Balanced</option>
              <option value="combat-heavy">Combat-Heavy</option>
            </select>
          </div>

          {/* Encounter Length */}
          <div>
            <label className="text-[11px] text-gray-500 block mb-1">
              Encounter Length
            </label>
            <select
              value={encounterLength}
              onChange={(e) =>
                setEncounterLength(e.target.value as EncounterLength)
              }
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2
                         text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-purple-500"
            >
              <option value="quick">Quick</option>
              <option value="standard">Standard</option>
              <option value="epic">Epic</option>
            </select>
          </div>

          {/* Custom DM Instructions Toggle */}
          <div>
            <button
              onClick={() => setShowPrompt(!showPrompt)}
              className="flex items-center gap-2 text-sm text-gray-400 hover:text-gray-200 transition-colors"
            >
              <span
                className={`text-[10px] text-gray-600 transition-transform ${showPrompt ? "rotate-90" : ""}`}
              >
                &#9654;
              </span>
              <span>Custom DM Instructions</span>
              {hasCustomPrompt && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-yellow-600/20 text-yellow-400">
                  Custom
                </span>
              )}
            </button>
            {showPrompt && (
              <div className="mt-2 space-y-2">
                <textarea
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  placeholder="e.g. Use a dark gothic horror tone. NPCs speak in riddles. Be generous with loot..."
                  className="w-full h-48 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2
                             text-sm text-gray-200 font-mono leading-relaxed resize-y
                             placeholder-gray-600
                             focus:outline-none focus:ring-1 focus:ring-purple-500"
                  spellCheck={false}
                />
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>{systemPrompt.length.toLocaleString()} characters</span>
                  {hasCustomPrompt && (
                    <button
                      onClick={() => setSystemPrompt("")}
                      className="text-gray-400 hover:text-gray-200 transition-colors"
                    >
                      Clear Custom Instructions
                    </button>
                  )}
                </div>
                <p className="text-[11px] text-gray-600 leading-relaxed">
                  These are added on top of the default DM rules (combat, dice, identity, etc.).
                  Leave empty to use defaults only.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-700">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={mode === "new" && !campaignName.trim()}
            className="px-5 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-40
                       disabled:hover:bg-purple-600 text-white text-sm rounded-lg
                       font-medium transition-colors"
          >
            Configure
          </button>
        </div>
      </div>
    </div>
  );
}
