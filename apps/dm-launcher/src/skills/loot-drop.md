---
description: "Generate level-appropriate loot (currency, consumables, mundane items, magic items) with every magic item verified in the database. Dispatches to the scene-builder specialist which persists to world/items/. Never invents magic items not in the SRD."
context: fork
agent: scene-builder
user-invocable: true
---

Generate loot for the following situation.

Context: $ARGUMENTS

Follow the scene-builder procedure (loot variant):

1. Call `get_players` for party level + composition.
2. Choose a currency amount appropriate to source (gold, silver, copper).
3. Pick 0-3 magic items — verify EACH via `lookup_rule(category: "magic_item")`. If any fail lookup, REMOVE them. Never invent magic items.
4. Add 0-3 mundane items (potions, scrolls, useful gear) — verify via `lookup_rule`.
5. Save to `world/items/<slug>.md`.

Return a list of the loot with verification status, so the conductor can narrate the discovery and call `add_item` / `update_currency` for each.
