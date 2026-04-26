# `action_ref` — Structured Outcomes (Reference)

The card mandates `action_ref` for typed damage. This file is the parameter reference for the four tools that accept it.

`action_ref: { source: "spell" | "weapon" | "item" | "monster", name, monster_action_name? }`

Accepted by: `show_aoe`, `apply_area_effect`, `apply_damage`, `roll_dice` (for `*_save` checks).

The tool resolves area shape, save ability/DC, damage dice, damage type, and `onSuccess` semantics from the DB.

Companion args:

- `caster_spell_save_dc` — passes the caster's spell save DC for spells.
- `upcast_level` — passes the casting level so upcast scaling resolves correctly.
- `outcome_branch` — for `apply_damage`, one of `"onHit"` / `"onFailedSave"` / `"onSuccessfulSave"`.

Explicit args remain supported as a fallback for prose-only entries (~41% of monster actions). Use the fallback only when the DB row lacks structured `ActionEffect` data — never as a shortcut to skip `action_ref` for a structured row.
