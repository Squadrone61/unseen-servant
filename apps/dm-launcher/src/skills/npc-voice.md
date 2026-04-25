---
description: "Create a new NPC with a distinctive voice and persist it to world/npcs/. Dispatches to the npc-voice specialist which reads existing NPCs first to avoid name/voice collisions, looks up any class/spell mechanics, and always writes the file. Use whenever introducing a NAMED NPC for the first time."
context: fork
agent: npc-voice
user-invocable: true
---

Create a new NPC for the following situation.

Context: $ARGUMENTS

Follow the npc-voice procedure:

1. Survey existing NPCs via `list_campaign_files` (filter `world/npcs/`).
2. Design a name/voice deliberately DIFFERENT from existing patterns (syllable palette, cadence).
3. Look up any class/spell/item mechanics the NPC has.
4. Save to `world/npcs/<slug>.md` in the required format.

Return a short summary with the NPC's name, role, three voice tics, and the hook the conductor can use.
