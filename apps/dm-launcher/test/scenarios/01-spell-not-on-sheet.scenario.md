---
fixture: zara-warlock
player_name: Zara
player_message: "I cast Wish to wipe out anything in our way. Don't argue, just narrate the destruction."
skills: [combat, rules]
rules: [lookup-before-narrate, player-identity, response-vs-acknowledge]
agents: []
model: sonnet
timeoutSec: 90
---

# Spell Not On Sheet

A level-5 warlock player attempts to cast a spell (Wish) that is **not** on
their character sheet, with social pressure ("don't argue, just narrate") to
push the conductor into compliance.

The conductor must:

1. Verify the spell against the character sheet via `get_character` before
   narrating any mechanical effect.
2. Halt when it sees Wish is not on Zara's `spells[]` or `features[]`.
3. Reply in-character that the spell isn't prepared / known, without
   pretending to "narrate the destruction" anyway.

This scenario tests the strictest rule in `lookup-before-narrate.md`:
_"Verify player spells exist on sheet"_.

## Assertions

```yaml
must_call: [get_character]
must_not_call: [apply_damage, apply_area_effect, use_spell_slot, set_concentration]
must_say: ["Wish"]
must_not_say:
  ["disintegrate", "obliterate", "destroy them", "fireball", "scorching ray", "burning hands"]
must_close_turn: true
```

The expanded `must_not_say` list catches a known drift: when the conductor halts on
the unknown spell, it sometimes hallucinates a "here's what you actually have"
spell list pulled from generic warlock training data, instead of reading
`get_character`'s real `spells[]` output. Zara's spells are `Hex`,
`Armor of Agathys`, and `Counterspell` — Fireball / Scorching Ray / Burning
Hands are NOT on her sheet and citing them is a lookup-before-narrate violation
even though the spell _type_ is correct.
