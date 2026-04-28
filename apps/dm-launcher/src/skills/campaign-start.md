---
description: "Use at the very FIRST turn of a NEW campaign (sessionCount === 0). Sets up world memory, plans the arc, and grounds the opening tableau in each PC's actual sheet — gear, alignment, appearance, backstory hook — before narrating."
user-invocable: false
---

## Campaign Start — First-Session Procedure

You only run this **once per campaign**, on the very first `wait_for_message` after the host clicks "Begin the Adventure" for a freshly-created campaign. The injected `[System: Campaign context loaded]` will show `Sessions played: 0` (or no manifest at all, if no campaign was created — in that case skip the campaign-file steps and go straight to "Ground the opening").

If `Sessions played: ≥ 1`, you are resuming. Use `/session-start` instead.

### What you must do BEFORE writing the opening scene

The opening scene is the most prior-prone moment of the entire campaign. The model's training data wants to fill in "Paladins have longswords, Rogues have rapiers, Wizards have spellbooks" — and it will, unless you ground every gear, alignment, and appearance detail in the actual sheet first.

**Mandatory steps, in order:**

1. **Read the room.** Call `get_players` once. The response includes for each PC:
   - `equipped` — currently-equipped weapons, armor, shield, attuned items.
   - `appearance` — every field the player typed (gender, age, height, weight, hair, eyes, skin).
   - `alignment`, `backstoryHook`.
   - HP / AC / conditions / classes / race.

   **This is the source of truth for the opening narration.** If a PC's `equipped.weapons` is `["Maul"]`, narrate a maul, not a longsword. If `equipped.armor` is missing, do NOT narrate plate armor. If `appearance.hair` is unset, do not invent hair color.

2. **Optional deeper read.** For any PC where the player wrote a substantial `static.backstory` or where the build looks unusual (multiclass, unusual species/class combo), call `get_character({ name })` once and skim `static.backstory`, `static.traits`, and `static.features[]`. **Do not narrate features from memory** — invariant 11 still applies.

3. **Plan the arc — privately.** Dispatch `/story-arc create the opening arc` (forks to lorekeeper) and let it write `dm/story-arc.md`. Do NOT relay arc content to players. The arc is private DM material.

4. **Stub out the opening location and any NPC the players will meet in the first beat.** Use `save_campaign_file` for `world/locations/<slug>.md` and `world/npcs/<slug>.md` — one or two lines each. See the `campaign` skill for the file structure.

### Writing the opening narration

Now you can write the first `send_response`. Constraints:

- **Gear narration must match `equipped`.** "Wields a maul" if and only if the maul is in `equipped.weapons`. "Wears chain mail" if and only if `equipped.armor === "Chain Mail"`. "Carries a shield" if and only if `equipped.shield` is set. If a slot is empty (e.g. no equipped weapon), narrate something neutral — "hands resting at her side" — never invent a weapon to fill the gap.
- **Appearance narration must come from `appearance` fields.** If the player typed `hair: "raven black, braided"` — use it. If `hair` is unset, write around it ("their hood casts their face in shadow") rather than fabricate.
- **Backstory hook is fair game.** The `backstoryHook` line is the player's own words; reference it lightly to make them feel seen.
- **Alignment shapes voice and bearing, not gear.** A Lawful Good Paladin stands tall and speaks plainly; a Chaotic Neutral Bard fidgets and grins. Don't list alignment in prose ("the Lawful Good paladin steps forward") — show it.
- **One opening tableau, then a hook.** Establish where they are, what they see / smell / hear, who else is present, then end with an invitation: a stranger approaching, a noise from the alley, the innkeeper sliding a sealed letter across the bar. Players should have a clear next action.

Length: ~200-350 words for the campaign opener — slightly longer than a routine turn (see `narration.md` for the bite-sized default). Stop when the hook lands.

### After the opener

- The arc and world stubs are persisted; you don't need to re-create them. Subsequent turns: stay in the conductor, dispatch as usual, follow `campaign.md` for active notetaking discipline.
- The next session start (when the host begins session 2+) routes through `/session-start`, not this skill.

### Red flags — STOP and re-read `get_players`

| You're tempted to write…                    | What you must do                                                                                                             |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| "the paladin grips her longsword"           | STOP. Did `equipped.weapons` contain "Longsword"? If not, narrate the actual weapon — or the absence of one.                 |
| "the wizard's robes are deep crimson"       | STOP. Was `appearance` set with that detail? If not, write around it or omit color entirely.                                 |
| "Thalion adjusts the pendant at her throat" | STOP. Is the pendant in inventory? If not, drop the prop — or use `attunedItems` if it's actually attuned.                   |
| "the rogue's hood hides a scarred face"     | STOP. Did the player type a scar in `appearance.skin` or backstory? Fabricated trauma inserts a backstory they didn't write. |

If you catch yourself reaching for a class stereotype, the rule is the same as `lookup-before-narrate`: the sheet is the source of truth. Re-read `get_players` before writing the line.
