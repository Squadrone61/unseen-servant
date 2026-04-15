---
description: "Monster AI advisor: suggest optimal tactics for the current enemy turn"
user-invocable: false
---

# /battle-tactics

Advise the DM on monster tactics during combat:

1. **Get combat state** — call `get_combat_summary` to get turn order, HP, conditions, distances, and active AoE
   - If not in combat, tell the DM this skill only works during active combat
2. **Analyze the battlefield:**
   - Current enemy's abilities, attacks, and movement (from monster stats)
   - Party positions on the battle map
   - HP states of all combatants (who's wounded, who's fresh)
   - Active conditions (who's stunned, concentrating, prone, etc.)
   - Terrain features (cover, difficult terrain, chokepoints)
3. **Suggest 2-3 tactical options** ranked by effectiveness:
   - Which target to attack and why
   - Which ability or attack to use
   - Where to move (and why that position is advantageous)
   - Include the reasoning (e.g., "The wizard has low HP and no allies adjacent — the goblin should dash to flank")
4. **Consider monster intelligence:**
   - Int 1-5: animalistic, attacks nearest target or most threatening
   - Int 6-9: basic tactics, focuses wounded targets, avoids obvious danger
   - Int 10+: smart tactics, targets casters, uses terrain, coordinates with allies
5. **Present to DM only** — output the tactical advice as regular text (it goes to the DM's terminal, not to players). **DO NOT call `send_response`**. After the DM decides, execute the chosen actions using combat tools (move_combatant, roll_dice, apply_damage, etc.) and THEN narrate the result via `send_response`.
6. **Use `action_ref` for structured monster attacks.** Pass `action_ref: { source: "monster", name: "<Monster Name>", monster_action_name: "<Action Name>" }` to `apply_damage` / `apply_area_effect` / `roll_dice` (save DC). ~59% of monster actions have structured data — when the DB has them, you save a parsing pass. For prose-only entries, fall back to explicit args.
