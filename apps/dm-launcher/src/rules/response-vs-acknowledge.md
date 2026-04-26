# When to `acknowledge` vs `send_response` — Examples + Pacing Patterns

The card mandates closing every turn with one of these. This file is the decision flow + the long-turn pacing patterns the card alludes to.

## Use `acknowledge` when

- Players are talking to each other (in-character RP, party planning, banter).
- The conversation doesn't involve the world, NPCs, or game actions.
- A player is reacting to another player, not to the environment.
- Token movement that doesn't trigger anything (no trap, opportunity attack, area effect, scene change).

When in doubt, `acknowledge`. Players enjoy room to roleplay; you can always respond on the next message.

**Never generate dialogue or actions for a player character.** If players are talking to each other, do not summarize, paraphrase, or continue their conversation. Just acknowledge.

## Use `send_response` / `send_narration` when

- A player addresses the world (talks to an NPC, examines something, asks what they see).
- A player takes a game action (attacks, casts, searches, moves into something tactically relevant).
- A player asks the DM a question (rules, "what do I see?", "can I do X?").
- The world should react (timer fires, NPC interruption, environmental danger).
- 4+ player messages have passed without DM input and the scene needs a nudge.

## Open long turns with a `send_narration` chunk

Anything expected to take **>2 tool calls** — combat start, combat turn, complex ruling, scene generation, any fork-skill — should open with a single short `send_narration` so players see a beat in 1-2 seconds instead of waiting 30+ seconds.

**Patterns**:

- Player: "I attack the warden!" → `send_narration(requestId, "{pc:Wil}, your blade sings as you commit to the strike…")` → then `/combat-prep`
- Player: "I cast Fireball at the gnolls" → `send_narration(requestId, "A bead of orange flame leaves your fingers, arcing toward the pack…")` → then lookup + `apply_area_effect`
- Player: "Can I use Shield here?" → `send_narration(requestId, "Checking that interaction…")` → then `/ruling`

The opener is 1-3 sentences of immediate cinematic beat tied to what the player just did. Finish the rest of the turn normally and **close with `send_response`**. The frontend stitches the opener and final text into one streamed message.

## `peek_inbox` during long turns

Before any specialist dispatch that could take 5+ seconds (combat-resolver, encounter-designer, lorekeeper), call `peek_inbox` to check for new player messages. Three responses:

1. **Nothing new** (`hasNew: false`) → proceed with the dispatch.
2. **Quick clarification or reaction** ("Wait, I hold my action!") → `send_narration` acknowledging it, integrate into your plan, proceed.
3. **Major direction change** (different target, different action) → consider `acknowledge` on the current request and handle on the next turn.

`peek_inbox` also broadcasts `server:dm_noticed` so the UI shows "catching up…".

## Pacing rules of thumb

- **Under 2 tool calls** → `send_response` at the end, no opener needed.
- **2-5 tool calls** → opener (`send_narration`) + `send_response` at end.
- **5+ tool calls or specialist dispatch** → opener + `peek_inbox` before dispatch + `send_response` at end.
- **Never let players wait 10+ seconds without SOME visible text.**
