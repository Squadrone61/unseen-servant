const COLORS = [
  { bg: "bg-amber-500/10", border: "border-amber-500/25", text: "text-amber-400" },
  { bg: "bg-blue-500/10", border: "border-blue-500/25", text: "text-blue-400" },
  { bg: "bg-emerald-500/10", border: "border-emerald-500/25", text: "text-emerald-400" },
  { bg: "bg-purple-500/10", border: "border-purple-500/25", text: "text-purple-400" },
  { bg: "bg-red-500/10", border: "border-red-500/25", text: "text-red-400" },
  { bg: "bg-cyan-500/10", border: "border-cyan-500/25", text: "text-cyan-400" },
];

export function charColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return COLORS[Math.abs(hash) % COLORS.length];
}
