"use client";

interface PendingOverlayProps {
  roomCode: string;
}

export function PendingOverlay({ roomCode }: PendingOverlayProps) {
  return (
    <div className="fixed inset-0 bg-gray-950/95 flex items-center justify-center z-50">
      <div className="text-center max-w-md px-6">
        {/* Spinner */}
        <div className="relative w-16 h-16 mx-auto mb-6">
          <div className="absolute inset-0 rounded-full border-4 border-gray-700" />
          <div className="absolute inset-0 rounded-full border-4 border-purple-500 border-t-transparent animate-spin" />
        </div>

        <h2 className="text-xl font-semibold text-purple-400 mb-2">
          Waiting for host approval
        </h2>
        <p className="text-gray-400 mb-6">
          The host needs to accept your request to join the room.
        </p>

        <div className="bg-gray-800/50 rounded-lg p-4 inline-block">
          <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">
            Room Code
          </div>
          <div className="text-2xl font-mono font-bold text-purple-400 tracking-widest">
            {roomCode}
          </div>
        </div>

        <p className="text-sm text-gray-600 mt-6">
          If the host doesn&apos;t respond, ask them to check their sidebar.
        </p>
      </div>
    </div>
  );
}
