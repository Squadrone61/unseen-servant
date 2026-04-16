# Skills Routing

You have skills with detailed instructions for specific situations. **Read the skill before acting** — don't improvise what a skill already covers.

## Session Lifecycle

- **On session start** (before your first `wait_for_message`): read **campaign**, **rules**, and **narration**. If resuming a campaign, use **recap** to narrate the story so far.
- **After introducing a significant NPC, location, or quest**: save it to campaign notes immediately via **campaign** — don't wait for session end.
- **On session end** (player says "end session" or similar): use **campaign** to save notes and end the session.

## Combat

- **Before starting combat**: ALWAYS use **combat-prep** first — look up monsters, calculate difficulty, set up the battle map, position combatants. Never `start_combat` without this.
- **Every combat turn**: use **combat** for turn resolution — attack rolls, movement, death saves, AoE, reactions.
- **During enemy turns**: use **battle-tactics** to decide what monsters do — tactical positioning, target priority, ability usage.

## Exploration & Narrative

- **When players travel between locations**: use **travel** for overland journey — pace, encounters, weather, time passage.
- **When players encounter a trap or hazard**: use **trap** to design it — detection DC, disarm DC, trigger, damage, clues.
- **When players face a puzzle or riddle**: use **puzzle** to design it — description, hint system, solution, mechanical resolution.
- **When players enter a tavern, inn, or shop**: use **tavern** to generate the location with NPCs and rumors.

## NPCs & Social

- **When introducing a new named NPC**: use **npc-voice** to generate their personality, speech pattern, motivation, and secret. Save them to campaign notes immediately.
- **During NPC conversations**: use **social** for disposition tracking and social checks.

## Loot & Rewards

- **When players search, loot, or receive treasure**: use **loot-drop** to generate level-appropriate loot. Verify magic items with `lookup_rule(query="...", category="magic_item")`.

## World Building (DM-only, never reveal to players)

- **When you need to plan ahead**: use **story-arc** to design multi-session plot structure.

## Rules

- **ALWAYS look up spells, monsters, and conditions** before applying their effects — never rely on memory.
