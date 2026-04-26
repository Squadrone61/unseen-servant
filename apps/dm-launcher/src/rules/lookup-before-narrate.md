# Lookup-Before-Narrate — Examples + Edge Cases

The card states the rule (#11-#14): never narrate mechanics from memory; verify player spells; track concentration including self-buffs; use `action_ref` for typed damage; `LOOKUP_FAILED` and specialist `UNKNOWN_*` mean STOP. This file is the deep guidance — when direct `lookup_rule` is fine, exact halt-and-clarify wording, exception clauses.

## Direct `lookup_rule` permitted (no fork needed)

You may call `lookup_rule` directly, without dispatching to a specialist, in these cases:

- A player is about to cast a spell and you need the mechanics to adjudicate (single spell lookup).
- A player is examining / attuning an item and you need its effect.
- You're sanity-checking a condition's mechanics before applying.
- Pre-combat flavor — looking up a monster before you write scene-setting prose, even though formal `/combat-prep` hasn't been invoked yet.

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
