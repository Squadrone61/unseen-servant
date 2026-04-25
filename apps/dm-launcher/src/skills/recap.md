---
description: "Narrate the story so far, in DM voice, from campaign files. Dispatches to the lorekeeper specialist which reads active-context and recent sessions. Use at session start when resuming a campaign."
context: fork
agent: lorekeeper
user-invocable: true
---

Produce a recap narrative for the campaign's current state.

Context (optional focus): $ARGUMENTS

Follow the lorekeeper procedure (session recap variant):

1. Load `active-context.md`, last 2-3 `sessions/session-*.md`, and `dm/story-arc.md` if present.
2. Return a 2-4 paragraph recap narrative in DM voice — where the party ended, what's at stake, unresolved threads.

The conductor will relay your narrative directly to players via `send_response`, adding entity tags (`{pc:...}`, `{npc:...}`, `{place:...}`).
