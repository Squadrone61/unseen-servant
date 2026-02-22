/**
 * State Resolver
 *
 * Processes validated AI actions and applies them to game state.
 * The resolver is the single source of truth for all state mutations.
 * It validates every action before applying, never trusting the AI.
 *
 * Player combatants bind to CharacterDynamicData — damage/healing/conditions
 * are written directly to the character entry. Enemy/NPC combatants store
 * their own HP and conditions inline.
 */

import type {
  AIAction,
  AICombatStart,
  CharacterData,
  CharacterDynamicData,
  CheckRequest,
  Combatant,
  CombatState,
  CreatureSize,
  GameEvent,
  GameState,
  GridPosition,
  RollResult,
  StateChange,
  BattleMapState,
  MapTile,
} from "@aidnd/shared/types";
import {
  getModifier,
  getProficiencyBonus,
  getTotalLevel,
} from "@aidnd/shared/utils";
import { rollInitiative, rollDamage } from "./dice";

// ─── Result type ───

export interface ResolveResult {
  /** Characters whose dynamic data was modified (keyed by userId) */
  characterUpdates: Map<string, CharacterDynamicData>;
  /** Updated combat state: CombatState=changed, null=ended, undefined=no change */
  combatUpdate?: CombatState | null;
  /** Check requests that need player input */
  checkRequests: CheckRequest[];
  /** Events created for the event log */
  events: GameEvent[];
  /** Validation warnings (non-fatal) */
  warnings: string[];
  /** User-visible system messages (broadcast to activity log) */
  systemMessages: string[];
  /** Damage dice rolls to broadcast (when AI specifies dice formula) */
  damageRolls: Array<{ targetName: string; roll: RollResult; damageType?: string }>;
}

// ─── Helpers ───

/** Get the tile span for a creature size (large=2, huge=3, gargantuan=4, otherwise 1) */
function sizeSpan(size: CreatureSize): number {
  switch (size) {
    case "large": return 2;
    case "huge": return 3;
    case "gargantuan": return 4;
    default: return 1;
  }
}

/** Get all tiles occupied by a combatant (top-left anchor + size span) */
function getOccupiedTiles(pos: GridPosition, size: CreatureSize): GridPosition[] {
  const span = sizeSpan(size);
  const tiles: GridPosition[] = [];
  for (let dy = 0; dy < span; dy++) {
    for (let dx = 0; dx < span; dx++) {
      tiles.push({ x: pos.x + dx, y: pos.y + dy });
    }
  }
  return tiles;
}

/** Minimum Chebyshev distance between any tile of combatant A and any tile of combatant B */
function combatantDistance(a: Combatant, b: Combatant): number | null {
  if (!a.position || !b.position) return null;
  const aTiles = getOccupiedTiles(a.position, a.size);
  const bTiles = getOccupiedTiles(b.position, b.size);
  let minDist = Infinity;
  for (const at of aTiles) {
    for (const bt of bTiles) {
      const d = Math.max(Math.abs(at.x - bt.x), Math.abs(at.y - bt.y));
      if (d < minDist) minDist = d;
    }
  }
  return minDist === Infinity ? null : minDist;
}

/** Find a character by character name (case-insensitive, with fuzzy fallback). Returns [userId, CharacterData]. */
function findCharacterByName(
  characters: Map<string, CharacterData>,
  name: string
): [string, CharacterData] | null {
  const target = name.toLowerCase().trim();

  // Exact match
  for (const [userId, char] of characters) {
    if (char.static.name.toLowerCase() === target) {
      return [userId, char];
    }
  }

  // Fuzzy: first name match, or substring contains
  for (const [userId, char] of characters) {
    const charName = char.static.name.toLowerCase();
    const targetFirst = target.split(" ")[0];
    const charFirst = charName.split(" ")[0];
    if (
      charName.includes(target) ||
      target.includes(charName) ||
      (targetFirst.length > 2 && charFirst === targetFirst)
    ) {
      return [userId, char];
    }
  }

  return null;
}

/** Find a combatant by name in combat state (case-insensitive, with fuzzy fallback). */
function findCombatantByName(
  combat: CombatState,
  name: string
): Combatant | null {
  const target = name.toLowerCase().trim();

  // Exact match
  for (const c of Object.values(combat.combatants)) {
    if (c.name.toLowerCase() === target) return c;
  }

  // Fuzzy: first name match, or substring contains
  for (const c of Object.values(combat.combatants)) {
    const cName = c.name.toLowerCase();
    const targetFirst = target.split(" ")[0];
    const cFirst = cName.split(" ")[0];
    if (
      cName.includes(target) ||
      target.includes(cName) ||
      (targetFirst.length > 2 && cFirst === targetFirst)
    ) {
      return c;
    }
  }

  return null;
}

/** Deep clone CharacterDynamicData for snapshotting. */
function cloneDynamic(d: CharacterDynamicData): CharacterDynamicData {
  return JSON.parse(JSON.stringify(d));
}

/** Parse map layout string format into BattleMapState. */
function parseMapLayout(layout: AICombatStart["mapLayout"]): BattleMapState | undefined {
  if (!layout) return undefined;

  const charToTile: Record<string, MapTile["type"]> = {
    ".": "floor",
    "#": "wall",
    "~": "water",
    "^": "difficult_terrain",
    D: "door",
    S: "stairs",
    _: "pit",
  };

  const tiles: MapTile[][] = [];
  for (let y = 0; y < layout.height && y < layout.tiles.length; y++) {
    const row: MapTile[] = [];
    const rowStr = layout.tiles[y];
    for (let x = 0; x < layout.width; x++) {
      const ch = x < rowStr.length ? rowStr[x] : ".";
      row.push({ type: charToTile[ch] || "floor" });
    }
    tiles.push(row);
  }

  return {
    id: crypto.randomUUID(),
    width: layout.width,
    height: layout.height,
    tiles,
  };
}

/** Generate a simple default rectangular room. */
function generateDefaultMap(combatantCount: number): BattleMapState {
  const size = Math.max(8, Math.min(20, combatantCount * 3));
  const tiles: MapTile[][] = [];

  for (let y = 0; y < size; y++) {
    const row: MapTile[] = [];
    for (let x = 0; x < size; x++) {
      const isWall = y === 0 || y === size - 1 || x === 0 || x === size - 1;
      row.push({ type: isWall ? "wall" : "floor" });
    }
    tiles.push(row);
  }

  return {
    id: crypto.randomUUID(),
    width: size,
    height: size,
    tiles,
  };
}

/**
 * Generate a themed battlefield map from a terrain keyword.
 * Uses seeded randomness to create interesting tactical terrain.
 */
function generateTerrainMap(
  terrain: string,
  combatantCount: number
): BattleMapState {
  const t = terrain.toLowerCase();
  const size = Math.max(8, Math.min(20, combatantCount * 3));

  // Determine dimensions based on terrain
  let width = size;
  let height = size;
  if (t.includes("corridor") || t.includes("alley") || t.includes("tunnel") || t.includes("bridge")) {
    width = Math.max(6, Math.min(8, size - 2));
    height = Math.max(10, Math.min(16, size + 4));
  } else if (t.includes("clearing") || t.includes("field") || t.includes("plaza")) {
    width = Math.max(10, Math.min(16, size + 2));
    height = Math.max(10, Math.min(16, size + 2));
  }

  const tiles: MapTile[][] = [];

  // Fill with floor, surround with walls
  for (let y = 0; y < height; y++) {
    const row: MapTile[] = [];
    for (let x = 0; x < width; x++) {
      const isWall = y === 0 || y === height - 1 || x === 0 || x === width - 1;
      row.push({ type: isWall ? "wall" : "floor" });
    }
    tiles.push(row);
  }

  // Helper to set tile if in bounds and not on border
  const setTile = (x: number, y: number, type: MapTile["type"]) => {
    if (x > 0 && x < width - 1 && y > 0 && y < height - 1) {
      tiles[y][x] = { type };
    }
  };

  // Simple pseudo-random using position for determinism
  const rng = (x: number, y: number) => {
    const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return n - Math.floor(n);
  };

  // Apply terrain features
  if (t.includes("forest") || t.includes("wood") || t.includes("grove")) {
    // Scattered trees (walls) and undergrowth (difficult terrain)
    for (let y = 2; y < height - 2; y++) {
      for (let x = 2; x < width - 2; x++) {
        const r = rng(x, y);
        if (r < 0.12) setTile(x, y, "wall"); // tree
        else if (r < 0.25) setTile(x, y, "difficult_terrain"); // undergrowth
      }
    }
  } else if (t.includes("cave") || t.includes("cavern") || t.includes("underground")) {
    // Irregular walls, some water pools
    for (let y = 2; y < height - 2; y++) {
      for (let x = 2; x < width - 2; x++) {
        const r = rng(x, y);
        const edgeDist = Math.min(x, y, width - 1 - x, height - 1 - y);
        if (edgeDist <= 2 && r < 0.3) setTile(x, y, "wall"); // cave wall protrusions
        else if (r < 0.06) setTile(x, y, "water"); // puddle
        else if (r < 0.12) setTile(x, y, "difficult_terrain"); // rubble
      }
    }
  } else if (t.includes("dungeon") || t.includes("room") || t.includes("chamber")) {
    // Pillars, doors
    const midX = Math.floor(width / 2);
    const midY = Math.floor(height / 2);
    // Pillars in a grid pattern
    for (let y = 3; y < height - 3; y += 3) {
      for (let x = 3; x < width - 3; x += 3) {
        setTile(x, y, "wall");
      }
    }
    // Doors on walls
    setTile(midX, 0, "door");
    setTile(midX, height - 1, "door");
  } else if (t.includes("swamp") || t.includes("marsh") || t.includes("bog")) {
    for (let y = 2; y < height - 2; y++) {
      for (let x = 2; x < width - 2; x++) {
        const r = rng(x, y);
        if (r < 0.2) setTile(x, y, "water");
        else if (r < 0.35) setTile(x, y, "difficult_terrain");
      }
    }
  } else if (t.includes("village") || t.includes("town") || t.includes("street") || t.includes("alley")) {
    // Building walls on sides, open path in middle
    const pathLeft = Math.floor(width * 0.3);
    const pathRight = Math.floor(width * 0.7);
    for (let y = 2; y < height - 2; y++) {
      for (let x = 2; x < width - 2; x++) {
        if (x < pathLeft || x > pathRight) {
          const r = rng(x, y);
          if (r < 0.5) setTile(x, y, "wall"); // building walls
        }
      }
    }
  } else if (t.includes("river") || t.includes("stream") || t.includes("shore")) {
    // Water stripe through the middle
    const midX = Math.floor(width / 2);
    for (let y = 0; y < height; y++) {
      const offset = Math.floor(Math.sin(y * 0.8) * 1.5);
      setTile(midX + offset, y, "water");
      setTile(midX + offset - 1, y, "water");
      if (rng(midX, y) < 0.3) setTile(midX + offset + 1, y, "water");
    }
  } else if (t.includes("mountain") || t.includes("cliff") || t.includes("rocky")) {
    for (let y = 2; y < height - 2; y++) {
      for (let x = 2; x < width - 2; x++) {
        const r = rng(x, y);
        if (r < 0.15) setTile(x, y, "wall"); // boulders
        else if (r < 0.3) setTile(x, y, "difficult_terrain"); // scree
        else if (r < 0.35) setTile(x, y, "pit"); // crevasse
      }
    }
  } else if (t.includes("bridge")) {
    // Water on sides, narrow bridge in center
    const bridgeLeft = Math.floor(width * 0.35);
    const bridgeRight = Math.floor(width * 0.65);
    for (let y = 2; y < height - 2; y++) {
      for (let x = 1; x < width - 1; x++) {
        if (x < bridgeLeft || x > bridgeRight) {
          setTile(x, y, "water");
        }
      }
    }
  }

  return {
    id: crypto.randomUUID(),
    width,
    height,
    tiles,
  };
}

// ─── Main resolver ───

export function resolveActions(
  actions: AIAction[],
  gameState: GameState,
  characters: Map<string, CharacterData>,
  conversationIndex: number
): ResolveResult {
  const characterUpdates = new Map<string, CharacterDynamicData>();
  const checkRequests: CheckRequest[] = [];
  const events: GameEvent[] = [];
  const warnings: string[] = [];
  const systemMessages: string[] = [];
  const damageRolls: Array<{ targetName: string; roll: RollResult; damageType?: string }> = [];
  let combat = gameState.encounter?.combat
    ? { ...gameState.encounter.combat }
    : undefined;
  let combatChanged = false;

  // Snapshot current state before any changes
  const snapshotCharacters: Record<string, CharacterDynamicData> = {};
  for (const [userId, char] of characters) {
    snapshotCharacters[userId] = cloneDynamic(char.dynamic);
  }
  const snapshotCombatants = combat
    ? JSON.parse(JSON.stringify(combat.combatants))
    : undefined;

  for (const action of actions) {
    const changes: StateChange[] = [];

    switch (action.type) {
      case "damage": {
        let damageAmount = action.amount;
        let diceRoll: RollResult | undefined;

        // Roll dice if AI specified a formula (e.g. "2d6+3")
        if (action.dice) {
          diceRoll = rollDamage(action.dice);
          damageAmount = Math.max(1, diceRoll.total);
          diceRoll = { ...diceRoll, label: `${action.dice}${action.damageType ? ` ${action.damageType}` : ""} damage` };
        }

        const result = applyDamage(
          action.target,
          damageAmount,
          action.damageType,
          characters,
          combat,
          characterUpdates,
          warnings
        );

        if (result && diceRoll) {
          damageRolls.push({
            targetName: action.target,
            roll: diceRoll,
            damageType: action.damageType,
          });
        }

        if (result) {
          changes.push(...result);
          // Mark combat changed if target was a combatant (not a player character)
          if (combat && !findCharacterByName(characters, action.target)) {
            combatChanged = true;
          }
        }
        break;
      }

      case "healing": {
        const result = applyHealing(
          action.target,
          action.amount,
          characters,
          combat,
          characterUpdates,
          warnings
        );
        if (result) {
          changes.push(...result);
          if (combat && !findCharacterByName(characters, action.target)) {
            combatChanged = true;
          }
        }
        break;
      }

      case "set_hp": {
        const result = applySetHP(
          action.target,
          action.value,
          characters,
          combat,
          characterUpdates,
          warnings
        );
        if (result) {
          changes.push(...result);
          if (combat && !findCharacterByName(characters, action.target)) {
            combatChanged = true;
          }
        }
        break;
      }

      case "set_temp_hp": {
        const result = applySetTempHP(
          action.target,
          action.value,
          characters,
          combat,
          characterUpdates,
          warnings
        );
        if (result) {
          changes.push(...result);
          if (combat && !findCharacterByName(characters, action.target)) {
            combatChanged = true;
          }
        }
        break;
      }

      case "condition_add": {
        const result = applyCondition(
          action.target,
          action.condition,
          true,
          characters,
          combat,
          characterUpdates,
          warnings
        );
        if (result) {
          changes.push(...result);
          if (combat && !findCharacterByName(characters, action.target)) {
            combatChanged = true;
          }
        }
        break;
      }

      case "condition_remove": {
        const result = applyCondition(
          action.target,
          action.condition,
          false,
          characters,
          combat,
          characterUpdates,
          warnings
        );
        if (result) {
          changes.push(...result);
          if (combat && !findCharacterByName(characters, action.target)) {
            combatChanged = true;
          }
        }
        break;
      }

      case "spell_slot_use": {
        const result = applySpellSlot(
          action.target,
          action.level,
          true,
          characters,
          characterUpdates,
          warnings
        );
        if (result) changes.push(...result);
        break;
      }

      case "spell_slot_restore": {
        const result = applySpellSlot(
          action.target,
          action.level,
          false,
          characters,
          characterUpdates,
          warnings
        );
        if (result) changes.push(...result);
        break;
      }

      case "death_save": {
        const found = findCharacterByName(characters, action.target);
        if (!found) {
          warnings.push(`Death save: character "${action.target}" not found`);
          break;
        }
        // Death save is requested — the server will roll it separately
        // Just note it as a pending action; the actual roll happens in GameRoom
        warnings.push(
          `Death save for "${action.target}" — will be rolled server-side`
        );
        break;
      }

      case "xp_award": {
        for (const targetName of action.targets) {
          const found = findCharacterByName(characters, targetName);
          if (!found) {
            warnings.push(`XP award: character "${targetName}" not found`);
            continue;
          }
          const [userId, char] = found;
          char.dynamic.xp += Math.max(0, action.amount);
          characterUpdates.set(userId, char.dynamic);
          changes.push({
            type: "xp_gain",
            target: targetName,
            amount: action.amount,
          });
        }
        break;
      }

      case "check_request": {
        const check: CheckRequest = {
          id: crypto.randomUUID(),
          type: action.check.type,
          ability: action.check.ability,
          skill: action.check.skill,
          dc: action.check.dc,
          targetCharacter: action.check.targetCharacter,
          advantage: action.check.advantage,
          disadvantage: action.check.disadvantage,
          reason: action.check.reason,
        };

        // Melee adjacency warning: if this is a combat attack, check positions
        if (combat && check.type === "attack" && check.reason) {
          const reasonLower = check.reason.toLowerCase();
          const isMelee = reasonLower.includes("melee") ||
            (!reasonLower.includes("ranged") && !reasonLower.includes("spell attack"));
          if (isMelee) {
            // Find attacker combatant
            const attacker = findCombatantByName(combat, check.targetCharacter);
            // Try to find target from the reason string (e.g. "...vs Goblin (AC 15)")
            const vsMatch = check.reason.match(/vs\s+(.+?)(?:\s*\(|$)/i);
            const targetName = vsMatch?.[1]?.trim();
            const target = targetName ? findCombatantByName(combat, targetName) : null;

            if (attacker && target) {
              const dist = combatantDistance(attacker, target);
              if (dist !== null && dist > 1) {
                systemMessages.push(
                  `⚠️ Melee attack: ${attacker.name} is ${dist * 5}ft from ${target.name} (not adjacent)`
                );
              }
            }
          }
        }

        checkRequests.push(check);
        // Store pending check on combat or game state
        if (combat) {
          combat.pendingCheck = check;
          combatChanged = true;
        } else {
          gameState.pendingCheck = check;
        }
        break;
      }

      case "combat_start": {
        if (!action.enemies || action.enemies.length === 0) {
          warnings.push("combat_start ignored: enemies array is empty");
          break;
        }
        combat = startCombat(action, characters, warnings);
        combatChanged = true;
        // Set up encounter with map: AI mapLayout > terrain-based > default
        const combatantCount = Object.keys(combat.combatants).length;
        let mapSource: string;
        let map: BattleMapState;
        const parsedMap = parseMapLayout(action.mapLayout);
        if (parsedMap) {
          map = parsedMap;
          mapSource = "AI-designed map";
        } else if (action.terrain) {
          map = generateTerrainMap(action.terrain, combatantCount);
          mapSource = `Auto-generated ${action.terrain} terrain`;
        } else {
          map = generateDefaultMap(combatantCount);
          mapSource = "Default map (AI did not specify terrain)";
          systemMessages.push("AI did not specify terrain — using default map.");
        }

        // Track which combatants needed auto-placement
        const preAssignPlayers = Object.values(combat.combatants)
          .filter((c) => c.type === "player" && !c.position)
          .map((c) => c.name);
        const preAssignEnemies = Object.values(combat.combatants)
          .filter((c) => c.type !== "player" && !c.position)
          .map((c) => c.name);

        assignCombatantPositions(combat, map);

        if (preAssignPlayers.length > 0) {
          systemMessages.push(
            `Auto-placed players: ${preAssignPlayers.join(", ")}`
          );
        }
        if (preAssignEnemies.length > 0) {
          systemMessages.push(
            `Auto-placed enemies: ${preAssignEnemies.join(", ")}`
          );
        }
        systemMessages.push(
          `Combat started: ${mapSource} (${map.width}×${map.height})`
        );

        if (!gameState.encounter) {
          gameState.encounter = {
            id: crypto.randomUUID(),
            phase: "combat",
            combat,
            map,
          };
        } else {
          gameState.encounter.phase = "combat";
          gameState.encounter.combat = combat;
          gameState.encounter.map = map;
        }
        changes.push({ type: "combat_phase", phase: "active" });
        break;
      }

      case "combat_end": {
        if (combat) {
          combat.phase = "ended";
          changes.push({ type: "combat_phase", phase: "ended" });
        }
        if (gameState.encounter) {
          gameState.encounter.phase = "exploration";
          gameState.encounter.combat = undefined;
          gameState.encounter.map = undefined;
        }
        combat = undefined;
        combatChanged = true;
        break;
      }

      case "turn_end": {
        if (combat && combat.phase === "active" && combat.turnOrder.length > 0) {
          // Advance to next combatant
          combat.turnIndex =
            (combat.turnIndex + 1) % combat.turnOrder.length;
          // Increment round when wrapping
          if (combat.turnIndex === 0) {
            combat.round++;
          }
          // Reset movement for the new active combatant
          const activeId = combat.turnOrder[combat.turnIndex];
          const active = combat.combatants[activeId];
          if (active) {
            active.movementUsed = 0;
          }
          combatChanged = true;
        }
        break;
      }

      case "add_combatants": {
        if (!combat) {
          warnings.push("add_combatants: not in combat");
          break;
        }
        combatChanged = true;
        for (const c of action.combatants) {
          const id = crypto.randomUUID();
          const initiative = rollInitiative(c.initiativeModifier);
          const combatant: Combatant = {
            id,
            name: c.name,
            type: c.type,
            initiative,
            initiativeModifier: c.initiativeModifier,
            speed: c.speed,
            movementUsed: 0,
            size: c.size || "medium",
            position: c.position,
            maxHP: c.maxHP,
            currentHP: c.maxHP,
            tempHP: 0,
            armorClass: c.armorClass,
            conditions: [],
          };
          combat.combatants[id] = combatant;
          // Insert into turn order by initiative
          insertIntoTurnOrder(combat, id, initiative);
          changes.push({ type: "combatant_add", combatant });
        }
        break;
      }

      case "move": {
        if (!combat) {
          warnings.push("move: not in combat");
          break;
        }
        const combatant = findCombatantByName(combat, action.combatantName);
        if (!combatant) {
          warnings.push(`move: combatant "${action.combatantName}" not found`);
          break;
        }
        const from = combatant.position || { x: 0, y: 0 };

        // Calculate Chebyshev distance (diagonal = 1 tile)
        const moveDx = Math.abs(action.to.x - from.x);
        const moveDy = Math.abs(action.to.y - from.y);
        const moveDistFt = Math.max(moveDx, moveDy) * 5;

        // Check speed budget: warn if over (AI may have valid reason like Dash)
        const moveRemaining = combatant.speed - (combatant.movementUsed ?? 0);
        if (moveDistFt > moveRemaining) {
          const overBy = moveDistFt - moveRemaining;
          systemMessages.push(
            `⚠️ ${combatant.name} moved ${moveDistFt}ft but only had ${moveRemaining}ft remaining (${overBy}ft over budget)`
          );
        }

        // Check for token stacking — warn if any tile the mover will occupy overlaps another combatant
        const moverTiles = getOccupiedTiles(action.to, combatant.size);
        for (const other of Object.values(combat.combatants)) {
          if (other.id === combatant.id || !other.position) continue;
          const otherTiles = getOccupiedTiles(other.position, other.size);
          const overlap = moverTiles.some((mt) => otherTiles.some((ot) => mt.x === ot.x && mt.y === ot.y));
          if (overlap) {
            systemMessages.push(
              `⚠️ ${combatant.name} overlaps ${other.name} at destination (${action.to.x},${action.to.y}) — tokens should not stack`
            );
            break;
          }
        }

        // Check target tile walkability
        const map = gameState.encounter?.map;
        if (map) {
          const tile = map.tiles[action.to.y]?.[action.to.x];
          if (tile && (tile.type === "wall" || tile.type === "pit")) {
            systemMessages.push(
              `⚠️ ${combatant.name} moved onto a ${tile.type} tile at (${action.to.x},${action.to.y})`
            );
          }
        }

        // Update movement tracking
        combatant.movementUsed = (combatant.movementUsed ?? 0) + moveDistFt;
        combatant.position = action.to;
        combatChanged = true;
        changes.push({
          type: "move",
          combatantId: combatant.id,
          from,
          to: action.to,
        });
        break;
      }

      case "short_rest": {
        const shortTargets = action.targets?.length
          ? action.targets
          : Array.from(characters.values()).map((c) => c.static.name);
        for (const name of shortTargets) {
          const found = findCharacterByName(characters, name);
          if (!found) continue;
          const [userId, char] = found;
          // Restore short-rest class resources
          for (const resource of char.static.classResources || []) {
            if (resource.resetType === "short") {
              delete char.dynamic.resourcesUsed[resource.name];
            }
          }
          // Restore pact magic slots (recharge on short rest)
          for (const slot of char.dynamic.pactMagicSlots || []) {
            slot.used = 0;
          }
          characterUpdates.set(userId, char.dynamic);
        }
        break;
      }

      case "long_rest": {
        // Restore HP to max, restore all spell slots, clear conditions
        const targets = action.targets?.length
          ? action.targets
          : Array.from(characters.values()).map((c) => c.static.name);
        for (const name of targets) {
          const found = findCharacterByName(characters, name);
          if (!found) continue;
          const [userId, char] = found;
          char.dynamic.currentHP = char.static.maxHP;
          char.dynamic.tempHP = 0;
          char.dynamic.conditions = [];
          char.dynamic.deathSaves = { successes: 0, failures: 0 };
          for (const slot of char.dynamic.spellSlotsUsed) {
            slot.used = 0;
          }
          for (const slot of char.dynamic.pactMagicSlots || []) {
            slot.used = 0;
          }
          // Restore all class resources
          char.dynamic.resourcesUsed = {};
          characterUpdates.set(userId, char.dynamic);
        }
        break;
      }

      case "journal_update": {
        // Apply journal updates to game state
        if (!gameState.journal) {
          gameState.journal = {
            storySummary: "",
            completedQuests: [],
            npcs: [],
            locations: [],
            notableItems: [],
            partyLevel: 1,
          };
        }
        const j = gameState.journal;

        if (action.storySummary) j.storySummary = action.storySummary;
        if (action.activeQuest !== undefined) j.activeQuest = action.activeQuest;
        if (action.questCompleted) {
          j.completedQuests.push(action.questCompleted);
          // Keep last 10 completed quests
          if (j.completedQuests.length > 10) {
            j.completedQuests = j.completedQuests.slice(-10);
          }
          // Clear active quest if it matches the completed one
          if (j.activeQuest === action.questCompleted) {
            j.activeQuest = undefined;
          }
        }
        if (action.addNPC) {
          // Replace existing NPC with same name, or add new
          const idx = j.npcs.findIndex(
            (n) => n.name.toLowerCase() === action.addNPC!.name.toLowerCase()
          );
          if (idx >= 0) {
            j.npcs[idx] = action.addNPC;
          } else {
            j.npcs.push(action.addNPC);
          }
          // Cap at 10 NPCs — evict oldest
          if (j.npcs.length > 10) {
            j.npcs = j.npcs.slice(-10);
          }
        }
        if (action.removeNPC) {
          j.npcs = j.npcs.filter(
            (n) => n.name.toLowerCase() !== action.removeNPC!.toLowerCase()
          );
        }
        if (action.addLocation && !j.locations.includes(action.addLocation)) {
          j.locations.push(action.addLocation);
          // Cap at 8 locations — evict oldest
          if (j.locations.length > 8) {
            j.locations = j.locations.slice(-8);
          }
        }
        if (action.addItem && !j.notableItems.includes(action.addItem)) {
          j.notableItems.push(action.addItem);
          if (j.notableItems.length > 8) {
            j.notableItems = j.notableItems.slice(-8);
          }
        }
        if (action.removeItem) {
          j.notableItems = j.notableItems.filter(
            (i) => i.toLowerCase() !== action.removeItem!.toLowerCase()
          );
        }
        break;
      }
    }

    // Create event for non-trivial actions
    if (changes.length > 0) {
      events.push({
        id: crypto.randomUUID(),
        type: actionToEventType(action.type),
        timestamp: Date.now(),
        description: describeAction(action),
        stateBefore: {
          characters: snapshotCharacters,
          combatants: snapshotCombatants,
        },
        conversationIndex,
        changes,
      });
    }
  }

  return {
    characterUpdates,
    // undefined = no change, null = combat ended, CombatState = updated
    combatUpdate: combatChanged ? (combat ?? null) : undefined,
    checkRequests,
    events,
    warnings,
    systemMessages,
    damageRolls,
  };
}

// ─── Action processors ───

function applyDamage(
  targetName: string,
  amount: number,
  damageType: string | undefined,
  characters: Map<string, CharacterData>,
  combat: CombatState | undefined,
  updates: Map<string, CharacterDynamicData>,
  warnings: string[]
): StateChange[] | null {
  amount = Math.max(0, amount);
  if (amount === 0) return null;

  // Check if target is a player character
  const found = findCharacterByName(characters, targetName);
  if (found) {
    const [userId, char] = found;
    let remaining = amount;

    // Deduct tempHP first
    if (char.dynamic.tempHP > 0) {
      const absorbed = Math.min(char.dynamic.tempHP, remaining);
      char.dynamic.tempHP -= absorbed;
      remaining -= absorbed;
    }

    // Then deduct currentHP
    char.dynamic.currentHP = Math.max(0, char.dynamic.currentHP - remaining);

    // Add unconscious at 0 HP
    if (
      char.dynamic.currentHP === 0 &&
      !char.dynamic.conditions.includes("unconscious")
    ) {
      char.dynamic.conditions.push("unconscious");
    }

    updates.set(userId, char.dynamic);
    return [{ type: "damage", target: targetName, amount, damageType }];
  }

  // Check if target is an enemy/npc combatant
  if (combat) {
    const combatant = findCombatantByName(combat, targetName);
    if (combatant && combatant.type !== "player") {
      let remaining = amount;
      if (combatant.tempHP && combatant.tempHP > 0) {
        const absorbed = Math.min(combatant.tempHP, remaining);
        combatant.tempHP -= absorbed;
        remaining -= absorbed;
      }
      combatant.currentHP = Math.max(
        0,
        (combatant.currentHP ?? 0) - remaining
      );
      if (
        combatant.currentHP === 0 &&
        !combatant.conditions?.includes("unconscious")
      ) {
        if (!combatant.conditions) combatant.conditions = [];
        combatant.conditions.push("unconscious");
      }
      return [{ type: "damage", target: targetName, amount, damageType }];
    }
  }

  warnings.push(`Damage: target "${targetName}" not found`);
  return null;
}

function applyHealing(
  targetName: string,
  amount: number,
  characters: Map<string, CharacterData>,
  combat: CombatState | undefined,
  updates: Map<string, CharacterDynamicData>,
  warnings: string[]
): StateChange[] | null {
  amount = Math.max(0, amount);
  if (amount === 0) return null;

  const found = findCharacterByName(characters, targetName);
  if (found) {
    const [userId, char] = found;
    const wasDown = char.dynamic.currentHP === 0;
    char.dynamic.currentHP = Math.min(
      char.static.maxHP,
      char.dynamic.currentHP + amount
    );
    // Remove unconscious if healed from 0
    if (wasDown && char.dynamic.currentHP > 0) {
      char.dynamic.conditions = char.dynamic.conditions.filter(
        (c) => c !== "unconscious"
      );
      char.dynamic.deathSaves = { successes: 0, failures: 0 };
    }
    updates.set(userId, char.dynamic);
    return [{ type: "healing", target: targetName, amount }];
  }

  // Enemy/NPC healing
  if (combat) {
    const combatant = findCombatantByName(combat, targetName);
    if (combatant && combatant.type !== "player") {
      const wasDown = (combatant.currentHP ?? 0) === 0;
      combatant.currentHP = Math.min(
        combatant.maxHP ?? 0,
        (combatant.currentHP ?? 0) + amount
      );
      if (wasDown && (combatant.currentHP ?? 0) > 0) {
        combatant.conditions = (combatant.conditions || []).filter(
          (c) => c !== "unconscious"
        );
      }
      return [{ type: "healing", target: targetName, amount }];
    }
  }

  warnings.push(`Healing: target "${targetName}" not found`);
  return null;
}

function applySetHP(
  targetName: string,
  value: number,
  characters: Map<string, CharacterData>,
  combat: CombatState | undefined,
  updates: Map<string, CharacterDynamicData>,
  warnings: string[]
): StateChange[] | null {
  const found = findCharacterByName(characters, targetName);
  if (found) {
    const [userId, char] = found;
    char.dynamic.currentHP = Math.max(
      0,
      Math.min(char.static.maxHP, value)
    );
    updates.set(userId, char.dynamic);
    return [{ type: "hp_set", target: targetName, value }];
  }

  if (combat) {
    const combatant = findCombatantByName(combat, targetName);
    if (combatant && combatant.type !== "player") {
      combatant.currentHP = Math.max(
        0,
        Math.min(combatant.maxHP ?? value, value)
      );
      return [{ type: "hp_set", target: targetName, value }];
    }
  }

  warnings.push(`Set HP: target "${targetName}" not found`);
  return null;
}

function applySetTempHP(
  targetName: string,
  value: number,
  characters: Map<string, CharacterData>,
  combat: CombatState | undefined,
  updates: Map<string, CharacterDynamicData>,
  warnings: string[]
): StateChange[] | null {
  value = Math.max(0, value);
  const found = findCharacterByName(characters, targetName);
  if (found) {
    const [userId, char] = found;
    // Temp HP doesn't stack — use the higher value
    char.dynamic.tempHP = Math.max(char.dynamic.tempHP, value);
    updates.set(userId, char.dynamic);
    return [{ type: "temp_hp", target: targetName, amount: value }];
  }

  if (combat) {
    const combatant = findCombatantByName(combat, targetName);
    if (combatant && combatant.type !== "player") {
      combatant.tempHP = Math.max(combatant.tempHP ?? 0, value);
      return [{ type: "temp_hp", target: targetName, amount: value }];
    }
  }

  warnings.push(`Set Temp HP: target "${targetName}" not found`);
  return null;
}

function applyCondition(
  targetName: string,
  condition: string,
  add: boolean,
  characters: Map<string, CharacterData>,
  combat: CombatState | undefined,
  updates: Map<string, CharacterDynamicData>,
  warnings: string[]
): StateChange[] | null {
  const cond = condition.toLowerCase();

  const found = findCharacterByName(characters, targetName);
  if (found) {
    const [userId, char] = found;
    if (add) {
      if (!char.dynamic.conditions.includes(cond)) {
        char.dynamic.conditions.push(cond);
      }
    } else {
      char.dynamic.conditions = char.dynamic.conditions.filter(
        (c) => c !== cond
      );
    }
    updates.set(userId, char.dynamic);
    return [
      add
        ? { type: "condition_add", target: targetName, condition: cond }
        : { type: "condition_remove", target: targetName, condition: cond },
    ];
  }

  if (combat) {
    const combatant = findCombatantByName(combat, targetName);
    if (combatant && combatant.type !== "player") {
      if (!combatant.conditions) combatant.conditions = [];
      if (add) {
        if (!combatant.conditions.includes(cond)) {
          combatant.conditions.push(cond);
        }
      } else {
        combatant.conditions = combatant.conditions.filter((c) => c !== cond);
      }
      return [
        add
          ? { type: "condition_add", target: targetName, condition: cond }
          : { type: "condition_remove", target: targetName, condition: cond },
      ];
    }
  }

  warnings.push(
    `Condition ${add ? "add" : "remove"}: target "${targetName}" not found`
  );
  return null;
}

function applySpellSlot(
  targetName: string,
  level: number,
  use: boolean,
  characters: Map<string, CharacterData>,
  updates: Map<string, CharacterDynamicData>,
  warnings: string[]
): StateChange[] | null {
  const found = findCharacterByName(characters, targetName);
  if (!found) {
    warnings.push(`Spell slot: character "${targetName}" not found`);
    return null;
  }

  const [userId, char] = found;
  // Try regular slots first, then fall back to pact magic slots
  let slot = char.dynamic.spellSlotsUsed.find((s) => s.level === level);
  if (!slot || (use && slot.used >= slot.total)) {
    const pactSlot = (char.dynamic.pactMagicSlots || []).find((s) => s.level === level);
    if (pactSlot && (!use || pactSlot.used < pactSlot.total)) {
      slot = pactSlot;
    }
  }
  if (!slot) {
    warnings.push(
      `Spell slot: "${targetName}" has no level ${level} slots`
    );
    return null;
  }

  if (use) {
    if (slot.used >= slot.total) {
      warnings.push(
        `Spell slot: "${targetName}" has no level ${level} slots remaining`
      );
      return null;
    }
    slot.used++;
  } else {
    if (slot.used <= 0) return null;
    slot.used--;
  }

  updates.set(userId, char.dynamic);
  return [
    use
      ? { type: "spell_slot_use", target: targetName, level }
      : { type: "spell_slot_restore", target: targetName, level },
  ];
}

// ─── Combat initialization ───

function startCombat(
  action: AICombatStart,
  characters: Map<string, CharacterData>,
  warnings: string[]
): CombatState {
  const combatants: Record<string, Combatant> = {};

  // Add player combatants (bound to CharacterDynamicData)
  for (const [userId, char] of characters) {
    const id = crypto.randomUUID();
    const dexMod = getModifier(char.static.abilities.dexterity);
    const totalLevel = getTotalLevel(char.static.classes);
    const profBonus = getProficiencyBonus(totalLevel);

    // Check for initiative advantage
    const hasInitAdv = char.static.advantages.some(
      (a) => a.type === "advantage" && a.subType === "initiative"
    );

    const initMod = dexMod; // TODO: add initiative bonus from features
    const initiative = hasInitAdv
      ? Math.max(rollInitiative(initMod), rollInitiative(initMod))
      : rollInitiative(initMod);

    // Apply AI-provided player position if available
    const aiPos = action.playerPositions?.[char.static.name];

    combatants[id] = {
      id,
      name: char.static.name,
      type: "player",
      playerId: userId,
      initiative,
      initiativeModifier: initMod,
      speed: char.static.speed,
      movementUsed: 0,
      size: "medium", // TODO: derive from race
      position: aiPos,
    };
  }

  // Add enemy combatants
  for (const enemy of action.enemies) {
    const id = crypto.randomUUID();
    const initiative = rollInitiative(enemy.initiativeModifier);

    combatants[id] = {
      id,
      name: enemy.name,
      type: "enemy",
      initiative,
      initiativeModifier: enemy.initiativeModifier,
      speed: enemy.speed,
      movementUsed: 0,
      size: enemy.size || "medium",
      position: enemy.position,
      tokenColor: enemy.tokenColor,
      maxHP: enemy.maxHP,
      currentHP: enemy.maxHP,
      tempHP: 0,
      armorClass: enemy.armorClass,
      conditions: [],
    };
  }

  // Sort by initiative (descending), then initiative modifier as tiebreaker
  const turnOrder = Object.values(combatants)
    .sort((a, b) => {
      if (b.initiative !== a.initiative) return b.initiative - a.initiative;
      return b.initiativeModifier - a.initiativeModifier;
    })
    .map((c) => c.id);

  return {
    phase: "active",
    round: 1,
    turnIndex: 0,
    turnOrder,
    combatants,
  };
}

/** Get number of tiles a creature occupies per axis (large=2, huge=3, etc.) */
function creatureTileSpan(size: string): number {
  switch (size) {
    case "large": return 2;
    case "huge": return 3;
    case "gargantuan": return 4;
    default: return 1; // tiny, small, medium
  }
}

/**
 * Assign grid positions to combatants that don't already have one.
 * Players go on the left side, enemies/NPCs on the right side.
 * Accounts for creature size (large=2x2, huge=3x3, gargantuan=4x4).
 */
function assignCombatantPositions(
  combat: CombatState,
  map: BattleMapState
): void {
  const players: string[] = [];
  const enemies: string[] = [];

  for (const [id, c] of Object.entries(combat.combatants)) {
    if (c.position) continue; // Already has a position
    if (c.type === "player") {
      players.push(id);
    } else {
      enemies.push(id);
    }
  }

  // Find walkable tiles (not wall/pit)
  const isWalkable = (x: number, y: number): boolean => {
    if (x < 0 || y < 0 || x >= map.width || y >= map.height) return false;
    const tile = map.tiles[y]?.[x];
    return tile != null && tile.type !== "wall" && tile.type !== "pit";
  };

  // Occupied set to prevent stacking — tracks ALL tiles used by placed creatures
  const occupied = new Set<string>();
  for (const c of Object.values(combat.combatants)) {
    if (!c.position) continue;
    const span = creatureTileSpan(c.size);
    for (let dy = 0; dy < span; dy++) {
      for (let dx = 0; dx < span; dx++) {
        occupied.add(`${c.position.x + dx},${c.position.y + dy}`);
      }
    }
  }

  /** Check if a creature of given size can be placed at (x,y). All tiles must be walkable + unoccupied. */
  const canPlace = (x: number, y: number, span: number): boolean => {
    for (let dy = 0; dy < span; dy++) {
      for (let dx = 0; dx < span; dx++) {
        const tx = x + dx;
        const ty = y + dy;
        if (!isWalkable(tx, ty) || occupied.has(`${tx},${ty}`)) return false;
      }
    }
    return true;
  };

  /** Place creature and mark all its tiles as occupied. */
  const placeAt = (id: string, x: number, y: number): boolean => {
    const span = creatureTileSpan(combat.combatants[id].size);
    if (!canPlace(x, y, span)) return false;
    combat.combatants[id].position = { x, y };
    for (let dy = 0; dy < span; dy++) {
      for (let dx = 0; dx < span; dx++) {
        occupied.add(`${x + dx},${y + dy}`);
      }
    }
    return true;
  };

  // Place players on the left side, scanning from column 1 outward
  const midY = Math.floor(map.height / 2);
  for (let i = 0; i < players.length; i++) {
    let placed = false;
    // Spread vertically from center, scanning columns left-to-right
    for (let dx = 1; dx < map.width - 1 && !placed; dx++) {
      for (let dy = 0; dy < map.height && !placed; dy++) {
        const tryY = midY + (dy % 2 === 0 ? Math.floor(dy / 2) : -Math.ceil(dy / 2));
        if (tryY >= 1 && tryY < map.height - 1) {
          placed = placeAt(players[i], dx, tryY);
        }
      }
    }
  }

  // Place enemies on the right side, scanning from right edge inward
  for (let i = 0; i < enemies.length; i++) {
    const span = creatureTileSpan(combat.combatants[enemies[i]].size);
    let placed = false;
    for (let dx = map.width - 1 - span; dx >= 1 && !placed; dx--) {
      for (let dy = 0; dy < map.height && !placed; dy++) {
        const tryY = midY + (dy % 2 === 0 ? Math.floor(dy / 2) : -Math.ceil(dy / 2));
        if (tryY >= 1 && tryY < map.height - 1) {
          placed = placeAt(enemies[i], dx, tryY);
        }
      }
    }
  }
}

/** Insert a combatant into the turn order by initiative. */
function insertIntoTurnOrder(
  combat: CombatState,
  combatantId: string,
  initiative: number
): void {
  const idx = combat.turnOrder.findIndex((id) => {
    const c = combat.combatants[id];
    return c && c.initiative < initiative;
  });
  if (idx === -1) {
    combat.turnOrder.push(combatantId);
  } else {
    combat.turnOrder.splice(idx, 0, combatantId);
  }
}

// ─── Event helpers ───

function actionToEventType(
  actionType: string
): GameEvent["type"] {
  const map: Record<string, GameEvent["type"]> = {
    damage: "damage",
    healing: "healing",
    set_hp: "hp_set",
    set_temp_hp: "temp_hp_set",
    condition_add: "condition_added",
    condition_remove: "condition_removed",
    spell_slot_use: "spell_slot_used",
    spell_slot_restore: "spell_slot_restored",
    death_save: "death_save",
    xp_award: "xp_gained",
    check_request: "check_requested",
    combat_start: "combat_start",
    combat_end: "combat_end",
    turn_end: "turn_end",
    add_combatants: "combat_start",
    move: "custom",
    short_rest: "rest_short",
    long_rest: "rest_long",
  };
  return map[actionType] || "custom";
}

function describeAction(action: AIAction): string {
  switch (action.type) {
    case "damage":
      return `${action.target} took ${action.amount} ${action.damageType || ""} damage`.trim();
    case "healing":
      return `${action.target} healed for ${action.amount} HP`;
    case "set_hp":
      return `${action.target}'s HP set to ${action.value}`;
    case "set_temp_hp":
      return `${action.target} gained ${action.value} temp HP`;
    case "condition_add":
      return `${action.target} gained condition: ${action.condition}`;
    case "condition_remove":
      return `${action.target} lost condition: ${action.condition}`;
    case "spell_slot_use":
      return `${action.target} used a level ${action.level} spell slot`;
    case "spell_slot_restore":
      return `${action.target} restored a level ${action.level} spell slot`;
    case "xp_award":
      return `${action.targets.join(", ")} gained ${action.amount} XP`;
    case "combat_start":
      return `Combat started with ${action.enemies.length} enemies`;
    case "combat_end":
      return "Combat ended";
    case "turn_end":
      return "Turn ended";
    case "check_request":
      return `${action.check.targetCharacter}: ${action.check.reason}`;
    case "death_save":
      return `${action.target} makes a death saving throw`;
    case "move":
      return `${action.combatantName} moved`;
    case "add_combatants":
      return `${action.combatants.length} combatants joined`;
    case "short_rest":
      return "Short rest";
    case "long_rest":
      return "Long rest";
    case "journal_update":
      return "Journal updated";
  }
}
