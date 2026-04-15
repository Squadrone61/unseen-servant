---
description: "Generate an NPC with personality, speech patterns, and secrets"
user-invocable: false
---

# /npc-voice

Create a detailed NPC based on the user's description.

**Name variety is a hard requirement.** Repetitive or archetypal names are a failure — consciously vary syllable count, cadence, and cultural root across every NPC you create this campaign. Do not recycle names or cadences you've already used.

1. **Parse the description** — extract the NPC concept (e.g., "grizzled dwarf blacksmith", "nervous elven scholar")
2. **Generate the NPC profile:**
   - **Name** — a fitting fantasy name (distinct in sound and origin from prior NPCs)
   - **Appearance** — 2-3 distinctive physical traits
   - **Personality** — core trait, flaw, and bond
   - **Speech pattern** — a verbal tic, accent note, or catchphrase that makes them recognizable (e.g., always speaks in questions, uses nautical metaphors, whispers everything)
   - **Motivation** — what they want right now
   - **Secret** — something they're hiding that could become a plot hook
3. **Save to campaign notes** — call `save_campaign_file` to create `world/npcs/{slug}` with the NPC's details
4. **Introduce them** — send a brief introduction via `send_response`, demonstrating their speech pattern in a line of dialogue

Example usage: `/npc-voice grizzled dwarf blacksmith with a gambling problem`
