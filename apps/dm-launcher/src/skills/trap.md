---
description: "Design a trap: detection, disarm, trigger, damage, hints"
user-invocable: false
---

# /trap

Design a trap based on the user's description:

1. **Detection** — Perception or Investigation DC to notice the trap (passive or active)
2. **Disarm** — Thieves' Tools, Arcana, or other skill DC to disarm
3. **Trigger** — what sets it off (pressure plate, tripwire, proximity, opening a container)
4. **Effect** — damage dice and type, or condition (poison, restrained, etc.), save DC
5. **Hints** — subtle clues for observant players (scuff marks, faint clicking, discolored stone)
6. **Place it** — note the trap location and status in your DM planning. Save to `dm/` notes via `save_campaign_file` if it's part of a planned dungeon.
7. **During play** — when players encounter the trap, describe ONLY observable clues via `send_response`. Call for Perception/Investigation checks with `roll_dice`. If triggered, roll damage/saves and apply with `apply_damage`/`add_condition`.

Do NOT reveal trap details to players — only describe what they can observe.
Present the trap design to the DM operator only.

Example usage: `/trap poison dart trap in a tomb corridor, party level 5`
