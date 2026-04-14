"use client";

import { useState, useRef, useEffect } from "react";
import { ChatMessage } from "./ChatMessage";
import { Button } from "@/components/ui/Button";
import type {
  ServerMessage,
  CheckRequest,
  CheckResult,
  RollResult,
} from "@unseen-servant/shared/types";
import type { ConnectionState } from "@/hooks/useWebSocket";
import type { StagedAoE, AoECounts } from "@/hooks/useAoEPlacement";

// Merged check: check_request + check_result resolved into a single display card
export interface MergedCheckMessage {
  type: "merged_check";
  request: CheckRequest;
  roll: RollResult;
  result: CheckResult;
  playerName: string;
  timestamp: number;
}

export type DisplayMessage = ServerMessage | MergedCheckMessage;

/** Stable key for check-related messages so React updates in-place */
function getMessageKey(msg: DisplayMessage, index: number): string {
  switch (msg.type) {
    case "server:check_request":
      return `check-${msg.check.id}`;
    case "merged_check":
      return `check-${msg.request.id}`;
    case "server:dice_roll":
      return `roll-${msg.id}`;
    case "server:check_result":
      return `result-${msg.result.requestId}`;
    default:
      // ServerMessage types with id field
      if ("id" in msg && typeof msg.id === "string") return msg.id;
      return `msg-${index}`;
  }
}

function formatTypingText(names: string[]): string {
  if (names.length === 1) {
    const verb = names[0] === "DM" ? "thinking" : "typing";
    return `${names[0]} is ${verb}...`;
  }
  if (names.length === 2) {
    // If DM is one of two, just show both actions
    const parts = names.map((n) => `${n} is ${n === "DM" ? "thinking" : "typing"}`);
    return `${parts.join(" and ")}...`;
  }
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]} are typing...`;
}

interface ChatPanelProps {
  messages: DisplayMessage[];
  onSend: (content: string) => void;
  connectionState: ConnectionState;
  onRollDice?: (checkRequestId: string) => void;
  myCharacterName?: string;
  isMyTurn?: boolean;
  onEndTurn?: () => void;
  typingPlayers?: string[];
  onTypingChange?: (isTyping: boolean) => void;
  /** Optional element rendered left of the input (e.g. character trigger button) */
  characterTrigger?: React.ReactNode;
  /** If present, the staged AoE will be shown as a badge and attached on send */
  stagedAoE?: StagedAoE | null;
  stagedAoECounts?: AoECounts;
  onCancelAoE?: () => void;
  /** Called when a message is sent with a pending AoE — receives the staged AoE */
  onSendWithAoE?: (content: string, staged: StagedAoE) => void;
}

export function ChatPanel({
  messages,
  onSend,
  connectionState,
  onRollDice,
  myCharacterName,
  isMyTurn,
  onEndTurn,
  typingPlayers,
  onTypingChange,
  characterTrigger,
  stagedAoE,
  stagedAoECounts,
  onCancelAoE,
  onSendWithAoE,
}: ChatPanelProps) {
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setInput(value);

    if (!onTypingChange) return;

    if (value.trim()) {
      onTypingChange(true);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => onTypingChange(false), 2000);
    } else {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      onTypingChange(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && connectionState === "connected") {
      if (stagedAoE && onSendWithAoE) {
        onSendWithAoE(input.trim(), stagedAoE);
      } else {
        onSend(input.trim());
      }
      setInput("");
      if (onTypingChange) {
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        onTypingChange(false);
      }
    }
  };

  const isConnected = connectionState === "connected";

  return (
    <div className="flex-1 flex flex-col min-h-0 min-w-0">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
        {messages.length === 0 && (
          <div className="text-center text-gray-600 mt-16">
            <p className="text-lg mb-2 text-gray-500" style={{ fontFamily: "var(--font-cinzel)" }}>
              {typingPlayers?.includes("DM")
                ? "The Dungeon Master is preparing\u2026"
                : "Waiting for the adventure to begin\u2026"}
            </p>
            <div className="w-16 h-px bg-gradient-to-r from-transparent via-amber-500/30 to-transparent mx-auto" />
          </div>
        )}
        {messages.map((msg, i) => (
          <ChatMessage
            key={getMessageKey(msg, i)}
            message={msg}
            onRollDice={onRollDice}
            myCharacterName={myCharacterName}
          />
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Typing Indicator */}
      {typingPlayers && typingPlayers.length > 0 && (
        <div className="px-4 py-1.5 text-sm text-gray-400 italic shrink-0">
          {formatTypingText(typingPlayers)}
        </div>
      )}

      {/* AoE staged badge */}
      {stagedAoE && (
        <div className="px-4 py-2 shrink-0 border-t border-amber-800/30 bg-amber-950/20">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-amber-400/70">AoE</span>
            <span className="text-amber-300 font-medium truncate flex-1">
              {stagedAoE.spellName ?? stagedAoE.label ?? "Template"} &middot; {stagedAoE.size}ft{" "}
              {stagedAoE.shape === "rectangle"
                ? (stagedAoE.rectanglePreset ?? "rectangle")
                : stagedAoE.shape}
              {stagedAoECounts && (
                <span className="text-amber-500/70 ml-1">
                  &middot;{" "}
                  {stagedAoECounts.enemies.length +
                    stagedAoECounts.allies.length +
                    stagedAoECounts.self.length}{" "}
                  targets
                </span>
              )}
            </span>
            <button
              type="button"
              onClick={onCancelAoE}
              className="text-gray-500 hover:text-gray-300 transition-colors ml-1 text-base leading-none"
              title="Cancel AoE placement"
            >
              &times;
            </button>
          </div>
        </div>
      )}

      {/* Input */}
      <form onSubmit={handleSubmit} className="border-t border-gray-700/40 p-4 shrink-0">
        <div className="flex gap-2 items-center">
          {characterTrigger}
          <input
            type="text"
            value={input}
            onChange={handleInputChange}
            placeholder={isConnected ? "What do you do?" : "Connecting..."}
            disabled={!isConnected}
            maxLength={2000}
            className="flex-1 bg-gray-900/60 border border-gray-700/50 rounded-lg px-4 py-2.5
                       text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-1
                       focus:ring-amber-500/50 focus:border-amber-500/30 disabled:opacity-50"
          />
          {isMyTurn && onEndTurn && (
            <Button type="button" onClick={onEndTurn} size="md">
              End Turn
            </Button>
          )}
          <Button type="submit" disabled={!isConnected || !input.trim()} size="md">
            Send
          </Button>
        </div>
      </form>
    </div>
  );
}
