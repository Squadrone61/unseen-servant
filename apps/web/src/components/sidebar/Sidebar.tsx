"use client";

import { useState, useEffect, useRef } from "react";
import { formatClassString, getTotalLevel } from "@aidnd/shared/utils";
import type {
  CharacterData,
  CombatState,
  GameEvent,
  PlayerInfo,
  ServerMessage,
} from "@aidnd/shared/types";
import { CharacterPopover } from "@/components/character/CharacterPopover";

interface SidebarProps {
  roomCode: string;
  players: string[];
  allPlayers: PlayerInfo[];
  hostName: string;
  dmConnected: boolean;
  isHost: boolean;
  logMessages: ServerMessage[];
  partyCharacters: Record<string, CharacterData>;
  storyStarted: boolean;
  combatState?: CombatState | null;
  eventLog?: GameEvent[];
  campaignConfigured?: boolean;
  activeCampaignName?: string;
  onKick: (playerName: string) => void;
  onStartStory: () => void;
  onRollback?: (eventId: string) => void;
  onDestroyRoom?: () => void;
  onSetPassword?: (password: string) => void;
  onOpenCampaignConfig?: () => void;
  onToggleNotes?: () => void;
  showNotes?: boolean;
}

export function Sidebar({
  roomCode,
  players,
  allPlayers,
  hostName,
  dmConnected,
  isHost,
  logMessages,
  partyCharacters,
  storyStarted,
  combatState,
  eventLog,
  campaignConfigured,
  activeCampaignName,
  onKick,
  onStartStory,
  onRollback,
  onDestroyRoom,
  onSetPassword,
  onOpenCampaignConfig,
  onToggleNotes,
  showNotes,
}: SidebarProps) {
  const [logCollapsed, setLogCollapsed] = useState(false);
  const [eventLogCollapsed, setEventLogCollapsed] = useState(true);
  const [copied, setCopied] = useState(false);
  const [hoveredPlayer, setHoveredPlayer] = useState<string | null>(null);
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordSet, setPasswordSet] = useState(false);
  const [confirmingRollbackId, setConfirmingRollbackId] = useState<string | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);
  const rollbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-scroll activity log
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logMessages]);

  const copyRoomCode = async () => {
    await navigator.clipboard.writeText(roomCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRollbackClick = (eventId: string) => {
    if (rollbackTimeoutRef.current) clearTimeout(rollbackTimeoutRef.current);
    setConfirmingRollbackId(eventId);
    rollbackTimeoutRef.current = setTimeout(() => {
      setConfirmingRollbackId(null);
    }, 3000);
  };

  const handleRollbackConfirm = (eventId: string) => {
    if (rollbackTimeoutRef.current) clearTimeout(rollbackTimeoutRef.current);
    setConfirmingRollbackId(null);
    onRollback?.(eventId);
  };

  const handleRollbackCancel = () => {
    if (rollbackTimeoutRef.current) clearTimeout(rollbackTimeoutRef.current);
    setConfirmingRollbackId(null);
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

  // Use allPlayers if available, otherwise fall back to online-only players list
  const displayPlayers: PlayerInfo[] =
    allPlayers.length > 0
      ? allPlayers
      : players.map((name) => ({
          name,
          online: true,
          isHost: name === hostName,
        }));

  return (
    <div className="w-72 border-l border-gray-700 flex flex-col bg-gray-850 shrink-0">
      {/* Room Code */}
      <div className="p-4 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <div className="text-xs text-gray-500 uppercase tracking-wider">
            Room Code
          </div>
          {isHost && (
            <span className="text-[10px] bg-purple-600/30 text-purple-400 px-1.5 py-0.5 rounded-full font-medium uppercase tracking-wider">
              Host
            </span>
          )}
        </div>
        <button
          onClick={copyRoomCode}
          className="text-2xl font-mono font-bold text-purple-400 tracking-widest mt-1
                     hover:text-purple-300 transition-colors"
          title="Click to copy"
        >
          {roomCode}
        </button>
        {copied && (
          <span className="text-xs text-green-400 ml-2">Copied!</span>
        )}
      </div>

      {/* Password Management (Host only) */}
      {isHost && onSetPassword && (
        <div className="p-4 border-b border-gray-700">
          <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">
            Room Password
          </div>
          {passwordSet ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-sm text-yellow-400">
                <span>&#128274;</span>
                <span>Password set</span>
              </div>
              <button
                onClick={handleRemovePassword}
                className="text-xs text-red-400/60 hover:text-red-400 transition-colors"
              >
                Remove
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <input
                type="text"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSetPassword()}
                placeholder="Set password..."
                className="flex-1 bg-gray-900 border border-gray-700 rounded px-2 py-1.5
                           text-sm text-gray-100 placeholder-gray-500 focus:outline-none
                           focus:ring-1 focus:ring-purple-500 min-w-0"
              />
              <button
                onClick={handleSetPassword}
                disabled={!passwordInput.trim()}
                className="text-xs bg-purple-600/20 text-purple-400 hover:bg-purple-600/40
                           disabled:opacity-30 disabled:hover:bg-purple-600/20
                           px-2.5 py-1.5 rounded transition-colors shrink-0"
              >
                Set
              </button>
            </div>
          )}
        </div>
      )}

      {/* Players */}
      <div className="p-4 border-b border-gray-700">
        <div className="text-xs text-gray-500 uppercase tracking-wider mb-3">
          Party ({displayPlayers.length})
        </div>
        {displayPlayers.length === 0 ? (
          <p className="text-sm text-gray-600">No players yet...</p>
        ) : (
          <ul className="space-y-2">
            {displayPlayers.map((player) => {
              const charData = partyCharacters[player.name];
              return (
                <li
                  key={player.name}
                  className="relative flex items-center gap-2 text-sm group"
                  onMouseEnter={() => setHoveredPlayer(player.name)}
                  onMouseLeave={() => setHoveredPlayer(null)}
                >
                  <div
                    className={`w-2 h-2 rounded-full shrink-0 ${
                      player.online ? "bg-green-500" : "bg-gray-600"
                    }`}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`truncate ${
                          player.online ? "text-gray-200" : "text-gray-500"
                        }`}
                      >
                        {player.name}
                      </span>
                      {player.isHost && (
                        <span className="text-[10px] text-purple-400 shrink-0">
                          (host)
                        </span>
                      )}
                      {!player.online && (
                        <span className="text-[10px] text-gray-600 shrink-0">
                          (offline)
                        </span>
                      )}
                    </div>
                    {charData && (
                      <div
                        className={`text-[10px] ${
                          player.online ? "text-gray-500" : "text-gray-600"
                        }`}
                      >
                        {formatClassString(charData.static.classes)} &middot;
                        Lvl {getTotalLevel(charData.static.classes)}
                      </div>
                    )}
                  </div>
                  {isHost && !player.isHost && player.online && (
                    <button
                      onClick={() => onKick(player.name)}
                      className="text-xs text-red-400/60 hover:text-red-400
                                 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                      title="Kick player"
                    >
                      Kick
                    </button>
                  )}

                  {/* Character Popover */}
                  {hoveredPlayer === player.name && charData && (
                    <div className="absolute right-full top-0 mr-2 z-50">
                      <CharacterPopover
                        character={charData}
                        playerName={player.name}
                        online={player.online}
                      />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Campaign & Start Story (Host only, before story starts) */}
      {isHost && !storyStarted && (
        <div className="p-4 border-b border-gray-700 space-y-2">
          {campaignConfigured && activeCampaignName ? (
            <>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                <span className="text-sm text-emerald-400 font-medium truncate">
                  {activeCampaignName}
                </span>
              </div>
              {dmConnected && (
                <>
                  <button
                    onClick={onStartStory}
                    className="w-full bg-purple-600 hover:bg-purple-700 text-white py-2.5 rounded-lg
                               font-medium transition-colors text-sm flex items-center justify-center gap-2"
                  >
                    <span className="text-lg">&#9876;</span>
                    Begin the Adventure
                  </button>
                  <p className="text-[10px] text-gray-600 text-center">
                    This will introduce the party and start the story
                  </p>
                </>
              )}
            </>
          ) : (
            <button
              onClick={onOpenCampaignConfig}
              disabled={!dmConnected}
              className="w-full bg-gray-700 hover:bg-gray-600 disabled:opacity-40
                         disabled:hover:bg-gray-700 text-gray-200 py-2.5 rounded-lg
                         font-medium transition-colors text-sm"
            >
              Configure Campaign
            </button>
          )}
        </div>
      )}

      {/* Active campaign label (after story started) */}
      {storyStarted && activeCampaignName && (
        <div className="px-4 py-2 border-b border-gray-700">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
            <span className="text-xs text-emerald-400/80 font-medium truncate">
              {activeCampaignName}
            </span>
          </div>
        </div>
      )}

      {/* Notes toggle (visible when campaign is active) */}
      {activeCampaignName && onToggleNotes && (
        <div className="px-4 py-2 border-b border-gray-700">
          <button
            onClick={onToggleNotes}
            className={`w-full flex items-center gap-2 text-sm py-1.5 px-2 rounded-lg transition-colors ${
              showNotes
                ? "bg-purple-600/20 text-purple-400"
                : "text-gray-400 hover:text-gray-200 hover:bg-gray-700/50"
            }`}
          >
            <span className="text-base">&#128221;</span>
            <span>Notes</span>
          </button>
        </div>
      )}

      {/* Activity Log */}
      <div className="border-b border-gray-700 flex flex-col min-h-0 flex-1">
        <button
          onClick={() => setLogCollapsed(!logCollapsed)}
          className="flex items-center gap-1 p-4 pb-2 w-full text-left"
        >
          <span
            className={`text-[10px] text-gray-600 transition-transform ${logCollapsed ? "" : "rotate-90"}`}
          >
            &#9654;
          </span>
          <span className="text-xs text-gray-500 uppercase tracking-wider">
            Activity Log
          </span>
          {logMessages.length > 0 && (
            <span className="text-[10px] text-gray-600 ml-auto">
              {logMessages.length}
            </span>
          )}
        </button>
        {!logCollapsed && (
          <div className="px-4 pb-3 overflow-y-auto flex-1 space-y-1">
            {logMessages.length === 0 ? (
              <p className="text-xs text-gray-600 italic">No activity yet</p>
            ) : (
              logMessages.map((msg, i) => (
                <div
                  key={i}
                  className={`text-xs ${
                    msg.type === "server:error"
                      ? "text-red-400"
                      : "text-gray-500"
                  }`}
                >
                  {msg.type === "server:error" && "message" in msg
                    ? `Error: ${msg.message}`
                    : "content" in msg
                      ? msg.content
                      : ""}
                </div>
              ))
            )}
            <div ref={logEndRef} />
          </div>
        )}
      </div>

      {/* Event Log (Host only) */}
      {isHost && eventLog && eventLog.length > 0 && (
        <div className="border-b border-gray-700 flex flex-col min-h-0">
          <button
            onClick={() => setEventLogCollapsed(!eventLogCollapsed)}
            className="flex items-center gap-1 p-4 pb-2 w-full text-left"
          >
            <span
              className={`text-[10px] text-gray-600 transition-transform ${eventLogCollapsed ? "" : "rotate-90"}`}
            >
              &#9654;
            </span>
            <span className="text-xs text-gray-500 uppercase tracking-wider">
              Event Log
            </span>
            <span className="text-[10px] text-gray-600 ml-auto">
              {eventLog.length}
            </span>
          </button>
          {!eventLogCollapsed && (
            <div className="px-4 pb-3 overflow-y-auto max-h-48 space-y-1.5">
              {eventLog.slice(-20).map((event) => (
                <div
                  key={event.id}
                  className="flex items-start gap-1.5 text-xs group"
                >
                  <div className="flex-1 text-gray-400 min-w-0">
                    <span className="text-gray-600">
                      {event.type.replace(/_/g, " ")}
                    </span>
                    {" — "}
                    <span>{event.description}</span>
                  </div>
                  {onRollback && (
                    confirmingRollbackId === event.id ? (
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => handleRollbackConfirm(event.id)}
                          className="text-[10px] text-red-400 font-medium shrink-0"
                        >
                          Confirm?
                        </button>
                        <button
                          onClick={handleRollbackCancel}
                          className="text-[10px] text-gray-500 hover:text-gray-300 shrink-0"
                          title="Cancel rollback"
                        >
                          &times;
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleRollbackClick(event.id)}
                        className="text-[10px] text-red-400/60 hover:text-red-400
                                   opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                        title="Rollback to before this event"
                      >
                        Undo
                      </button>
                    )
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* DM Status */}
      <div className="px-4 py-3 border-t border-gray-700">
        {dmConnected ? (
          <div className="text-sm text-green-400 flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-green-500" />
            <span>DM Connected</span>
          </div>
        ) : (
          <div className="text-sm text-yellow-400 flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse" />
            <span>Waiting for DM...</span>
          </div>
        )}
      </div>

      {/* Destroy Room — host only */}
      {isHost && onDestroyRoom && (
        <div className="border-t border-red-900/30">
          <button
            onClick={() => {
              if (
                window.confirm(
                  "Are you sure you want to destroy this room? All data will be permanently deleted and all players will be disconnected."
                )
              ) {
                onDestroyRoom();
              }
            }}
            className="w-full px-3 py-2 text-sm font-medium text-red-400 bg-red-950/40 border border-red-800/50 rounded-lg hover:bg-red-900/50 hover:text-red-300 transition-colors"
          >
            Destroy Room
          </button>
        </div>
      )}
    </div>
  );
}
