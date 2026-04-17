"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { TopBar } from "@/components/ui/TopBar";
import { Button } from "@/components/ui/Button";
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
    <div className="flex min-h-screen flex-col">
      <TopBar items={[]} current="Browse Rooms">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => fetchRooms(true)}
          disabled={refreshing}
        >
          <svg
            className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`}
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
      </TopBar>

      <div className="flex-1 p-6">
        <div className="mx-auto max-w-5xl">
          {loading ? (
            <div className="py-16 text-center">
              <p className="text-gray-600">Loading rooms...</p>
            </div>
          ) : error ? (
            <div className="py-16 text-center">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          ) : rooms.length === 0 ? (
            <div className="py-16 text-center">
              <p
                className="mb-2 text-lg text-gray-500"
                style={{ fontFamily: "var(--font-cinzel)" }}
              >
                No active rooms
              </p>
              <p className="mb-4 text-sm text-gray-600">Be the first to start an adventure.</p>
              <Button size="md" href="/">
                Create a Room
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {rooms.map((room) => (
                <div
                  key={room.roomCode}
                  className="rounded-lg border border-gray-700/25 bg-gray-900/60 p-3 transition-colors hover:border-gray-700/40"
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-semibold tracking-wide text-gray-300">
                      {room.hostName ? `${room.hostName}'s Room` : room.roomCode}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleRoomClick(room.roomCode)}
                    >
                      Join
                    </Button>
                  </div>
                  <span className="font-mono text-xs tracking-wide text-gray-600">
                    {room.roomCode}
                  </span>
                  <div className="mt-1.5 flex items-center gap-1.5 text-xs text-gray-600">
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
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
