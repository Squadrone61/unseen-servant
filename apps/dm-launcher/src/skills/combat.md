---
description: "Turn-by-turn combat execution: attack resolution, movement validation, death saves, AoE, flanking, cover, opportunity attacks. Invoke during active combat."
user-invocable: false
---

## Combat (Active)

### Tactical Tools

- Use `get_combat_summary` instead of `get_game_state` during combat — it's optimized for tactical decisions.
- Use `get_map_info` to check terrain, objects, cover, and elevation in an area (e.g., area: "C3:F6") — useful for answering player questions about the battlefield.
- Use `apply_batch_effects` to apply multiple effects (damage, heal, conditions, movement) in one call — efficient for multi-target resolution. Max 10 effects.
- SRD lookups default to summary mode (~30 tokens). Use `detail: "full"` only for rules disputes or complex interactions.

### Effect System

See the **rules** skill for damage type handling, feature activation, concentration mechanics, and advantage/disadvantage hints.

### Position & Range Validation (STRICT)

- Before allowing any melee attack, CHECK positions using `get_combat_summary` — it shows distances between combatants.
- Melee range = 5ft = 1 adjacent tile (including diagonals). Reach weapons = 10ft = 2 tiles.
- If the attacker is NOT adjacent to the target, they must MOVE first (costs movement) or use a ranged attack.
- NEVER assume creatures are adjacent — always verify grid positions.
- Call `move_combatant` to update position BEFORE resolving a melee attack if the creature moved.

### Turn Management (STRICT)

- **NEVER call `advance_turn` for player characters.** Players click End Turn themselves.
- **NEVER narrate the next combatant's actions** until advance_turn is called (NPCs) or the player ends their turn (PCs).
- **NEVER request damage rolls or actions from a player AFTER their turn ended.** If damage was missed, resolve narratively or skip.
- After resolving a player's declared actions, STOP and WAIT. Do not preview what comes next.
- When a player moves their token (you'll see a System movement message), **acknowledge** silently unless the move triggers something (trap, opportunity attack, entering a new area). Don't narrate every 5-foot step.
- **DO call `advance_turn` for NPCs/enemies** after resolving all their actions.
- When a player's turn begins, announce: "{pc:CharacterName}, it's your turn. What do you do?"

### Combat Lifecycle Tools

- Call `end_combat` when combat ends (all enemies defeated, flee, retreat). Clears combat state, returns to exploration.
- Call `add_combatant` to add reinforcements, summoned creatures, or late arrivals mid-combat. Initiative is rolled automatically.
- Call `remove_combatant` when a creature dies, flees, or is dismissed. Removes from turn order.
- Use `set_initiative` to override initiative (readied actions, DM adjustments).
- Use `set_active_turn` to jump to a specific combatant's turn (DM override — skips condition expiry for skipped turns).

### Attack Resolution

- For monster attacks: roll attack with `roll_dice({ checkType: "attack", notation: "1d20+X", reason: "Monster attack" })` — if it hits, apply damage via `apply_damage({ target, action_ref: { source: "monster", name, monster_action_name }, outcome_branch: "onHit" })` for structured entries, or explicit `damage`/`damage_type` for prose-only monsters.
- For player attacks: the player describes the attack, you determine if it hits using the attack roll, then have the player roll damage with `roll_dice({ player: "CharName", checkType: "damage", notation: "..." })`
- **Players ALWAYS roll their own damage.** When a player's attack/spell hits, use roll_dice with player + checkType="damage" so the player sees "Roll Damage". NEVER roll damage on behalf of a player.
- **Always pass DC and checkType for attack rolls.** Use roll_dice with player, checkType="melee_attack"/"ranged_attack"/"spell_attack"/"finesse_attack", dc=TARGET_AC. "melee_attack" uses STR + prof. "ranged_attack" uses DEX + prof. "spell_attack" uses spell attack bonus. "finesse_attack" uses max(STR,DEX) + prof. Combat bonuses like Archery +2 are applied automatically.
- Describe attacks cinematically, not just mechanically
- Give enemies tactical behavior appropriate to their intelligence
- Make combat dynamic — use the environment, have enemies adapt
- Call out when players are low on HP or resources as appropriate
- **NEVER reveal exact enemy HP to players.** Describe enemy health narratively: "barely scratched", "looking roughed up", "badly wounded", "on its last legs", "bloodied" (≤50%). Exact HP numbers are for your internal tracking only.

### Critical Hits

- Natural 20 = critical hit. DOUBLE all damage dice, then add modifiers (modifiers NOT doubled).
- Example: longsword crit = 2d8 + Str mod (not 1d8 + Str).
- Announce crits dramatically!

### Flanking

- Requires two allies on OPPOSITE sides of an enemy (north/south, east/west, or diagonal opposites).
- L-shaped positioning (north + east) is NOT flanking.
- Flanking grants advantage on melee attack rolls against the flanked creature.
- Verify positions on the grid before granting flanking.

### Concentration Checks

- When a concentrating creature takes damage, it must make a Constitution saving throw (DC = 10 or half the damage taken, whichever is higher)
- If the check fails, call `break_concentration` to end the spell, then narrate the effect fading

### Opportunity Attacks

- When a creature moves out of an enemy's reach without Disengaging, that enemy can use a reaction to make one melee attack
- Remind players about this when relevant — both for and against them

### Death Saves

- At 0 HP, a creature makes death saving throws at the start of each turn (DC 10 Constitution save)
- After rolling, call `death_save` to record the result — pass `critical_fail: true` for nat 1 (2 failures), `critical_success: true` for nat 20 (regain 1 HP, reset saves)
- The tool auto-stabilizes at 3 successes or marks dead at 3 failures — announce the count
- Any damage while at 0 HP = one death save failure (critical hit = two failures)

### Cover

- **Half cover** (+2 AC, +2 Dex saves): behind a low wall, another creature, or similar obstacle
- **Three-quarters cover** (+5 AC, +5 Dex saves): behind a portcullis, arrow slit, or thick tree trunk
- The system automatically notes cover when you target creatures on tiles with cover set

### Area of Effect Spells

- **Targeting flow**: (1) player declares spell, (2) call `show_aoe` with `action_ref: { source: "spell", name }` to visualize (shape/size auto-filled from DB), (3) if friendlies are in the blast, ask "Are you sure?", (4) player confirms or adjusts, (5) call `apply_area_effect` with the same `action_ref` plus `caster_spell_save_dc` — save ability/DC/damage/onSuccess all resolved from DB `ActionEffect`.
- Set `persistent: true` for ongoing spells (Wall of Fire, Spirit Guardians, Fog Cloud). Call `dismiss_aoe` when they end.
- AoE colors should match the spell narratively (fire = "#FF6B35", ice = "#4FC3F7", necrotic = "#9C27B0").
- `action_ref` supports `upcast_level` (levels above base) for auto-scaling damage dice. Prefer it over hand-editing dice.

### Stealth & Surprise

- When a group wants to be stealthy, each member makes a Stealth check against the targets' Passive Perception.
- If ALL sneaking creatures beat the target's Passive Perception, the targets are **surprised**.
- Surprised creatures **cannot act on their first turn** of combat and **cannot use reactions** until that turn ends.
- Assassin's Assassinate feature: auto-crit on surprised targets that haven't acted yet.
- Stealth ends when a creature attacks, casts a spell, or is detected.

### Difficulty Scaling

- **Too easy** (no PCs taking damage, enemies dropping in 1-2 hits): add reinforcements, smarter tactics, environmental hazards
- **Too deadly** (multiple PCs at 0 HP, all resources burned in round 1): enemies flee when bloodied, NPC ally arrives, environmental escape route, spread damage across targets
- **Never silently change monster HP/AC mid-fight** — use narrative justifications for any adjustments
