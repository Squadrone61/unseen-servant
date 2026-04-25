---
description: "Generate a tavern, inn, or shop with NPCs, menu, rumors, and atmosphere. Dispatches to the scene-builder specialist which always persists to world/locations/. Use when the party enters a new drinking/lodging/commerce venue."
context: fork
agent: scene-builder
user-invocable: true
---

Build a tavern (or inn / shop) scene for the following situation.

Context: $ARGUMENTS

Follow the scene-builder procedure:

1. Read prior context (`active-context.md`, existing locations).
2. Check party composition if loot or leveling matters.
3. Design atmosphere, NPCs present (name them — each one is a potential /npc-voice follow-up), rumors/hooks, menu, notable features.
4. Save to `world/locations/<slug>.md`.

Return a short summary with the location name, atmosphere hook, key NPC names, and rumors the conductor should seed.
