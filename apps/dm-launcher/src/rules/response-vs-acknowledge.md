# Response vs Acknowledge — Pacing Patterns

Deep ref for the long-turn pacing patterns the card alludes to (invariants 21-22). When `acknowledge` vs `send_response` is itself the question, the card's loop rule decides — this file is for the _how_.

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
