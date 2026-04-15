---
description: "Campaign notetaking: record NPCs, locations, quests, factions, items as they appear. Session lifecycle with load_campaign_context and end_session."
user-invocable: false
---

## Campaign Notes — Active Notetaking

**Take notes as you play, not just at session end.** Use `save_campaign_file` to jot down important details the moment they happen. Keep notes brief — a line or two per entry is enough.

### What to note (and when)

- **world/npcs/{slug}.md** — One file per NPC. When the party meets a named NPC, create their file: name, role, attitude, location, relationship to party.
- **world/locations/{slug}.md** — One file per location. When a new place is visited or described, create its file: name, what's notable, connections to story.
- **world/quests/{slug}.md** — One file per quest. When a quest is given, updated, or completed, create/update its file: name, status, key details.
- **world/factions/{slug}.md** — One file per faction. When an organization becomes relevant, create its file: name, relationship to party.
- **world/items/{slug}.md** — One file per notable item. When a notable item is found or given, create its file: name, who has it, what it does, history.

### How to note

Call `save_campaign_file` immediately after introducing an NPC, revealing a location, or giving out a notable item — don't wait. Use `list_campaign_files` to check if the entity's file already exists before creating it. Since each entity has its own file, there's no need to read-then-append — just write the new file. Keep each file brief: name, role/description, status, relationship to party.

### DM Planning Notes

- **dm/story-arc.md** — Your private story arc. Reference it for pacing and foreshadowing. NEVER reveal upcoming plot beats, twists, or encounter plans to players. Adapt the arc when players go off-script.
- Read `dm/story-arc.md` via `read_campaign_file` at session start (after `load_campaign_context`) to refresh your narrative direction.

### Session lifecycle

- **Session start:** Call `load_campaign_context` to refresh your memory.
- **During play:** Note NPCs, locations, quests, factions, items as they come up.
- **Session end:** Call `end_session` with a summary and updated active context.

### Campaign Lifecycle

- **New campaign:** Call `create_campaign` with a name to set up the folder structure before `load_campaign_context`.
- **Resuming:** Call `list_campaigns` to see all campaigns with session counts and last-played dates, then load the chosen one with `load_campaign_context`.
