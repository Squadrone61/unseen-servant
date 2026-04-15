---
description: "Generate a tavern or shop with NPCs, rumors, menu, and atmosphere"
user-invocable: false
---

# /tavern

Generate a tavern or shop on the fly.

**Name variety matters.** Location and NPC names should be distinct and inventive — avoid reusing syllables, structures, or archetypes from earlier taverns/NPCs this campaign.

1. **Generate the location:**
   - **Name** — a memorable, thematic name (fresh — not a variant of a previous location's name)
   - **Atmosphere** — 2-3 sensory details (sights, sounds, smells)
   - **Notable feature** — one thing that makes this place unique
2. **Generate 2-3 NPCs** (bartender/shopkeep + patrons/customers):
   - Name, race, one-line personality
   - A speech quirk that makes them instantly recognizable
3. **Generate 1-2 rumors** — one true, one misleading
   - If campaign context exists (check via `load_campaign_context`), tie rumors to active quests or world events
4. **Generate a menu** with 3-4 items — flavorful names and descriptions (no mechanical effects needed)
5. **Save to campaign notes:**
   - Call `save_campaign_file` to create `world/locations/{slug}` with the location's details
   - For each NPC, call `save_campaign_file` to create `world/npcs/{slug}` with their details
6. **Send the scene** — call `send_response` to describe the party entering the establishment, with NPC dialogue demonstrating their speech patterns

Example usage: `/tavern seedy port tavern`
