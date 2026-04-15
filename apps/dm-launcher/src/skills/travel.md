---
description: "Overland travel: pace, distance, encounters, weather, time passage"
user-invocable: false
---

# /travel

Process overland travel to a destination:

1. **Determine travel pace** — ask the party or infer:
   - **Fast** (30 miles/day): -5 to passive Perception, no stealth possible
   - **Normal** (24 miles/day): standard travel
   - **Slow** (18 miles/day): able to use stealth, +5 to passive Perception for noticing threats
2. **Calculate time** — distance / daily pace = travel days
3. **Random encounters** — roll for each travel day/segment if appropriate for the region (d20, encounter on 18+, adjust frequency by danger level)
4. **Weather** — describe weather briefly for flavor (sun, rain, fog, snow)
5. **Narrate the journey** — send_response with travel montage: landscapes, weather, camp scenes, arrival
6. **Note the destination** — if it's a new location, save to campaign notes via save_campaign_file

Example usage: `/travel 3-day journey through the Misty Mountains to Rivendell`
