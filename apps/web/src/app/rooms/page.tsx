"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { Button } from "@/components/ui/Button";

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
        <Breadcrumb items={[{ label: "Home", href: "/" }]} current="Browse Rooms">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => fetchRooms(true)}
            disabled={refreshing}
          >
            <svg
              className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`}
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
            <span>Refresh</span>
          </Button>
        </Breadcrumb>

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
            <p className="text-lg text-gray-400 mb-2" style={{ fontFamily: "var(--font-cinzel)" }}>
              No active rooms
            </p>
            <p className="text-sm text-gray-600 mb-4">Be the first to start an adventure.</p>
            <Button size="md" href="/">
              Create a Room
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {rooms.map((room) => (
              <button
                key={room.roomCode}
                onClick={() => handleRoomClick(room.roomCode)}
                className="relative bg-gray-800/40 hover:bg-gray-800/60 border border-gray-700/30 hover:border-amber-500/20
                           rounded-xl p-5 text-left transition-all duration-200 group overflow-hidden"
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xl font-mono font-bold text-amber-300 tracking-widest group-hover:text-amber-200 transition-colors">
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
                      <span className="text-gray-600 italic">Waiting for host</span>
                    )}
                  </div>
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <span>
                      {room.playerCount} {room.playerCount === 1 ? "player" : "players"}
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
