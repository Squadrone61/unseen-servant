---
description: "D&D 2024 rules enforcement: mandatory spell/monster/condition lookups, dice rolling protocol, advantage/disadvantage, rests, milestone leveling."
user-invocable: false
---

## D&D 2024 Rules Enforcement (SRD 5.2)

All rules lookups use the **2024 D&D rules (SRD 5.2)**, not the 2014 edition.

### Lookup Before Resolve (MANDATORY)

- BEFORE resolving any spell: call `lookup_rule(query="...", category="spell")` to get exact 2024 effects, range, duration, components
- BEFORE any enemy acts: call `lookup_rule(query="...", category="monster")` to get accurate 2024 stats (if not already looked up this combat)
- BEFORE applying any condition: call `lookup_rule(query="...", category="condition")` to get exact 2024 mechanical effects
- For magic items: call `lookup_rule(query="...", category="magic_item")` to get rarity, attunement, and effects
- For feats: call `lookup_rule(query="...", category="feat")` to get prerequisites and effects
- For game actions (Attack, Dash, Dodge, Grapple, Shove): call `lookup_rule(query="...", category="action")` for exact 2024 rules
- For optional class features (Invocations, Maneuvers, Metamagic): call `lookup_rule(query="...", category="optional_feature")`
- For species traits: call `lookup_rule(query="...", category="species")`; for backgrounds: call `lookup_rule(query="...", category="background")`
- For languages: call `lookup_rule(query="...", category="language")`; for diseases: call `lookup_rule(query="...", category="disease")`
- For general rules questions (combat mechanics, class features, gameplay): call `lookup_rule(query="...")` with a keyword query and no category
  NEVER guess spell effects, monster stats, or condition rules. ALWAYS look them up.
- If a lookup returns "not found", the entry is not in the SRD — tell players you're using general knowledge and the activity log will show a notice

### Dice Rolling

- ALL rolls go through `roll_dice` so players see them in chat — never narrate a roll without actually rolling
- **NEVER type "roll a d20" / "roll initiative" / "roll a death save" / "roll X" in prose.** Every player-side roll MUST be an interactive `roll_dice` call with `player` set — the player sees a Roll button. Prose roll requests are broken — the player can't respond to them and the system can't capture the result
- `checkType` auto-computes modifiers from the character sheet. Valid values:
  - **Skills:** perception, stealth, athletics, acrobatics, arcana, deception, history, insight, intimidation, investigation, medicine, nature, performance, persuasion, religion, sleight_of_hand, animal_handling, survival
  - **Abilities:** strength, dexterity, constitution, intelligence, wisdom, charisma
  - **Saves:** strength_save, dexterity_save, constitution_save, intelligence_save, wisdom_save, charisma_save
  - **Attacks:** melee_attack (STR + prof), ranged_attack (DEX + prof), spell_attack (spell bonus), finesse_attack (max(STR,DEX) + prof)
  - **Other:** damage, custom (modifier not auto-computed — include in notation)
- For monster/NPC rolls, omit `player` — the DM rolls server-side
- For player rolls, include `player` (character name) so the player rolls interactively on their client

### Key Rules Reminders

- **Advantage/disadvantage** never stack — multiple sources of advantage still = one extra d20. Advantage and disadvantage cancel each other out regardless of how many sources of each.
- **Concentration** — a caster can only concentrate on one spell at a time. Casting a new concentration spell ends the previous one.
- **Short rest healing uses Hit Dice (class-specific), NOT d20.** d6 (Sorcerer/Wizard), d8 (Bard/Cleric/Druid/Monk/Rogue/Warlock), d10 (Fighter/Paladin/Ranger), d12 (Barbarian). Each die + Con modifier.

### Mechanical Tracking (STRICT)

- ALWAYS use tools to modify HP, spell slots, conditions, inventory, and currency — don't just narrate changes.
- Use `use_spell_slot` every time a player casts a leveled spell.
- Use `add_item` immediately when a character receives, finds, or buys an item — don't wait for the player to ask.
- Use `update_item` when an item's properties change (awakened, attuned, damaged, etc.).
- Use `remove_item` when an item is given away, consumed, or destroyed.
- Use `add_condition` to apply conditions (poisoned, stunned, prone, etc.) — creates an effect bundle with mechanical effects. Use `remove_condition` to clear them.
- Use `set_hp` to set a character's HP to an exact value (e.g., after a complex effect that isn't simple damage or healing).
- Use `set_temp_hp` when a spell or ability grants temporary HP (Heroism, Dark One's Blessing). Temp HP doesn't stack — takes the higher value.
- Use `update_currency` when players earn, spend, or trade gold. Positive adds, negative subtracts. Auto-converts from higher denominations when spending.
- Use `restore_spell_slot` when a slot is recovered outside of a rest (Arcane Recovery, Font of Magic).
- Use `restore_class_resource` when a resource is restored outside of a rest. Use amount=999 to fully restore.
- Use `grant_inspiration` for exceptional roleplay or creative problem-solving. Use `use_inspiration` when a player spends it for advantage on a d20 roll.
- Use `get_character` to check a specific character's full data (stats, HP, spell slots, conditions, inventory) when you need details beyond `get_players`.
- Call for ability checks when outcomes are uncertain (describe the DC reasoning).

### Effect System

- **Prefer `action_ref` over explicit dice.** When a spell/weapon/monster action has structured DB data, pass `action_ref: { source: "spell"|"weapon"|"item"|"monster", name, monster_action_name? }` to `apply_damage`, `apply_area_effect`, `show_aoe`, and `roll_dice` (for `*_save` checks). The tool pulls damage dice, damage type, save ability, save DC, area shape/size, and onSuccess semantics from the DB. Explicit args still work as a fallback for prose-only monster entries.
- **Outcome branches.** `apply_damage` with `action_ref` takes `outcome_branch`: `"onHit"` for attack-roll hits, `"onFailedSave"` for save-based on fails, `"onSuccessfulSave"` when the spell deals half on success. `apply_area_effect` handles branch selection internally per target.
- **Damage types matter.** Always include `damage_type` when calling `apply_damage` without `action_ref` — resistance, immunity, and vulnerability are applied automatically from active effects. Don't manually halve or double damage.
- **Feature activation.** When a class feature with mechanical effects is used (Rage, Bladesong, Wild Shape), call `activate_feature` to apply its bonuses. Pair with `use_class_resource` if it costs a resource. Call `deactivate_feature` when it ends.
- **Concentration vs features.** `set_concentration` is for concentration spells (broken by damage/new spell). `activate_feature` is for class features (manual deactivation).
- **Advantage/disadvantage hints.** When `roll_dice` is called with `checkType` + `player`, it checks active effects and returns hints (e.g., "Advantage on STR checks from Rage"). Use these to decide advantage/disadvantage.
- **Exhaustion.** Use `set_exhaustion` when exhaustion is imposed (forced march, certain abilities). PHB 2024: -2 to all d20 rolls per level, level 10 = death.

### Milestone Leveling

- Award milestone level-ups at story-appropriate moments (major quest completion, boss defeat, new chapter)
- Announce dramatically, then remind players to update their character sheet to apply the new level.
- Use `lookup_rule(query="...", category="class")` to summarize what each character gains at the next level.

### Rests

- **Short rest**: Call `short_rest` with resting characters — restores short-rest class resources and Warlock pact slots. Then ask players if they want to spend Hit Dice for healing — roll interactively with `roll_dice({ player: "CharName", checkType: "custom", notation: "XdY+Z", reason: "Hit Dice healing" })` where XdY is the character's Hit Die (d6 Sorcerer/Wizard, d8 Bard/Cleric/Druid/Monk/Rogue/Warlock, d10 Fighter/Paladin/Ranger, d12 Barbarian) and Z is their Con modifier — use `get_character` to check if unsure. Apply with `heal`. Narrate the break.
- **Long rest**: Optionally check for random encounters first. Call `long_rest` with all characters — restores full HP, all spell slots, all class resources, clears conditions, resets death saves. Narrate night passage and dawn.
