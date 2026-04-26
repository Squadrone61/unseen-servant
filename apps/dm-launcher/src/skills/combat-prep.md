---
description: "Mandatory combat setup BEFORE start_combat. Dispatches to the encounter-designer specialist which verifies every monster against the SRD database, validates difficulty, draws the battle map, and persists an Encounter Bundle (so combat-resolver doesn't re-look-up each turn). Returns a SHORT ENCOUNTER SUMMARY with the bundle slug. Use whenever combat is about to begin."
context: fork
agent: encounter-designer
user-invocable: false
---

Design the encounter for the following situation.

Request: $ARGUMENTS

Follow the encounter-designer procedure in your system prompt:

1. Read the party composition.
2. Verify EVERY candidate monster with `lookup_rule` (category: "monster"). Reject any that fail.
3. Validate difficulty with `calculate_encounter_difficulty` against the campaign's target (standard / long / boss).
4. Draw the battle map yourself via `update_battle_map`.
5. **Save the Encounter Bundle via `save_encounter_bundle`** — this captures every monster's stats + abilities so the combat-resolver can read once per turn instead of re-looking-up. The bundle is the contract for the rest of the fight.
6. Return a SHORT ENCOUNTER SUMMARY (slug + difficulty + combatant list + opening hook + citations).

The conductor will use the bundle slug to call `start_combat` with `encounter_bundle_slug: "<slug>"`. The map is already drawn, the bundle is already saved — do NOT call `start_combat` yourself.
