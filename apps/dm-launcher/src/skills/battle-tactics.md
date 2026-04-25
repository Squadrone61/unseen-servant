---
description: "Tactical advice for a monster turn WITHOUT executing. Dispatches to combat-resolver in advisory mode — returns 2-3 ranked tactical options you choose between before dispatching /combat-turn to execute. Useful when you want to see options before committing."
context: fork
agent: combat-resolver
user-invocable: false
---

Advise tactics for the following combatant. **Do NOT produce a full TURN PLAN.** Stop after step 4 of your procedure (picking a tactic) and return options only.

Combatant: $ARGUMENTS[0]

Return format:

```
TACTICS ADVICE — <combatant>

Current situation:
<2-3 lines summarizing state from get_combat_summary + get_map_info>

Options (ranked best to worst):

1. <Tactic name>: <one-sentence description>
   - Target: <who>
   - Why: <reasoning>
   - Risk: <downside>

2. <Tactic name>: ...

3. <Tactic name>: ...

Recommended: #<N> because <short reason>

Citations:
- lookup_rule("<monster>", monster) → key abilities
- get_combat_summary → <relevant state>
```

Do NOT roll dice. Do NOT return MUTATIONS. The conductor will pick one and either dispatch `/combat-turn` for full execution or apply the tactic directly.
