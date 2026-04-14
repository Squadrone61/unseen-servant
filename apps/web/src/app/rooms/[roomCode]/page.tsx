"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useState, useEffect, useRef, useMemo } from "react";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { LeftSidebar } from "@/components/character/LeftSidebar";
import { useWebSocket } from "@/hooks/useWebSocket";
import { BattleMap } from "@/components/game/BattleMap";

import { CampaignConfigModal } from "@/components/sidebar/CampaignConfigModal";
import { SettingsModal } from "@/components/sidebar/SettingsModal";
import { HowToPlayModal } from "@/components/guide/HowToPlayModal";
import { PlayerNotesPanel } from "@/components/notes/PlayerNotesPanel";
import { GameNavBar } from "@/components/game/GameNavBar";
import { Button } from "@/components/ui/Button";
import { Drawer } from "@/components/game/Drawer";
import { CharacterTrigger } from "@/components/game/CharacterTrigger";
import { CharacterSheet } from "@/components/character/CharacterSheet";
import { CharacterPopover } from "@/components/character/CharacterPopover";
import { usePlayerNotes } from "@/hooks/usePlayerNotes";
import { useCharacterLibrary } from "@/hooks/useCharacterLibrary";
import { useAoEPlacement } from "@/hooks/useAoEPlacement";
import { mergeReimport, formatClassString } from "@unseen-servant/shared/utils";
import { getHP } from "@unseen-servant/shared/character";
import type {
  BattleMapState,
  CharacterData,
  CombatState,
  EncounterLength,
  GameEvent,
  PacingProfile,
  PlayerInfo,
  ServerMessage,
} from "@unseen-servant/shared/types";
import type { DisplayMessage } from "@/components/chat/ChatPanel";
import type { StagedAoE } from "@/hooks/useAoEPlacement";
import type { PendingAoEPayload } from "@unseen-servant/shared/types";

function buildPendingAoEPayload(staged: StagedAoE): PendingAoEPayload {
  const base = {
    shape: staged.shape,
    spellName: staged.spellName,
    concentration: staged.concentration,
    color: staged.color,
    label: staged.label,
    rectanglePreset: staged.rectanglePreset,
    targetAoeId: staged.targetAoeId,
    size: staged.size,
  };
  if (staged.shape === "sphere") {
    // origin is a grid corner (world-integer tile-units).
    return { ...base, origin: staged.origin, cornerOrigin: true };
  }
  if (staged.shape === "cone") {
    return { ...base, origin: staged.origin, direction: staged.direction };
  }
  // rectangle
  const preset = staged.rectanglePreset ?? "free";
  if (preset === "free") {
    return {
      ...base,
      origin: staged.rectFrom ?? staged.origin,
      endpoint: staged.rectTo ?? staged.origin,
    };
  }
  if (preset === "cube") {
    return {
      ...base,
      origin: staged.origin,
      cornerOrigin: true,
      length: staged.size,
      width: staged.size,
    };
  }
  // line
  return {
    ...base,
    origin: staged.origin,
    direction: staged.direction,
    length: staged.length,
    width: staged.width ?? 5,
  };
}

/** Messages that belong in the main story chat */
function isStoryMessage(msg: ServerMessage): boolean {
  return msg.type === "server:chat" || msg.type === "server:ai";
}

/** Messages that belong in the sidebar activity log */
function isLogMessage(msg: ServerMessage): boolean {
  return msg.type === "server:system" || msg.type === "server:error";
}

export default function GamePage() {
  const { roomCode } = useParams<{ roomCode: string }>();
  const router = useRouter();
  // Start as undefined (matches server render), then read sessionStorage after mount
  const [playerName, setPlayerName] = useState<string | null | undefined>(undefined);

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

  return <GameContent roomCode={roomCode} playerName={playerName} />;
}

function GameContent({ roomCode, playerName }: { roomCode: string; playerName: string }) {
  const router = useRouter();
  const [storyMessages, setStoryMessages] = useState<DisplayMessage[]>([]);
  const [logMessages, setLogMessages] = useState<ServerMessage[]>([]);
  const [players, setPlayers] = useState<string[]>([]);
  const [allPlayers, setAllPlayers] = useState<PlayerInfo[]>([]);
  const [dmConnected, setDmConnected] = useState(false);
  const [isHost, setIsHost] = useState(false);
  const [hostName, setHostName] = useState<string>("");
  const [myCharacter, setMyCharacter] = useState<CharacterData | null>(null);
  const [myCharacterLibraryId, setMyCharacterLibraryId] = useState<string | null>(null);
  const [partyCharacters, setPartyCharacters] = useState<Record<string, CharacterData>>({});
  const [storyStarted, setStoryStarted] = useState(false);
  const [combatState, setCombatState] = useState<CombatState | null>(null);
  const [battleMap, setBattleMap] = useState<BattleMapState | null>(null);
  const [eventLog, setEventLog] = useState<GameEvent[]>([]);
  const [highlightedCombatantId, setHighlightedCombatantId] = useState<string | null>(null);
  const [campaigns, setCampaigns] = useState<
    {
      slug: string;
      name: string;
      lastPlayedAt: string;
      sessionCount: number;
      pacingProfile?: string;
      encounterLength?: string;
      customPrompt?: string;
    }[]
  >([]);
  const [activeCampaignSlug, setActiveCampaignSlug] = useState<string | undefined>(undefined);
  const [activeCampaignName, setActiveCampaignName] = useState<string | undefined>(undefined);
  const [campaignConfigured, setCampaignConfigured] = useState(false);
  const [showCampaignConfig, setShowCampaignConfig] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [typingPlayers, setTypingPlayers] = useState<Map<string, number>>(new Map());

  const [battleMapWidth, setBattleMapWidth] = useState(50);
  const [showActivity, setShowActivity] = useState(false);
  const [showEvents, setShowEvents] = useState(false);
  const [showParty, setShowParty] = useState(false);
  const [hoveredPartyPlayer, setHoveredPartyPlayer] = useState<string | null>(null);
  const [showCharacterDrawer, setShowCharacterDrawer] = useState(false);

  // Join state — don't render game UI until successfully joined
  const [joined, setJoined] = useState(false);

  // Password prompt state
  const [passwordRequired, setPasswordRequired] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [roomPassword, setRoomPassword] = useState<string | undefined>(undefined);

  // Client-only state: browser storage values loaded after mount
  const [clientReady, setClientReady] = useState(false);
  const [authToken, setAuthToken] = useState<string | undefined>(undefined);
  const [guestId, setGuestId] = useState<string | undefined>(undefined);

  // Track whether we've sent the initial character
  const sentCharacterRef = useRef(false);
  // Ref for player notes loaded callback (set after useWebSocket)
  const playerNotesLoadedRef = useRef<((content: string) => void) | null>(null);
  // Track seen message IDs for deduplication on reconnect
  const seenMessageIds = useRef<Set<string>>(new Set());

  // Character library for auto-sync and reconciliation
  const {
    findByName: libFindByName,
    saveCharacter: libSaveCharacter,
    updateCharacter: libUpdateCharacter,
    bindToCampaign: libBindToCampaign,
    touchCharacter: libTouchCharacter,
  } = useCharacterLibrary();
  const libFindByNameRef = useRef(libFindByName);
  libFindByNameRef.current = libFindByName;

  // Load all browser storage values after mount (avoids hydration mismatch)
  useEffect(() => {
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

  // Refs for reconciliation (avoid stale closures in handleMessage)
  const sendRef = useRef<(msg: import("@unseen-servant/shared/types").ClientMessage) => void>(
    () => {},
  );
  const myCharacterRef = useRef<CharacterData | null>(null);
  myCharacterRef.current = myCharacter;
  const myCharacterLibraryIdRef = useRef<string | null>(null);
  myCharacterLibraryIdRef.current = myCharacterLibraryId;

  // Reconcile a server-restored character with the local library
  const reconcileWithLibrary = useCallback(
    (restoredChar: CharacterData, campaignSlug?: string) => {
      const libEntry = libFindByNameRef.current(restoredChar.static.name);
      if (libEntry) {
        setMyCharacterLibraryId(libEntry.id);
        // Check if library version is newer (level-up between sessions)
        const libImportedAt = libEntry.character.static.importedAt ?? 0;
        const restoredImportedAt = restoredChar.static.importedAt ?? 0;
        if (libImportedAt > restoredImportedAt) {
          // Merge: new static from library + dynamic from campaign
          const merged = mergeReimport(
            restoredChar,
            libEntry.character.static,
            libEntry.character.dynamic,
          );
          setMyCharacter(merged);
          sendRef.current({ type: "client:set_character", character: merged });
          libUpdateCharacter(libEntry.id, merged);
        } else {
          // Campaign is truth — update library with server version
          libUpdateCharacter(libEntry.id, restoredChar);
        }
        if (campaignSlug) {
          libBindToCampaign(libEntry.id, campaignSlug, roomCode);
        }
        libTouchCharacter(libEntry.id);
      } else {
        // Character not in library — add it (different browser scenario)
        const saved = libSaveCharacter(restoredChar, {
          campaignSlug,
          roomCode,
        });
        setMyCharacterLibraryId(saved.id);
      }
    },
    [roomCode, libUpdateCharacter, libBindToCampaign, libTouchCharacter, libSaveCharacter],
  );

  const handleMessage = useCallback(
    (msg: ServerMessage) => {
      // Deduplicate messages using their id (prevents doubles on reconnect replay)
      const msgId = "id" in msg ? (msg as { id?: string }).id : undefined;
      if (msgId) {
        if (seenMessageIds.current.has(msgId)) return;
        seenMessageIds.current.add(msgId);
      }

      switch (msg.type) {
        case "server:room_joined":
          setJoined(true);
          setPlayers(msg.players);
          setHostName(msg.hostName);
          setDmConnected(msg.dmConnected);
          setIsHost(msg.isHost ?? false);
          setPasswordRequired(false);
          setPasswordError("");
          if (msg.user?.userId) setMyUserId(msg.user.userId);
          // Clear chat/log on reconnect — server replays the full chat log
          if (msg.isReconnect) {
            setStoryMessages([]);
            setLogMessages([]);
            seenMessageIds.current.clear();
          }
          if (msg.allPlayers) setAllPlayers(msg.allPlayers);
          if (msg.characters) {
            setPartyCharacters(msg.characters);
            // Restore own character from server (reconnect after days/weeks)
            if (msg.characters[playerName]) {
              const restoredChar = msg.characters[playerName];
              setMyCharacter(restoredChar);
              // Reconcile with library
              reconcileWithLibrary(restoredChar);
            }
          }
          if (msg.storyStarted !== undefined) setStoryStarted(msg.storyStarted);
          if (msg.campaignConfigured) setCampaignConfigured(true);
          if (msg.activeCampaignSlug) setActiveCampaignSlug(msg.activeCampaignSlug);
          if (msg.activeCampaignName) setActiveCampaignName(msg.activeCampaignName);
          break;

        case "server:player_joined":
          setPlayers(msg.players);
          setHostName(msg.hostName);
          if (msg.allPlayers) setAllPlayers(msg.allPlayers);
          if (msg.isDM) setDmConnected(true);
          break;

        case "server:player_left":
          setPlayers(msg.players);
          setHostName(msg.hostName);
          if (msg.allPlayers) setAllPlayers(msg.allPlayers);
          if (msg.isDM) setDmConnected(false);
          break;

        case "server:character_updated": {
          setPartyCharacters((prev) => ({
            ...prev,
            [msg.playerName]: msg.character,
          }));
          // If it's our own character being echoed back, update local state + library
          if (msg.playerName === playerName) {
            setMyCharacter(msg.character);
            const libEntry = libFindByNameRef.current(msg.character.static.name);
            if (libEntry) {
              libUpdateCharacter(libEntry.id, msg.character);
            }
          }
          // Activity log entry only for player-initiated edits (not DM tool changes)
          if (msg.source === "player") {
            const lvl = msg.character.static.classes.reduce((s, c) => s + c.level, 0);
            setLogMessages((prev) => [
              ...prev,
              {
                type: "server:system",
                content: `${msg.playerName} updated character "${msg.character.static.name}" (Lvl ${lvl}, HP ${msg.character.dynamic.currentHP}/${getHP(msg.character)}).`,
                timestamp: Date.now(),
              } as ServerMessage,
            ]);
          }
          break;
        }

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
          setCombatState(msg.gameState.encounter?.combat ?? null);
          setBattleMap(msg.gameState.encounter?.map ?? null);
          setEventLog(msg.gameState.eventLog);
          // Characters included on join/reconnect — bridge is the source of truth
          if (msg.characters) {
            setPartyCharacters(msg.characters);
            if (msg.characters[playerName]) {
              const restoredChar = msg.characters[playerName];
              setMyCharacter(restoredChar);
              reconcileWithLibrary(restoredChar);
            }
          }
          setGameStateSynced(true);
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
          break;

        case "server:dm_config_update":
          setDmConnected(true);
          if (msg.campaigns) setCampaigns(msg.campaigns);
          break;

        case "server:campaign_loaded":
          setActiveCampaignSlug(msg.campaignSlug);
          setActiveCampaignName(msg.campaignName);
          break;

        case "server:campaign_configured":
          setCampaignConfigured(true);
          setActiveCampaignSlug(msg.campaignSlug);
          setActiveCampaignName(msg.campaignName);
          // Restore characters from campaign if provided
          if (msg.restoredCharacters) {
            setPartyCharacters((prev) => ({ ...prev, ...msg.restoredCharacters }));
            if (msg.restoredCharacters[playerName]) {
              const restoredChar = msg.restoredCharacters[playerName];
              setMyCharacter(restoredChar);
              reconcileWithLibrary(restoredChar, msg.campaignSlug);
            }
          }
          break;

        case "server:event_log":
          setEventLog((prev) => [...prev, msg.event]);
          break;

        case "server:typing": {
          setTypingPlayers((prev) => {
            const next = new Map(prev);
            const existing = next.get(msg.playerName);
            if (existing) clearTimeout(existing);

            if (msg.isTyping) {
              const tid = window.setTimeout(() => {
                setTypingPlayers((p) => {
                  const n = new Map(p);
                  n.delete(msg.playerName);
                  return n;
                });
              }, 30000);
              next.set(msg.playerName, tid);
            } else {
              next.delete(msg.playerName);
            }
            return next;
          });
          break;
        }

        case "server:player_notes_loaded":
          playerNotesLoadedRef.current?.(msg.content);
          break;

        case "server:check_request":
          // Append as-is — shows Roll button to target player
          setStoryMessages((prev) => [...prev, msg]);
          break;

        case "server:dice_roll":
          // Legacy: check-linked dice_rolls from old stored chat logs — skip
          if (msg.checkRequestId) break;
          // Standalone roll (DM or player without check) — append directly
          setStoryMessages((prev) => [...prev, msg]);
          break;

        case "server:check_result":
          // Find matching check_request and merge into a single resolved card
          setStoryMessages((prev) => {
            const idx = prev.findLastIndex(
              (m) => m.type === "server:check_request" && m.check.id === msg.result.requestId,
            );
            if (idx === -1) {
              // No matching request — append as standalone fallback
              return [...prev, msg];
            }
            const request = (prev[idx] as Extract<DisplayMessage, { type: "server:check_request" }>)
              .check;
            const updated: DisplayMessage[] = [...prev];
            updated[idx] = {
              type: "merged_check",
              request,
              roll: msg.result.roll,
              result: msg.result,
              playerName: msg.result.characterName,
              timestamp: msg.timestamp,
            };
            return updated;
          });
          break;

        default:
          if (isStoryMessage(msg)) {
            setStoryMessages((prev) => [...prev, msg]);
            // Ensure chat panel is visible for non-host players who missed the start_story event
            setStoryStarted(true);
          } else if (isLogMessage(msg)) {
            setLogMessages((prev) => [...prev, msg]);
          }
          break;
      }
    },
    [router, playerName, libUpdateCharacter, reconcileWithLibrary],
  );

  const { send, connectionState } = useWebSocket({
    roomCode,
    playerName,
    authToken,
    guestId,
    password: roomPassword,
    onMessage: handleMessage,
    enabled: clientReady,
  });
  sendRef.current = send;

  // Cross-tab storage listener for mid-session level-ups
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key !== "character_library" || !myCharacterRef.current) return;
      try {
        const lib = e.newValue ? JSON.parse(e.newValue) : [];
        const libId = myCharacterLibraryIdRef.current;
        const currentChar = myCharacterRef.current;
        if (!currentChar) return;
        const entry = lib.find((c: { id: string; character: CharacterData }) =>
          libId
            ? c.id === libId
            : c.character.static.name.toLowerCase() === currentChar.static.name.toLowerCase(),
        );
        if (!entry) return;
        const libImportedAt = entry.character.static.importedAt ?? 0;
        const currentImportedAt = myCharacterRef.current.static.importedAt ?? 0;
        if (libImportedAt > currentImportedAt) {
          const merged = mergeReimport(
            myCharacterRef.current,
            entry.character.static,
            entry.character.dynamic,
          );
          setMyCharacter(merged);
          send({ type: "client:set_character", character: merged });
        }
      } catch {
        /* ignore parse errors */
      }
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, [send]);

  // Player notes hook
  const {
    notes: playerNotes,
    saveState: notesSaveState,
    updateNotes,
    handleNotesLoaded,
  } = usePlayerNotes({ send });
  playerNotesLoadedRef.current = handleNotesLoaded;

  // AoE placement hook — owns local staging state for player-placed templates
  const aoePlacement = useAoEPlacement(combatState, battleMap, myCharacter?.static.name);

  // Read my userId from auth state (set during room_joined)
  const [myUserId, setMyUserId] = useState<string | undefined>(undefined);

  // Expose message handler for Playwright tests (zero cost, no-op in production)
  useEffect(() => {
    (window as Window & { __testInjectMessage?: typeof handleMessage }).__testInjectMessage =
      handleMessage;
    return () => {
      delete (window as Window & { __testInjectMessage?: typeof handleMessage })
        .__testInjectMessage;
    };
  }, [handleMessage]);

  // Flag that initial game state sync has been received (for test timing)
  const [gameStateSynced, setGameStateSynced] = useState(false);
  useEffect(() => {
    if (gameStateSynced) {
      (window as Window & { __testGameStateSynced?: boolean }).__testGameStateSynced = true;
    }
  }, [gameStateSynced]);

  // Send initial character data after connection
  useEffect(() => {
    if (connectionState === "connected" && myCharacter && !sentCharacterRef.current) {
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

  const handleSendWithAoE = useCallback(
    (content: string, staged: StagedAoE) => {
      send({
        type: "client:chat",
        content,
        playerName,
        pendingAoE: buildPendingAoEPayload(staged),
      });
      aoePlacement.clearStaged();
    },
    [send, playerName, aoePlacement],
  );

  const handleKick = (name: string) => {
    send({ type: "client:kick_player", playerName: name });
  };

  const handleStartStory = () => {
    send({ type: "client:start_story" });
    // Bind character to campaign — this is when the bridge snapshots characters
    if (myCharacterLibraryId && activeCampaignSlug) {
      libBindToCampaign(myCharacterLibraryId, activeCampaignSlug, roomCode);
    }
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

  const handleEndTurn = useCallback(() => {
    send({ type: "client:end_turn" });
  }, [send]);

  const handleDestroyRoom = () => {
    send({ type: "client:destroy_room" });
  };

  const handleSetPassword = (password: string) => {
    send({ type: "client:set_password", password });
  };

  const handleTypingChange = useCallback(
    (isTyping: boolean) => {
      send({ type: "client:typing", isTyping });
    },
    [send],
  );

  const handleConfigureCampaign = (config: {
    campaignName: string;
    systemPrompt?: string;
    pacingProfile: PacingProfile;
    encounterLength: EncounterLength;
    existingCampaignSlug?: string;
  }) => {
    send({ type: "client:configure_campaign", ...config });
  };

  const handleCharacterImported = useCallback(
    (character: CharacterData, libraryId: string) => {
      setMyCharacter(character);
      setMyCharacterLibraryId(libraryId);
      setShowCharacterDrawer(true);
      send({ type: "client:set_character", character });
    },
    [send],
  );

  const handlePasswordSubmit = () => {
    if (!passwordInput.trim()) return;
    setRoomPassword(passwordInput.trim());
    setPasswordError("");
    setPasswordRequired(false);
    setPasswordInput("");
  };

  // Compute whether it's this player's turn in combat
  const isMyTurn = useMemo(() => {
    if (!combatState || combatState.phase !== "active" || !myCharacter) return false;
    const activeId = combatState.turnOrder[combatState.turnIndex];
    const activeCombatant = combatState.combatants[activeId];
    return (
      activeCombatant?.type === "player" &&
      activeCombatant.name.toLowerCase() === myCharacter.static.name.toLowerCase()
    );
  }, [combatState, myCharacter]);

  // Password prompt overlay
  if (passwordRequired) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="bg-gray-800/60 border border-gray-700/40 rounded-xl p-6 w-full max-w-sm space-y-4">
          <div className="text-center">
            <div className="text-3xl mb-2">&#128274;</div>
            <h2
              className="text-lg font-semibold text-amber-200/90"
              style={{ fontFamily: "var(--font-cinzel)" }}
            >
              Room Password Required
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Room <span className="font-mono text-amber-300">{roomCode}</span> is password
              protected
            </p>
          </div>

          {passwordError && <p className="text-red-400 text-sm text-center">{passwordError}</p>}

          <input
            type="password"
            value={passwordInput}
            onChange={(e) => setPasswordInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handlePasswordSubmit()}
            placeholder="Enter room password..."
            autoFocus
            className="w-full bg-gray-900/60 border border-gray-700/50 rounded-lg px-4 py-2.5
                       text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-1
                       focus:ring-amber-500/50 focus:border-amber-500/30"
          />

          <div className="flex gap-3">
            <Button variant="primary" size="lg" className="flex-1" onClick={handlePasswordSubmit}>
              Join Room
            </Button>
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
          <div className="w-8 h-8 border-2 border-amber-500/70 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-gray-400">
            Connecting to room <span className="font-mono text-amber-300">{roomCode}</span>...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen">
      <GameNavBar
        roomCode={roomCode}
        isHost={isHost}
        dmConnected={dmConnected}
        connectionState={connectionState}
        playerCount={players.length}
        storyStarted={storyStarted}
        campaignConfigured={campaignConfigured}
        logMessageCount={logMessages.length}
        eventLogCount={eventLog.length}
        showNotes={showNotes}
        onToggleNotes={() => setShowNotes((v) => !v)}
        onToggleActivity={() => setShowActivity((v) => !v)}
        onToggleEvents={() => setShowEvents((v) => !v)}
        onToggleParty={() => setShowParty((v) => !v)}
        onOpenSettings={() => setShowSettings(true)}
        onOpenGuide={() => setShowGuide(true)}
      />
      {/* Main Content Area */}
      <div className="flex flex-1 min-h-0">
        {/* Lobby: inline character picker sidebar (only until a character is selected) */}
        {!storyStarted && !myCharacter && (
          <div className="w-52 border-r border-gray-700/20 flex flex-col bg-gray-950 shrink-0">
            <LeftSidebar character={myCharacter} onCharacterImported={handleCharacterImported} />
          </div>
        )}

        {/* Inline character sheet panel: always in lobby, togglable once story starts */}
        {(showCharacterDrawer || !storyStarted) && myCharacter && (
          <div className="w-80 shrink-0 border-r border-gray-700/20 overflow-y-auto bg-gray-900">
            <CharacterSheet
              character={myCharacter}
              onCastAoE={
                storyStarted && combatState?.phase === "active"
                  ? (params) => {
                      aoePlacement.startPlacement(params);
                    }
                  : undefined
              }
            />
          </div>
        )}

        {/* Center content */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Lobby center: waiting state + campaign config */}
          {!storyStarted && (
            <div className="flex-1 flex flex-col items-center justify-center gap-3">
              {campaignConfigured && activeCampaignName && (
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span className="text-sm font-medium text-emerald-400">{activeCampaignName}</span>
                </div>
              )}

              <p className="text-base text-gray-600" style={{ fontFamily: "var(--font-cinzel)" }}>
                Waiting for the adventure to begin…
              </p>
              <div className="w-10 h-px bg-amber-500/25" />

              {isHost &&
                (campaignConfigured && dmConnected ? (
                  <Button variant="outline" size="lg" onClick={handleStartStory}>
                    <span>⚔</span>
                    Begin the Adventure
                  </Button>
                ) : (
                  <>
                    <Button
                      variant="outline"
                      size="lg"
                      onClick={() => setShowCampaignConfig(true)}
                      disabled={!dmConnected}
                    >
                      Configure Campaign
                    </Button>
                    {!dmConnected && (
                      <p className="text-xs text-gray-600">Waiting for DM to connect...</p>
                    )}
                  </>
                ))}
            </div>
          )}

          {/* Active gameplay */}
          {storyStarted && (
            <>
              {battleMap && combatState && combatState.phase === "active" ? (
                <CombatLayout
                  battleMap={battleMap}
                  combatState={combatState}
                  partyCharacters={partyCharacters}
                  myCharacterName={myCharacter?.static.name}
                  onMoveToken={handleMoveToken}
                  onEndTurn={handleEndTurn}
                  onCombatantClick={setHighlightedCombatantId}
                  highlightedCombatantId={highlightedCombatantId}
                  battleMapWidth={battleMapWidth}
                  onBattleMapWidthChange={setBattleMapWidth}
                  storyMessages={storyMessages}
                  onSend={handleSend}
                  onSendWithAoE={handleSendWithAoE}
                  connectionState={connectionState}
                  onRollDice={handleRollDice}
                  isMyTurn={isMyTurn}
                  typingPlayers={Array.from(typingPlayers.keys())}
                  onTypingChange={handleTypingChange}
                  aoePlacement={aoePlacement}
                  myUserId={myUserId}
                  characterTrigger={
                    myCharacter ? (
                      <CharacterTrigger
                        character={myCharacter}
                        onClick={() => setShowCharacterDrawer((v) => !v)}
                        compact
                      />
                    ) : undefined
                  }
                />
              ) : (
                <ChatPanel
                  messages={storyMessages}
                  onSend={handleSend}
                  connectionState={connectionState}
                  onRollDice={handleRollDice}
                  myCharacterName={myCharacter?.static.name}
                  isMyTurn={isMyTurn}
                  onEndTurn={handleEndTurn}
                  typingPlayers={Array.from(typingPlayers.keys())}
                  onTypingChange={handleTypingChange}
                  characterTrigger={
                    myCharacter ? (
                      <CharacterTrigger
                        character={myCharacter}
                        onClick={() => setShowCharacterDrawer((v) => !v)}
                      />
                    ) : undefined
                  }
                />
              )}
            </>
          )}

          {/* Bottom bar: chat input for lobby */}
          {!storyStarted && (
            <div className="flex items-center gap-3 h-14 px-4 border-t border-gray-700/20 bg-gray-950 shrink-0">
              {/* Character trigger (shown after character is selected) */}
              {myCharacter && (
                <CharacterTrigger
                  character={myCharacter}
                  onClick={() => setShowCharacterDrawer((v) => !v)}
                />
              )}
              <input
                type="text"
                placeholder="What do you do?"
                disabled
                className="flex-1 h-9 bg-gray-900/60 border border-gray-700/30 rounded-md px-3
                           text-sm text-gray-100 placeholder-gray-600 disabled:opacity-50"
              />
              <Button disabled size="sm">
                Send
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* ─── Party Popup ─── */}
      {showParty && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowParty(false)} />
          <div className="fixed top-12 right-24 z-50 w-72 bg-gray-900 border border-gray-700/40 rounded-lg shadow-2xl">
            <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700/30">
              <span
                className="text-xs text-gray-400 uppercase tracking-wider font-medium"
                style={{ fontFamily: "var(--font-cinzel)" }}
              >
                Party
              </span>
              <button
                onClick={() => setShowParty(false)}
                className="text-gray-500 hover:text-gray-300 text-lg leading-none"
              >
                ×
              </button>
            </div>
            <div className="p-3 space-y-2.5 max-h-80 overflow-y-auto">
              {(allPlayers.length > 0
                ? allPlayers
                : players.map((name) => ({ name, online: true, isHost: name === hostName }))
              ).map((player) => {
                const charData = partyCharacters[player.name];
                return (
                  <div
                    key={player.name}
                    className="group"
                    onMouseEnter={() => setHoveredPartyPlayer(player.name)}
                    onMouseLeave={() => setHoveredPartyPlayer(null)}
                  >
                    <div className="flex items-center gap-2 text-sm">
                      <div
                        className={`w-2 h-2 rounded-full shrink-0 ${player.online ? "bg-green-500" : "bg-gray-600"}`}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className={player.online ? "text-gray-200" : "text-gray-500"}>
                            {player.name}
                          </span>
                          {player.isHost && <span className="text-xs text-amber-300">(host)</span>}
                          {!player.online && (
                            <span className="text-xs text-gray-600">(offline)</span>
                          )}
                        </div>
                        {charData && (
                          <div className="text-xs text-gray-500">
                            {formatClassString(charData.static.classes)} ·{" "}
                            {charData.static.species || charData.static.race}
                          </div>
                        )}
                      </div>
                      {isHost && !player.isHost && player.online && (
                        <button
                          onClick={() => handleKick(player.name)}
                          className="text-xs text-red-400/60 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          Kick
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          {/* Character popover — rendered outside the popup so it's not clipped by overflow */}
          {hoveredPartyPlayer &&
            (() => {
              const player = (
                allPlayers.length > 0
                  ? allPlayers
                  : players.map((name) => ({ name, online: true, isHost: name === hostName }))
              ).find((p) => p.name === hoveredPartyPlayer);
              const charData = player ? partyCharacters[player.name] : undefined;
              if (!player || !charData) return null;
              return (
                <div className="fixed z-[60]" style={{ top: "3rem", right: "calc(6rem + 18rem)" }}>
                  <CharacterPopover
                    character={charData}
                    playerName={player.name}
                    online={player.online}
                  />
                </div>
              );
            })()}
        </>
      )}

      <Drawer open={showActivity} onClose={() => setShowActivity(false)} title="Activity Log">
        <div className="p-4 space-y-1.5">
          {logMessages.length === 0 ? (
            <p className="text-xs text-gray-600 italic">No activity yet</p>
          ) : (
            logMessages.map((msg, i) => (
              <div
                key={i}
                className={`flex items-start gap-2 text-xs ${msg.type === "server:error" ? "text-red-400" : "text-gray-500"}`}
              >
                {"timestamp" in msg && typeof msg.timestamp === "number" && (
                  <span className="shrink-0 text-gray-600 font-mono">
                    {new Date(msg.timestamp).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                )}
                <span>{"content" in msg ? (msg as { content: string }).content : ""}</span>
              </div>
            ))
          )}
        </div>
      </Drawer>

      <Drawer open={showEvents} onClose={() => setShowEvents(false)} title="Event Log">
        <div className="p-4 space-y-2">
          {!eventLog || eventLog.length === 0 ? (
            <p className="text-xs text-gray-600 italic">No events yet</p>
          ) : (
            eventLog.slice(-10).map((evt) => (
              <div key={evt.id} className="flex items-start justify-between gap-2 group">
                <div className="text-xs text-gray-400 flex-1 flex items-start gap-2">
                  <span className="shrink-0 text-gray-600 font-mono">
                    {new Date(evt.timestamp).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  <span>
                    {evt.type.replace(/_/g, " ")} — {evt.description}
                  </span>
                </div>
                {isHost && (
                  <button
                    onClick={() => handleRollback(evt.id)}
                    className="text-xs text-red-400/60 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                  >
                    Undo
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </Drawer>

      {/* Player Notes Panel */}
      {showNotes && (
        <PlayerNotesPanel
          notes={playerNotes}
          saveState={notesSaveState}
          onChange={updateNotes}
          onClose={() => setShowNotes(false)}
        />
      )}

      {/* Settings Modal */}
      {showSettings && (
        <SettingsModal
          onClose={() => setShowSettings(false)}
          isHost={isHost}
          onSetPassword={handleSetPassword}
          onDestroyRoom={handleDestroyRoom}
        />
      )}

      {/* Campaign Config Modal */}
      {showCampaignConfig && (
        <CampaignConfigModal
          campaigns={campaigns}
          onSubmit={handleConfigureCampaign}
          onClose={() => setShowCampaignConfig(false)}
        />
      )}

      {/* How to Play Guide */}
      {showGuide && <HowToPlayModal onClose={() => setShowGuide(false)} />}
    </div>
  );
}

// ─── Combat Layout (side-by-side BattleMap + ChatPanel with resizable divider) ───

function CombatLayout({
  battleMap,
  combatState,
  partyCharacters,
  myCharacterName,
  onMoveToken,
  onEndTurn,
  onCombatantClick,
  highlightedCombatantId,
  battleMapWidth,
  onBattleMapWidthChange,
  storyMessages,
  onSend,
  onSendWithAoE,
  connectionState,
  onRollDice,
  isMyTurn,
  typingPlayers,
  onTypingChange,
  characterTrigger,
  aoePlacement,
  myUserId,
}: {
  battleMap: import("@unseen-servant/shared/types").BattleMapState;
  combatState: import("@unseen-servant/shared/types").CombatState;
  partyCharacters: Record<string, import("@unseen-servant/shared/types").CharacterData>;
  myCharacterName?: string;
  onMoveToken: (to: { x: number; y: number }) => void;
  onEndTurn: () => void;
  onCombatantClick: (id: string) => void;
  highlightedCombatantId: string | null;
  battleMapWidth: number;
  onBattleMapWidthChange: (w: number) => void;
  storyMessages: DisplayMessage[];
  onSend: (content: string) => void;
  onSendWithAoE: (content: string, staged: StagedAoE) => void;
  connectionState: import("@/hooks/useWebSocket").ConnectionState;
  onRollDice: (id: string) => void;
  isMyTurn: boolean;
  typingPlayers: string[];
  onTypingChange: (isTyping: boolean) => void;
  characterTrigger?: React.ReactNode;
  aoePlacement: import("@/hooks/useAoEPlacement").UseAoEPlacementResult;
  myUserId?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!draggingRef.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const pct = ((e.clientX - rect.left) / rect.width) * 100;
      onBattleMapWidthChange(Math.min(75, Math.max(25, pct)));
    };
    const onMouseUp = () => {
      draggingRef.current = false;
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [onBattleMapWidthChange]);

  return (
    <div ref={containerRef} className="flex-1 flex flex-row min-h-0">
      <BattleMap
        map={battleMap}
        combat={combatState}
        partyCharacters={partyCharacters}
        myCharacterName={myCharacterName}
        onMoveToken={onMoveToken}
        onCombatantClick={onCombatantClick}
        highlightedCombatantId={highlightedCombatantId}
        style={{ width: `${battleMapWidth}%` }}
        aoePlacement={aoePlacement}
        myUserId={myUserId}
      />
      {/* Resize handle */}
      <div
        className="w-1 cursor-col-resize bg-gray-700/50 hover:bg-amber-500/50 active:bg-amber-400/60 transition-colors shrink-0"
        onMouseDown={() => {
          draggingRef.current = true;
        }}
      />
      <ChatPanel
        messages={storyMessages}
        onSend={onSend}
        connectionState={connectionState}
        onRollDice={onRollDice}
        myCharacterName={myCharacterName}
        isMyTurn={isMyTurn}
        onEndTurn={onEndTurn}
        typingPlayers={typingPlayers}
        onTypingChange={onTypingChange}
        characterTrigger={characterTrigger}
        stagedAoE={aoePlacement.stagedAoE}
        stagedAoECounts={aoePlacement.affectedCombatants}
        onCancelAoE={aoePlacement.cancel}
        onSendWithAoE={onSendWithAoE}
      />
    </div>
  );
}
