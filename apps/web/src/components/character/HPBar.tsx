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
    <div className="relative bg-gray-900/60 border border-gray-700/50 rounded py-1 overflow-hidden text-center">
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
          {temp > 0 && <span className="text-blue-400 text-xs ml-1">(+{temp})</span>}
        </div>
      </div>
    </div>
  );
}
