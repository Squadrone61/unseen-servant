import type { ServerMessage } from "@aidnd/shared/types";

interface ChatMessageProps {
  message: ServerMessage;
}

export function ChatMessage({ message }: ChatMessageProps) {
  switch (message.type) {
    case "server:chat":
      return (
        <div className="flex gap-2">
          <span className="font-bold text-blue-400 shrink-0">
            {message.playerName}:
          </span>
          <span className="text-gray-200">{message.content}</span>
        </div>
      );

    case "server:ai":
      return (
        <div className="bg-purple-900/20 border-l-4 border-purple-500 p-3 rounded-r-lg">
          <div className="text-xs text-purple-400 font-semibold mb-1">
            Dungeon Master
          </div>
          <div className="text-gray-200 whitespace-pre-wrap leading-relaxed">
            {message.content}
          </div>
        </div>
      );

    case "server:system":
      return (
        <div className="text-center text-sm text-gray-500 italic py-1">
          {message.content}
        </div>
      );

    case "server:error":
      return (
        <div className="text-center text-sm text-red-400 bg-red-900/20 p-2 rounded">
          Error: {message.message}
        </div>
      );

    default:
      return null;
  }
}
