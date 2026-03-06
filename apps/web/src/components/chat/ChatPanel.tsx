"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { ChatMessage } from "./ChatMessage";
import type { ServerMessage, CheckRequest, CheckResult, RollResult } from "@aidnd/shared/types";
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

/**
 * Post-process messages to merge check sequences using checkRequestId.
 * - check_request + dice_roll + check_result → merged_check
 * - check_request + dice_roll (no result yet) → merged_check_pending
 * - bare check_request (no roll yet) → left as-is (shows "Roll d20" button)
 */
function mergeCheckMessages(messages: ServerMessage[]): DisplayMessage[] {
  // Index dice_rolls and check_results by checkRequestId
  const rollByCheckId = new Map<string, { msg: Extract<ServerMessage, { type: "server:dice_roll" }>; idx: number }>();
  const resultByCheckId = new Map<string, { msg: Extract<ServerMessage, { type: "server:check_result" }>; idx: number }>();

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (msg.type === "server:dice_roll" && msg.checkRequestId) {
      rollByCheckId.set(msg.checkRequestId, { msg: msg as Extract<ServerMessage, { type: "server:dice_roll" }>, idx: i });
    }
    if (msg.type === "server:check_result") {
      resultByCheckId.set(msg.result.requestId, { msg: msg as Extract<ServerMessage, { type: "server:check_result" }>, idx: i });
    }
  }

  // Nothing to merge
  if (rollByCheckId.size === 0 && resultByCheckId.size === 0) return messages;

  const consumed = new Set<number>();
  const result: DisplayMessage[] = [];

  for (let i = 0; i < messages.length; i++) {
    if (consumed.has(i)) continue;
    const msg = messages[i];

    if (msg.type === "server:check_request") {
      const checkId = msg.check.id;
      const rollEntry = rollByCheckId.get(checkId);
      const resultEntry = resultByCheckId.get(checkId);

      if (rollEntry && resultEntry) {
        // All 3 present → merged_check
        consumed.add(i);
        consumed.add(rollEntry.idx);
        consumed.add(resultEntry.idx);
        result.push({
          type: "merged_check",
          request: msg.check,
          roll: rollEntry.msg.roll,
          result: resultEntry.msg.result,
          playerName: rollEntry.msg.playerName,
          timestamp: resultEntry.msg.timestamp,
        });
      } else if (rollEntry) {
        // Roll arrived but no result yet → merged_check_pending
        consumed.add(i);
        consumed.add(rollEntry.idx);
        result.push({
          type: "merged_check_pending",
          request: msg.check,
          roll: rollEntry.msg.roll,
          playerName: rollEntry.msg.playerName,
          timestamp: rollEntry.msg.timestamp,
        });
      } else {
        // Bare check_request — leave as-is (shows Roll button)
        result.push(msg);
      }
      continue;
    }

    // Skip dice_roll/check_result that were consumed by merge
    if (consumed.has(i)) continue;

    // Standalone dice_roll with checkRequestId but no matching check_request (shouldn't happen, but safe)
    // and check_results without a matching request are passed through
    result.push(msg);
  }

  return result;
}

interface ChatPanelProps {
  messages: ServerMessage[];
  onSend: (content: string) => void;
  connectionState: ConnectionState;
  onRollDice?: (checkRequestId: string) => void;
  myCharacterName?: string;
  isMyTurn?: boolean;
  onEndTurn?: () => void;
}

export function ChatPanel({ messages, onSend, connectionState, onRollDice, myCharacterName, isMyTurn, onEndTurn }: ChatPanelProps) {
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const displayMessages = useMemo(() => mergeCheckMessages(messages), [messages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && connectionState === "connected") {
      onSend(input.trim());
      setInput("");
    }
  };

  const isConnected = connectionState === "connected";

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Header */}
      <div className="border-b border-gray-700 p-4 flex items-center gap-3 shrink-0">
        <h2 className="text-lg font-semibold text-purple-400">
          AI Dungeon Master
        </h2>
        <div className="flex items-center gap-1.5 ml-auto">
          <div
            className={`w-2 h-2 rounded-full ${
              connectionState === "connected"
                ? "bg-green-500"
                : connectionState === "reconnecting"
                  ? "bg-yellow-500 animate-pulse"
                  : connectionState === "connecting"
                    ? "bg-yellow-500 animate-pulse"
                    : "bg-red-500"
            }`}
          />
          <span className="text-sm text-gray-400">
            {connectionState === "connected"
              ? "Connected"
              : connectionState === "reconnecting"
                ? "Reconnecting..."
                : connectionState === "connecting"
                  ? "Connecting..."
                  : "Disconnected"}
          </span>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
        {displayMessages.length === 0 && (
          <div className="text-center text-gray-600 mt-8">
            <p className="text-lg mb-1">Waiting for the adventure to begin...</p>
            <p className="text-sm">
              Make sure someone has configured an AI provider.
            </p>
          </div>
        )}
        {displayMessages.map((msg, i) => (
          <ChatMessage key={i} message={msg} onRollDice={onRollDice} myCharacterName={myCharacterName} />
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="border-t border-gray-700 p-4 shrink-0">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={isConnected ? "What do you do?" : "Connecting..."}
            disabled={!isConnected}
            maxLength={2000}
            className="flex-1 bg-gray-800 border border-gray-600 rounded-lg px-4 py-2.5
                       text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2
                       focus:ring-purple-500 disabled:opacity-50"
          />
          {isMyTurn && onEndTurn && (
            <button
              type="button"
              onClick={onEndTurn}
              className="bg-amber-600 hover:bg-amber-700 text-white px-4 py-2.5 rounded-lg
                         font-medium transition-colors whitespace-nowrap"
            >
              End Turn
            </button>
          )}
          <button
            type="submit"
            disabled={!isConnected || !input.trim()}
            className="bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700
                       disabled:text-gray-500 text-white px-6 py-2.5 rounded-lg
                       font-medium transition-colors"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
}
