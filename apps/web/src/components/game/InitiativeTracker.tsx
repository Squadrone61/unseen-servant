import type { CharacterData, CombatState } from "@unseen-servant/shared/types";
import { getHP } from "@unseen-servant/shared/character";
import { getCondition } from "@unseen-servant/shared/data";
import {
  EntityPopoverProvider,
  useEntityPopover,
} from "@/components/character/EntityPopoverContext";
import { EntityDetailPopover } from "@/components/character/EntityDetailPopover";

interface InitiativeTrackerProps {
  combat: CombatState;
  onCombatantClick?: (combatantId: string) => void;
  partyCharacters?: Record<string, CharacterData>;
}

export function InitiativeTracker(props: InitiativeTrackerProps) {
  if (props.combat.phase !== "active") return null;
  return (
    <EntityPopoverProvider>
      <InitiativeTrackerInner {...props} />
    </EntityPopoverProvider>
  );
}

function InitiativeTrackerInner({
  combat,
  onCombatantClick,
  partyCharacters,
}: InitiativeTrackerProps) {
  const { stack, push } = useEntityPopover();

  return (
    <>
      <div className="flex shrink-0 items-stretch gap-1.5 overflow-x-auto border-b border-gray-700/20 bg-gray-950 px-3 py-1.5">
        {/* Divider */}
        <div className="h-9 w-px shrink-0 bg-gray-700/20" />

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
              flex w-20 shrink-0 flex-col items-center gap-0.5 rounded-lg px-2.5 py-1.5
              transition-all
              ${onCombatantClick ? "cursor-pointer hover:bg-gray-700/40" : ""}
              ${isActive ? "bg-amber-900/20 ring-2 ring-amber-400" : isEnemy ? "border border-red-500/20 bg-gray-800/50" : "border border-gray-700/30 bg-gray-800/50"}
              ${isDead ? "opacity-40" : ""}
            `}
            >
              {/* Top: dot + name */}
              <div className="flex w-full min-w-0 items-center gap-1">
                <div
                  className={`h-2 w-2 shrink-0 rounded-full ${
                    isPlayer ? "bg-blue-500" : isEnemy ? "bg-red-500" : "bg-gray-500"
                  }`}
                  style={
                    combatant.tokenColor ? { backgroundColor: combatant.tokenColor } : undefined
                  }
                />
                <span
                  className={`truncate text-xs font-medium ${
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
                  <div className="mt-0.5 h-1 w-full overflow-hidden rounded-full bg-gray-700">
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
                    <div className="text-xs leading-tight text-gray-500">
                      {currentHP}/{maxHP}
                    </div>
                  )}
                </>
              )}

              {/* Concentration */}
              {concentratingOn && (
                <div
                  className="mt-0.5 text-xs font-bold text-purple-400"
                  title={`Concentrating: ${concentratingOn.spellName}`}
                >
                  C
                </div>
              )}

              {/* Conditions */}
              {combatant.conditions && combatant.conditions.length > 0 && (
                <div className="mt-0.5 flex items-center gap-0.5">
                  {combatant.conditions.map((cond, ci) => {
                    const hasEntry = getCondition(cond.name) !== undefined;
                    return (
                      <span
                        key={ci}
                        role={hasEntry ? "button" : undefined}
                        tabIndex={hasEntry ? 0 : undefined}
                        title={cond.duration ? `${cond.name} (${cond.duration} rounds)` : cond.name}
                        onClick={
                          hasEntry
                            ? (e) => {
                                e.stopPropagation();
                                push("condition", cond.name, { x: e.clientX, y: e.clientY });
                              }
                            : undefined
                        }
                        className={hasEntry ? "cursor-pointer" : undefined}
                      >
                        <svg
                          className="h-3 w-3 text-orange-400"
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
                      </span>
                    );
                  })}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {stack.map((entry) => (
        <EntityDetailPopover key={entry.id} entry={entry} />
      ))}
    </>
  );
}
