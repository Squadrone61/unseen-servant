"use client";

import { Suspense, useState, useEffect, useRef, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";

import { useAuth } from "@/hooks/useAuth";
import { useCharacterLibrary } from "@/hooks/useCharacterLibrary";
import { Button } from "@/components/ui/Button";
import { HowToPlayModal } from "@/components/guide/HowToPlayModal";
import { charColor } from "@/utils/char-color";
import { timeAgo } from "@/utils/time-ago";

interface RoomMeta {
  roomCode: string;
  hostName: string;
  playerCount: number;
  hasPassword: boolean;
  createdAt: number;
}

function getWorkerUrl(): string {
  return process.env.NEXT_PUBLIC_WORKER_URL || "http://localhost:8787";
}

export default function HomePage() {
  return (
    <Suspense>
      <HomePageInner />
    </Suspense>
  );
}

function HomePageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading: authLoading, login, logout } = useAuth();
  const { characters } = useCharacterLibrary();
  const [playerName, setPlayerName] = useState("");
  const playerNameLoadedRef = useRef(false);
  const [joinCode, setJoinCode] = useState("");
  const [joinPassword, setJoinPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [kickMessage, setKickMessage] = useState("");
  const [rooms, setRooms] = useState<RoomMeta[]>([]);
  const [showGuide, setShowGuide] = useState(false);
  const [guideBannerDismissed, setGuideBannerDismissed] = useState(true);

  // Load saved state on mount
  useEffect(() => {
    localStorage.removeItem("ai_config");
    localStorage.removeItem("anthropic_api_key");

    const storedName = localStorage.getItem("playerName");
    if (storedName) {
      setPlayerName(storedName);
      playerNameLoadedRef.current = true;
    }

    const kick = sessionStorage.getItem("kick_message");
    if (kick) {
      setKickMessage(kick);
      sessionStorage.removeItem("kick_message");
    }

    const joinParam = searchParams.get("join");
    if (joinParam) {
      setJoinCode(joinParam.toUpperCase().slice(0, 6));
    }

    if (!localStorage.getItem("unseen-guide-dismissed")) {
      setGuideBannerDismissed(false);
    }
  }, [searchParams]);

  // Fetch active rooms
  const fetchRooms = useCallback(async () => {
    try {
      const res = await fetch(`${getWorkerUrl()}/api/rooms`);
      if (!res.ok) return;
      const data = await res.json();
      setRooms(data.rooms ?? []);
    } catch {
      // Silently fail — rooms strip is optional context
    }
  }, []);

  useEffect(() => {
    fetchRooms();
  }, [fetchRooms]);

  // Pre-fill character name from Google account
  useEffect(() => {
    if (user?.displayName && !playerName && !playerNameLoadedRef.current) {
      setPlayerName(user.displayName);
    }
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  // Debounce-save playerName to localStorage
  useEffect(() => {
    const trimmed = playerName.trim();
    const timer = setTimeout(() => {
      if (trimmed) {
        localStorage.setItem("playerName", trimmed);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [playerName]);

  const handleCreate = async () => {
    if (!playerName.trim()) {
      setError("Enter your player name");
      return;
    }
    setLoading(true);
    setError("");

    try {
      localStorage.setItem("playerName", playerName.trim());
      const res = await fetch(`${getWorkerUrl()}/api/rooms/create`, {
        method: "POST",
      });
      const { roomCode } = await res.json();
      router.push(`/rooms/${roomCode}`);
    } catch {
      setError("Failed to create room. Is the server running?");
      setLoading(false);
    }
  };

  const handleJoin = (roomCode?: string) => {
    const code = roomCode || joinCode.trim();
    if (!playerName.trim()) {
      setError("Enter your player name");
      return;
    }
    if (code.length !== 6) {
      setError("Room code must be 6 characters");
      return;
    }

    localStorage.setItem("playerName", playerName.trim());
    if (joinPassword.trim()) {
      sessionStorage.setItem("roomPassword", joinPassword.trim());
    }
    router.push(`/rooms/${code.toUpperCase()}`);
  };

  const topCharacters = characters.slice(0, 4);

  return (
    <div className="flex min-h-screen flex-col">
      {/* ── Nav Bar ── */}
      <nav className="flex h-11 shrink-0 items-center justify-between border-b border-gray-700/25 bg-gray-950 px-7">
        <div className="flex items-center gap-2">
          <Image src="/icon.svg" alt="Unseen Servant" width={20} height={20} className="h-5 w-5" />
        </div>

        <div className="flex items-center gap-2.5">
          <Button variant="ghost" size="sm" onClick={() => setShowGuide(true)}>
            How to Play
          </Button>
          <div className="h-4 w-px bg-gray-700/30" />
          {authLoading ? (
            <span className="text-xs text-gray-600">Loading...</span>
          ) : user ? (
            <>
              <div className="flex items-center gap-2">
                {user.avatarUrl && (
                  // eslint-disable-next-line @next/next/no-img-element -- external Google avatar URL, no remote host config
                  <img src={user.avatarUrl} alt="" className="h-6 w-6 rounded-full" />
                )}
                <span className="text-xs text-gray-400">{user.displayName}</span>
              </div>
              <Button variant="ghost" size="sm" onClick={logout}>
                Sign out
              </Button>
            </>
          ) : (
            <>
              <span className="text-xs text-gray-600">Playing as guest</span>
              <button
                onClick={login}
                className="flex items-center gap-1.5 rounded-md bg-white px-3
                           py-1.5 text-xs font-medium text-gray-800 transition-colors hover:bg-gray-100"
              >
                <svg className="h-3 w-3" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
                Sign in with Google
              </button>
            </>
          )}
        </div>
      </nav>

      {/* ── Hero Area ── */}
      <div
        className="flex flex-1 flex-col items-center justify-center gap-5 px-8"
        style={{
          background: "radial-gradient(ellipse at center, #1a1610 0%, #111318 70%)",
        }}
      >
        <Image src="/icon.svg" alt="" width={96} height={96} className="h-24 w-24" />
        <h1
          className="text-4xl font-bold text-amber-200/90"
          style={{
            fontFamily: "var(--font-cinzel)",
            textShadow: "0 0 40px rgba(245,158,11,0.2)",
          }}
        >
          Unseen Servant
        </h1>
        <p className="text-xs tracking-widest text-gray-600 uppercase">
          D&D 5E WITH AN AI GAME MASTER
        </p>
        <div className="h-px w-10 bg-amber-500/25" />

        {/* First-time guide banner */}
        {!guideBannerDismissed && (
          <div className="flex w-full max-w-xl items-center gap-3 rounded-lg border border-amber-500/15 bg-amber-500/5 px-4 py-2.5">
            <span className="flex-1 text-sm text-gray-400">
              New to Unseen Servant?{" "}
              <button
                onClick={() => setShowGuide(true)}
                className="text-amber-400 underline underline-offset-2 transition-colors hover:text-amber-300"
              >
                Learn how to play
              </button>
            </span>
            <button
              onClick={() => {
                setGuideBannerDismissed(true);
                localStorage.setItem("unseen-guide-dismissed", "1");
              }}
              className="text-lg leading-none text-gray-600 transition-colors hover:text-gray-400"
            >
              &times;
            </button>
          </div>
        )}

        {/* Kick/Reject message */}
        {kickMessage && (
          <div className="w-full max-w-lg rounded-lg border border-red-700/50 bg-red-900/20 p-3 text-center">
            <p className="text-sm text-red-400">{kickMessage}</p>
          </div>
        )}

        {/* Player Name */}
        <div className="w-full max-w-xl space-y-1">
          <label
            className="text-xs font-medium tracking-wider text-gray-600 uppercase"
            style={{ fontFamily: "var(--font-cinzel)" }}
          >
            Player Name
          </label>
          <input
            type="text"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            placeholder="What should we call you?"
            maxLength={30}
            className="h-10 w-full rounded-lg border border-gray-700/40 bg-gray-900/80 px-4
                       text-sm text-gray-100 placeholder-gray-600 transition-colors focus:border-amber-500/25
                       focus:ring-1 focus:ring-amber-500/40 focus:outline-none"
          />
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        {/* Create / Join Cards */}
        <div className="flex w-full max-w-xl gap-4">
          {/* Create Room — primary */}
          <div className="flex flex-1 flex-col gap-3 rounded-xl border border-amber-500/15 bg-gray-800/50 p-5">
            <div
              className="text-xs tracking-widest text-amber-200/90 uppercase"
              style={{ fontFamily: "var(--font-cinzel)" }}
            >
              Create Room
            </div>
            <p className="flex-1 text-xs leading-relaxed text-gray-500">
              Start a new adventure as the host. Configure your campaign and invite players.
            </p>
            <Button onClick={handleCreate} disabled={loading} size="lg" fullWidth>
              {loading ? "Creating..." : "Create Room"}
            </Button>
          </div>

          {/* Join Room — secondary */}
          <div className="flex flex-1 flex-col gap-3 rounded-xl border border-gray-700/50 bg-gray-800/30 p-5">
            <div
              className="text-xs tracking-widest text-gray-600 uppercase"
              style={{ fontFamily: "var(--font-cinzel)" }}
            >
              Join Room
            </div>
            <div className="flex flex-1 gap-2">
              <div className="flex-1 space-y-1">
                <label className="text-xs text-gray-600">Room Code</label>
                <input
                  type="text"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase().slice(0, 6))}
                  placeholder="ABCDEF"
                  maxLength={6}
                  className="h-10 w-full rounded-lg border border-gray-700/40 bg-gray-900/60 px-3
                             text-center font-mono text-sm tracking-widest text-gray-100
                             placeholder-gray-600 transition-colors focus:border-amber-500/25 focus:ring-1
                             focus:ring-amber-500/40 focus:outline-none"
                />
              </div>
              <div className="flex-1 space-y-1">
                <label className="text-xs text-gray-600">Password (optional)</label>
                <input
                  type="password"
                  value={joinPassword}
                  onChange={(e) => setJoinPassword(e.target.value)}
                  placeholder="Leave blank if none"
                  className="h-10 w-full rounded-lg border border-gray-700/40 bg-gray-900/60 px-3
                             text-xs text-gray-100 placeholder-gray-600 transition-colors focus:border-amber-500/25
                             focus:ring-1 focus:ring-amber-500/40 focus:outline-none"
                />
              </div>
            </div>
            <Button variant="secondary" size="lg" fullWidth onClick={() => handleJoin()}>
              Join Room
            </Button>
          </div>
        </div>
      </div>

      {/* ── Bottom Context Strip ── */}
      <div className="flex h-72 shrink-0 gap-6 border-t border-gray-700/20 bg-gray-950 px-7 py-5">
        {/* Active Rooms */}
        <div className="flex min-w-0 flex-1 flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span
                className="text-xs tracking-widest text-gray-500 uppercase"
                style={{ fontFamily: "var(--font-cinzel)" }}
              >
                Active Rooms
              </span>
              <Button variant="icon" onClick={() => fetchRooms()} title="Refresh rooms">
                <svg
                  className="h-3 w-3"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                  <path d="M3 3v5h5" />
                  <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                  <path d="M16 16h5v5" />
                </svg>
              </Button>
            </div>
            <Link
              href="/rooms"
              className="text-xs text-amber-500/60 transition-colors hover:text-amber-500/90"
            >
              Browse all →
            </Link>
          </div>

          <div className="flex min-h-0 flex-1 gap-2.5">
            {rooms.length === 0 ? (
              <div className="flex flex-1 items-center justify-center text-xs text-gray-700">
                No active rooms
              </div>
            ) : (
              rooms.slice(0, 3).map((room) => (
                <div
                  key={room.roomCode}
                  className="flex h-24 w-56 shrink-0 flex-col gap-2 rounded-lg border border-gray-700/25 bg-gray-900/60
                             p-3 transition-colors hover:border-gray-700/40"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-semibold tracking-wide text-gray-300">
                      {room.hostName ? `${room.hostName}'s Room` : room.roomCode}
                    </span>
                    <Button variant="outline" size="xs" onClick={() => handleJoin(room.roomCode)}>
                      Join
                    </Button>
                  </div>
                  <span className="font-mono text-xs tracking-wide text-gray-600">
                    {room.roomCode}
                  </span>
                  <div className="flex items-center gap-1.5 text-xs text-gray-600">
                    <svg
                      className="h-2.5 w-2.5"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                      <circle cx="9" cy="7" r="4" />
                      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                    </svg>
                    <span>{room.playerCount}</span>
                    {room.hasPassword && (
                      <svg
                        className="ml-1 h-2.5 w-2.5 text-yellow-500/60"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <rect width="18" height="11" x="3" y="11" rx="2" />
                        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                      </svg>
                    )}
                    <span className="ml-auto">{timeAgo(room.createdAt)}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Divider */}
        <div className="w-px self-stretch bg-gray-700/20" />

        {/* Characters */}
        <div className="flex min-w-0 flex-1 flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <span
              className="text-xs tracking-widest text-gray-500 uppercase"
              style={{ fontFamily: "var(--font-cinzel)" }}
            >
              Characters
            </span>
            <Link
              href="/characters"
              className="text-xs text-gray-500 transition-colors hover:text-gray-400"
            >
              Manage all →
            </Link>
          </div>

          <div className="flex min-h-0 flex-1 gap-2.5">
            {topCharacters.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-2">
                <span className="text-xs text-gray-700">No characters yet</span>
                <Link
                  href="/characters/create"
                  className="text-xs text-gray-500 transition-colors hover:text-gray-400"
                >
                  Create one →
                </Link>
              </div>
            ) : (
              topCharacters.map((saved) => {
                const c = saved.character;
                const name = c.static?.name || "Unnamed";
                const color = charColor(name);
                const mainClass = c.static?.classes?.[0];
                const level = c.static?.classes?.reduce((sum, cl) => sum + (cl.level || 0), 0) || 0;

                return (
                  <Link
                    key={saved.id}
                    href={`/characters/${saved.id}`}
                    className="flex h-24 w-56 shrink-0 items-center gap-3 rounded-lg border border-gray-700/25 bg-gray-900/60
                               p-3 transition-colors hover:border-gray-700/40"
                  >
                    <div
                      className={`h-10 w-10 shrink-0 rounded-md ${color.bg} border ${color.border}
                                  flex items-center justify-center`}
                    >
                      <span
                        className={`text-base ${color.text}`}
                        style={{ fontFamily: "var(--font-cinzel)" }}
                      >
                        {name[0]?.toUpperCase()}
                      </span>
                    </div>
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span
                        className="truncate text-xs text-gray-300"
                        style={{ fontFamily: "var(--font-cinzel)" }}
                      >
                        {name}
                      </span>
                      <span className="truncate text-xs text-gray-600">
                        Lv {level} {mainClass?.name || ""}
                        {c.static?.species ? ` · ${c.static.species}` : ""}
                      </span>
                      {saved.campaignSlug && (
                        <span className="w-fit truncate rounded border border-amber-500/10 bg-amber-500/5 px-1.5 py-0.5 text-xs text-amber-500/40">
                          {saved.campaignSlug}
                        </span>
                      )}
                    </div>
                  </Link>
                );
              })
            )}
          </div>
        </div>
      </div>
      {showGuide && <HowToPlayModal onClose={() => setShowGuide(false)} />}
    </div>
  );
}
