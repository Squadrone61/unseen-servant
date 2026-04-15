---
description: "Design a puzzle: description, hints, solution, resolution"
user-invocable: false
---

# /puzzle

Design a puzzle for the party:

1. **Description** — what the players see (inscriptions, mechanisms, magical effects, physical layout)
2. **Hint system** (3 tiers):
   - **Subtle**: environmental clue players might notice on their own
   - **Moderate**: available with a successful Investigation/Arcana check (DC 12-15)
   - **Direct**: given if the party is stuck for too long — nearly gives the answer
3. **Solution** — the correct sequence, answer, or action
4. **Mechanical resolution** — what checks help (Investigation, Arcana, History, Perception), DCs, and what info each reveals
5. **Reward** — what solving the puzzle grants (passage, treasure, lore, shortcut)
6. **During play** — describe the initial scene via `send_response`. As players attempt solutions, call for relevant checks with `roll_dice`, reveal hints based on the tier system, and narrate outcomes. When solved, deliver rewards narratively and mechanically (`add_item`, etc.).

Present the puzzle design to the DM operator. When players encounter it in play, describe only what they observe and respond to their attempts.

Example usage: `/puzzle ancient dwarven door with rune-based lock, party level 7`
