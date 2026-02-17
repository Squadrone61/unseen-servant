"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { Sidebar } from "@/components/sidebar/Sidebar";
import { PendingOverlay } from "@/components/game/PendingOverlay";
import { JoinGate } from "@/components/game/JoinGate";
import { useWebSocket } from "@/hooks/useWebSocket";
import type { AIConfig, ServerMessage } from "@aidnd/shared/types";

function loadAIConfig(): AIConfig | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = localStorage.getItem("ai_config");
    if (!raw) return undefined;
    const parsed = JSON.parse(raw);
    if (parsed?.provider && parsed?.apiKey) return parsed as AIConfig;
  } catch {
    // ignore malformed JSON
  }
  return undefined;
}

/** Messages that belong in the main story chat */
function isStoryMessage(msg: ServerMessage): boolean {
  return msg.type === "server:chat" || msg.type === "server:ai";
}

/** Messages that belong in the sidebar activity log */
function isLogMessage(msg: ServerMessage): boolean {
  return msg.type === "server:system" || msg.type === "server:error";
}

function getInitialPlayerName(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem("playerName") || null;
}

export default function GamePage() {
  const { roomCode } = useParams<{ roomCode: string }>();
  const initialName = getInitialPlayerName();
  const [playerName, setPlayerName] = useState<string | null>(initialName);

  // If no name in sessionStorage, show the JoinGate
  if (!playerName) {
    return (
      <JoinGate
        roomCode={roomCode}
        onReady={(name) => setPlayerName(name)}
      />
    );
  }

  return <GameContent roomCode={roomCode} playerName={playerName} />;
}

function GameContent({
  roomCode,
  playerName,
}: {
  roomCode: string;
  playerName: string;
}) {
  const router = useRouter();
  const [storyMessages, setStoryMessages] = useState<ServerMessage[]>([]);
  const [logMessages, setLogMessages] = useState<ServerMessage[]>([]);
  const [players, setPlayers] = useState<string[]>([]);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [aiProvider, setAiProvider] = useState<string | undefined>();
  const [aiModel, setAiModel] = useState<string | undefined>();
  const [isHost, setIsHost] = useState(false);
  const [hostName, setHostName] = useState<string>("");
  const [joinPending, setJoinPending] = useState(false);
  const [pendingPlayers, setPendingPlayers] = useState<string[]>([]);

  const aiConfig = loadAIConfig();
  const authToken =
    typeof window !== "undefined"
      ? localStorage.getItem("auth_token") || undefined
      : undefined;
  const guestId =
    typeof window !== "undefined"
      ? (() => {
          let id = sessionStorage.getItem("guestId");
          if (!id) {
            id = `guest_${crypto.randomUUID().slice(0, 8)}`;
            sessionStorage.setItem("guestId", id);
          }
          return id;
        })()
      : undefined;

  const handleMessage = useCallback(
    (msg: ServerMessage) => {
      switch (msg.type) {
        case "server:room_joined":
          setPlayers(msg.players);
          setHostName(msg.hostName);
          setHasApiKey(msg.hasApiKey);
          setAiProvider(msg.aiProvider);
          setAiModel(msg.aiModel);
          setIsHost(msg.isHost ?? false);
          setJoinPending(false);
          break;

        case "server:player_joined":
        case "server:player_left":
          setPlayers(msg.players);
          setHostName(msg.hostName);
          break;

        case "server:join_pending":
          setJoinPending(true);
          break;

        case "server:join_request":
          setPendingPlayers((prev) => {
            if (prev.includes(msg.playerName)) return prev;
            return [...prev, msg.playerName];
          });
          setLogMessages((prev) => [
            ...prev,
            {
              type: "server:system",
              content: `${msg.playerName} is requesting to join the room.`,
              timestamp: Date.now(),
            },
          ]);
          break;

        case "server:kicked":
          sessionStorage.setItem("kick_message", msg.reason);
          router.push("/");
          break;

        case "server:error":
          if (msg.code === "REJECTED") {
            sessionStorage.setItem("kick_message", msg.message);
            router.push("/");
            return;
          }
          setLogMessages((prev) => [...prev, msg]);
          break;

        default:
          if (isStoryMessage(msg)) {
            setStoryMessages((prev) => [...prev, msg]);
          } else if (isLogMessage(msg)) {
            setLogMessages((prev) => [...prev, msg]);
          }
          break;
      }
    },
    [router]
  );

  const { send, connectionState } = useWebSocket({
    roomCode,
    playerName,
    aiConfig,
    authToken,
    guestId,
    onMessage: handleMessage,
  });

  const handleSend = (content: string) => {
    send({
      type: "client:chat",
      content,
      playerName,
    });
  };

  const handleSetAIConfig = (config: AIConfig) => {
    send({ type: "client:set_ai_config", aiConfig: config });
    localStorage.setItem("ai_config", JSON.stringify(config));
    setHasApiKey(true);
    setAiProvider(config.provider);
    setAiModel(config.model);
  };

  const handleApprove = (name: string) => {
    send({ type: "client:approve_join", playerName: name });
    setPendingPlayers((prev) => prev.filter((p) => p !== name));
  };

  const handleReject = (name: string) => {
    send({ type: "client:reject_join", playerName: name });
    setPendingPlayers((prev) => prev.filter((p) => p !== name));
  };

  const handleKick = (name: string) => {
    send({ type: "client:kick_player", playerName: name });
  };

  if (joinPending) {
    return <PendingOverlay roomCode={roomCode} />;
  }

  return (
    <div className="flex h-screen">
      <ChatPanel
        messages={storyMessages}
        onSend={handleSend}
        connectionState={connectionState}
      />
      <Sidebar
        roomCode={roomCode}
        players={players}
        hostName={hostName}
        hasApiKey={hasApiKey}
        aiProvider={aiProvider}
        aiModel={aiModel}
        isHost={isHost}
        pendingPlayers={pendingPlayers}
        logMessages={logMessages}
        onSetAIConfig={handleSetAIConfig}
        onApprove={handleApprove}
        onReject={handleReject}
        onKick={handleKick}
      />
    </div>
  );
}
