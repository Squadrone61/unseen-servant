---
description: "Use at the FIRST turn of a RESUMED campaign session (sessionCount >= 1). Surfaces 'where we left off', refreshes PC state from the sheet, and grounds the re-introductory tableau in current gear/conditions before narrating."
user-invocable: false
---

## Session Start — Resumed-Session Procedure

You run this on the **first turn of any session except the first**. Look at the injected `[System: Campaign context loaded]` block: if `Sessions played: ≥ 1`, you are resuming — this skill is the procedure. If `Sessions played: 0`, use `/campaign-start` instead.

The opening narration of session N is more constrained than a campaign opener — players already have a mental image of their PCs and the world. Your job is to **re-anchor the table to where things actually stand right now**, not to invent.

### What you must do BEFORE writing the opening scene

**Mandatory steps, in order:**

1. **Refresh on the world state.** The `[System: Campaign context loaded]` block was already injected with the manifest, system prompt, active context, and prior session summaries. Skim it. Note: who, where, what's pending, what cliffhanger.

2. **Recap the prior session — narratively.** Dispatch `/recap` (forks to lorekeeper) for the player-facing recap. The lorekeeper reads session summaries and the current `dm/session-scratch/` (if any) and returns a tight 2-3 paragraph "previously, on…" beat. Use the recap's prose as the FIRST chunk of your opening — `send_narration` it before continuing, so players have something to read while you finish your prep.

3. **Re-ground in the actual party state.** Call `get_players` once. The response includes for each PC:
   - `hp` / `conditions` — what state they're actually in right now (tempHP, conditions carried over).
   - `equipped` — currently-equipped weapons, armor, shield, attuned items. Inventory may have changed mid-campaign (looted gear, swapped weapons, broken armor).
   - `appearance`, `alignment`, `backstoryHook` — for any prose touching physical description.

   **This is the source of truth for the opening tableau.** Sessions 5+ are where gear-drift hits hardest: a Paladin who started with a maul might now wield a magic warhammer they looted in session 3 — but the model's training prior still wants to write "longsword". Re-read `equipped` every session.

4. **For any PC with conditions, low HP, or a recent dramatic event** (death save, loss, level-up between sessions), call `get_character({ name })` once and skim `dynamic` so you can reflect their current state in voice ("{pc:Thalion}, still favoring the leg the troll mauled, …").

5. **Optional: scratch the surface.** If you want pre-recap detail beyond the lorekeeper's summary, call `read_session_scratch` directly to see notes from the most recent session that haven't been folded into a session summary yet.

### Writing the opening narration

After the recap chunk has been sent via `send_narration`, draft the second chunk — the "we pick up here" tableau. Constraints:

- **Gear narration must match `equipped` right now, not what they had last campaign.** Re-look every session. If `equipped.weapons` changed, the weapon name in your prose changes.
- **Conditions must surface where appropriate.** A PC with `conditions: ["poisoned"]` should not be narrated as "fresh and rested". A PC at 4/47 HP should not be "striding confidently into the temple".
- **Tie back to the recap's last beat.** "When we last saw {pc:Thalion}, she stood at the threshold of the {place:Sundered Vault} — the chains still rattling behind her. The air is colder now, …"
- **End with a clear handle.** Either prompt for actions ("what do you do?") or set up the first scene's pending decision ("the {npc:Steward} clears his throat — he's been waiting").

Length: ~200-300 words for the second chunk. Combined with the recap chunk, ~400-500 total.

### After the opener

- Resume the normal game loop. Continue active notetaking per `campaign.md`. Dispatch as usual.
- The session ends when the host calls `end_session` — at which point you call `end_session` to fold scratch + active state into the next session's manifest.

### Red flags — STOP and re-read `get_players`

| You're tempted to write…                                    | What you must do                                                                                                                 |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| "still wielding the longsword from session 1"               | STOP. Re-read `equipped.weapons` — they may have swapped weapons three sessions ago.                                             |
| "{pc:Thalion}, fully healed, …"                             | STOP. Re-read `hp` and `conditions`. PCs do not auto-restore between sessions unless `long_rest` was called in the last session. |
| "as the party gathers, all five of them ready for the road" | STOP. Re-read the player list — has anyone left, joined, or dropped offline since the manifest's `players[]` was last written?   |
| "the wizard adjusts his iconic pointy hat"                  | STOP. Was that hat ever in `appearance` or inventory? Or are you inserting D&D-stereotype flair?                                 |

If anything in your draft contradicts the response from `get_players`, the response wins.
