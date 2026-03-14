"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/Button";

const VOLUME_KEY = "unseen-tts-volume";

function loadVolume(): number {
  if (typeof window === "undefined") return 1.0;
  const stored = localStorage.getItem(VOLUME_KEY);
  if (stored !== null) {
    const v = parseFloat(stored);
    if (!isNaN(v) && v >= 0 && v <= 1) return v;
  }
  return 1.0;
}

interface SettingsModalProps {
  onClose: () => void;
  isHost: boolean;
  onSetPassword?: (password: string) => void;
  onDestroyRoom?: () => void;
}

export function SettingsModal({ onClose, isHost, onSetPassword, onDestroyRoom }: SettingsModalProps) {
  const [volume, setVolume] = useState(loadVolume);
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordSet, setPasswordSet] = useState(false);

  // Close on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const handleVolumeChange = (v: number) => {
    const clamped = Math.max(0, Math.min(1, v));
    setVolume(clamped);
    localStorage.setItem(VOLUME_KEY, String(clamped));
  };

  const handleSetPassword = () => {
    if (!passwordInput.trim() || !onSetPassword) return;
    onSetPassword(passwordInput.trim());
    setPasswordSet(true);
    setPasswordInput("");
  };

  const handleRemovePassword = () => {
    if (!onSetPassword) return;
    onSetPassword("");
    setPasswordSet(false);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-gray-800/60 rounded-xl w-full max-w-sm flex flex-col mx-4 border border-gray-700/40 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700/40">
          <h2
            className="text-base font-semibold text-amber-200/90"
            style={{ fontFamily: "var(--font-cinzel)" }}
          >
            Settings
          </h2>
          <Button variant="icon" onClick={onClose}>
            <span className="text-lg leading-none">&times;</span>
          </Button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {/* Narration Volume */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm text-gray-300 font-medium">
                Narration Volume
              </label>
              <span className="text-xs text-gray-500 font-mono tabular-nums">
                {Math.round(volume * 100)}%
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={volume}
              onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
              className="w-full h-1.5 accent-amber-500 cursor-pointer"
              aria-label="Narration volume"
            />
          </div>

          {/* Host Section */}
          {isHost && (onSetPassword || onDestroyRoom) && (
            <>
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-gradient-to-r from-transparent via-amber-500/20 to-transparent" />
                <span className="text-sm text-gray-500 uppercase tracking-wider" style={{ fontFamily: "var(--font-cinzel)" }}>Host</span>
                <div className="flex-1 h-px bg-gradient-to-r from-transparent via-amber-500/20 to-transparent" />
              </div>

              {/* Room Password */}
              {onSetPassword && (
                <div>
                  <div className="text-sm text-gray-500 uppercase tracking-wider mb-2">
                    Room Password
                  </div>
                  {passwordSet ? (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-sm text-yellow-400">
                        <span>&#128274;</span>
                        <span>Password set</span>
                      </div>
                      <Button
                        variant="danger"
                        size="xs"
                        onClick={handleRemovePassword}
                      >
                        Remove
                      </Button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={passwordInput}
                        onChange={(e) => setPasswordInput(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleSetPassword()}
                        placeholder="Set password..."
                        className="flex-1 bg-gray-900/60 border border-gray-700/40 rounded px-2 py-1.5
                                   text-sm text-gray-100 placeholder-gray-500 focus:outline-none
                                   focus:ring-1 focus:ring-amber-500/50 focus:border-amber-500/30 min-w-0"
                      />
                      <Button
                        size="xs"
                        onClick={handleSetPassword}
                        disabled={!passwordInput.trim()}
                      >
                        Set
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {/* Destroy Room */}
              {onDestroyRoom && (
                <Button
                  variant="danger"
                  size="md"
                  fullWidth
                  onClick={() => {
                    if (
                      window.confirm(
                        "Are you sure you want to destroy this room? All data will be permanently deleted and all players will be disconnected."
                      )
                    ) {
                      onDestroyRoom();
                    }
                  }}
                >
                  Destroy Room
                </Button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
