---
description: "Use during a PLAYER's turn in active combat — attack resolution, AoE targeting flow, death saves, concentration checks. For NPC/enemy turns use /combat-turn; for combat start use /combat-prep."
user-invocable: false
---

## Combat — Conductor's Slice

Combat-resolver owns enemy turns. Encounter-designer owns prep + map + bundle. You own player turns and player AoE casts.

### Player attack resolution

1. Player declares the attack and target.
2. Roll to hit via `roll_dice({ player, checkType, dc: TARGET_AC, notation: "1d20" })` where `checkType` is one of:
   - `melee_attack` (STR + prof)
   - `ranged_attack` (DEX + prof)
   - `spell_attack` (spell attack bonus)
   - `finesse_attack` (max(STR,DEX) + prof)
     The tool auto-applies the modifier from the sheet and surfaces advantage/disadvantage hints from active effects.
3. **On hit, the player rolls their own damage.** Issue `roll_dice({ player, notation: "<dice>+<mod>", reason: "..." })` — no `checkType`. Players ALWAYS roll their own damage.
4. Apply the rolled damage via `apply_damage({ name, action_ref: { source, name, monsterActionName? }, outcome_branch: "onHit" })`. The action_ref pulls damage type so res/imm/vuln auto-applies.

### Player AoE targeting flow

1. Player declares the spell. Visualize: `show_aoe({ action_ref: { source: "spell", name }, caster_spell_save_dc, color, label })` — shape/size auto-fill from DB.
2. If friendlies are in the blast, ask "Are you sure?" before resolving.
3. Resolve damage + saves: `apply_area_effect({ action_ref, caster_spell_save_dc, upcast_level? })`. Save DC, ability, damage dice and onSuccess all resolve from DB.
4. Set `persistent: true` for ongoing spells (Wall of Fire, Spirit Guardians, Fog Cloud). Call `dismiss_aoe(aoe_id)` when they end.

### Redirects

- **NPC/enemy turn** → dispatch `/combat-turn <combatant>`. Never narrate from memory.
- **Combat start** → dispatch `/combat-prep`.
- **Ambiguous rule mid-fight** → dispatch `/ruling <question>`.
