---
description: "Get a cited ruling on an ambiguous D&D rule, spell interaction, or mechanics question. Dispatches to the rules-advisor specialist which halts on unknown references rather than inventing rules. Use whenever mechanics are unclear or a player invokes an unusual interaction."
context: fork
agent: rules-advisor
user-invocable: true
---

Produce a cited ruling on the following question.

Question: $ARGUMENTS

Follow the rules-advisor procedure:

1. Identify every rule, spell, condition, feature, or item referenced in the question.
2. Call `lookup_rule` on each reference. If any fails, halt and return `RULING: UNABLE` with the unknown references.
3. If all lookups succeed, return a RULING with Answer, Reasoning, Citations (with exact quotes), and Caveats.

Your output goes to the conductor. The conductor will relay the answer to the player(s) in DM voice with entity tags.
