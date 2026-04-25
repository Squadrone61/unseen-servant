---
description: "Generate an overland travel leg: distance, pace, terrain, weather, time passage, and possible encounters. Dispatches to the scene-builder specialist which persists to world/locations/. Use when the party is traveling between regions."
context: fork
agent: scene-builder
user-invocable: true
---

Build a travel leg for the following journey.

Context: $ARGUMENTS

Follow the scene-builder procedure (travel variant):

1. Read `active-context.md` and any existing location files for the start/end.
2. Determine realistic distance, pace, terrain, weather, time.
3. Seed 0-2 events or encounters appropriate to the terrain and party level. Look up any monster stats.
4. Note exhaustion / rest / watch impact.
5. Save to `world/locations/<slug>.md` (travel leg as its own location entry).

Return a summary the conductor can narrate from — terrain, weather, timing, encounter hooks.
