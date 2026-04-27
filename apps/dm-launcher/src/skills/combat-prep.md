---
description: "Mandatory combat setup BEFORE start_combat. Dispatches to the encounter-designer specialist which verifies every monster against the SRD database, validates difficulty, draws the battle map, and persists an Encounter Bundle (so combat-resolver doesn't re-look-up each turn). Returns a SHORT ENCOUNTER SUMMARY with the bundle slug. Use whenever combat is about to begin."
context: fork
agent: encounter-designer
user-invocable: false
---

Design an encounter for: $ARGUMENTS

See your specialist procedure.
