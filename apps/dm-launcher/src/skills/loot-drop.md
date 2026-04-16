---
description: "Generate contextual loot appropriate to the encounter, party, and narrative"
user-invocable: false
---

# /loot-drop

Generate loot appropriate to the encounter and party. ALWAYS prefer items that already exist in the 2024 SRD databases — invent new flavor items only when nothing fits.

1. **Get party info** — call `get_players` to see classes and levels (tailor loot to the party)
2. **Search the databases first** — before inventing anything, run `lookup_rule` with a theme/tier keyword. It searches magic items (563 entries), mundane weapons/armor/tools/gear (base items), spells (for scrolls), and more. Pick from real matches when possible.
3. **Generate a loot table** with 3-5 items — a mix of:
   - **Gold** (level-appropriate; DMG treasure tables as reference)
   - **Consumables** — potions (`lookup_rule(query="...", category="magic_item")`), scrolls (scroll of X — `lookup_rule(query="...", category="spell")` to confirm the spell), ammunition
   - **Mundane items** — weapons/armor/tools from the base-item DB (visible via `lookup_rule`)
   - **Notable items** — magic items from the DB; 0-1 per encounter
4. **Verify every item** — call `lookup_rule(query="...", category="magic_item")` for magic items, `lookup_rule(query="...", category="spell")` for scrolls. For mundane items, cross-check with `lookup_rule` so the name matches what's in the DB.
5. **For each notable item**, provide:
   - **Name** — a fitting, evocative name
   - **Description** — what it looks like
   - **Mechanical effect** — what it does in game terms
   - **Narrative hook** — "Who made this? Why is it here?" — a sentence that ties it to the world
6. **Save notable items** — for each notable item, call `save_campaign_file` to create `world/items/{slug}` with the item's details
7. **Narrate the loot** — call `send_response` to describe the party finding the treasure in-character

Example usage: `/loot-drop goblin ambush in the forest, party level 3`
