---
description: "Resolve a single NPC or enemy combatant's turn during active combat. Dispatches to the combat-resolver specialist which looks up stats, picks tactics, pre-rolls dice, and returns a TURN PLAN. Use this for EVERY enemy turn — never narrate enemy actions without it."
context: fork
agent: combat-resolver
user-invocable: false
---

Resolve the next combatant's turn.

Combatant: $ARGUMENTS[0]

Follow the combat-resolver procedure in your system prompt. Return a TURN PLAN exactly in the format specified, with NARRATIVE / MUTATIONS / FOLLOWUPS / CITATIONS sections. Every mechanical claim must trace to a lookup_rule result or a roll_dice call.

If you cannot look up the combatant's stat block, return `UNKNOWN_COMBATANT: <name>` and stop.
If any ability you plan to use fails lookup, remove it and return `UNKNOWN_ABILITY: <name>` for that ability.

The conductor will apply the MUTATIONS in order and narrate from your draft NARRATIVE with entity tags.
