---
description: "Narrate a story-so-far recap from campaign notes"
user-invocable: false
---

# /recap

Generate an in-character recap of the story so far:

1. **Load campaign context** — call `load_campaign_context` to get all campaign notes
2. **Read session notes** — call `list_campaign_files` and read any session summaries
3. **Compose the recap** — write a dramatic, in-character narration covering:
   - How the adventure began
   - Key events and turning points
   - Important NPCs met and their relationships
   - Active quests and unresolved threads
   - Where the party currently stands
4. **Deliver it** — send the recap via `send_response` as atmospheric DM narration (not a dry summary)
5. **Context check** — if `totalMessageCount` is high (50+), consider calling `compact_history` afterward to free context space
