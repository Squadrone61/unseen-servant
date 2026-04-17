interface FilterChip {
  id: string;
  label: string;
  count?: number;
}

interface FilterChipBarProps {
  chips: FilterChip[];
  activeChipId: string;
  onSelect: (chipId: string) => void;
}

export function FilterChipBar({ chips, activeChipId, onSelect }: FilterChipBarProps) {
  return (
    <div className="scrollbar-none flex gap-1 overflow-x-auto pb-1.5">
      {chips.map((chip) => {
        const isActive = chip.id === activeChipId;
        return (
          <button
            key={chip.id}
            onClick={() => onSelect(chip.id)}
            className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium transition-colors ${
              isActive
                ? "bg-amber-500/80 text-white"
                : "bg-gray-700/40 text-gray-400 hover:bg-gray-700/60 hover:text-gray-300"
            }`}
          >
            {chip.label}
            {chip.count != null && (
              <span className={isActive ? "ml-0.5 text-amber-100" : "ml-0.5 text-gray-500"}>
                {chip.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
