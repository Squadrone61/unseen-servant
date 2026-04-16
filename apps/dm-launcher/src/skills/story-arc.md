---
description: "Design a multi-session story arc with plot beats, NPCs, and twists (DM-only)"
user-invocable: false
---

# /story-arc

Design a multi-session campaign story arc. This is **DM-only prep** — never reveal the arc to players.

1. **Load context** — call `load_campaign_context` to get existing NPCs, quests, locations, party state
2. **Get party info** — call `get_players` to see levels, classes, and backstories
3. **Design the arc** based on the user's description:
   - **Theme & tone** — the overarching mood and genre
   - **Hook** — how the arc begins (tie to existing story if possible)
   - **Act structure** (3-act or milestone-based):
     - Key plot beats per session/act
     - Encounters (combat + social + exploration mix) with suggested monsters
     - NPCs to introduce (allies, antagonists, wildcards)
     - Clues and reveals — what players learn and when
   - **Climax** — the big confrontation or decision
   - **Twist** — at least one surprise that recontextualizes earlier events
   - **Consequences** — how the resolution changes the world
4. **Validate monsters** — call `lookup_rule(query="...", category="monster")` for each suggested encounter creature to verify stats exist
5. **Save the arc** — call `save_campaign_file` to write `dm/story-arc.md`. This is a **DM planning directory** — never referenced in player-facing responses.
6. **Present to DM** — show the arc summary to the DM operator. **DO NOT call `send_response`** — players must never see this.

**Critical:** During play, reference `dm/story-arc.md` for pacing and foreshadowing, but NEVER reveal upcoming plot beats, twists, or encounter plans to players. The arc is a guide, not a railroad — adapt when players go off-script.

Example usage: `/story-arc dark mystery in a cursed coastal town, 4-6 sessions`
