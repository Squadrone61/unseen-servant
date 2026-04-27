# `action_ref` — Schema Reference

Deep ref for invariant 13. The rule itself is on the card; this file is the schema.

```
action_ref: {
  source: "spell" | "weapon" | "item" | "monster",
  name: string,
  monsterActionName?: string  // required for source: "monster"
}
```

Accepted by: `show_aoe`, `apply_area_effect`, `apply_damage`, `roll_dice` (for `*_save` checks).

Resolves area shape, save ability/DC, damage dice, damage type, and `onSuccess` semantics from the DB.

Companion args (snake_case at top level — separate from `action_ref` itself):

- `caster_spell_save_dc` — the caster's spell save DC; substituted when the action's DC field is `"spell_save_dc"`.
- `upcast_level` — extra spell levels above base; scales damage dice.
- `outcome_branch` — for `apply_damage` only: `"onHit" | "onMiss" | "onFailedSave" | "onSuccessfulSave"`.

Explicit args (`damage`, `damage_type`, `save_ability`, `save_dc`) remain a fallback for prose-only DB rows. Use the fallback only when the row lacks structured `ActionEffect` data.
