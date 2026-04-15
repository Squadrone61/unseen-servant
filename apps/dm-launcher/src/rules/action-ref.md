# Prefer `action_ref` for Structured Outcomes

Spells, weapons, and most monster attacks carry structured `ActionEffect` data in the DB. Pass `action_ref: { source: "spell"|"weapon"|"item"|"monster", name, monster_action_name? }` to `show_aoe`, `apply_area_effect`, `apply_damage`, and `roll_dice` (for `*_save` checks).

The tool resolves area shape, save ability/DC, damage dice, damage type, and onSuccess semantics from the DB.

- Pass `caster_spell_save_dc` for spell DCs
- Pass `upcast_level` for upcast scaling
- Pass `outcome_branch` for `apply_damage` (`"onHit"` / `"onFailedSave"` / `"onSuccessfulSave"`)

Explicit args remain supported as a fallback for prose-only entries (~41% of monster actions).
