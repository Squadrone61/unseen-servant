# Skills Routing — Full Map

The card has the terse dispatch table. This file is the complete routing reference, including session lifecycle hooks and the specialists' write-side responsibilities. Refer here when you need to know **which specialist owns the file write** for a given trigger.

## Session Lifecycle

- **On session start**: call `load_campaign_context` (default scope `"compact"` — small, fast). If resuming a campaign with prior sessions, dispatch `/recap` for the story-so-far narrative.
- **During play — after introducing a new named NPC, location, or quest**: dispatch to the matching specialist (below) so the file gets saved. No manual "remember to save later."
- **On session end** (player says "end session" or similar): call `end_session` with a summary and updated active-context.

## Combat

| Trigger                                 | Dispatch                                                                                                                                                                    | Specialist does                                                                                                             |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Combat about to start                   | `/combat-prep`                                                                                                                                                              | Fork → encounter-designer: verifies every monster via lookup_rule, validates difficulty, stages map, returns ENCOUNTER PLAN |
| NPC/enemy turn in active combat         | `/combat-turn <name>`                                                                                                                                                       | Fork → combat-resolver: looks up stats + abilities, pre-rolls, returns TURN PLAN                                            |
| Want tactical options without executing | `/battle-tactics <name>`                                                                                                                                                    | Fork → combat-resolver (advice mode): returns 2-3 ranked tactics, no MUTATIONS                                              |
| Player turn (PC acting)                 | **Stay in conductor.** Read `combat` skill for player-turn procedure. Use `roll_dice` with player+checkType, `apply_damage`, `add_condition`, `advance_turn` etc. directly. |

**You never narrate an enemy action without `/combat-turn` first** (see `lookup-before-narrate.md`).

## Rules & Spell Interactions

| Trigger                                                                        | Dispatch                                                                                                                  |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| Ambiguous rule, timing, spell interaction, or player invokes an unusual ruling | `/ruling <question>` → fork to rules-advisor (cites sources, halts on unknown, logs to `agents/rules-advisor/rulings.md`) |

For **simple, single-spell lookups** (player about to cast a known spell), a direct `lookup_rule` is fine — no fork needed.

## NPCs & Social

| Trigger                                        | Dispatch                                                                                                                          |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Introducing a NEW named NPC for the first time | `/npc-voice <description>` → fork to npc-voice (checks existing roster, designs distinct voice, saves to `world/npcs/`)           |
| Ongoing NPC dialogue                           | **Stay in conductor.** Read the NPC's file via `read_campaign_file` if you need their voice. Meta-guidance in the `social` skill. |

## Scene Generation

| Trigger                                | Dispatch                                                                                                  |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Party enters a new tavern / inn / shop | `/tavern <context>` → fork to scene-builder (saves to `world/locations/`)                                 |
| Party begins overland travel           | `/travel <from to>` → fork to scene-builder (saves to `world/locations/`)                                 |
| You want to place a trap               | `/trap <context>` → fork to scene-builder (saves to `dm/traps/`, DM-only)                                 |
| You want to place a puzzle             | `/puzzle <context>` → fork to scene-builder (saves to `dm/puzzles/`, DM-only)                             |
| Loot needed                            | `/loot-drop <context>` → fork to scene-builder (verifies every magic item in DB, saves to `world/items/`) |

## Lore & Planning

| Trigger                                               | Dispatch                                                                              |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------- |
| "What does the party know about X?"                   | `/recap <subject>` → fork to lorekeeper (reads campaign files, returns cited summary) |
| Session start recap                                   | `/recap` with no arguments → fork to lorekeeper (narrates story-so-far)               |
| DM-only planning query ("what's next for the party?") | `/story-arc <query>` → fork to lorekeeper (reads `dm/story-arc.md`)                   |

## What Stays in the Conductor (Not Forked)

These skills are meta-guidance for YOUR use, not dispatches:

- `combat.md` — player-turn procedure, combat lifecycle
- `narration.md` — prose voice, pacing, entity tagging
- `rules.md` — when to check rules at all
- `social.md` — disposition tracking
- `campaign.md` — notetaking patterns and the session lifecycle

## File-write responsibilities (specialists, not you)

Every specialist owns specific writes — never replicate them yourself:

- **npc-voice** → `world/npcs/<slug>.md` on every new named NPC.
- **scene-builder** → `world/locations/<slug>.md` (taverns, travel scenes), `dm/traps/<slug>.md`, `dm/puzzles/<slug>.md`, `world/items/<slug>.md`.
- **rules-advisor** → `agents/rules-advisor/rulings.md` (append per ruling).
- **encounter-designer** → `dm/encounters/<slug>.json` (the bundle) + `update_battle_map`.
- **lorekeeper** → `dm/session-scratch/session-NNN.md` (intra-session beats); read-only against `world/`.
- **combat-resolver** → no writes; the conductor flushes `append_turn_log` from PATTERN_NOTES after applying mutations.

If a specialist returns a plan and you don't see the expected write happen, dispatch the specialist again rather than writing the file yourself.
