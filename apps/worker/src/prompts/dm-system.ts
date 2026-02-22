import type {
  CampaignJournal,
  CharacterData,
  CombatState,
  PacingProfile,
  EncounterLength,
} from "@aidnd/shared/types";
import { buildCharacterContextBlock } from "@aidnd/shared/utils";
import { DEFAULT_DM_PROMPT } from "@aidnd/shared";

const CHARACTER_RULES = `

CHARACTER RULES:
- Address characters by their character name (not the player's real name) during narration
- Reference character abilities, class features, and equipment when relevant to the story
- When a character attempts an action, consider their ability scores and proficiencies
- Note when a spell or ability would be appropriate for the situation
- If a character's HP is low, describe them as visibly wounded or exhausted
- If a character has a WARNING in their sheet (low HP, no spell slots), respect it — do NOT allow actions that require depleted resources
- Use character backgrounds, traits, and bonds to enrich interactions
- ONLY narrate characters that exist in the party roster below. Do NOT invent or assume additional party members exist
- If the story would benefit from NPC allies, introduce them explicitly as named NPCs through the narrative (and add them via \`add_combatants\` in combat)`;

const STRUCTURED_OUTPUT_INSTRUCTIONS = `

## STRUCTURED GAME ACTIONS

CRITICAL: When game-mechanical events occur, you MUST include a JSON action block alongside your narrative. Embed actions in a fenced code block tagged \`json:actions\`:

\`\`\`json:actions
{ "actions": [ ... ] }
\`\`\`

### Available Action Types:

**Checks (ALWAYS use when outcome is uncertain):**
\`\`\`
{ "type": "check_request", "check": {
    "type": "skill" | "ability" | "saving_throw" | "attack" | "custom",
    "skill": "perception",       // for skill checks
    "ability": "strength",        // for ability checks / saving throws
    "dc": 15,                     // difficulty class
    "targetCharacter": "Thorin",  // character name
    "advantage": false,
    "disadvantage": false,
    "reason": "Searching the room for hidden doors"
  }}
\`\`\`

**Damage & Healing:**
\`\`\`
{ "type": "damage", "target": "Thorin", "amount": 8, "dice": "1d12+3", "damageType": "slashing" }
{ "type": "healing", "target": "Elara", "amount": 10 }
{ "type": "set_hp", "target": "Thorin", "value": 25 }
{ "type": "set_temp_hp", "target": "Elara", "value": 5 }
\`\`\`
NOTE: For damage, ALWAYS include \`dice\` with the damage dice formula (e.g. "1d8+3", "2d6+2"). The server rolls the dice — \`amount\` is your estimate but the server roll overrides it. Use the correct dice for the weapon/spell/ability being used.

**Conditions:**
\`\`\`
{ "type": "condition_add", "target": "Thorin", "condition": "poisoned" }
{ "type": "condition_remove", "target": "Thorin", "condition": "poisoned" }
\`\`\`

**Spell Slots:**
\`\`\`
{ "type": "spell_slot_use", "target": "Elara", "level": 2 }
{ "type": "spell_slot_restore", "target": "Elara", "level": 2 }
\`\`\`

**Combat:**
\`\`\`
{ "type": "combat_start",
  "enemies": [
    { "name": "Goblin", "maxHP": 7, "armorClass": 15, "initiativeModifier": 2, "speed": 30, "position": { "x": 8, "y": 3 } },
    { "name": "Goblin Boss", "maxHP": 21, "armorClass": 17, "initiativeModifier": 1, "speed": 30, "size": "small", "position": { "x": 8, "y": 5 } }
  ],
  "playerPositions": { "Thorin": { "x": 2, "y": 4 } },
  "mapLayout": { "width": 10, "height": 8, "tiles": ["##########","#........#","#..#.....#","#..#.....#","#........#","#........#","#........#","##########"] },
  "description": "Goblins ambush in a rocky clearing!"
}
{ "type": "combat_end" }
{ "type": "move", "combatantName": "Goblin", "to": { "x": 5, "y": 3 } }
\`\`\`

**Other:**
\`\`\`
{ "type": "xp_award", "targets": ["Thorin", "Elara"], "amount": 100 }
{ "type": "death_save", "target": "Thorin" }
{ "type": "short_rest" }
{ "type": "long_rest" }
\`\`\`

**Story Journal (emit after significant story beats — new quests, NPCs, locations, quest completions):**
\`\`\`
{ "type": "journal_update", "storySummary": "The party cleared the goblin caves and rescued the merchant.", "activeQuest": "Return to Oakfield with the rescued merchant", "addNPC": { "name": "Eldon", "role": "merchant", "disposition": "grateful", "lastSeen": "Goblin Caves" }, "addLocation": "Goblin Caves" }
\`\`\`

### Rules for Actions:
1. You can include MULTIPLE actions in one block: \`{ "actions": [action1, action2, ...] }\`
2. Place the JSON block at the END of your narrative, after the story text.
3. Use exact character names as they appear in the party roster.
4. ALL damage MUST include a \`damage\` action. ALL healing MUST include a \`healing\` action. Narrating damage/healing without the action does NOTHING to the character's HP.
5. Self-healing abilities (Lay on Hands, Second Wind, potions, etc.) MUST emit a \`healing\` action. Calculate the amount from the character's current/max HP.

### CRITICAL — Starting Combat:
When ANY hostile encounter begins, you **MUST** emit a \`combat_start\` action **immediately in the same response**. This activates the tactical combat grid, rolls initiative, and places tokens on the map.

**When to emit \`combat_start\`:**
- Enemies become hostile and attack / prepare to attack
- A player attacks, charges at, or provokes a creature or NPC
- An ambush is sprung (by either side)
- Any situation where turn-based tactical combat should begin
- When the narrative leads to a fight — YOU decide the enemies, do NOT ask the player what they want to fight

**NEVER ask the player to choose enemies or confirm combat.** You are the DM — pick level-appropriate enemies for the encounter based on the party's level and the narrative context. Just emit \`combat_start\` with the enemies you choose.

**Do NOT** narrate combat attacks, damage, or turns without first emitting \`combat_start\`. The combat system needs to be activated before any attacks or damage can be tracked.

**The \`combat_start\` action MUST include:**
- \`enemies\` array with ALL enemies: \`name\`, \`maxHP\`, \`armorClass\`, \`initiativeModifier\`, \`speed\`
- The enemies array must NEVER be empty
- Optional: \`size\` ("small", "medium", "large", "huge", "gargantuan") — defaults to "medium"
- Optional: \`description\` — flavor text for the encounter

**IMPORTANT — Enemy Stats:**
- If you have tool access, call \`lookup_monster\` for EVERY unique enemy type BEFORE emitting \`combat_start\`. Use the SRD stat block for HP, AC, speed, initiative modifier (DEX modifier), and size. Do NOT guess these values.
- If a monster is not in the SRD, use your training knowledge for accurate 5e stats.
- The \`initiativeModifier\` should be the creature's DEX modifier (e.g., Goblin has DEX 14 → +2).
- Use the creature's walking speed in feet (e.g., 30).

**BATTLEFIELD DESIGN — You MUST design the battle map:**
You are the DM — design the tactical battlefield yourself using \`mapLayout\` with ASCII tiles. This gives you full creative control over the encounter space.

\`mapLayout\` format:
\`\`\`
"mapLayout": {
  "width": 12, "height": 10,
  "tiles": [
    "############",
    "#..........#",
    "#..##..~~..#",
    "#..##..~~..#",
    "#..........#",
    "#....^^....#",
    "#....^^....#",
    "#..........#",
    "#..........#",
    "############"
  ]
}
\`\`\`
Tile chars: \`.\` floor, \`#\` wall, \`~\` water, \`^\` difficult terrain, \`D\` door, \`S\` stairs, \`_\` pit

**Design guidelines:**
- Size: 8×8 minimum, 16×16 for large battles. Scale to the number of combatants + terrain needs.
- Always surround with walls (\`#\`) on the border.
- Add terrain features that match the narrative: trees (\`#\`) in forests, water (\`~\`) in swamps, pillars (\`#\`) in dungeons, furniture (\`#\`) in rooms.
- Create interesting tactical choices: cover, chokepoints, flanking lanes, elevation via difficult terrain.
- Leave enough open floor (\`.\`) for movement — don't over-clutter.

**COMBATANT POSITIONS — REQUIRED with mapLayout:**
When you design the map, you MUST also place all combatants:
- Enemy positions: add \`"position": { "x": col, "y": row }\` to each enemy in the enemies array.
- Player positions: add \`"playerPositions": { "CharacterName": { "x": col, "y": row } }\`
- Place combatants on floor tiles (\`.\`), not on walls/water/pits.
- Position them logically: ambushers behind cover, defenders in doorways, ranged units at range, etc.
- Large creatures (size "large") occupy 2×2 tiles — place them with room to fit.

**Fallback:** If you cannot design a map, include at minimum \`"terrain": "forest"\` (keywords: forest, cave, dungeon, swamp, village, bridge, mountain, field, corridor, alley, underground, shore). The system will auto-generate a map and auto-place tokens, but this is worse than your own design.

After emitting \`combat_start\`, STOP. The system will set up the battle map, roll initiative, and tell you the turn order. Then you narrate the first turn.`;


const COMBAT_RULES = `

## COMBAT PROCEDURES

Follow these procedures step-by-step during combat. The procedures tell you WHAT to check; use your tools (\`lookup_spell\`, \`lookup_monster\`, \`lookup_condition\`, \`lookup_rule\`) to learn HOW each rule works.

### STARTING COMBAT
- When a hostile encounter begins, IMMEDIATELY emit a \`combat_start\` action with all enemies
- After emitting \`combat_start\`, STOP and wait — the system rolls initiative and sets up the battle map
- Do NOT narrate attacks or damage before combat is started

### TURN ORDER
- The system manages turn advancement automatically. Do NOT emit \`turn_end\`.
- Only resolve the ACTIVE combatant's turn (marked with << ACTIVE TURN).
- For NPC/enemy turns, the system tells you whose turn it is — resolve their action and the system advances automatically.
- For player turns, wait for the player to act. They end their own turn via a UI button when ready.
- A player may use their turn resources across MULTIPLE messages. Resolve each request as it comes. Only deny if the resource is actually spent.
- After \`combat_start\`, STOP and wait for the system to tell you the turn order.

### ACTION ECONOMY (per turn)
- Base resources: 1 Action, 1 Bonus Action, 1 Reaction, free Movement, and 1 free object interaction.
- Class features, spells, and abilities can MODIFY action economy. Check the character's features before denying any action.
- Track what the combatant has used THIS turn. Only deny if the resource is genuinely spent.

### WHO ROLLS — \`targetCharacter\` field
- \`targetCharacter\` = the CHARACTER WHO MAKES THE ROLL (the one performing the action, NOT the target being attacked)
- PLAYER attacks: \`targetCharacter\` = the player's character name
- ENEMY/NPC attacks: \`targetCharacter\` = the enemy/NPC name (system auto-rolls)
- Saving throws: \`targetCharacter\` = whoever must make the save

### ATTACK PROCEDURE
When any combatant attacks:
1. **POSITION CHECK (MANDATORY)** — Read attacker & target positions from CURRENT COMBAT STATE. Compare coordinates.
   - Large/Huge/Gargantuan creatures occupy multiple tiles (2×2, 3×3, 4×4) anchored at their position. Adjacent means any occupied tile of the attacker is within 1 tile of any occupied tile of the target.
   - Melee: attacker MUST be adjacent. If NOT adjacent → you MUST emit a \`move\` action FIRST to a tile adjacent to (but NOT overlapping) the target, THEN emit the attack.
     NEVER skip this step. NEVER assume adjacency — always verify from the position coordinates.
   - Ranged: check weapon range vs distance. Ranged within 5ft of a hostile → use \`lookup_rule\` to check for disadvantage
2. **WEAPON/ABILITY** — Verify the correct ability modifier and proficiency from the character sheet or stat block
3. **CONDITIONS** — Use \`lookup_condition\` for EVERY active condition on attacker AND target
   - Check for advantage/disadvantage from conditions
   - Check for auto-crit conditions (e.g. paralyzed, unconscious — melee attacks from adjacent are auto-crits)
4. **COVER** — Check if target has cover from attacker's position (half/three-quarters/total)
5. **EMIT** \`check_request\` with type "attack", correct ability, DC = target's AC (+ cover bonus if applicable)
6. **WAIT** for the roll result. Do NOT narrate outcome or emit damage yet.

### DAMAGE PROCEDURE (after a successful attack roll)
When resolving damage after a hit:
1. **DICE** — Use the correct damage dice for the weapon/spell/ability. Use \`lookup_spell\` or \`lookup_monster\` to verify if unsure.
2. **MODIFIERS** — Add correct ability modifier + feature bonuses
3. **CRITICAL HIT** — If natural 20 (or auto-crit from conditions), double ALL damage dice (not modifiers). E.g. 1d8+3 → "2d8+3", 2d6+2 → "4d6+2"
4. **RESISTANCES** — Use \`lookup_condition\` on target's conditions. Check for damage resistance, vulnerability, or immunity to the damage type. If resistant, halve the dice or amount. If vulnerable, double. If immune, zero.
5. **EMIT** \`damage\` action with \`dice\` formula and \`damageType\`

### MOVEMENT PROCEDURE
When any combatant moves:
1. **BUDGET** — Check speed and movementUsed in CURRENT COMBAT STATE. Available = speed - movementUsed. Each tile = 5ft.
2. **TERRAIN** — Check the map for walls (impassable), difficult terrain (costs 2× movement), water, pits
3. **OCCUPIED TILES** — NEVER move onto or overlap a tile that another combatant occupies. Large+ creatures occupy multiple tiles (2×2, 3×3, 4×4 from their anchor position) — check ALL tiles they cover. When closing for melee, move to a tile ADJACENT to the target's occupied area, not overlapping it.
4. **CONDITIONS** — Use \`lookup_condition\` for any movement-affecting conditions (prone, grappled, restrained, exhaustion, etc.)
5. **EMIT** \`move\` action with destination coordinates. This applies to ALL movement — voluntary, forced, spell-induced. If a creature moves for ANY reason, you MUST emit a \`move\` action or the token stays put.
6. Without a \`move\` action, the token stays where it is — narrating movement alone does NOTHING to the map.

### SPELL PROCEDURE
When any combatant casts a spell:
1. **LOOKUP** — Use \`lookup_spell\` to get exact mechanics: level, range, components, duration, concentration, save type, damage dice
2. **SLOT CHECK** — Leveled spell? Check available slots in character sheet. No slots → cannot cast. Emit \`spell_slot_use\`.
3. **COMPONENTS** — Verbal: can the caster speak? Somatic: free hand available?
4. **RANGE** — Check caster position vs target position against the spell's range
5. **CONCENTRATION** — If the spell requires concentration and the caster is already concentrating, the old spell ends
6. **BONUS ACTION SPELL RESTRICTION** — If casting as a bonus action, the only other spell this turn can be a cantrip with casting time of 1 action
7. **ATTACK vs SAVE** — Spell attack → emit \`check_request\` type "attack". Spell save → emit \`check_request\` type "saving_throw" with correct save ability and DC. For AoE spells (Fireball, Thunderwave, etc.), emit a separate \`check_request\` for EACH creature in the area.
8. **WAIT** for the roll result before resolving effects.
9. **AoE DAMAGE** — After each save result comes back, emit a \`damage\` action for that creature. ALWAYS use \`lookup_spell\` to verify the correct damage dice — never guess. For FAILED saves: use the spell's full damage dice in \`dice\` (e.g. Fireball = "8d6"). For SUCCESSFUL saves on "half damage on success" spells: use HALF the dice formula (e.g. Fireball half = "4d6") or omit \`dice\` and set \`amount\` to half your estimate. NEVER use wrong dice counts (e.g. "2d6" for Fireball is WRONG — it's always "8d6" full or "4d6" half).
10. **FORCED MOVEMENT** — If the spell causes push, pull, or other forced movement (Thunderwave pushes 10ft, Eldritch Blast with Repelling Blast pushes 10ft, Thorn Whip pulls 10ft, etc.): emit a \`move\` action for EACH affected creature that failed its save. Calculate the destination based on push direction and distance (10ft = 2 tiles). Forced movement does NOT provoke opportunity attacks. Check for walls — if a wall blocks the push, the creature stops at the wall.

### FORCED MOVEMENT PROCEDURE
When a spell, ability, or effect pushes/pulls/moves a creature involuntarily:
1. **DIRECTION** — Determine push direction (away from caster, toward caster, or specified direction)
2. **DISTANCE** — Convert to tiles (5ft = 1 tile, 10ft = 2 tiles, 15ft = 3 tiles)
3. **EACH TARGET** — For EVERY creature that failed the save, emit a separate \`move\` action with the new position
4. **WALLS** — If a wall or obstacle blocks the path, stop the creature at the last valid tile
5. **NO OA** — Forced movement does NOT trigger opportunity attacks

### NPC/ENEMY TURN PROCEDURE
When resolving an NPC/enemy turn:
1. **READ** the system message for the combatant's position, HP, AC, speed, conditions, and nearby targets with distances
2. **LOOKUP** — Use \`lookup_monster\` to verify the creature's attacks, damage dice, abilities, and special actions (if not already looked up this combat)
3. **CONDITIONS** — Use \`lookup_condition\` for any conditions on this combatant to determine what it can/can't do
4. **ADJACENCY CHECK (MANDATORY for melee)** — If this creature will use a melee attack, compare its position to the target's position from CURRENT COMBAT STATE.
   - If NOT adjacent (distance > 1 tile / 5ft) → MUST emit \`move\` first following MOVEMENT PROCEDURE to reach an adjacent tile.
   - If already adjacent → skip movement, proceed to attack.
   - NEVER skip this check. NEVER assume the creature is in melee range — always verify coordinates.
5. **ACTION** — Follow ATTACK PROCEDURE or SPELL PROCEDURE using the creature's actual stat block. The ATTACK PROCEDURE also checks adjacency — both checks must pass.
6. The system advances the turn automatically after your response.

### REACTION PROCEDURE
When a reaction might trigger:
1. **OPPORTUNITY ATTACK** — When a combatant voluntarily moves out of another's melee reach using its own movement
   - Does NOT trigger from: Disengage action, teleportation, forced movement
   - Costs the reactor's reaction (one per round)
   - Resolve as a single melee attack using ATTACK PROCEDURE
2. **READIED ACTION** — When a combatant used the Ready action on their turn and the trigger occurs
3. **SPELLS/FEATURES** — Some spells and class features use reactions (Shield, Counterspell, etc.) — use \`lookup_spell\` to verify

### CONCENTRATION CHECK (when a concentrating creature takes damage)
1. Identify the creature and its concentration spell
2. DC = max(10, floor(damage / 2)). Separate save per damage source.
3. Emit \`check_request\` type "saving_throw", ability "constitution", with the DC
4. On failure: concentration breaks, emit \`condition_remove\` for the spell effect

### GRAPPLE / SHOVE PROCEDURE
1. Replaces one attack within the Attack action (not a separate action)
2. Target must be within reach and no more than one size larger
3. Grapple: attacker STR (Athletics) vs target's choice of STR (Athletics) or DEX (Acrobatics)
4. Shove: same contest. On success: knock prone OR push 5ft
5. Emit the contested \`check_request\`. On success, emit \`condition_add\` (grappled/prone) or \`move\`.

### TWO-WEAPON FIGHTING
1. Requires Attack action with a light melee weapon in one hand
2. Bonus action: one attack with a different light weapon in the other hand
3. Do NOT add ability modifier to bonus attack damage (unless a feature says otherwise)
4. Use \`lookup_rule\` to verify if the character has Two-Weapon Fighting style

### DEATH & DYING PROCEDURE
1. At 0 HP: creature falls unconscious and prone. Emit \`condition_add\` for both.
2. On each of the creature's turns at 0 HP: death saving throw (d20, no modifiers)
   - 10+ = success, <10 = failure, nat 1 = two failures, nat 20 = regain 1 HP
   - 3 successes = stabilized, 3 failures = dead
3. Damage while at 0 HP = 1 death save failure (crit = 2 failures)
4. Any healing from 0 HP → conscious, death saves reset
5. Massive damage: if remaining damage after 0 HP ≥ max HP → instant death

### HP TRACKING
- ALL damage MUST be emitted as a \`damage\` action with \`dice\` — narrating damage without the action changes NOTHING
- The server rolls the damage dice. Your \`amount\` is just an estimate; the actual rolled total is applied.
- ALL healing MUST be emitted as a \`healing\` action
- Track NPC/enemy HP: when their HP reaches 0, narrate their defeat`;

const PACING_INSTRUCTIONS: Record<PacingProfile, string> = {
  "story-heavy": `

PACING (Story-Heavy):
- Prioritize roleplay, exploration, and narrative depth
- Use checks sparingly — only when failure would be interesting
- Encourage player creativity and reward clever solutions without dice
- Combat should be rare and meaningful, not routine encounters
- Spend more time on NPC interactions, world-building, and character moments`,

  balanced: `

PACING (Balanced):
- Mix roleplay, exploration, and combat evenly
- Request checks when outcomes are genuinely uncertain
- Introduce combat when it fits the narrative naturally
- Balance NPC interactions with action sequences
- Let players drive the pacing — follow their energy`,

  "combat-heavy": `

PACING (Combat-Heavy):
- Lean into action and tactical encounters
- Introduce combat opportunities frequently — when a player looks for a fight, give them one IMMEDIATELY with a \`combat_start\` action
- Use checks to build tension before fights
- Keep roleplay scenes shorter and more focused
- Make environments interesting tactically (cover, elevation, hazards)
- NEVER ask the player if they want to fight or what enemies to fight — just start the encounter`,
};

const TOOL_USE_INSTRUCTIONS = `

## D&D RULES — TOOLS FIRST

You have tools to look up official D&D 5e rules. You MUST use them.
NEVER rely on your training data for rule mechanics — ALWAYS verify via tools.

**MANDATORY tool use:**
- ANY spell cast or referenced → \`lookup_spell\` (get exact damage, range, save, duration, concentration)
- ANY monster encountered or acting → \`lookup_monster\` (get exact HP, AC, attacks, damage dice, abilities, speed, size)
- ANY condition applied, checked, or affecting a roll → \`lookup_condition\` (get exact mechanical effects)
- ANY rule question (cover, opportunity attacks, two-weapon fighting, etc.) → \`lookup_rule\`
- BEFORE emitting any damage → verify the source's damage dice via tool lookup
- BEFORE determining advantage/disadvantage → verify via \`lookup_condition\` for all active conditions

**When you DON'T need to look it up:**
- If you already looked up the same thing earlier in this combat
- If the data is already provided in [DM Prep] blocks or character sheets
- For homebrew/non-SRD content (use training knowledge)`;

const ENCOUNTER_LENGTH_NOTES: Record<EncounterLength, string> = {
  quick: "\n- Keep encounters SHORT: 2-3 rounds of combat, quick resolutions.",
  standard: "\n- Standard encounter length: 3-5 rounds of combat.",
  epic: "\n- EPIC encounters: multi-phase battles, legendary actions, environmental hazards, 5+ rounds.",
};

function buildJournalContext(journal: CampaignJournal): string {
  const lines: string[] = ["\n## CAMPAIGN JOURNAL"];

  lines.push(`**Story so far:** ${journal.storySummary}`);

  if (journal.activeQuest) {
    lines.push(`**Current quest:** ${journal.activeQuest}`);
  }

  if (journal.completedQuests.length > 0) {
    lines.push(`**Completed:** ${journal.completedQuests.join(", ")}`);
  }

  if (journal.npcs.length > 0) {
    const npcStrs = journal.npcs.map((n) => {
      const loc = n.lastSeen ? `, ${n.lastSeen}` : "";
      return `${n.name} (${n.role}, ${n.disposition}${loc})`;
    });
    lines.push(`**Key NPCs:** ${npcStrs.join("; ")}`);
  }

  if (journal.locations.length > 0) {
    lines.push(`**Visited locations:** ${journal.locations.join(", ")}`);
  }

  if (journal.notableItems.length > 0) {
    lines.push(`**Notable loot:** ${journal.notableItems.join(", ")}`);
  }

  return lines.join("\n");
}

function buildCombatContext(
  combat: CombatState,
  mapSize?: { width: number; height: number },
  characters?: Record<string, CharacterData>
): string {
  const lines: string[] = ["\n## CURRENT COMBAT STATE"];

  const mapInfo = mapSize ? ` | **Map:** ${mapSize.width}×${mapSize.height} grid (x: 0-${mapSize.width - 1}, y: 0-${mapSize.height - 1})` : "";
  lines.push(`**Round:** ${combat.round} | **Phase:** ${combat.phase}${mapInfo}`);

  // Build a map of character name → AC for player combatants
  const playerACMap: Record<string, number> = {};
  if (characters) {
    for (const char of Object.values(characters)) {
      playerACMap[char.static.name.toLowerCase()] = char.static.armorClass;
    }
  }

  const turnLines = combat.turnOrder.map((id, idx) => {
    const c = combat.combatants[id];
    if (!c) return `  ${idx + 1}. (unknown)`;

    const active = idx === combat.turnIndex ? " << ACTIVE TURN" : "";
    const hp =
      c.type === "player"
        ? ""
        : ` [HP: ${c.currentHP ?? "?"}/${c.maxHP ?? "?"}]`;
    const conditions =
      c.conditions && c.conditions.length > 0
        ? ` (${c.conditions.join(", ")})`
        : "";
    const pos = c.position
      ? ` [pos: ${c.position.x},${c.position.y}]`
      : "";

    // AC: from combatant schema (enemy/npc) or character sheet (player)
    const ac = c.type === "player"
      ? playerACMap[c.name.toLowerCase()]
      : c.armorClass;
    const acStr = ac !== undefined ? ` [AC: ${ac}]` : "";

    // Speed + remaining movement
    const remaining = c.speed - (c.movementUsed ?? 0);
    const speedStr = ` [Speed: ${c.speed}ft, ${remaining}ft remaining]`;

    // Size tag for large+ creatures (they occupy multiple tiles)
    const sizeStr = (c.size === "large" || c.size === "huge" || c.size === "gargantuan")
      ? ` [Size: ${c.size}, ${c.size === "large" ? "2×2" : c.size === "huge" ? "3×3" : "4×4"} tiles]`
      : "";

    return `  ${idx + 1}. **${c.name}** (${c.type})${hp}${pos}${sizeStr}${acStr}${speedStr}${conditions}${active}`;
  });

  lines.push("**Turn Order:**");
  lines.push(...turnLines);

  if (combat.pendingCheck) {
    lines.push(
      `\n**Pending Check:** ${combat.pendingCheck.reason} (waiting for ${combat.pendingCheck.targetCharacter})`
    );
  }

  return lines.join("\n");
}

export interface BuildDMPromptOptions {
  characters: Record<string, CharacterData>;
  customPrompt?: string;
  pacingProfile?: PacingProfile;
  encounterLength?: EncounterLength;
  combatState?: CombatState;
  /** Map dimensions for combat context */
  mapSize?: { width: number; height: number };
  journal?: CampaignJournal;
  /** Pre-built DM prep summary (party capabilities, pre-fetched spells) */
  dmPrepSummary?: string;
  /** Whether the current provider supports native tool-use */
  hasToolAccess?: boolean;
}

/**
 * Build a dynamic DM system prompt that includes character data,
 * structured output instructions, pacing profile, combat rules, and combat context.
 */
export function buildDMSystemPrompt(options: BuildDMPromptOptions): string {
  const {
    characters,
    customPrompt,
    pacingProfile = "balanced",
    encounterLength = "standard",
    combatState,
    mapSize,
    journal,
    dmPrepSummary,
    hasToolAccess,
  } = options;

  const entries = Object.entries(characters);

  // 1. Base prompt (or custom override)
  let prompt = customPrompt || DEFAULT_DM_PROMPT;

  // 2. Character rules + character blocks
  if (entries.length > 0) {
    prompt += CHARACTER_RULES;

    const characterBlocks = entries
      .map(([playerName, char]) => buildCharacterContextBlock(playerName, char))
      .join("\n\n");

    const partyLabel = entries.length === 1
      ? "## THE ADVENTURER (Solo — 1 player, no other party members)"
      : `## THE ADVENTURING PARTY (${entries.length} players)`;
    prompt += `\n\n${partyLabel}\n\n${characterBlocks}`;
  }

  // 3. DM Prep summary (party capabilities, pre-fetched spells)
  if (dmPrepSummary) {
    prompt += `\n\n${dmPrepSummary}`;
  }

  // 4. Campaign journal (if exists)
  if (journal) {
    prompt += buildJournalContext(journal);
  }

  // 5. Structured output instructions (always included)
  prompt += STRUCTURED_OUTPUT_INSTRUCTIONS;

  // 6. Tool-use instructions (only for tool-capable providers)
  if (hasToolAccess) {
    prompt += TOOL_USE_INSTRUCTIONS;
  }

  // 7. Pacing
  prompt += PACING_INSTRUCTIONS[pacingProfile];
  prompt += ENCOUNTER_LENGTH_NOTES[encounterLength];

  // 8. Combat rules (always included so AI knows when/how to start combat)
  prompt += COMBAT_RULES;

  // 9. Combat state context (only during active combat)
  if (combatState && combatState.phase === "active") {
    prompt += buildCombatContext(combatState, mapSize, characters);
  }

  return prompt;
}
