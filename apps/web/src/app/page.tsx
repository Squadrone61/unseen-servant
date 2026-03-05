"use client";

import { Suspense, useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";

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
  const [playerName, setPlayerName] = useState("");
  const playerNameLoadedRef = useRef(false);
  const [joinCode, setJoinCode] = useState("");
  const [joinPassword, setJoinPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [kickMessage, setKickMessage] = useState("");

  // Load saved state on mount
  useEffect(() => {
    // Clean up legacy ai_config from localStorage
    localStorage.removeItem("ai_config");
    localStorage.removeItem("anthropic_api_key");

    // Restore player name from localStorage
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

    // Support ?join=ROOMCODE query param (redirect-back from room page)
    const joinParam = searchParams.get("join");
    if (joinParam) {
      setJoinCode(joinParam.toUpperCase().slice(0, 6));
    }
  }, [searchParams]);

  // Pre-fill character name from Google account only if user hasn't set one
  useEffect(() => {
    if (user?.displayName && !playerName && !playerNameLoadedRef.current) {
      setPlayerName(user.displayName);
    }
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  // Debounce-save playerName to sessionStorage as user types
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
      setError("Enter your character name");
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

  const handleJoin = () => {
    if (!playerName.trim()) {
      setError("Enter your character name");
      return;
    }
    if (joinCode.trim().length !== 6) {
      setError("Room code must be 6 characters");
      return;
    }

    localStorage.setItem("playerName", playerName.trim());
    if (joinPassword.trim()) {
      sessionStorage.setItem("roomPassword", joinPassword.trim());
    }
    router.push(`/rooms/${joinCode.trim().toUpperCase()}`);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-purple-400 mb-2">
            AI Dungeon Master
          </h1>
          <p className="text-gray-400">D&D 5e with an AI Game Master</p>
        </div>

        {/* Kick/Reject message */}
        {kickMessage && (
          <div className="bg-red-900/20 border border-red-700 rounded-lg p-3 mb-4 text-center">
            <p className="text-sm text-red-400">{kickMessage}</p>
          </div>
        )}

        <div className="bg-gray-800 rounded-xl p-6 space-y-5">
          {/* Auth Section */}
          <div className="flex items-center justify-between pb-3 border-b border-gray-700">
            {authLoading ? (
              <span className="text-sm text-gray-500">Loading...</span>
            ) : user ? (
              <div className="flex items-center gap-3">
                {user.avatarUrl && (
                  <img
                    src={user.avatarUrl}
                    alt=""
                    className="w-8 h-8 rounded-full"
                  />
                )}
                <div>
                  <div className="text-sm font-medium text-gray-200">
                    {user.displayName}
                  </div>
                  <div className="text-xs text-gray-500">{user.email}</div>
                </div>
              </div>
            ) : (
              <span className="text-sm text-gray-500">Playing as guest</span>
            )}

            {user ? (
              <button
                onClick={logout}
                className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
              >
                Sign out
              </button>
            ) : (
              <button
                onClick={login}
                className="flex items-center gap-2 bg-white hover:bg-gray-100 text-gray-800
                           text-sm font-medium px-4 py-2 rounded-lg transition-colors"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24">
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
            )}
          </div>

          {/* Character Name */}
          <div>
            <label className="block text-sm text-gray-400 mb-1">
              Character Name
            </label>
            <input
              type="text"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              placeholder="Enter your name..."
              maxLength={30}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2.5
                         text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2
                         focus:ring-purple-500 focus:border-transparent"
            />
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}

          {/* Two-column: Create Room | Join Room */}
          <div className="grid grid-cols-2 gap-4 pt-1">
            {/* Left column: Create Room */}
            <div className="space-y-3">
              <div className="text-xs text-gray-500 uppercase tracking-wider font-medium">
                Create Room
              </div>

              <p className="text-xs text-gray-500">
                Create a room and start the MCP bridge to connect Claude Code as the AI Dungeon Master.
              </p>

              <button
                onClick={handleCreate}
                disabled={loading}
                className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700
                           text-white py-2.5 rounded-lg font-medium transition-colors text-sm"
              >
                {loading ? "Creating..." : "Create Room"}
              </button>
            </div>

            {/* Right column: Join Room */}
            <div className="space-y-3">
              <div className="text-xs text-gray-500 uppercase tracking-wider font-medium">
                Join Room
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1">
                  Room Code
                </label>
                <input
                  type="text"
                  value={joinCode}
                  onChange={(e) =>
                    setJoinCode(e.target.value.toUpperCase().slice(0, 6))
                  }
                  placeholder="ABCDEF"
                  maxLength={6}
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2
                             text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2
                             focus:ring-purple-500 focus:border-transparent font-mono text-center
                             text-lg tracking-widest"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1">
                  Password <span className="text-gray-600">(if required)</span>
                </label>
                <input
                  type="password"
                  value={joinPassword}
                  onChange={(e) => setJoinPassword(e.target.value)}
                  placeholder="Leave blank if none"
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2
                             text-sm text-gray-100 placeholder-gray-500 focus:outline-none
                             focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
              </div>

              <button
                onClick={handleJoin}
                className="w-full bg-gray-700 hover:bg-gray-600 text-white py-2.5 rounded-lg
                           font-medium transition-colors text-sm"
              >
                Join Room
              </button>
            </div>
          </div>

          {/* Browse Rooms */}
          <div className="pt-2 border-t border-gray-700">
            <Link
              href="/rooms"
              className="block text-center text-sm text-purple-400 hover:text-purple-300
                         transition-colors py-2"
            >
              Browse Rooms
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
