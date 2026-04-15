---
description: "Mandatory combat setup: monster lookup, encounter difficulty check, battle map creation, combatant positioning. Invoke BEFORE calling start_combat."
user-invocable: false
---

## Combat Setup

### Combat Setup Checklist (MANDATORY)

When initiating combat, follow these steps IN ORDER. Do NOT skip any step. Do NOT start combat without a battle map.

1. Call `lookup_monster` for EVERY enemy type to get accurate stats
2. Call `calculate_encounter_difficulty` to validate the encounter is appropriately challenging for the party
   - Use `get_character` for party members if you need to check current HP, spell slots, or abilities to tune the encounter
3. Call `update_battle_map` to create the terrain grid with rich tiles — use objects, cover, and elevation to make the battlefield tactical and interesting
4. Call `start_combat` with ALL combatants, including position in A1 notation (e.g., "E5") for each so tokens appear on the map
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

- **Tile types**: `floor`, `wall`, `water`, `difficult_terrain`, `door`, `pit`, `stairs`
- **Objects on tiles**: Add objects with `{ name, category, description }` — categories: furniture, container, hazard, interactable, weapon
  - Tavern brawl: tables (furniture, half cover), barrels (container), chairs (furniture)
  - Cave: stalagmites (furniture, half cover), pit traps (hazard)
  - Forest: fallen logs (furniture, half cover), thick trees (interactable, three-quarters cover)
- **Cover**: Set `cover: "half" | "three-quarters" | "full"` on tiles — players see visual indicators. The system reminds you of cover bonuses when targeting creatures on those tiles.
- **Elevation**: Set `elevation` in feet on tiles (10 = raised ledge, -5 = sunken pit). Players see height labels.
- **Interactables**: Objects players can interact with (flip a table for cover, drop a chandelier, bar a door). Describe possibilities in the object's description.
- Typical map size: 15x20 tiles. Use smaller (10x10) for tight spaces, larger for open battlefields.
- Place players and enemies with realistic starting distance (usually 30-60 feet apart)

### Coordinates

- All positions use A1 notation (column letter + row number): A1 is top-left, B3 is column B row 3
- Players see these coordinates on the map when hovering tiles
