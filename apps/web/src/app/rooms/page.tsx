"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

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

function timeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function RoomsPage() {
  const router = useRouter();
  const [rooms, setRooms] = useState<RoomMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const fetchRooms = useCallback(async (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      const res = await fetch(`${getWorkerUrl()}/api/rooms`);
      if (!res.ok) throw new Error("Failed to fetch rooms");
      const data = await res.json();
      setRooms(data.rooms ?? []);
      setError("");
    } catch {
      setError("Could not load rooms. Is the server running?");
    } finally {
      setLoading(false);
      if (isManual) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchRooms();
    const interval = setInterval(() => fetchRooms(), 15000);
    return () => clearInterval(interval);
  }, [fetchRooms]);

  const handleRoomClick = (roomCode: string) => {
    router.push(`/rooms/${roomCode}`);
  };

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div>
              <h1 className="text-2xl font-bold text-purple-400">Browse Rooms</h1>
              <p className="text-sm text-gray-500 mt-1">
                Join an active game session
              </p>
            </div>
            <button
              onClick={() => fetchRooms(true)}
              disabled={refreshing}
              className="mt-1 p-2 text-gray-500 hover:text-purple-400 transition-colors disabled:opacity-50"
              title="Refresh"
            >
              <svg
                className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
            </button>
          </div>
          <Link
            href="/"
            className="text-sm text-gray-400 hover:text-gray-200 transition-colors"
          >
            &larr; Back to Home
          </Link>
        </div>

        {loading ? (
          <div className="text-center py-16">
            <p className="text-gray-500">Loading rooms...</p>
          </div>
        ) : error ? (
          <div className="text-center py-16">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        ) : rooms.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-gray-500 mb-2">No active rooms</p>
            <p className="text-sm text-gray-600">
              Create one from the{" "}
              <Link href="/" className="text-purple-400 hover:text-purple-300 underline">
                home page
              </Link>
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {rooms.map((room) => (
              <button
                key={room.roomCode}
                onClick={() => handleRoomClick(room.roomCode)}
                className="bg-gray-800 hover:bg-gray-750 border border-gray-700 hover:border-purple-500/50
                           rounded-xl p-5 text-left transition-all group"
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xl font-mono font-bold text-purple-400 tracking-widest group-hover:text-purple-300 transition-colors">
                    {room.roomCode}
                  </span>
                  {room.hasPassword && (
                    <span className="text-yellow-500" title="Password protected">
                      &#128274;
                    </span>
                  )}
                </div>

                <div className="space-y-1.5">
                  <div className="text-sm text-gray-300">
                    {room.hostName || (
                      <span className="text-gray-600 italic">
                        Waiting for host
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <span>
                      {room.playerCount}{" "}
                      {room.playerCount === 1 ? "player" : "players"}
                    </span>
                    <span>{timeAgo(room.createdAt)}</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
