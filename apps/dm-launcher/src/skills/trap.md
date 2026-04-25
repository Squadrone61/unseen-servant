---
description: "Design a trap with detection DC, disarm DC, trigger, damage, and observable clues. Dispatches to the scene-builder specialist which persists to dm/traps/. DM-only spec — the conductor describes clues to players, never the mechanics directly."
context: fork
agent: scene-builder
user-invocable: true
---

Design a trap for the following situation.

Context: $ARGUMENTS

Follow the scene-builder procedure (trap variant):

1. Determine location, trigger, effect (damage type + save DC — verify damage dice via `lookup_rule` for any referenced spells or mechanical effects).
2. Pick detection / disarm DCs appropriate to the party level (call `get_players` if needed).
3. Describe the observable clue — something a Perception check could catch — without giving away the mechanics.
4. Save to `dm/traps/<slug>.md`.

Return a DM-only summary: clue, trigger, effect, DCs. The conductor will describe the clue to players IF they succeed on their passive/active Perception; never narrate the trap's mechanical details unless sprung.
