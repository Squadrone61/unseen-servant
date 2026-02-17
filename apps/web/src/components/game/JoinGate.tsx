"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";

interface JoinGateProps {
  roomCode: string;
  onReady: (name: string) => void;
}

export function JoinGate({ roomCode, onReady }: JoinGateProps) {
  const { user, loading: authLoading, login } = useAuth();
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  // Pre-fill name from Google account
  useEffect(() => {
    if (user?.displayName && !name) {
      setName(user.displayName);
    }
  }, [user, name]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Enter your character name");
      return;
    }
    sessionStorage.setItem("playerName", trimmed);
    onReady(trimmed);
  };

  return (
    <div className="fixed inset-0 bg-gray-950 flex items-center justify-center z-50">
      <div className="w-full max-w-sm px-6">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-purple-400 mb-1">
            Join Game
          </h1>
          <div className="text-sm text-gray-500">
            Room{" "}
            <span className="font-mono text-purple-400 tracking-wider">
              {roomCode}
            </span>
          </div>
        </div>

        <div className="bg-gray-800 rounded-xl p-5 space-y-4">
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

            {!user && !authLoading && (
              <button
                onClick={login}
                className="flex items-center gap-2 bg-white hover:bg-gray-100 text-gray-800
                           text-sm font-medium px-3 py-1.5 rounded-lg transition-colors"
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
                Sign in
              </button>
            )}
          </div>

          {!user && !authLoading && (
            <p className="text-xs text-yellow-500/80 bg-yellow-900/10 rounded px-3 py-2">
              Sign in to skip re-approval on reconnect.
            </p>
          )}

          {/* Name Input */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">
                Character Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setError("");
                }}
                placeholder="Enter your name..."
                maxLength={30}
                autoFocus
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2.5
                           text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2
                           focus:ring-purple-500 focus:border-transparent"
              />
            </div>

            {error && <p className="text-red-400 text-sm">{error}</p>}

            <button
              type="submit"
              className="w-full bg-purple-600 hover:bg-purple-700 text-white py-2.5 rounded-lg
                         font-medium transition-colors text-sm"
            >
              Join Game
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
