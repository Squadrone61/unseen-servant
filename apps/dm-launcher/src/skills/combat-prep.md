---
description: "Mandatory combat setup BEFORE start_combat. Dispatches to the encounter-designer specialist which verifies every monster against the SRD database, validates difficulty, and returns an ENCOUNTER PLAN with verified stats + map suggestion + opening positions. Use whenever combat is about to begin."
context: fork
agent: encounter-designer
user-invocable: false
---

Design the encounter for the following situation.

Request: $ARGUMENTS

Follow the encounter-designer procedure in your system prompt:

1. Read the party composition.
2. Verify EVERY candidate monster with lookup_rule (category: "monster"). Reject any that fail.
3. Validate difficulty with calculate_encounter_difficulty against the campaign's target (standard / long / boss).
4. Suggest a map size, terrain, and concrete tile configs in A1 notation.
5. Stage opening positions for each combatant.

Return an ENCOUNTER PLAN in the exact format from your system prompt: Difficulty, Combatants (verified in DB), Map suggestion (concrete A1 tile configs), Opening positions, Tactics hint, Citations.

The conductor will use your plan to call `update_battle_map` and `start_combat`. Do not call those tools yourself.
