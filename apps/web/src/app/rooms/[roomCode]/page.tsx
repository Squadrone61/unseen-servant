"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useState, useEffect, useRef } from "react";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { Sidebar } from "@/components/sidebar/Sidebar";
import { LeftSidebar } from "@/components/character/LeftSidebar";
import { useWebSocket } from "@/hooks/useWebSocket";
import { InitiativeTracker } from "@/components/game/InitiativeTracker";
import { BattleMap } from "@/components/game/BattleMap";
import type {
  AIConfig,
  BattleMapState,
  CharacterData,
  CombatState,
  EncounterLength,
  GameEvent,
  PacingProfile,
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
  const router = useRouter();
  // Start as undefined (matches server render), then read sessionStorage after mount
  const [playerName, setPlayerName] = useState<string | null | undefined>(
    undefined
  );

  // Read player name from localStorage after hydration
  useEffect(() => {
    const stored = localStorage.getItem("playerName") || null;
    setPlayerName(stored);
  }, []);

  // Redirect to home if no player name (must be in useEffect, not during render)
  useEffect(() => {
    if (playerName === null) {
      router.push(`/?join=${roomCode}`);
    }
  }, [playerName, router, roomCode]);

  // Still loading or redirecting — render nothing
  if (!playerName) {
    return null;
  }

  return (
    <GameContent
      roomCode={roomCode}
      playerName={playerName}
    />
  );
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
  const [allPlayers, setAllPlayers] = useState<PlayerInfo[]>([]);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [aiProvider, setAiProvider] = useState<string | undefined>();
  const [aiModel, setAiModel] = useState<string | undefined>();
  const [isHost, setIsHost] = useState(false);
  const [hostName, setHostName] = useState<string>("");
  const [myCharacter, setMyCharacter] = useState<CharacterData | null>(null);
  const [partyCharacters, setPartyCharacters] = useState<
    Record<string, CharacterData>
  >({});
  const [storyStarted, setStoryStarted] = useState(false);
  const [combatState, setCombatState] = useState<CombatState | null>(null);
  const [battleMap, setBattleMap] = useState<BattleMapState | null>(null);
  const [eventLog, setEventLog] = useState<GameEvent[]>([]);
  const [pacingProfile, setPacingProfile] = useState<PacingProfile>("balanced");
  const [encounterLength, setEncounterLength] = useState<EncounterLength>("standard");
  const [customSystemPrompt, setCustomSystemPrompt] = useState<string | undefined>(undefined);
  const [highlightedCombatantId, setHighlightedCombatantId] = useState<string | null>(null);

  // Join state — don't render game UI until successfully joined
  const [joined, setJoined] = useState(false);

  // Password prompt state
  const [passwordRequired, setPasswordRequired] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [roomPassword, setRoomPassword] = useState<string | undefined>(
    undefined
  );

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

    // Load password from sessionStorage (set by home page quick-join)
    const storedPassword = sessionStorage.getItem("roomPassword");
    if (storedPassword) {
      setRoomPassword(storedPassword);
      sessionStorage.removeItem("roomPassword");
    }

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
          setJoined(true);
          setPlayers(msg.players);
          setHostName(msg.hostName);
          setHasApiKey(msg.hasApiKey);
          setAiProvider(msg.aiProvider);
          setAiModel(msg.aiModel);
          setIsHost(msg.isHost ?? false);
          setPasswordRequired(false);
          setPasswordError("");
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

        case "server:kicked":
          sessionStorage.setItem("kick_message", msg.reason);
          router.push("/");
          break;

        case "server:room_destroyed":
          sessionStorage.setItem("kick_message", "The room has been destroyed by the host.");
          router.push("/");
          return;

        case "server:error":
          if (msg.code === "PASSWORD_REQUIRED") {
            setPasswordRequired(true);
            return;
          }
          if (msg.code === "WRONG_PASSWORD") {
            setPasswordRequired(true);
            setPasswordError("Incorrect password");
            return;
          }
          if (msg.code === "REJECTED" || msg.code === "ROOM_NOT_FOUND") {
            sessionStorage.setItem("kick_message", msg.message);
            router.push("/");
            return;
          }
          setLogMessages((prev) => [...prev, msg]);
          break;

        case "server:combat_update":
          setCombatState(msg.combat ?? null);
          if (msg.map !== undefined) setBattleMap(msg.map ?? null);
          break;

        case "server:game_state_sync":
          if (msg.gameState.encounter?.combat) {
            setCombatState(msg.gameState.encounter.combat);
          }
          setBattleMap(msg.gameState.encounter?.map ?? null);
          setEventLog(msg.gameState.eventLog);
          setPacingProfile(msg.gameState.pacingProfile);
          setEncounterLength(msg.gameState.encounterLength);
          setCustomSystemPrompt(msg.gameState.customSystemPrompt);
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
          setBattleMap(msg.gameState.encounter?.map ?? null);
          setEventLog(msg.gameState.eventLog);
          setPacingProfile(msg.gameState.pacingProfile);
          setEncounterLength(msg.gameState.encounterLength);
          setCustomSystemPrompt(msg.gameState.customSystemPrompt);
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
    password: roomPassword,
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

  const handleMoveToken = useCallback(
    (to: { x: number; y: number }) => {
      send({ type: "client:move_token", to });
    },
    [send],
  );

  const handleDestroyRoom = () => {
    send({ type: "client:destroy_room" });
  };

  const handleSetPassword = (password: string) => {
    send({ type: "client:set_password", password });
  };

  const handleSetPacing = (profile: PacingProfile, length: EncounterLength) => {
    send({ type: "client:set_pacing", profile, encounterLength: length });
    setPacingProfile(profile);
    setEncounterLength(length);
  };

  const handleSetSystemPrompt = (prompt?: string) => {
    send({ type: "client:set_system_prompt", prompt });
    setCustomSystemPrompt(prompt);
  };

  const handleCharacterImported = useCallback(
    (character: CharacterData) => {
      setMyCharacter(character);
      send({ type: "client:set_character", character });
    },
    [send]
  );

  const handlePasswordSubmit = () => {
    if (!passwordInput.trim()) return;
    setRoomPassword(passwordInput.trim());
    setPasswordError("");
    setPasswordRequired(false);
    setPasswordInput("");
  };

  // Password prompt overlay
  if (passwordRequired) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="bg-gray-800 rounded-xl p-6 w-full max-w-sm space-y-4">
          <div className="text-center">
            <div className="text-3xl mb-2">&#128274;</div>
            <h2 className="text-lg font-semibold text-gray-200">
              Room Password Required
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Room <span className="font-mono text-purple-400">{roomCode}</span>{" "}
              is password protected
            </p>
          </div>

          {passwordError && (
            <p className="text-red-400 text-sm text-center">{passwordError}</p>
          )}

          <input
            type="password"
            value={passwordInput}
            onChange={(e) => setPasswordInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handlePasswordSubmit()}
            placeholder="Enter room password..."
            autoFocus
            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2.5
                       text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2
                       focus:ring-purple-500 focus:border-transparent"
          />

          <div className="flex gap-3">
            <button
              onClick={handlePasswordSubmit}
              className="flex-1 bg-purple-600 hover:bg-purple-700 text-white py-2.5 rounded-lg
                         font-medium transition-colors text-sm"
            >
              Join Room
            </button>
            <button
              onClick={() => router.push("/")}
              className="px-4 text-gray-500 hover:text-gray-300 text-sm transition-colors"
            >
              Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Show connecting state until we've successfully joined
  if (!joined) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-gray-400">
            Connecting to room <span className="font-mono text-purple-400">{roomCode}</span>...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen">
      <LeftSidebar
        character={myCharacter}
        onCharacterImported={handleCharacterImported}
      />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {combatState && combatState.phase === "active" && (
          <InitiativeTracker
            combat={combatState}
            onCombatantClick={setHighlightedCombatantId}
          />
        )}
        {battleMap && combatState && combatState.phase === "active" && (
          <BattleMap
            map={battleMap}
            combat={combatState}
            partyCharacters={partyCharacters}
            myCharacterName={myCharacter?.static.name}
            onMoveToken={handleMoveToken}
            highlightedCombatantId={highlightedCombatantId}
          />
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
        logMessages={logMessages}
        partyCharacters={partyCharacters}
        storyStarted={storyStarted}
        combatState={combatState}
        eventLog={eventLog}
        pacingProfile={pacingProfile}
        encounterLength={encounterLength}
        customSystemPrompt={customSystemPrompt}
        onSetAIConfig={handleSetAIConfig}
        onKick={handleKick}
        onStartStory={handleStartStory}
        onRollback={handleRollback}
        onDestroyRoom={handleDestroyRoom}
        onSetPassword={handleSetPassword}
        onSetPacing={handleSetPacing}
        onSetSystemPrompt={handleSetSystemPrompt}
      />
    </div>
  );
}
