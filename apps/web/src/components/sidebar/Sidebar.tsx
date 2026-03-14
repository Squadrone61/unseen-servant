"use client";

import { useState, useEffect, useRef } from "react";
import { formatClassString, getTotalLevel } from "@unseen-servant/shared/utils";
import type {
  CharacterData,
  CombatState,
  GameEvent,
  PlayerInfo,
  ServerMessage,
} from "@unseen-servant/shared/types";
import { CharacterPopover } from "@/components/character/CharacterPopover";
import { Button } from "@/components/ui/Button";
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
  connectionState?: string;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  onKick: (playerName: string) => void;
  onStartStory: () => void;
  onRollback?: (eventId: string) => void;
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
  connectionState,
  collapsed,
  onToggleCollapse,
  onKick,
  onStartStory,
  onRollback,
  onOpenCampaignConfig,
  onToggleNotes,
  showNotes,
}: SidebarProps) {
  const [logCollapsed, setLogCollapsed] = useState(false);
  const [eventLogCollapsed, setEventLogCollapsed] = useState(true);
  const [copied, setCopied] = useState(false);
  const [hoveredPlayer, setHoveredPlayer] = useState<string | null>(null);
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

  // Use allPlayers if available, otherwise fall back to online-only players list
  const displayPlayers: PlayerInfo[] =
    allPlayers.length > 0
      ? allPlayers
      : players.map((name) => ({
          name,
          online: true,
          isHost: name === hostName,
        }));

  // Collapsed sidebar — thin strip with expand button + DM status dot
  if (collapsed) {
    return (
      <div className="w-10 border-l border-gray-700/40 flex flex-col items-center bg-gray-800/60 shrink-0 py-3 gap-3">
        <Button variant="icon" onClick={onToggleCollapse} title="Expand sidebar">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M10 4L6 8L10 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Button>
        <div
          className={`w-2.5 h-2.5 rounded-full shrink-0 ${
            dmConnected ? "bg-green-500" : "bg-yellow-500 animate-pulse"
          }`}
          title={dmConnected ? "DM Connected" : "Waiting for DM..."}
        />
        {connectionState && (
          <div
            className={`w-2 h-2 rounded-full shrink-0 ${
              connectionState === "connected"
                ? "bg-green-500"
                : connectionState === "reconnecting" || connectionState === "connecting"
                  ? "bg-yellow-500 animate-pulse"
                  : "bg-red-500"
            }`}
            title={connectionState === "connected" ? "Connected" : connectionState === "reconnecting" ? "Reconnecting..." : connectionState === "connecting" ? "Connecting..." : "Disconnected"}
          />
        )}
      </div>
    );
  }

  return (
    <div className="w-72 border-l border-gray-700/40 flex flex-col bg-gray-800/60 shrink-0">
      {/* Room Code */}
      <div className="p-4 border-b border-gray-700/40">
        <div className="flex items-center gap-2">
          <div className="text-sm text-gray-500 uppercase tracking-wider" style={{ fontFamily: "var(--font-cinzel)" }}>
            Room Code
          </div>
          {isHost && (
            <span className="text-xs bg-amber-500/10 text-amber-300 border border-amber-500/50 px-1.5 py-0.5 rounded-full font-medium uppercase tracking-wider">
              Host
            </span>
          )}
          {onToggleCollapse && (
            <Button variant="icon" onClick={onToggleCollapse} title="Collapse sidebar" className="ml-auto">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M6 4L10 8L6 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Button>
          )}
        </div>
        <button
          onClick={copyRoomCode}
          className="text-2xl font-mono font-bold text-amber-300 tracking-widest mt-1
                     hover:text-amber-200 transition-colors"
          title="Click to copy"
        >
          {roomCode}
        </button>
        {copied && (
          <span className="text-xs text-green-400 ml-2">Copied!</span>
        )}
        <div className="h-px bg-gradient-to-r from-amber-500/30 via-gray-700/50 to-transparent mt-2" />
      </div>

      {/* Players */}
      <div className="p-4 border-b border-gray-700/40">
        <div className="text-sm text-gray-500 uppercase tracking-wider mb-3" style={{ fontFamily: "var(--font-cinzel)" }}>
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
                        <span className="text-xs text-amber-300 shrink-0">
                          (host)
                        </span>
                      )}
                      {!player.online && (
                        <span className="text-xs text-gray-600 shrink-0">
                          (offline)
                        </span>
                      )}
                    </div>
                    {charData && (
                      <div
                        className={`text-xs ${
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
        <div className="p-4 border-b border-gray-700/40 space-y-2">
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
                    className="w-full bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/50 text-amber-300 hover:text-amber-200 py-2.5 rounded-lg
                               font-medium transition-colors text-sm flex items-center justify-center gap-2"
                  >
                    <span className="text-lg">&#9876;</span>
                    Begin the Adventure
                  </button>
                  <p className="text-xs text-gray-600 text-center">
                    This will introduce the party and start the story
                  </p>
                </>
              )}
            </>
          ) : (
            <>
              <button
                onClick={onOpenCampaignConfig}
                disabled={!dmConnected}
                className="w-full bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30
                           disabled:opacity-40 disabled:hover:bg-amber-500/10
                           text-amber-300 py-2.5 rounded-lg
                           font-medium transition-colors text-sm"
              >
                Configure Campaign
              </button>
              {!dmConnected && (
                <p className="text-xs text-gray-600 text-center">
                  Waiting for DM to connect...
                </p>
              )}
            </>
          )}
        </div>
      )}

      {/* Active campaign label (after story started) */}
      {storyStarted && activeCampaignName && (
        <div className="px-4 py-2 border-b border-gray-700/40">
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
        <div className="px-4 py-2 border-b border-gray-700/40">
          <button
            onClick={onToggleNotes}
            className={`w-full flex items-center gap-2 text-sm py-1.5 px-2 rounded-lg transition-colors ${
              showNotes
                ? "bg-amber-500/10 text-amber-300 border border-amber-500/50"
                : "text-gray-400 hover:text-gray-200 hover:bg-gray-700/50"
            }`}
          >
            <span className="text-base">&#128221;</span>
            <span>Notes</span>
          </button>
        </div>
      )}

      {/* Activity Log */}
      <div className="border-b border-gray-700/40 flex flex-col min-h-0 flex-1">
        <button
          onClick={() => setLogCollapsed(!logCollapsed)}
          className="flex items-center gap-1 p-4 pb-2 w-full text-left"
        >
          <span
            className={`text-xs text-gray-600 transition-transform ${logCollapsed ? "" : "rotate-90"}`}
          >
            &#9654;
          </span>
          <span className="text-sm text-gray-500 uppercase tracking-wider" style={{ fontFamily: "var(--font-cinzel)" }}>
            Activity Log
          </span>
          {logMessages.length > 0 && (
            <span className="text-xs text-gray-600 ml-auto">
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
        <div className="border-b border-gray-700/40 flex flex-col min-h-0">
          <button
            onClick={() => setEventLogCollapsed(!eventLogCollapsed)}
            className="flex items-center gap-1 p-4 pb-2 w-full text-left"
          >
            <span
              className={`text-xs text-gray-600 transition-transform ${eventLogCollapsed ? "" : "rotate-90"}`}
            >
              &#9654;
            </span>
            <span className="text-sm text-gray-500 uppercase tracking-wider" style={{ fontFamily: "var(--font-cinzel)" }}>
              Event Log
            </span>
            <span className="text-xs text-gray-600 ml-auto">
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
                          className="text-xs text-red-400 font-medium shrink-0"
                        >
                          Confirm?
                        </button>
                        <button
                          onClick={handleRollbackCancel}
                          className="text-xs text-gray-500 hover:text-gray-300 shrink-0"
                          title="Cancel rollback"
                        >
                          &times;
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleRollbackClick(event.id)}
                        className="text-xs text-red-400/60 hover:text-red-400
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

      {/* DM Status + Connection */}
      <div className="px-4 py-3 border-t border-gray-700/40 space-y-1.5">
        {dmConnected ? (
          <div className="text-sm text-green-400 flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-green-500" />
            <span>DM Connected</span>
            <a
              href="https://github.com/Squadrone61/unseen-servant/releases"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-gray-500 hover:text-gray-300 underline ml-auto"
            >
              Get Launcher ↗
            </a>
          </div>
        ) : (
          <div className="text-sm text-yellow-400 flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse" />
            <span>Waiting for DM...</span>
            <a
              href="https://github.com/Squadrone61/unseen-servant/releases"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-gray-500 hover:text-gray-300 underline ml-auto"
            >
              Get Launcher ↗
            </a>
          </div>
        )}
        {connectionState && (
          <div className="flex items-center gap-1.5">
            <div
              className={`w-2 h-2 rounded-full ${
                connectionState === "connected"
                  ? "bg-green-500"
                  : connectionState === "reconnecting" || connectionState === "connecting"
                    ? "bg-yellow-500 animate-pulse"
                    : "bg-red-500"
              }`}
            />
            <span className="text-xs text-gray-500">
              {connectionState === "connected"
                ? "Connected"
                : connectionState === "reconnecting"
                  ? "Reconnecting..."
                  : connectionState === "connecting"
                    ? "Connecting..."
                    : "Disconnected"}
            </span>
          </div>
        )}
      </div>

    </div>
  );
}
