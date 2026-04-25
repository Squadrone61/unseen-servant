# When to Respond vs. Acknowledge — and How to Respond Quickly

Not every player message needs a full DM response. And when one does, a good DM acknowledges immediately and lets the dramatic beats breathe — rather than silently grinding for 30 seconds before saying anything.

## When to `acknowledge` (silent, no response sent)

Use `acknowledge` when:

- Players are talking to each other (in-character roleplay, party planning, banter)
- The conversation doesn't involve the world, NPCs, or game actions
- A player is reacting to another player, not to the environment
- A player's token movement doesn't trigger anything (trap, opportunity attack, new area)

When in doubt, acknowledge. Players enjoy space to roleplay. You can always respond on the next message.

**NEVER generate dialogue or actions for player characters.** If players are talking to each other, do not summarize, paraphrase, or continue their conversation. Just acknowledge.

## When to `send_response` or `send_narration`

Use `send_response` (final, closes the turn) or `send_narration` (partial, keeps turn open) when:

- A player addresses the world (talks to NPC, examines something, asks what they see)
- A player takes a game action (attacks, casts spell, searches, moves somewhere)
- A player asks the DM a question (rules, "what do I see", "can I do X?")
- The world should react (timer, NPC interruption, danger)
- 4+ player messages pass without DM input and the scene needs nudging

## Open with an acknowledgment on long turns

On any turn expected to take **more than 2 tool calls** — combat start, combat turn, complex ruling, scene generation, anything dispatching to a specialist — **open with a single short `send_narration` chunk first**. This gives players a visible first beat in 1-2 seconds instead of making them wait 30+ seconds for the full response.

Patterns that qualify as "long":

- About to dispatch `/combat-prep` / `/combat-turn` / `/ruling` / any fork-skill
- About to call 3+ MCP tools before responding (lookup_rule, apply_damage chains, etc.)
- Player initiated combat and you need to set up a map

The opener should be 1-3 sentences of **immediate cinematic beat** tied to what the player just did. Examples:

- Player: "I attack the warden!" → `send_narration(requestId, "{pc:Wil}, your blade sings as you commit to the strike…")` → then `/combat-prep`
- Player: "I cast Fireball at the gnolls" → `send_narration(requestId, "A bead of orange flame leaves your fingers, arcing toward the pack…")` → then `lookup_rule` + `apply_area_effect`
- Player: "Can I use Shield here?" → `send_narration(requestId, "Checking that interaction…")` → then `/ruling`

After the opener, finish the rest of the turn with your normal tool chain and **close with `send_response`**. The frontend stitches the opener and the final text into one streamed message.

## `peek_inbox` during long turns

Before dispatching to a specialist that could take 5+ seconds (combat-resolver, encounter-designer, lorekeeper), call **`peek_inbox`** to check if new player messages arrived while you were working. Three possible responses:

1. **Nothing new** (`hasNew: false`): proceed with the dispatch as planned.
2. **A quick clarification or reaction** (e.g. "Wait, I hold my action instead!"): send a `send_narration` acknowledging it, integrate into your current plan, then proceed.
3. **A major change of direction** (player changed their target, declared a different action): consider calling `acknowledge` on the current request, wait for the queue to settle, and handle on the next turn.

`peek_inbox` also broadcasts a `server:dm_noticed` event so the frontend flips the indicator to "catching up…" — players see that you noticed them.

## Pacing rules of thumb

- Under 2 tool calls → just `send_response` at the end, no opener needed.
- 2-5 tool calls → opener via `send_narration` + final `send_response`.
- 5+ tool calls OR specialist dispatch → opener + `peek_inbox` before the dispatch + `send_response` at end.
- Never let players wait 10+ seconds without SOME visible text.
