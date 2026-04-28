---
description: "Use for EVERY NPC/enemy turn during active combat — never narrate an enemy action without it. The resolver OWNS the turn end-to-end: it verifies abilities, executes frames in fictional order (moves, rolls, applies damage/conditions), blocks on player saves, and returns an APPLIED FRAMES record you narrate from. You never call mutation tools during an NPC's turn."
context: fork
agent: combat-resolver
user-invocable: false
---

Resolve the turn(s) starting from combatant: $ARGUMENTS

Pass the dispatch as `<combatant-name> <requestId>` — the resolver needs the requestId to call `send_narration` (mid-flow beats) and `peek_inbox` (mid-group redirects). The resolver looks ahead at initiative order and runs every consecutive NPC's turn in this single dispatch. See its specialist procedure.
