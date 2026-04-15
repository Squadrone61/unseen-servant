// === Native Claude Code Skills (model-invocable gameplay and prep skills) ===
// These are written to .claude/skills/<name>/SKILL.md by dm-launcher.
// All skills use `user-invocable: false` — they are invoked by the model during gameplay,
// not triggered directly by the user.

export const NATIVE_SKILL_RECAP = `---
description: "Narrate a story-so-far recap from campaign notes"
user-invocable: false
---

# /recap

Generate an in-character recap of the story so far:

1. **Load campaign context** — call \`load_campaign_context\` to get all campaign notes
2. **Read session notes** — call \`list_campaign_files\` and read any session summaries
3. **Compose the recap** — write a dramatic, in-character narration covering:
   - How the adventure began
   - Key events and turning points
   - Important NPCs met and their relationships
   - Active quests and unresolved threads
   - Where the party currently stands
4. **Deliver it** — send the recap via \`send_response\` as atmospheric DM narration (not a dry summary)
5. **Context check** — if \`totalMessageCount\` is high (50+), consider calling \`compact_history\` afterward to free context space
`;

export const NATIVE_SKILL_NPC_VOICE = `---
description: "Generate an NPC with personality, speech patterns, and secrets"
user-invocable: false
---

# /npc-voice

Create a detailed NPC based on the user's description.

**Name variety is a hard requirement.** Repetitive or archetypal names are a failure — consciously vary syllable count, cadence, and cultural root across every NPC you create this campaign. Do not recycle names or cadences you've already used.

1. **Parse the description** — extract the NPC concept (e.g., "grizzled dwarf blacksmith", "nervous elven scholar")
2. **Generate the NPC profile:**
   - **Name** — a fitting fantasy name (distinct in sound and origin from prior NPCs)
   - **Appearance** — 2-3 distinctive physical traits
   - **Personality** — core trait, flaw, and bond
   - **Speech pattern** — a verbal tic, accent note, or catchphrase that makes them recognizable (e.g., always speaks in questions, uses nautical metaphors, whispers everything)
   - **Motivation** — what they want right now
   - **Secret** — something they're hiding that could become a plot hook
3. **Save to campaign notes** — call \`save_campaign_file\` to create \`world/npcs/{slug}\` with the NPC's details
4. **Introduce them** — send a brief introduction via \`send_response\`, demonstrating their speech pattern in a line of dialogue

Example usage: \`/npc-voice grizzled dwarf blacksmith with a gambling problem\`
`;

export const NATIVE_SKILL_STORY_ARC = `---
description: "Design a multi-session story arc with plot beats, NPCs, and twists (DM-only)"
user-invocable: false
---

# /story-arc

Design a multi-session campaign story arc. This is **DM-only prep** — never reveal the arc to players.

1. **Load context** — call \`load_campaign_context\` to get existing NPCs, quests, locations, party state
2. **Get party info** — call \`get_players\` to see levels, classes, and backstories
3. **Design the arc** based on the user's description:
   - **Theme & tone** — the overarching mood and genre
   - **Hook** — how the arc begins (tie to existing story if possible)
   - **Act structure** (3-act or milestone-based):
     - Key plot beats per session/act
     - Encounters (combat + social + exploration mix) with suggested monsters
     - NPCs to introduce (allies, antagonists, wildcards)
     - Clues and reveals — what players learn and when
   - **Climax** — the big confrontation or decision
   - **Twist** — at least one surprise that recontextualizes earlier events
   - **Consequences** — how the resolution changes the world
4. **Validate monsters** — call \`lookup_monster\` for each suggested encounter creature to verify stats exist
5. **Save the arc** — call \`save_campaign_file\` to write \`dm/story-arc.md\`. This is a **DM planning directory** — never referenced in player-facing responses.
6. **Present to DM** — show the arc summary to the DM operator. **DO NOT call \`send_response\`** — players must never see this.

**Critical:** During play, reference \`dm/story-arc.md\` for pacing and foreshadowing, but NEVER reveal upcoming plot beats, twists, or encounter plans to players. The arc is a guide, not a railroad — adapt when players go off-script.

Example usage: \`/story-arc dark mystery in a cursed coastal town, 4-6 sessions\`
`;

export const NATIVE_SKILL_LOOT_DROP = `---
description: "Generate contextual loot appropriate to the encounter, party, and narrative"
user-invocable: false
---

# /loot-drop

Generate loot appropriate to the encounter and party. ALWAYS prefer items that already exist in the 2024 SRD databases — invent new flavor items only when nothing fits.

1. **Get party info** — call \`get_players\` to see classes and levels (tailor loot to the party)
2. **Search the databases first** — before inventing anything, run \`search_rules\` with a theme/tier keyword. It searches magic items (563 entries), mundane weapons/armor/tools/gear (base items), spells (for scrolls), and more. Pick from real matches when possible.
3. **Generate a loot table** with 3-5 items — a mix of:
   - **Gold** (level-appropriate; DMG treasure tables as reference)
   - **Consumables** — potions (\`lookup_magic_item\`), scrolls (scroll of X — \`lookup_spell\` to confirm the spell), ammunition
   - **Mundane items** — weapons/armor/tools from the base-item DB (visible via \`search_rules\`)
   - **Notable items** — magic items from the DB; 0-1 per encounter
4. **Verify every item** — call \`lookup_magic_item\` for magic items, \`lookup_spell\` for scrolls. For mundane items, cross-check with \`search_rules\` so the name matches what's in the DB.
4. **For each notable item**, provide:
   - **Name** — a fitting, evocative name
   - **Description** — what it looks like
   - **Mechanical effect** — what it does in game terms
   - **Narrative hook** — "Who made this? Why is it here?" — a sentence that ties it to the world
5. **Save notable items** — for each notable item, call \`save_campaign_file\` to create \`world/items/{slug}\` with the item's details
6. **Narrate the loot** — call \`send_response\` to describe the party finding the treasure in-character

Example usage: \`/loot-drop goblin ambush in the forest, party level 3\`
`;

export const NATIVE_SKILL_TAVERN = `---
description: "Generate a tavern or shop with NPCs, rumors, menu, and atmosphere"
user-invocable: false
---

# /tavern

Generate a tavern or shop on the fly.

**Name variety matters.** Location and NPC names should be distinct and inventive — avoid reusing syllables, structures, or archetypes from earlier taverns/NPCs this campaign.

1. **Generate the location:**
   - **Name** — a memorable, thematic name (fresh — not a variant of a previous location's name)
   - **Atmosphere** — 2-3 sensory details (sights, sounds, smells)
   - **Notable feature** — one thing that makes this place unique
2. **Generate 2-3 NPCs** (bartender/shopkeep + patrons/customers):
   - Name, race, one-line personality
   - A speech quirk that makes them instantly recognizable
3. **Generate 1-2 rumors** — one true, one misleading
   - If campaign context exists (check via \`load_campaign_context\`), tie rumors to active quests or world events
4. **Generate a menu** with 3-4 items — flavorful names and descriptions (no mechanical effects needed)
5. **Save to campaign notes:**
   - Call \`save_campaign_file\` to create \`world/locations/{slug}\` with the location's details
   - For each NPC, call \`save_campaign_file\` to create \`world/npcs/{slug}\` with their details
6. **Send the scene** — call \`send_response\` to describe the party entering the establishment, with NPC dialogue demonstrating their speech patterns

Example usage: \`/tavern seedy port tavern\`
`;

export const NATIVE_SKILL_TRAVEL = `---
description: "Overland travel: pace, distance, encounters, weather, time passage"
user-invocable: false
---

# /travel

Process overland travel to a destination:

1. **Determine travel pace** — ask the party or infer:
   - **Fast** (30 miles/day): -5 to passive Perception, no stealth possible
   - **Normal** (24 miles/day): standard travel
   - **Slow** (18 miles/day): able to use stealth, +5 to passive Perception for noticing threats
2. **Calculate time** — distance / daily pace = travel days
3. **Random encounters** — roll for each travel day/segment if appropriate for the region (d20, encounter on 18+, adjust frequency by danger level)
4. **Weather** — describe weather briefly for flavor (sun, rain, fog, snow)
5. **Narrate the journey** — send_response with travel montage: landscapes, weather, camp scenes, arrival
6. **Note the destination** — if it's a new location, save to campaign notes via save_campaign_file

Example usage: \`/travel 3-day journey through the Misty Mountains to Rivendell\`
`;

export const NATIVE_SKILL_TRAP = `---
description: "Design a trap: detection, disarm, trigger, damage, hints"
user-invocable: false
---

# /trap

Design a trap based on the user's description:

1. **Detection** — Perception or Investigation DC to notice the trap (passive or active)
2. **Disarm** — Thieves' Tools, Arcana, or other skill DC to disarm
3. **Trigger** — what sets it off (pressure plate, tripwire, proximity, opening a container)
4. **Effect** — damage dice and type, or condition (poison, restrained, etc.), save DC
5. **Hints** — subtle clues for observant players (scuff marks, faint clicking, discolored stone)
6. **Place it** — note the trap location and status in your DM planning. Save to \`dm/\` notes via \`save_campaign_file\` if it's part of a planned dungeon.
7. **During play** — when players encounter the trap, describe ONLY observable clues via \`send_response\`. Call for Perception/Investigation checks with \`roll_dice\`. If triggered, roll damage/saves and apply with \`apply_damage\`/\`add_condition\`.

Do NOT reveal trap details to players — only describe what they can observe.
Present the trap design to the DM operator only.

Example usage: \`/trap poison dart trap in a tomb corridor, party level 5\`
`;

export const NATIVE_SKILL_PUZZLE = `---
description: "Design a puzzle: description, hints, solution, resolution"
user-invocable: false
---

# /puzzle

Design a puzzle for the party:

1. **Description** — what the players see (inscriptions, mechanisms, magical effects, physical layout)
2. **Hint system** (3 tiers):
   - **Subtle**: environmental clue players might notice on their own
   - **Moderate**: available with a successful Investigation/Arcana check (DC 12-15)
   - **Direct**: given if the party is stuck for too long — nearly gives the answer
3. **Solution** — the correct sequence, answer, or action
4. **Mechanical resolution** — what checks help (Investigation, Arcana, History, Perception), DCs, and what info each reveals
5. **Reward** — what solving the puzzle grants (passage, treasure, lore, shortcut)
6. **During play** — describe the initial scene via \`send_response\`. As players attempt solutions, call for relevant checks with \`roll_dice\`, reveal hints based on the tier system, and narrate outcomes. When solved, deliver rewards narratively and mechanically (\`add_item\`, etc.).

Present the puzzle design to the DM operator. When players encounter it in play, describe only what they observe and respond to their attempts.

Example usage: \`/puzzle ancient dwarven door with rune-based lock, party level 7\`
`;

export const NATIVE_SKILL_BATTLE_TACTICS = `---
description: "Monster AI advisor: suggest optimal tactics for the current enemy turn"
user-invocable: false
---

# /battle-tactics

Advise the DM on monster tactics during combat:

1. **Get combat state** — call \`get_combat_summary\` to get turn order, HP, conditions, distances, and active AoE
   - If not in combat, tell the DM this skill only works during active combat
2. **Analyze the battlefield:**
   - Current enemy's abilities, attacks, and movement (from monster stats)
   - Party positions on the battle map
   - HP states of all combatants (who's wounded, who's fresh)
   - Active conditions (who's stunned, concentrating, prone, etc.)
   - Terrain features (cover, difficult terrain, chokepoints)
3. **Suggest 2-3 tactical options** ranked by effectiveness:
   - Which target to attack and why
   - Which ability or attack to use
   - Where to move (and why that position is advantageous)
   - Include the reasoning (e.g., "The wizard has low HP and no allies adjacent — the goblin should dash to flank")
4. **Consider monster intelligence:**
   - Int 1-5: animalistic, attacks nearest target or most threatening
   - Int 6-9: basic tactics, focuses wounded targets, avoids obvious danger
   - Int 10+: smart tactics, targets casters, uses terrain, coordinates with allies
5. **Present to DM only** — output the tactical advice as regular text (it goes to the DM's terminal, not to players). **DO NOT call \`send_response\`**. After the DM decides, execute the chosen actions using combat tools (move_combatant, roll_dice, apply_damage, etc.) and THEN narrate the result via \`send_response\`.
6. **Use \`action_ref\` for structured monster attacks.** Pass \`action_ref: { source: "monster", name: "<Monster Name>", monster_action_name: "<Action Name>" }\` to \`apply_damage\` / \`apply_area_effect\` / \`roll_dice\` (save DC). ~59% of monster actions have structured data — when the DB has them, you save a parsing pass. For prose-only entries, fall back to explicit args.
`;

export const NATIVE_SKILL_COMBAT_PREP = `---
description: "Mandatory combat setup: monster lookup, encounter difficulty check, battle map creation, combatant positioning. Invoke BEFORE calling start_combat."
user-invocable: false
---

## Combat Setup

### Combat Setup Checklist (MANDATORY)
When initiating combat, follow these steps IN ORDER. Do NOT skip any step. Do NOT start combat without a battle map.

1. Call \`lookup_monster\` for EVERY enemy type to get accurate stats
2. Call \`calculate_encounter_difficulty\` to validate the encounter is appropriately challenging for the party
   - Use \`get_character\` for party members if you need to check current HP, spell slots, or abilities to tune the encounter
3. Call \`update_battle_map\` to create the terrain grid with rich tiles — use objects, cover, and elevation to make the battlefield tactical and interesting
4. Call \`start_combat\` with ALL combatants, including position in A1 notation (e.g., "E5") for each so tokens appear on the map
5. ONLY THEN narrate the combat beginning

NEVER skip any step. NEVER start combat without a battle map.

### Surprise & Player-Initiated Combat
When a player initiates a fight (ambush, surprise attack, "I attack the guard"):
1. **Let the initiating player resolve their opening action FIRST** — describe their attack, roll damage, apply effects
2. **Then** follow the Combat Setup Checklist above to start formal initiative
3. The initiating player's opening action counts as their first turn — they act normally in initiative order from Round 2 onward
4. For ambushes where the whole party has surprise, give every party member a chance to act before rolling initiative
5. Enemies who are surprised skip their first turn in initiative order (they can't act in Round 1)

### Battle Map Design
- **Tile types**: \`floor\`, \`wall\`, \`water\`, \`difficult_terrain\`, \`door\`, \`pit\`, \`stairs\`
- **Objects on tiles**: Add objects with \`{ name, category, description }\` — categories: furniture, container, hazard, interactable, weapon
  - Tavern brawl: tables (furniture, half cover), barrels (container), chairs (furniture)
  - Cave: stalagmites (furniture, half cover), pit traps (hazard)
  - Forest: fallen logs (furniture, half cover), thick trees (interactable, three-quarters cover)
- **Cover**: Set \`cover: "half" | "three-quarters" | "full"\` on tiles — players see visual indicators. The system reminds you of cover bonuses when targeting creatures on those tiles.
- **Elevation**: Set \`elevation\` in feet on tiles (10 = raised ledge, -5 = sunken pit). Players see height labels.
- **Interactables**: Objects players can interact with (flip a table for cover, drop a chandelier, bar a door). Describe possibilities in the object's description.
- Typical map size: 15x20 tiles. Use smaller (10x10) for tight spaces, larger for open battlefields.
- Place players and enemies with realistic starting distance (usually 30-60 feet apart)

### Coordinates
- All positions use A1 notation (column letter + row number): A1 is top-left, B3 is column B row 3
- Players see these coordinates on the map when hovering tiles
`;

export const NATIVE_SKILL_COMBAT = `---
description: "Turn-by-turn combat execution: attack resolution, movement validation, death saves, AoE, flanking, cover, opportunity attacks. Invoke during active combat."
user-invocable: false
---

## Combat (Active)

### Tactical Tools
- Use \`get_combat_summary\` instead of \`get_game_state\` during combat — it's optimized for tactical decisions.
- Use \`get_map_info\` to check terrain, objects, cover, and elevation in an area (e.g., area: "C3:F6") — useful for answering player questions about the battlefield.
- Use \`apply_batch_effects\` to apply multiple effects (damage, heal, conditions, movement) in one call — efficient for multi-target resolution. Max 10 effects.
- SRD lookups default to summary mode (~30 tokens). Use \`detail: "full"\` only for rules disputes or complex interactions.

### Effect System
See the **rules** skill for damage type handling, feature activation, concentration mechanics, and advantage/disadvantage hints.

### Position & Range Validation (STRICT)
- Before allowing any melee attack, CHECK positions using \`get_combat_summary\` — it shows distances between combatants.
- Melee range = 5ft = 1 adjacent tile (including diagonals). Reach weapons = 10ft = 2 tiles.
- If the attacker is NOT adjacent to the target, they must MOVE first (costs movement) or use a ranged attack.
- NEVER assume creatures are adjacent — always verify grid positions.
- Call \`move_combatant\` to update position BEFORE resolving a melee attack if the creature moved.

### Turn Management (STRICT)
- **NEVER call \`advance_turn\` for player characters.** Players click End Turn themselves.
- **NEVER narrate the next combatant's actions** until advance_turn is called (NPCs) or the player ends their turn (PCs).
- **NEVER request damage rolls or actions from a player AFTER their turn ended.** If damage was missed, resolve narratively or skip.
- After resolving a player's declared actions, STOP and WAIT. Do not preview what comes next.
- When a player moves their token (you'll see a System movement message), **acknowledge** silently unless the move triggers something (trap, opportunity attack, entering a new area). Don't narrate every 5-foot step.
- **DO call \`advance_turn\` for NPCs/enemies** after resolving all their actions.
- When a player's turn begins, announce: "{pc:CharacterName}, it's your turn. What do you do?"

### Combat Lifecycle Tools
- Call \`end_combat\` when combat ends (all enemies defeated, flee, retreat). Clears combat state, returns to exploration.
- Call \`add_combatant\` to add reinforcements, summoned creatures, or late arrivals mid-combat. Initiative is rolled automatically.
- Call \`remove_combatant\` when a creature dies, flees, or is dismissed. Removes from turn order.
- Use \`set_initiative\` to override initiative (readied actions, DM adjustments).
- Use \`set_active_turn\` to jump to a specific combatant's turn (DM override — skips condition expiry for skipped turns).

### Attack Resolution
- For monster attacks: roll attack with \`roll_dice({ checkType: "attack", notation: "1d20+X", reason: "Monster attack" })\` — if it hits, apply damage via \`apply_damage({ target, action_ref: { source: "monster", name, monster_action_name }, outcome_branch: "onHit" })\` for structured entries, or explicit \`damage\`/\`damage_type\` for prose-only monsters.
- For player attacks: the player describes the attack, you determine if it hits using the attack roll, then have the player roll damage with \`roll_dice({ player: "CharName", checkType: "damage", notation: "..." })\`
- **Players ALWAYS roll their own damage.** When a player's attack/spell hits, use roll_dice with player + checkType="damage" so the player sees "Roll Damage". NEVER roll damage on behalf of a player.
- **Always pass DC and checkType for attack rolls.** Use roll_dice with player, checkType="melee_attack"/"ranged_attack"/"spell_attack"/"finesse_attack", dc=TARGET_AC. "melee_attack" uses STR + prof. "ranged_attack" uses DEX + prof. "spell_attack" uses spell attack bonus. "finesse_attack" uses max(STR,DEX) + prof. Combat bonuses like Archery +2 are applied automatically.
- Describe attacks cinematically, not just mechanically
- Give enemies tactical behavior appropriate to their intelligence
- Make combat dynamic — use the environment, have enemies adapt
- Call out when players are low on HP or resources as appropriate
- **NEVER reveal exact enemy HP to players.** Describe enemy health narratively: "barely scratched", "looking roughed up", "badly wounded", "on its last legs", "bloodied" (≤50%). Exact HP numbers are for your internal tracking only.

### Critical Hits
- Natural 20 = critical hit. DOUBLE all damage dice, then add modifiers (modifiers NOT doubled).
- Example: longsword crit = 2d8 + Str mod (not 1d8 + Str).
- Announce crits dramatically!

### Flanking
- Requires two allies on OPPOSITE sides of an enemy (north/south, east/west, or diagonal opposites).
- L-shaped positioning (north + east) is NOT flanking.
- Flanking grants advantage on melee attack rolls against the flanked creature.
- Verify positions on the grid before granting flanking.

### Concentration Checks
- When a concentrating creature takes damage, it must make a Constitution saving throw (DC = 10 or half the damage taken, whichever is higher)
- If the check fails, call \`break_concentration\` to end the spell, then narrate the effect fading

### Opportunity Attacks
- When a creature moves out of an enemy's reach without Disengaging, that enemy can use a reaction to make one melee attack
- Remind players about this when relevant — both for and against them

### Death Saves
- At 0 HP, a creature makes death saving throws at the start of each turn (DC 10 Constitution save)
- After rolling, call \`death_save\` to record the result — pass \`critical_fail: true\` for nat 1 (2 failures), \`critical_success: true\` for nat 20 (regain 1 HP, reset saves)
- The tool auto-stabilizes at 3 successes or marks dead at 3 failures — announce the count
- Any damage while at 0 HP = one death save failure (critical hit = two failures)

### Cover
- **Half cover** (+2 AC, +2 Dex saves): behind a low wall, another creature, or similar obstacle
- **Three-quarters cover** (+5 AC, +5 Dex saves): behind a portcullis, arrow slit, or thick tree trunk
- The system automatically notes cover when you target creatures on tiles with cover set

### Area of Effect Spells
- **Targeting flow**: (1) player declares spell, (2) call \`show_aoe\` with \`action_ref: { source: "spell", name }\` to visualize (shape/size auto-filled from DB), (3) if friendlies are in the blast, ask "Are you sure?", (4) player confirms or adjusts, (5) call \`apply_area_effect\` with the same \`action_ref\` plus \`caster_spell_save_dc\` — save ability/DC/damage/onSuccess all resolved from DB \`ActionEffect\`.
- Set \`persistent: true\` for ongoing spells (Wall of Fire, Spirit Guardians, Fog Cloud). Call \`dismiss_aoe\` when they end.
- AoE colors should match the spell narratively (fire = "#FF6B35", ice = "#4FC3F7", necrotic = "#9C27B0").
- \`action_ref\` supports \`upcast_level\` (levels above base) for auto-scaling damage dice. Prefer it over hand-editing dice.

### Stealth & Surprise
- When a group wants to be stealthy, each member makes a Stealth check against the targets' Passive Perception.
- If ALL sneaking creatures beat the target's Passive Perception, the targets are **surprised**.
- Surprised creatures **cannot act on their first turn** of combat and **cannot use reactions** until that turn ends.
- Assassin's Assassinate feature: auto-crit on surprised targets that haven't acted yet.
- Stealth ends when a creature attacks, casts a spell, or is detected.

### Difficulty Scaling
- **Too easy** (no PCs taking damage, enemies dropping in 1-2 hits): add reinforcements, smarter tactics, environmental hazards
- **Too deadly** (multiple PCs at 0 HP, all resources burned in round 1): enemies flee when bloodied, NPC ally arrives, environmental escape route, spread damage across targets
- **Never silently change monster HP/AC mid-fight** — use narrative justifications for any adjustments
`;

export const NATIVE_SKILL_NARRATION = `---
description: "Narrative style: vivid descriptions, improv framework, pacing, scene transitions, entity highlighting tags. Invoke when crafting narrative responses."
user-invocable: false
---

## Narrative Style

### Description
- Write vivid, immersive descriptions that engage the senses
- Keep responses focused — 2-4 paragraphs for most turns, longer for major scenes
- Give NPCs distinct personalities and speech patterns — give each NPC a verbal tic, catchphrase, or speech pattern to make them instantly recognizable
- Balance description, dialogue, and mechanical resolution

### Improv Framework
- **"Yes, and..."** — accept player ideas and build on them. If a player tries something creative, reward it.
- **"Yes, but..."** — accept with a complication. The action succeeds, but introduces a new challenge or cost.
- Never flatly deny creative player actions. Find a way to make it work (possibly with a check or consequence).

### Pacing
- Read the room — if players want action, deliver it; if they want roleplay, lean into it
- Present clear choices but don't railroad — let players surprise you
- End scenes with hooks that invite player action
- Escalate tension gradually; not every encounter needs to be combat

### Scene Transitions
- Use brief narration to bridge time gaps ("The road stretches on for two days..." or "As dawn breaks over the city...")
- Ask players what they do during downtime — don't skip it silently
- When transitioning between scenes, ground players with a sensory detail from the new location

### Exploration
- When players explore, describe the environment with enough detail to spark curiosity
- Reward investigation and creative problem-solving
- Use all five senses in descriptions — not just sight
- Foreshadow upcoming encounters or story beats through environmental details

### Entity Highlighting (MANDATORY)
You MUST wrap ALL named entity mentions in tags for UI color-coding. Tag EVERY mention, not just the first.

**Tag types:**
- Places: {place:Waterdeep}, {place:The Yawning Portal}
- NPCs/gods: {npc:Barthen}, {npc:Tiamat}
- Player characters: {pc:Zara Stormweave}, {pc:Thorin}
- Items (specific named): {item:Flame Tongue}, {item:Potion of Healing}
- Factions: {faction:Zhentarim}, {faction:Harpers}

**Correct:** "{npc:Barthen} gestures to {place:The Yawning Portal}. 'You'll find the {faction:Zhentarim} there,' {npc:Barthen} whispers."
**Wrong:** "{npc:Barthen} gestures to {place:The Yawning Portal}. 'You'll find the Zhentarim there,' Barthen whispers."

Only tag proper names — not generic references like "the city" or "a sword".
`;

export const NATIVE_SKILL_SOCIAL = `---
description: "NPC disposition framework and social encounter mechanics: hostile/indifferent/friendly attitudes, social checks, persuasion. Invoke during NPC interactions."
user-invocable: false
---

## Social Encounters

### NPC Disposition Framework
- **Hostile**: Actively working against the party. Social checks DC 20+. Might require multiple successes or leverage.
- **Indifferent**: No particular opinion. Social checks DC 10-15. Default for strangers.
- **Friendly**: Disposed to help. Social checks DC 5-10. May help without a check if the request is reasonable.

### When to Call Social Checks
- **Persuasion**: Convince with logic, charm, or good faith
- **Deception**: Mislead, lie, or create false impressions
- **Intimidation**: Threaten or coerce — may shift disposition negatively even on success
- **Insight**: Read motives, detect lies, gauge emotional state (contested vs Deception)

### Social Check Principles
- A single check rarely flips a hostile NPC to friendly — disposition shifts one step per meaningful interaction
- Failed social checks have consequences: suspicion, offense, raised prices, calling guards — never just "nothing happens"
- Let players roleplay before calling for a check — good arguments lower the DC, poor ones raise it
- NPCs can lie, have hidden agendas, and change their minds — they're not vending machines
`;

export const NATIVE_SKILL_RULES = `---
description: "D&D 2024 rules enforcement: mandatory spell/monster/condition lookups, dice rolling protocol, advantage/disadvantage, rests, milestone leveling."
user-invocable: false
---

## D&D 2024 Rules Enforcement (SRD 5.2)

All rules lookups use the **2024 D&D rules (SRD 5.2)**, not the 2014 edition.

### Lookup Before Resolve (MANDATORY)
- BEFORE resolving any spell: call \`lookup_spell\` to get exact 2024 effects, range, duration, components
- BEFORE any enemy acts: call \`lookup_monster\` to get accurate 2024 stats (if not already looked up this combat)
- BEFORE applying any condition: call \`lookup_condition\` to get exact 2024 mechanical effects
- For magic items: call \`lookup_magic_item\` to get rarity, attunement, and effects
- For feats: call \`lookup_feat\` to get prerequisites and effects
- For game actions (Attack, Dash, Dodge, Grapple, Shove): call \`lookup_action\` for exact 2024 rules
- For optional class features (Invocations, Maneuvers, Metamagic): call \`lookup_optional_feature\`
- For species traits: call \`lookup_species\`; for backgrounds: call \`lookup_background\`
- For languages: call \`lookup_language\`; for diseases: call \`lookup_disease\`
- For general rules questions (combat mechanics, class features, gameplay): call \`search_rules\` with a keyword query
NEVER guess spell effects, monster stats, or condition rules. ALWAYS look them up.
- If a lookup returns "not found", the entry is not in the SRD — tell players you're using general knowledge and the activity log will show a notice

### Dice Rolling
- ALL rolls go through \`roll_dice\` so players see them in chat — never narrate a roll without actually rolling
- **NEVER type "roll a d20" / "roll initiative" / "roll a death save" / "roll X" in prose.** Every player-side roll MUST be an interactive \`roll_dice\` call with \`player\` set — the player sees a Roll button. Prose roll requests are broken — the player can't respond to them and the system can't capture the result
- \`checkType\` auto-computes modifiers from the character sheet. Valid values:
  - **Skills:** perception, stealth, athletics, acrobatics, arcana, deception, history, insight, intimidation, investigation, medicine, nature, performance, persuasion, religion, sleight_of_hand, animal_handling, survival
  - **Abilities:** strength, dexterity, constitution, intelligence, wisdom, charisma
  - **Saves:** strength_save, dexterity_save, constitution_save, intelligence_save, wisdom_save, charisma_save
  - **Attacks:** melee_attack (STR + prof), ranged_attack (DEX + prof), spell_attack (spell bonus), finesse_attack (max(STR,DEX) + prof)
  - **Other:** damage, custom (modifier not auto-computed — include in notation)
- For monster/NPC rolls, omit \`player\` — the DM rolls server-side
- For player rolls, include \`player\` (character name) so the player rolls interactively on their client

### Key Rules Reminders
- **Advantage/disadvantage** never stack — multiple sources of advantage still = one extra d20. Advantage and disadvantage cancel each other out regardless of how many sources of each.
- **Concentration** — a caster can only concentrate on one spell at a time. Casting a new concentration spell ends the previous one.
- **Short rest healing uses Hit Dice (class-specific), NOT d20.** d6 (Sorcerer/Wizard), d8 (Bard/Cleric/Druid/Monk/Rogue/Warlock), d10 (Fighter/Paladin/Ranger), d12 (Barbarian). Each die + Con modifier.

### Mechanical Tracking (STRICT)
- ALWAYS use tools to modify HP, spell slots, conditions, inventory, and currency — don't just narrate changes.
- Use \`use_spell_slot\` every time a player casts a leveled spell.
- Use \`add_item\` immediately when a character receives, finds, or buys an item — don't wait for the player to ask.
- Use \`update_item\` when an item's properties change (awakened, attuned, damaged, etc.).
- Use \`remove_item\` when an item is given away, consumed, or destroyed.
- Use \`add_condition\` to apply conditions (poisoned, stunned, prone, etc.) — creates an effect bundle with mechanical effects. Use \`remove_condition\` to clear them.
- Use \`set_hp\` to set a character's HP to an exact value (e.g., after a complex effect that isn't simple damage or healing).
- Use \`set_temp_hp\` when a spell or ability grants temporary HP (Heroism, Dark One's Blessing). Temp HP doesn't stack — takes the higher value.
- Use \`update_currency\` when players earn, spend, or trade gold. Positive adds, negative subtracts. Auto-converts from higher denominations when spending.
- Use \`restore_spell_slot\` when a slot is recovered outside of a rest (Arcane Recovery, Font of Magic).
- Use \`restore_class_resource\` when a resource is restored outside of a rest. Use amount=999 to fully restore.
- Use \`grant_inspiration\` for exceptional roleplay or creative problem-solving. Use \`use_inspiration\` when a player spends it for advantage on a d20 roll.
- Use \`get_character\` to check a specific character's full data (stats, HP, spell slots, conditions, inventory) when you need details beyond \`get_players\`.
- Call for ability checks when outcomes are uncertain (describe the DC reasoning).

### Effect System
- **Prefer \`action_ref\` over explicit dice.** When a spell/weapon/monster action has structured DB data, pass \`action_ref: { source: "spell"|"weapon"|"item"|"monster", name, monster_action_name? }\` to \`apply_damage\`, \`apply_area_effect\`, \`show_aoe\`, and \`roll_dice\` (for \`*_save\` checks). The tool pulls damage dice, damage type, save ability, save DC, area shape/size, and onSuccess semantics from the DB. Explicit args still work as a fallback for prose-only monster entries.
- **Outcome branches.** \`apply_damage\` with \`action_ref\` takes \`outcome_branch\`: \`"onHit"\` for attack-roll hits, \`"onFailedSave"\` for save-based on fails, \`"onSuccessfulSave"\` when the spell deals half on success. \`apply_area_effect\` handles branch selection internally per target.
- **Damage types matter.** Always include \`damage_type\` when calling \`apply_damage\` without \`action_ref\` — resistance, immunity, and vulnerability are applied automatically from active effects. Don't manually halve or double damage.
- **Feature activation.** When a class feature with mechanical effects is used (Rage, Bladesong, Wild Shape), call \`activate_feature\` to apply its bonuses. Pair with \`use_class_resource\` if it costs a resource. Call \`deactivate_feature\` when it ends.
- **Concentration vs features.** \`set_concentration\` is for concentration spells (broken by damage/new spell). \`activate_feature\` is for class features (manual deactivation).
- **Advantage/disadvantage hints.** When \`roll_dice\` is called with \`checkType\` + \`player\`, it checks active effects and returns hints (e.g., "Advantage on STR checks from Rage"). Use these to decide advantage/disadvantage.
- **Exhaustion.** Use \`set_exhaustion\` when exhaustion is imposed (forced march, certain abilities). PHB 2024: -2 to all d20 rolls per level, level 10 = death.

### Milestone Leveling
- Award milestone level-ups at story-appropriate moments (major quest completion, boss defeat, new chapter)
- Announce dramatically, then remind players to update their character sheet to apply the new level.
- Use \`lookup_class\` to summarize what each character gains at the next level.

### Rests
- **Short rest**: Call \`short_rest\` with resting characters — restores short-rest class resources and Warlock pact slots. Then ask players if they want to spend Hit Dice for healing — roll interactively with \`roll_dice({ player: "CharName", checkType: "custom", notation: "XdY+Z", reason: "Hit Dice healing" })\` where XdY is the character's Hit Die (d6 Sorcerer/Wizard, d8 Bard/Cleric/Druid/Monk/Rogue/Warlock, d10 Fighter/Paladin/Ranger, d12 Barbarian) and Z is their Con modifier — use \`get_character\` to check if unsure. Apply with \`heal\`. Narrate the break.
- **Long rest**: Optionally check for random encounters first. Call \`long_rest\` with all characters — restores full HP, all spell slots, all class resources, clears conditions, resets death saves. Narrate night passage and dawn.
`;

export const NATIVE_SKILL_CAMPAIGN = `---
description: "Campaign notetaking: record NPCs, locations, quests, factions, items as they appear. Session lifecycle with load_campaign_context and end_session."
user-invocable: false
---

## Campaign Notes — Active Notetaking

**Take notes as you play, not just at session end.** Use \`save_campaign_file\` to jot down important details the moment they happen. Keep notes brief — a line or two per entry is enough.

### What to note (and when)
- **world/npcs/{slug}.md** — One file per NPC. When the party meets a named NPC, create their file: name, role, attitude, location, relationship to party.
- **world/locations/{slug}.md** — One file per location. When a new place is visited or described, create its file: name, what's notable, connections to story.
- **world/quests/{slug}.md** — One file per quest. When a quest is given, updated, or completed, create/update its file: name, status, key details.
- **world/factions/{slug}.md** — One file per faction. When an organization becomes relevant, create its file: name, relationship to party.
- **world/items/{slug}.md** — One file per notable item. When a notable item is found or given, create its file: name, who has it, what it does, history.

### How to note
Call \`save_campaign_file\` immediately after introducing an NPC, revealing a location, or giving out a notable item — don't wait. Use \`list_campaign_files\` to check if the entity's file already exists before creating it. Since each entity has its own file, there's no need to read-then-append — just write the new file. Keep each file brief: name, role/description, status, relationship to party.

### DM Planning Notes
- **dm/story-arc.md** — Your private story arc. Reference it for pacing and foreshadowing. NEVER reveal upcoming plot beats, twists, or encounter plans to players. Adapt the arc when players go off-script.
- Read \`dm/story-arc.md\` via \`read_campaign_file\` at session start (after \`load_campaign_context\`) to refresh your narrative direction.

### Session lifecycle
- **Session start:** Call \`load_campaign_context\` to refresh your memory.
- **During play:** Note NPCs, locations, quests, factions, items as they come up.
- **Session end:** Call \`end_session\` with a summary and updated active context.

### Campaign Lifecycle
- **New campaign:** Call \`create_campaign\` with a name to set up the folder structure before \`load_campaign_context\`.
- **Resuming:** Call \`list_campaigns\` to see all campaigns with session counts and last-played dates, then load the chosen one with \`load_campaign_context\`.
`;
