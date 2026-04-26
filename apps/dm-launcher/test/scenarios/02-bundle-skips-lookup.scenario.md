---
fixture: goblin-ambush-with-bundle
player_name: Theron
player_message: "We're in combat already — initiative is rolled, Grixx is up first. What does the goblin boss do on his turn?"
skills: [combat, combat-turn, combat-prep, rules]
rules: [lookup-before-narrate, player-identity, response-vs-acknowledge, skills-routing]
agents: [combat-resolver]
model: sonnet
timeoutSec: 180
---

# Bundle Skips Per-Turn Lookup

Combat is in progress, round 1. **Grixx (Goblin Boss)** has the active turn.
Theron's player nudges the DM to run the NPC turn.

The campaign already has a saved EncounterBundle (`goblin-ambush-river-a3f`)
with both goblins' stats + abilities pre-resolved by encounter-designer at
combat-prep time. The conductor should — directly, or by dispatching
`/combat-turn Grixx` to the combat-resolver — read the bundle and run the turn
**without** calling `lookup_rule` for any of Grixx or Sneak's abilities.

This validates the encounter-bundle contract from `plans/encounter-bundle.md`:

> The bundle is the contract that lets combat-resolver run each turn without
> re-looking-up every monster ability — your verified-once data flows directly
> into the resolver's per-turn read.

## What we're testing

1. **Bundle is reachable.** `get_combat_summary` returns the slug
   `goblin-ambush-river-a3f`, and `load_encounter_bundle` resolves it from
   `dm/encounters/<slug>.json`.
2. **No per-turn lookup_rule churn.** The bundle covers Multiattack, Redirect
   Attack, and Shortbow. The resolver must not re-verify them.
3. **The NPC turn still resolves.** Grixx's mechanical turn happens —
   `apply_damage` and/or `advance_turn` get called and the conductor narrates
   the action. The bundle contract isn't useful if it makes the turn fail.

## Assertions

```yaml
must_call: [load_encounter_bundle, roll_dice]
must_not_call: [lookup_rule]
must_close_turn: false
```

The crucial assertion is `must_not_call: [lookup_rule]`. If the resolver (or
conductor in fallback mode) fires a single `lookup_rule` call for Multiattack,
Redirect Attack, Shortbow, or "goblin", the bundle was wasted and we're back
to the per-turn lookup churn the bundle plan was meant to eliminate.

`load_encounter_bundle` proves the bundle was actually read; `roll_dice`
proves the resolver path engaged with the turn (it didn't just inspect-and-
exit). Both together rule out a vacuous pass where the conductor never
attempted to resolve the NPC turn at all.

We do **not** assert `must_close_turn` here — `claude -p` print mode varies
in whether it calls a final `send_response` after a full multi-tool resolver
flow. The bundle contract is testable independently of the turn-closure
contract; the latter is exercised by simpler scenarios like `01-spell-not-on-sheet`.
Combat mechanics (HP/conditions/turn order) are exercised by mcp-bridge unit
tests.
