---
description: "Design a puzzle or riddle with description, 3-tier hints, solution, and mechanical resolution. Dispatches to the scene-builder specialist which persists to dm/puzzles/. The DM-only solution stays private; hints escalate as players struggle."
context: fork
agent: scene-builder
user-invocable: true
---

Design a puzzle for the following situation.

Context: $ARGUMENTS

Follow the scene-builder procedure (puzzle variant):

1. Decide the puzzle type (mechanical / verbal / spatial / magical).
2. Write what players SEE (narration-ready description).
3. Write the solution (DM-only).
4. Draft 3 hints in escalating order — subtle, clearer, obvious.
5. Define the mechanical resolution (ability check DCs, reward for solving, consequence for failure).
6. Save to `dm/puzzles/<slug>.md`.

Return a short summary with the puzzle's description, solution, and when/how to drip the hints.
