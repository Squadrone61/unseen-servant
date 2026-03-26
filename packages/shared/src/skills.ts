// === Native Claude Code Skills (user-invocable slash commands) ===
// These are written to .claude/skills/<name>/SKILL.md by dm-launcher.
// All skills use `disable-model-invocation: true` — they are operator-triggered
// creative/prep workflows, not autonomous gameplay behaviors.

export const NATIVE_SKILL_RECAP = `---
description: "Narrate a story-so-far recap from campaign notes"
disable-model-invocation: true
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
disable-model-invocation: true
---

# /npc-voice

Create a detailed NPC based on the user's description:

1. **Parse the description** — extract the NPC concept (e.g., "grizzled dwarf blacksmith", "nervous elven scholar")
2. **Generate the NPC profile:**
   - **Name** — a fitting fantasy name
   - **Appearance** — 2-3 distinctive physical traits
   - **Personality** — core trait, flaw, and bond
   - **Speech pattern** — a verbal tic, accent note, or catchphrase that makes them recognizable (e.g., always speaks in questions, uses nautical metaphors, whispers everything)
   - **Motivation** — what they want right now
   - **Secret** — something they're hiding that could become a plot hook
3. **Save to campaign notes** — call \`read_campaign_file\` for "world/npcs", then \`save_campaign_file\` to append the new NPC
4. **Introduce them** — send a brief introduction via \`send_response\`, demonstrating their speech pattern in a line of dialogue

Example usage: \`/npc-voice grizzled dwarf blacksmith with a gambling problem\`
`;

export const NATIVE_SKILL_STORY_ARC = `---
description: "Design a multi-session story arc with plot beats, NPCs, and twists (DM-only)"
disable-model-invocation: true
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
disable-model-invocation: true
---

# /loot-drop

Generate loot appropriate to the encounter and party:

1. **Get party info** — call \`get_players\` to see classes and levels (tailor loot to the party)
2. **Generate a loot table** with 3-5 items: a mix of gold, consumables, and 0-1 notable items
   - Gold amount should be level-appropriate (DMG treasure tables as reference)
   - Consumables: potions, scrolls, ammunition
   - Notable items: magic items, quest-relevant objects, flavorful mundane items
3. **Verify magic items** — for any magic item in the loot, call \`lookup_magic_item\` to confirm it exists in the SRD and get accurate rarity/attunement/effects
4. **For each notable item**, provide:
   - **Name** — a fitting, evocative name
   - **Description** — what it looks like
   - **Mechanical effect** — what it does in game terms
   - **Narrative hook** — "Who made this? Why is it here?" — a sentence that ties it to the world
5. **Save notable items** — call \`read_campaign_file\` for "world/items.md", then \`save_campaign_file\` to append new items
6. **Narrate the loot** — call \`send_response\` to describe the party finding the treasure in-character

Example usage: \`/loot-drop goblin ambush in the forest, party level 3\`
`;

export const NATIVE_SKILL_TAVERN = `---
description: "Generate a tavern or shop with NPCs, rumors, menu, and atmosphere"
disable-model-invocation: true
---

# /tavern

Generate a tavern or shop on the fly:

1. **Generate the location:**
   - **Name** — a memorable, thematic name
   - **Atmosphere** — 2-3 sensory details (sights, sounds, smells)
   - **Notable feature** — one thing that makes this place unique
2. **Generate 2-3 NPCs** (bartender/shopkeep + patrons/customers):
   - Name, race, one-line personality
   - A speech quirk that makes them instantly recognizable
3. **Generate 1-2 rumors** — one true, one misleading
   - If campaign context exists (check via \`load_campaign_context\`), tie rumors to active quests or world events
4. **Generate a menu** with 3-4 items — flavorful names and descriptions (no mechanical effects needed)
5. **Save to campaign notes:**
   - Call \`read_campaign_file\` for "world/locations.md", then \`save_campaign_file\` to append the new location
   - Call \`read_campaign_file\` for "world/npcs.md", then \`save_campaign_file\` to append the new NPCs
6. **Send the scene** — call \`send_response\` to describe the party entering the establishment, with NPC dialogue demonstrating their speech patterns

Example usage: \`/tavern seedy port tavern\`
`;

export const NATIVE_SKILL_TRAVEL = `---
description: "Overland travel: pace, distance, encounters, weather, time passage"
disable-model-invocation: true
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
disable-model-invocation: true
---

# /trap

Design a trap based on the user's description:

1. **Detection** — Perception or Investigation DC to notice the trap (passive or active)
2. **Disarm** — Thieves' Tools, Arcana, or other skill DC to disarm
3. **Trigger** — what sets it off (pressure plate, tripwire, proximity, opening a container)
4. **Effect** — damage dice and type, or condition (poison, restrained, etc.), save DC
5. **Hints** — subtle clues for observant players (scuff marks, faint clicking, discolored stone)
6. **Place it** — note the trap location and status in your DM planning

Do NOT reveal trap details to players via send_response — only describe what they can observe.
Present the trap design to the DM operator only.

Example usage: \`/trap poison dart trap in a tomb corridor, party level 5\`
`;

export const NATIVE_SKILL_PUZZLE = `---
description: "Design a puzzle: description, hints, solution, resolution"
disable-model-invocation: true
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

Present the puzzle design to the DM operator. When players encounter it in play, describe only what they observe and respond to their attempts.

Example usage: \`/puzzle ancient dwarven door with rune-based lock, party level 7\`
`;

export const NATIVE_SKILL_BATTLE_TACTICS = `---
description: "Monster AI advisor: suggest optimal tactics for the current enemy turn"
disable-model-invocation: true
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
5. **Present to DM only** — this is advice for the DM operator. **DO NOT call \`send_response\`** — players must not see monster tactical analysis. The DM decides what actions to take.
`;
