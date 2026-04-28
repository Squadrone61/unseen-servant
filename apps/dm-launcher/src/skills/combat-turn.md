---
description: "Use for EVERY NPC/enemy turn during active combat — never narrate an enemy action without it. Returns a TURN PLAN (single NPC) or GROUP TURN PLAN (consecutive NPCs the resolver chose to batch). You execute either."
context: fork
agent: combat-resolver
user-invocable: false
---

Resolve the turn(s) starting from combatant: $ARGUMENTS

The resolver looks ahead at initiative order and may return either a single TURN PLAN or a GROUP TURN PLAN covering several consecutive NPCs. See your specialist procedure.
