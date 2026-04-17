"use client";

interface HPBarProps {
  current: number;
  max: number;
  temp?: number;
}

export function HPBar({ current, max, temp = 0 }: HPBarProps) {
  const percentage = max > 0 ? Math.min((current / max) * 100, 100) : 0;

  const fillColor =
    percentage > 50 ? "bg-green-600/40" : percentage > 25 ? "bg-yellow-600/40" : "bg-red-600/40";

  return (
    <div className="relative overflow-hidden rounded border border-gray-700/50 bg-gray-900/60 py-1 text-center">
      {/* Fill background */}
      <div
        className={`absolute inset-0 ${fillColor} transition-all duration-300`}
        style={{ width: `${percentage}%` }}
      />
      {/* Content */}
      <div className="relative">
        <div className="text-xs text-gray-500 uppercase">HP</div>
        <div className="text-base font-bold text-gray-200">
          {current}/{max}
          {temp > 0 && <span className="ml-1 text-xs text-blue-400">(+{temp})</span>}
        </div>
      </div>
    </div>
  );
}
