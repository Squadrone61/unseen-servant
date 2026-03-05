"use client";

import { useState } from "react";

interface CampaignInfo {
  slug: string;
  name: string;
  lastPlayedAt: string;
  sessionCount: number;
}

interface CampaignSelectorProps {
  campaigns: CampaignInfo[];
  activeCampaignSlug?: string;
  activeCampaignName?: string;
  onSelectCampaign: (slug: string) => void;
  onCreateCampaign: (name: string) => void;
}

export function CampaignSelector({
  campaigns,
  activeCampaignSlug,
  activeCampaignName,
  onSelectCampaign,
  onCreateCampaign,
}: CampaignSelectorProps) {
  const [showNewInput, setShowNewInput] = useState(false);
  const [newName, setNewName] = useState("");

  const handleCreate = () => {
    if (!newName.trim()) return;
    onCreateCampaign(newName.trim());
    setNewName("");
    setShowNewInput(false);
  };

  return (
    <div className="space-y-2">
      {/* Current campaign display */}
      {activeCampaignName ? (
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
          <span className="text-sm text-emerald-400 font-medium truncate">
            {activeCampaignName}
          </span>
        </div>
      ) : (
        <div className="text-sm text-gray-500 italic">No campaign loaded</div>
      )}

      {/* Campaign dropdown */}
      {campaigns.length > 0 && (
        <select
          value={activeCampaignSlug || ""}
          onChange={(e) => {
            if (e.target.value) {
              onSelectCampaign(e.target.value);
            }
          }}
          className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5
                     text-sm text-gray-200 focus:outline-none focus:ring-1
                     focus:ring-purple-500"
        >
          <option value="">Select campaign...</option>
          {campaigns.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.name} ({c.sessionCount} sessions)
            </option>
          ))}
        </select>
      )}

      {/* New campaign */}
      {showNewInput ? (
        <div className="flex gap-1.5">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            placeholder="Campaign name..."
            autoFocus
            className="flex-1 bg-gray-900 border border-gray-700 rounded px-2 py-1.5
                       text-sm text-gray-100 placeholder-gray-500 focus:outline-none
                       focus:ring-1 focus:ring-purple-500 min-w-0"
          />
          <button
            onClick={handleCreate}
            disabled={!newName.trim()}
            className="text-xs bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/40
                       disabled:opacity-30 px-2 py-1.5 rounded transition-colors shrink-0"
          >
            Create
          </button>
          <button
            onClick={() => {
              setShowNewInput(false);
              setNewName("");
            }}
            className="text-xs text-gray-500 hover:text-gray-300 px-1 transition-colors shrink-0"
          >
            &times;
          </button>
        </div>
      ) : (
        <button
          onClick={() => setShowNewInput(true)}
          className="text-xs text-purple-400 hover:text-purple-300 transition-colors"
        >
          + New Campaign
        </button>
      )}
    </div>
  );
}
