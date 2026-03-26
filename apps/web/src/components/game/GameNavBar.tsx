import { useState } from "react";
import { Button } from "@/components/ui/Button";

interface GameNavBarProps {
  roomCode: string;
  isHost: boolean;
  dmConnected: boolean;
  connectionState: string;
  playerCount: number;
  storyStarted: boolean;
  campaignConfigured: boolean;
  logMessageCount: number;
  eventLogCount: number;
  showNotes: boolean;
  onToggleNotes: () => void;
  onToggleActivity: () => void;
  onToggleEvents: () => void;
  onToggleParty: () => void;
  onOpenSettings: () => void;
}

export function GameNavBar({
  roomCode,
  isHost,
  dmConnected,
  connectionState,
  playerCount,
  storyStarted,
  campaignConfigured,
  logMessageCount,
  eventLogCount,
  showNotes,
  onToggleNotes,
  onToggleActivity,
  onToggleEvents,
  onToggleParty,
  onOpenSettings,
}: GameNavBarProps) {
  const [copied, setCopied] = useState(false);

  const handleCopyRoom = () => {
    navigator.clipboard.writeText(roomCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isConnected = connectionState === "connected";
  const isReconnecting = connectionState === "reconnecting" || connectionState === "connecting";
  const showPostCampaignButtons = storyStarted || campaignConfigured;

  return (
    <nav className="flex items-center justify-between h-11 px-4 bg-gray-950 border-b border-gray-700/25 shrink-0">
      {/* Left: Logo + Room Code + Host */}
      <div className="flex items-center gap-2.5">
        <Button variant="icon" href="/" title="Home">
          <img src="/icon.svg" alt="Home" className="w-4 h-4" />
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={handleCopyRoom}
          title={copied ? "Copied!" : "Click to copy room code"}
        >
          <span className="font-semibold tracking-wider">{copied ? "Copied!" : roomCode}</span>
        </Button>

        {isHost && (
          <span className="px-1.5 py-0.5 bg-amber-500/8 border border-amber-500/25 rounded text-xs font-bold tracking-wider text-amber-400/70">
            HOST
          </span>
        )}
      </div>

      {/* Center: DM Status + Connection */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <div
            className={`w-1.5 h-1.5 rounded-full ${
              dmConnected ? "bg-green-500" : "bg-yellow-500 animate-pulse"
            }`}
          />
          <span className={`text-xs ${dmConnected ? "text-gray-500" : "text-yellow-500"}`}>
            {dmConnected ? "DM Connected" : "Waiting for DM..."}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <div
            className={`w-1.5 h-1.5 rounded-full ${
              isConnected
                ? "bg-green-500"
                : isReconnecting
                  ? "bg-yellow-500 animate-pulse"
                  : "bg-red-500"
            }`}
          />
          <span
            className={`text-xs ${isConnected ? "text-gray-500" : isReconnecting ? "text-yellow-500" : "text-red-500"}`}
          >
            {isConnected ? "Server Connected" : isReconnecting ? "Reconnecting..." : "Disconnected"}
          </span>
        </div>
      </div>

      {/* Right: Action Buttons */}
      <div className="flex items-center gap-1.5">
        {showPostCampaignButtons && (
          <>
            <Button variant={showNotes ? "outline" : "secondary"} size="sm" onClick={onToggleNotes}>
              <svg
                className="w-3 h-3"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
              </svg>
              Notes
            </Button>
            <Button variant="secondary" size="sm" onClick={onToggleActivity}>
              <svg
                className="w-3 h-3"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" x2="8" y1="13" y2="13" />
                <line x1="16" x2="8" y1="17" y2="17" />
                <line x1="10" x2="8" y1="9" y2="9" />
              </svg>
              Activity
              {logMessageCount > 0 && (
                <span className="px-1 min-w-4 text-center bg-amber-500/15 text-amber-400 text-xs rounded-full">
                  {logMessageCount}
                </span>
              )}
            </Button>
            <Button variant="secondary" size="sm" onClick={onToggleEvents}>
              <svg
                className="w-3 h-3"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
                <path d="M12 7v5l4 2" />
              </svg>
              Events
              {eventLogCount > 0 && (
                <span className="px-1 min-w-4 text-center bg-amber-500/15 text-amber-400 text-xs rounded-full">
                  {eventLogCount}
                </span>
              )}
            </Button>
          </>
        )}

        <Button variant="secondary" size="sm" onClick={onToggleParty}>
          <svg
            className="w-3 h-3"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
          {playerCount}
        </Button>

        <Button variant="danger" size="sm" href="/">
          Quit
        </Button>

        <Button variant="icon" onClick={onOpenSettings} title="Settings">
          <svg
            className="w-3.5 h-3.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        </Button>
      </div>
    </nav>
  );
}
