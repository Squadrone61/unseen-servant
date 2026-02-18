"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useState, useEffect, useRef } from "react";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { Sidebar } from "@/components/sidebar/Sidebar";
import { PendingOverlay } from "@/components/game/PendingOverlay";
import { JoinGate } from "@/components/game/JoinGate";
import { LeftSidebar } from "@/components/character/LeftSidebar";
import { useWebSocket } from "@/hooks/useWebSocket";
import { InitiativeTracker } from "@/components/game/InitiativeTracker";
import type {
  AIConfig,
  CharacterData,
  CombatState,
  GameEvent,
  GameState,
  PlayerInfo,
  ServerMessage,
} from "@aidnd/shared/types";

function loadAIConfig(): AIConfig | undefined {
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
  return (
    msg.type === "server:chat" ||
    msg.type === "server:ai" ||
    msg.type === "server:check_request" ||
    msg.type === "server:check_result" ||
    msg.type === "server:dice_roll"
  );
}

/** Messages that belong in the sidebar activity log */
function isLogMessage(msg: ServerMessage): boolean {
  return msg.type === "server:system" || msg.type === "server:error";
}

export default function GamePage() {
  const { roomCode } = useParams<{ roomCode: string }>();
  // Start as undefined (matches server render), then read sessionStorage after mount
  const [playerName, setPlayerName] = useState<string | null | undefined>(
    undefined
  );
  const [initialCharacter, setInitialCharacter] =
    useState<CharacterData | null>(null);

  // Read player name from sessionStorage after hydration
  useEffect(() => {
    const stored = sessionStorage.getItem("playerName") || null;
    setPlayerName(stored);
  }, []);

  // Still loading — render nothing (matches server render of undefined)
  if (playerName === undefined) {
    return null;
  }

  // No name in sessionStorage — show the JoinGate
  if (!playerName) {
    return (
      <JoinGate
        roomCode={roomCode}
        onReady={(name, character) => {
          setPlayerName(name);
          if (character) setInitialCharacter(character);
        }}
      />
    );
  }

  return (
    <GameContent
      roomCode={roomCode}
      playerName={playerName}
      initialCharacter={initialCharacter}
    />
  );
}

function GameContent({
  roomCode,
  playerName,
  initialCharacter,
}: {
  roomCode: string;
  playerName: string;
  initialCharacter: CharacterData | null;
}) {
  const router = useRouter();
  const [storyMessages, setStoryMessages] = useState<ServerMessage[]>([]);
  const [logMessages, setLogMessages] = useState<ServerMessage[]>([]);
  const [players, setPlayers] = useState<string[]>([]);
  const [allPlayers, setAllPlayers] = useState<PlayerInfo[]>([]);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [aiProvider, setAiProvider] = useState<string | undefined>();
  const [aiModel, setAiModel] = useState<string | undefined>();
  const [isHost, setIsHost] = useState(false);
  const [hostName, setHostName] = useState<string>("");
  const [joinPending, setJoinPending] = useState(false);
  const [pendingPlayers, setPendingPlayers] = useState<string[]>([]);
  const [myCharacter, setMyCharacter] = useState<CharacterData | null>(
    initialCharacter
  );
  const [partyCharacters, setPartyCharacters] = useState<
    Record<string, CharacterData>
  >({});
  const [storyStarted, setStoryStarted] = useState(false);
  const [combatState, setCombatState] = useState<CombatState | null>(null);
  const [eventLog, setEventLog] = useState<GameEvent[]>([]);

  // Client-only state: browser storage values loaded after mount
  const [clientReady, setClientReady] = useState(false);
  const [aiConfig, setAiConfig] = useState<AIConfig | undefined>(undefined);
  const [authToken, setAuthToken] = useState<string | undefined>(undefined);
  const [guestId, setGuestId] = useState<string | undefined>(undefined);

  // Track whether we've sent the initial character
  const sentCharacterRef = useRef(false);

  // Load all browser storage values after mount (avoids hydration mismatch)
  useEffect(() => {
    setAiConfig(loadAIConfig());
    setAuthToken(localStorage.getItem("auth_token") || undefined);

    let id = sessionStorage.getItem("guestId");
    if (!id) {
      id = `guest_${crypto.randomUUID().slice(0, 8)}`;
      sessionStorage.setItem("guestId", id);
    }
    setGuestId(id);

    setClientReady(true);
  }, []);

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
          if (msg.allPlayers) setAllPlayers(msg.allPlayers);
          if (msg.characters) {
            setPartyCharacters(msg.characters);
            // Restore own character from server (reconnect after days/weeks)
            if (msg.characters[playerName]) {
              setMyCharacter(msg.characters[playerName]);
            }
          }
          if (msg.storyStarted !== undefined) setStoryStarted(msg.storyStarted);
          break;

        case "server:player_joined":
        case "server:player_left":
          setPlayers(msg.players);
          setHostName(msg.hostName);
          if (msg.allPlayers) setAllPlayers(msg.allPlayers);
          break;

        case "server:character_updated":
          setPartyCharacters((prev) => ({
            ...prev,
            [msg.playerName]: msg.character,
          }));
          // If it's our own character being echoed back, update local state
          if (msg.playerName === playerName) {
            setMyCharacter(msg.character);
          }
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

        case "server:room_destroyed":
          sessionStorage.removeItem("playerName");
          sessionStorage.setItem("kick_message", "The room has been destroyed by the host.");
          router.push("/");
          return;

        case "server:error":
          if (msg.code === "REJECTED" || msg.code === "ROOM_NOT_FOUND") {
            sessionStorage.removeItem("playerName");
            sessionStorage.setItem("kick_message", msg.message);
            router.push("/");
            return;
          }
          setLogMessages((prev) => [...prev, msg]);
          break;

        case "server:combat_update":
          setCombatState(msg.combat ?? null);
          break;

        case "server:game_state_sync":
          if (msg.gameState.encounter?.combat) {
            setCombatState(msg.gameState.encounter.combat);
          }
          setEventLog(msg.gameState.eventLog);
          break;

        case "server:rollback":
          // Full state restoration
          if (msg.characterUpdates) {
            setPartyCharacters(msg.characterUpdates);
            if (msg.characterUpdates[playerName]) {
              setMyCharacter(msg.characterUpdates[playerName]);
            }
          }
          if (msg.gameState.encounter?.combat) {
            setCombatState(msg.gameState.encounter.combat);
          } else {
            setCombatState(null);
          }
          setEventLog(msg.gameState.eventLog);
          break;

        case "server:event_log":
          setEventLog((prev) => [...prev, msg.event]);
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
    [router, playerName]
  );

  const { send, connectionState } = useWebSocket({
    roomCode,
    playerName,
    aiConfig,
    authToken,
    guestId,
    onMessage: handleMessage,
    enabled: clientReady,
  });

  // Send initial character data after connection
  useEffect(() => {
    if (
      connectionState === "connected" &&
      myCharacter &&
      !sentCharacterRef.current
    ) {
      send({ type: "client:set_character", character: myCharacter });
      sentCharacterRef.current = true;
    }
  }, [connectionState, myCharacter, send]);

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

  const handleStartStory = () => {
    send({ type: "client:start_story" });
    setStoryStarted(true);
  };

  const handleRollDice = (checkRequestId: string) => {
    send({ type: "client:roll_dice", checkRequestId });
  };

  const handleRollback = (eventId: string) => {
    send({ type: "client:rollback", eventId });
  };

  const handleDestroyRoom = () => {
    send({ type: "client:destroy_room" });
  };

  const handleCharacterImported = useCallback(
    (character: CharacterData) => {
      setMyCharacter(character);
      send({ type: "client:set_character", character });
    },
    [send]
  );

  if (joinPending) {
    return <PendingOverlay roomCode={roomCode} />;
  }

  return (
    <div className="flex h-screen">
      <LeftSidebar
        character={myCharacter}
        onCharacterImported={handleCharacterImported}
      />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {combatState && combatState.phase === "active" && (
          <InitiativeTracker combat={combatState} />
        )}
        <ChatPanel
          messages={storyMessages}
          onSend={handleSend}
          connectionState={connectionState}
          onRollDice={handleRollDice}
          myCharacterName={myCharacter?.static.name}
        />
      </div>
      <Sidebar
        roomCode={roomCode}
        players={players}
        allPlayers={allPlayers}
        hostName={hostName}
        hasApiKey={hasApiKey}
        aiProvider={aiProvider}
        aiModel={aiModel}
        isHost={isHost}
        pendingPlayers={pendingPlayers}
        logMessages={logMessages}
        partyCharacters={partyCharacters}
        storyStarted={storyStarted}
        combatState={combatState}
        eventLog={eventLog}
        onSetAIConfig={handleSetAIConfig}
        onApprove={handleApprove}
        onReject={handleReject}
        onKick={handleKick}
        onStartStory={handleStartStory}
        onRollback={handleRollback}
        onDestroyRoom={handleDestroyRoom}
      />
    </div>
  );
}
