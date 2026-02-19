"use client";

import { useState, useEffect } from "react";
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
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function fetchRooms() {
      try {
        const res = await fetch(`${getWorkerUrl()}/api/rooms`);
        if (!res.ok) throw new Error("Failed to fetch rooms");
        const data = await res.json();
        if (active) {
          setRooms(data.rooms ?? []);
          setError("");
        }
      } catch {
        if (active) setError("Could not load rooms. Is the server running?");
      } finally {
        if (active) setLoading(false);
      }
    }

    fetchRooms();
    const interval = setInterval(fetchRooms, 15000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  const handleRoomClick = (roomCode: string) => {
    const playerName = sessionStorage.getItem("playerName");
    if (playerName) {
      router.push(`/rooms/${roomCode}`);
    } else {
      router.push(`/?join=${roomCode}`);
    }
  };

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-purple-400">Browse Rooms</h1>
            <p className="text-sm text-gray-500 mt-1">
              Join an active game session
            </p>
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
