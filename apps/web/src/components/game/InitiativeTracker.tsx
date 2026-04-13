import type { CharacterData, CombatState } from "@unseen-servant/shared/types";
import { getHP } from "@unseen-servant/shared/character";

interface InitiativeTrackerProps {
  combat: CombatState;
  onCombatantClick?: (combatantId: string) => void;
  partyCharacters?: Record<string, CharacterData>;
}

export function InitiativeTracker({
  combat,
  onCombatantClick,
  partyCharacters,
}: InitiativeTrackerProps) {
  if (combat.phase !== "active") return null;

  return (
    <div className="flex items-stretch gap-1.5 px-3 py-1.5 bg-gray-950 border-b border-gray-700/20 shrink-0 overflow-x-auto">
      {/* Divider */}
      <div className="w-px h-9 bg-gray-700/20 shrink-0" />

      {combat.turnOrder.map((id, idx) => {
        const combatant = combat.combatants[id];
        if (!combatant) return null;

        const isActive = idx === combat.turnIndex;
        const isPlayer = combatant.type === "player";
        const isEnemy = combatant.type === "enemy";

        let currentHP: number | undefined;
        let maxHP: number | undefined;
        let concentratingOn: { spellName: string; since?: number } | undefined;

        if (combatant.type === "player" && partyCharacters) {
          const char = Object.values(partyCharacters).find(
            (p) => p.static.name.toLowerCase() === combatant.name.toLowerCase(),
          );
          if (char) {
            currentHP = char.dynamic.currentHP;
            maxHP = getHP(char);
            concentratingOn = char.dynamic.concentratingOn;
          }
        } else {
          currentHP = combatant.currentHP;
          maxHP = combatant.maxHP;
        }

        if (combatant.concentratingOn) {
          concentratingOn = combatant.concentratingOn;
        }

        const isDead = currentHP !== undefined && currentHP <= 0;
        const hpPercent =
          maxHP && currentHP !== undefined ? Math.max(0, (currentHP / maxHP) * 100) : null;

        return (
          <button
            key={id}
            type="button"
            onClick={() => onCombatantClick?.(id)}
            className={`
              flex flex-col items-center shrink-0 w-20 px-2.5 py-1.5 rounded-lg gap-0.5
              transition-all
              ${onCombatantClick ? "cursor-pointer hover:bg-gray-700/40" : ""}
              ${isActive ? "ring-2 ring-amber-400 bg-amber-900/20" : isEnemy ? "border border-red-500/20 bg-gray-800/50" : "border border-gray-700/30 bg-gray-800/50"}
              ${isDead ? "opacity-40" : ""}
            `}
          >
            {/* Top: dot + name */}
            <div className="flex items-center gap-1 w-full min-w-0">
              <div
                className={`w-2 h-2 rounded-full shrink-0 ${
                  isPlayer ? "bg-blue-500" : isEnemy ? "bg-red-500" : "bg-gray-500"
                }`}
                style={combatant.tokenColor ? { backgroundColor: combatant.tokenColor } : undefined}
              />
              <span
                className={`text-xs font-medium truncate ${
                  isActive ? "text-amber-300" : "text-gray-300"
                }`}
              >
                {combatant.name}
              </span>
            </div>

            {/* Initiative */}
            <div className="text-xs text-gray-600">{combatant.initiative}</div>

            {/* HP bar */}
            {hpPercent !== null && (
              <>
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
                {isPlayer && currentHP !== undefined && maxHP !== undefined && (
                  <div className="text-[10px] text-gray-500 leading-tight">
                    {currentHP}/{maxHP}
                  </div>
                )}
              </>
            )}

            {/* Concentration */}
            {concentratingOn && (
              <div
                className="text-[10px] text-purple-400 font-bold mt-0.5"
                title={`Concentrating: ${concentratingOn.spellName}`}
              >
                C
              </div>
            )}

            {/* Conditions */}
            {combatant.conditions && combatant.conditions.length > 0 && (
              <div
                className="flex items-center gap-0.5 mt-0.5"
                title={combatant.conditions.map((c) => c.name).join(", ")}
              >
                {combatant.conditions.slice(0, 3).map((cond, ci) => (
                  <svg
                    key={ci}
                    className="w-3 h-3 text-orange-400"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" x2="12" y1="8" y2="12" />
                    <line x1="12" x2="12.01" y1="16" y2="16" />
                  </svg>
                ))}
                {combatant.conditions.length > 3 && (
                  <span className="text-xs text-orange-400">
                    +{combatant.conditions.length - 3}
                  </span>
                )}
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}
