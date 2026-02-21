import type { CombatState } from "@aidnd/shared/types";

interface InitiativeTrackerProps {
  combat: CombatState;
  onCombatantClick?: (combatantId: string) => void;
}

export function InitiativeTracker({ combat, onCombatantClick }: InitiativeTrackerProps) {
  if (combat.phase !== "active") return null;

  return (
    <div className="bg-gray-850 border-b border-gray-700 px-4 py-2">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-xs text-gray-500 uppercase tracking-wider">
          Combat
        </span>
        <span className="text-xs text-gray-600">Round {combat.round}</span>
      </div>
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {combat.turnOrder.map((id, idx) => {
          const combatant = combat.combatants[id];
          if (!combatant) return null;

          const isActive = idx === combat.turnIndex;
          const isPlayer = combatant.type === "player";
          const isEnemy = combatant.type === "enemy";
          const isDead =
            combatant.type !== "player" &&
            combatant.currentHP !== undefined &&
            combatant.currentHP <= 0;

          // HP bar for enemies/NPCs
          const hpPercent =
            combatant.maxHP && combatant.currentHP !== undefined
              ? Math.max(0, (combatant.currentHP / combatant.maxHP) * 100)
              : null;

          return (
            <button
              key={id}
              type="button"
              onClick={() => onCombatantClick?.(id)}
              className={`
                flex flex-col items-center px-2.5 py-1.5 rounded-lg text-center min-w-[72px]
                transition-all
                ${onCombatantClick ? "cursor-pointer hover:bg-gray-700/40" : ""}
                ${isActive ? "ring-2 ring-amber-400 bg-amber-900/20" : "bg-gray-800/50"}
                ${isDead ? "opacity-40" : ""}
              `}
            >
              {/* Token dot */}
              <div
                className={`w-3 h-3 rounded-full mb-0.5 ${
                  isPlayer
                    ? "bg-blue-500"
                    : isEnemy
                      ? "bg-red-500"
                      : "bg-gray-500"
                }`}
                style={combatant.tokenColor ? { backgroundColor: combatant.tokenColor } : undefined}
              />
              {/* Name */}
              <div
                className={`text-[10px] font-medium truncate max-w-[68px] ${
                  isActive ? "text-amber-300" : "text-gray-300"
                }`}
              >
                {combatant.name}
              </div>
              {/* Initiative */}
              <div className="text-[9px] text-gray-600">{combatant.initiative}</div>
              {/* HP bar for non-players */}
              {hpPercent !== null && (
                <div className="w-full h-1 bg-gray-700 rounded-full mt-0.5 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      hpPercent > 50
                        ? "bg-green-500"
                        : hpPercent > 25
                          ? "bg-yellow-500"
                          : "bg-red-500"
                    }`}
                    style={{ width: `${hpPercent}%` }}
                  />
                </div>
              )}
              {/* Conditions */}
              {combatant.conditions && combatant.conditions.length > 0 && (
                <div className="text-[8px] text-orange-400 mt-0.5 truncate max-w-[68px]">
                  {combatant.conditions.length} cond.
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
