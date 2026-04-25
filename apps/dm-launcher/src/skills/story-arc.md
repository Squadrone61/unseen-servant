---
description: "Query campaign plans and upcoming story beats (DM-only). Dispatches to the lorekeeper specialist which reads dm/story-arc.md and active-context. Use for DM planning; never relay output directly to players."
context: fork
agent: lorekeeper
user-invocable: true
---

Retrieve story-arc context for the conductor.

Context (query): $ARGUMENTS

Follow the lorekeeper procedure (story-arc query variant):

1. Load `dm/story-arc.md` and `active-context.md`.
2. Return next-planned beats, unresolved threads, NPC motivations.

This output is DM-only. The conductor uses it for planning — never relay verbatim to players.
