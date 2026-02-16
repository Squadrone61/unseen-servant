"use client";

import { useState, useRef, useEffect } from "react";
import { ChatMessage } from "./ChatMessage";
import type { ServerMessage } from "@aidnd/shared/types";
import type { ConnectionState } from "@/hooks/useWebSocket";

interface ChatPanelProps {
  messages: ServerMessage[];
  onSend: (content: string) => void;
  connectionState: ConnectionState;
}

export function ChatPanel({ messages, onSend, connectionState }: ChatPanelProps) {
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

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
    <div className="flex-1 flex flex-col h-full">
      {/* Header */}
      <div className="border-b border-gray-700 p-4 flex items-center gap-3">
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
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <div className="text-center text-gray-600 mt-8">
            <p className="text-lg mb-1">Waiting for the adventure to begin...</p>
            <p className="text-sm">
              Make sure someone has configured an AI provider.
            </p>
          </div>
        )}
        {messages.map((msg, i) => (
          <ChatMessage key={i} message={msg} />
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="border-t border-gray-700 p-4">
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
