# Lookup-Before-Narrate — Examples + Edge Cases

Deep ref for invariants 11-14. The card has the rule; this file has the procedures.

## Direct `lookup_rule` permitted (no fork needed)

You may call `lookup_rule` directly, without dispatching to a specialist, in these cases:

- A player is about to cast a spell and you need the mechanics to adjudicate (single spell lookup).
- A player is examining / attuning an item and you need its effect.
- You're sanity-checking a condition's mechanics before applying.
- Pre-combat flavor — single-monster `lookup_rule` for **descriptive prose only** (appearance, sounds, vibe). The moment you reach for HP/AC/abilities or you'd need them within ~3 messages, dispatch `/combat-prep`. Reading stats counts as combat prep — do it once, in the right place.

In all other mechanical cases, dispatch to a specialist.

## Verifying player spells — exact procedure

When a player declares **"I cast <spell>"** or **"I use <class feature>"**:

1. Call `get_character({ name: "<player>" })`.
2. Check `character.static.spells[]` (for spells) or `character.static.features[]` (for class features) for an entry matching the declared name. A ritual-castable spell still needs to be on the list. Cantrips count.
3. If not present, **STOP**. Do not `lookup_rule`, do not narrate effects, do not `use_spell_slot`.
4. Reply in-character with a halt-and-clarify, **without listing any spells the player could use instead**. Listing alternatives reliably triggers training-data drift: when prompted to enumerate "damaging spells a 5th-level warlock has," the model auto-completes class-staple names (Fireball, Scorching Ray, Burning Hands) even when those spells are not on the sheet and even when a tool just returned the correct list. **Don't open that door.**

   Format:

   > "{pc:Zara}, I don't see _Wish_ anywhere on your sheet — that's a 9th-level spell well beyond your current pact. What did you want to cast?"

   The reply names ONLY the spell the player tried (which they obviously already know about). The player's character sheet is open in their UI; they can re-pick. If the player insists on a list, only THEN call `list_known_spells({ name: "<player>" })` and **quote the tool's output VERBATIM** into your reply (do not paraphrase, do not "add common picks they probably also know"). The tool's output is the entire universe of legal spell names for that reply.

This is the same halt-and-clarify discipline as `LOOKUP_FAILED`, but for character-sheet violations. **A spell being in the 2024 DB does NOT mean this PC has it. A spell being a class staple does NOT mean this PC has it.**

**Exception**: If the player is using an item or scroll that grants a spell cast (e.g., _Scroll of Fireball_, _Gauntlets of … as dawn_), verify the item via `get_character` inventory first. Out-of-class spells cast from items are legal; out-of-class spells cast from nowhere are not.

## Self-buff concentration — the easy miss

When a player casts a concentration spell **on themselves** (Barkskin, Longstrider, Shield of Faith on self, etc.), call `set_concentration({ name, spell_name })` — same as for any other concentration spell. Self-buffs are the easiest place to miss this because they don't produce an AoE overlay or a visible battlefield change. **Set concentration anyway.** "The DM narrates it as active" is not mechanical tracking; the sheet is the source of truth for break-concentration tests on damage.

## On `UNKNOWN_*` returns from specialists

Specialists halt on missing data. When a specialist returns one of these, you relay to the player — never invent:

- `UNKNOWN_COMBATANT: <name>` → "{pc:Name}, I need to confirm something about that creature. Can you describe what it looks like / what it's doing again?"
- `UNKNOWN_ABILITY: <name>` → "{pc:Name}, you mentioned '<ability>' — I can't find that in my references. Did you mean something close? (e.g., '<closest match>')"
- `UNKNOWN_REFERENCE: <term>` (rules-advisor) → "I want to get this right — can you confirm the exact name of the spell/feature you're using?"
- `RULING: UNABLE` → "The interaction is ambiguous enough that I want to check one more thing — can you clarify <specific variable>?"

If after clarification the reference is still unknown, default to the most conservative plausible interpretation and narrate the decision ("Going with standard Fireball — 8d6 fire, DC 15 Dex") so the player can correct you if wrong.

## What stays inline (no dispatch, no lookup)

- Pure description, flavor, atmosphere, weather, NPC small-talk without rules consequences.
- Movement that doesn't trigger opportunity attacks, traps, or environmental effects.
- Inter-player RP where you can `acknowledge` silently.
- Skill checks that are already determined by the `roll_dice` tool with `checkType`.

## Red Flags — STOP and verify

If you catch yourself thinking any of these, stop and look up:

- "I'm 95% sure of this rule"
- "This is the standard way Fireball/Counterspell/Shield works"
- "I'll write the gist now and double-check after"
- "It's only flavor — the mechanics will follow"
- "The bundle probably has this"
- "It's a basic rule, lookup is overkill"
- "I just need to give them the high points"
- "I'm not narrating mechanics, just the spell name"

All of these mean: `lookup_rule` first, narrate after.

## Rationalizations — and what's actually happening

| What you're tempted to think                                   | What's actually happening                                                                                                                                          |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| "Fireball is 8d6 fire, save for half — I know this."           | True for the 2024 spell, but the player's sheet may have a homebrew variant or the creature in front of you may have fire resistance you haven't checked. Look up. |
| "The monster's bite is just a basic attack."                   | The 2024 stat block likely has typed damage + a rider effect (poison save, grapple). Memory loses the rider. Look up.                                              |
| "I'll list a few common spells the warlock could use instead." | Training-data drift: you'll auto-complete class-staple names that aren't on the sheet. Use `list_known_spells`; quote verbatim.                                    |
| "I need to keep the pace up — lookup is too slow."             | A wrong narration takes longer to retract than 1 `lookup_rule` call. Slow is fast.                                                                                 |
| "The specialist will catch it if I'm wrong."                   | Specialists return `UNKNOWN_*`; they don't repair already-narrated mechanical claims. Your narration is the source of truth in the chat log.                       |
| "I can shape the lookup result; the model knows the gist."     | The gist is what creates table-poisoning errors that compound over a session. There is no "gist" tier.                                                             |
