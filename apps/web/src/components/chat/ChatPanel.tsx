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

// Merged check: all 3 messages resolved (check_request + dice_roll + check_result)
export interface MergedCheckMessage {
  type: "merged_check";
  request: CheckRequest;
  roll: RollResult;
  result: CheckResult;
  playerName: string;
  timestamp: number;
}

// Merged check pending: check_request + dice_roll arrived, but no check_result yet
export interface MergedCheckPendingMessage {
  type: "merged_check_pending";
  request: CheckRequest;
  roll: RollResult;
  playerName: string;
  timestamp: number;
}

export type DisplayMessage = ServerMessage | MergedCheckMessage | MergedCheckPendingMessage;

/** Stable key for check-related messages so React updates in-place */
function getMessageKey(msg: DisplayMessage, index: number): string {
  switch (msg.type) {
    case "server:check_request":
      return `check-${msg.check.id}`;
    case "merged_check_pending":
      return `check-${msg.request.id}`;
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
      onSend(input.trim());
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
