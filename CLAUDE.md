# Unseen Servant

## Project Overview

AI-powered D&D 5e web app where an AI acts as the Dungeon Master. Players create characters via the built-in character builder (powered by native 5e.tools data), join multiplayer rooms via WebSocket, and play through AI-generated campaigns. Claude Code acts as the AI DM via an MCP bridge that owns all game logic and connects to the game server as a participant.

**Notion GDD:** https://www.notion.so/309fc254bf8381c18e37c2b5ee4d8641

## Architecture

```
[Players' Browsers] ←WebSocket→ [Cloudflare Worker]     (pure multiplayer relay + auth)
                                       ↕ WebSocket (DM participant)
                                [MCP Bridge Server]      (game engine + state + D&D tools + campaigns)
                                  ↕ stdio MCP
                                [Claude Code]            (AI Dungeon Master)
```

**Key principle:** The MCP bridge owns ALL game logic (combat, dice, HP, conditions, spell slots, conversation history). The worker is a **pure multiplayer relay** — it forwards player actions to the bridge and broadcasts bridge responses to clients.

### Monorepo Structure (pnpm workspaces + Turborepo)

```
apps/web/          → Next.js 16.1 frontend (React 19, Tailwind CSS 4)
apps/worker/       → Cloudflare Worker (Durable Objects, KV) — pure multiplayer relay + auth
apps/mcp-bridge/   → Game engine: GameStateManager + MCP tools + WebSocket client
apps/dm-launcher/  → CLI to launch Claude Code as DM (writes .mcp.json, spawns claude)
packages/shared/   → Shared types (Zod 4 schemas), constants, utils, dice, check helpers, D&D 2024 database
```

### Tech Stack

- **Frontend:** Next.js 16.1, React 19, TypeScript 5.9, Tailwind CSS 4
- **Backend:** Cloudflare Workers + Durable Objects (stateful game rooms) + KV (room metadata)
- **Real-time:** Native WebSocket over Durable Objects (no Socket.io)
- **AI:** Claude Code via MCP bridge — no API keys needed, no SDK dependencies
- **MCP Bridge:** @modelcontextprotocol/sdk, ws (WebSocket client), tsx
- **Auth:** Google OAuth + JWT tokens + guest mode (sessionStorage guestId)
- **Validation:** Zod 4 for all WebSocket message schemas
- **Build:** Turbo, pnpm 10.4.1, Wrangler 4
- **Deploy:** Cloudflare Pages (web) + Cloudflare Workers (worker)

### Key Patterns

- **Discriminated unions** for all message types (ClientMessage/ServerMessage)
- **Event sourcing** for game state changes (GameEvent log)
- **CharacterData split:** `static` (from character builder) + `dynamic` (HP, spell slots, conditions — owned by our system)
- **Bridge-owned game state:** GameStateManager in the MCP bridge owns all game logic — combat, dice, HP, conditions, conversation history, game state sync
- **player_action/broadcast** WebSocket contract: worker forwards player actions to bridge as `server:player_action`, bridge processes and sends results back as `client:broadcast`
- **MCP tool-use** for game state mutation (damage, combat, spell slots), D&D reference (spells, monsters, conditions), dice rolling, campaign persistence
- **Campaign configuration** flow: host configures campaign (name, pacing, encounter length) before starting story via CampaignConfigModal
- **A1 coordinate notation** throughout: all tool inputs/outputs use A1 grid coordinates (formatGridPosition/parseGridPosition in shared/utils/grid.ts)
- **WebSocket Hibernation API** for Durable Objects (persistent connections survive hibernation)

## Dev Commands

```bash
pnpm dev:all        # Run both web (port 3000) and worker (port 8787)
pnpm dev:web        # Next.js dev server only (port 3000)
pnpm dev:worker     # Wrangler dev server only (port 8787)
pnpm dev:mcp        # Run MCP bridge (needs UNSEEN_ROOM_CODE env var)
pnpm build          # Build all packages
pnpm build:dm       # Build dm-launcher (production, points to unseenservant-api.safaakyuz.com)
pnpm dev:dm         # Build + launch DM pointed at localhost:8787
pnpm type-check     # TypeScript type checking
pnpm dead-code      # Run knip dead code detection
pnpm deploy         # Deploy all to Cloudflare
pnpm deploy:worker  # Deploy worker only
pnpm deploy:web     # Deploy web only
```

### Running a Game Session

1. `pnpm dev:all` — start web + worker
2. Create a room in the browser, note the room code
3. Set room code in `.mcp.json` → `UNSEEN_ROOM_CODE`
4. Claude Code connects via MCP, bridge joins the room as "DM"
5. Players join, host configures campaign (name, pacing, encounter length) via Campaign Config modal
6. Host clicks "Begin the Adventure"
7. Claude Code receives player messages via `wait_for_message`, responds via `send_response`

## Environment

- **Web dev:** http://localhost:3000
- **Worker dev:** http://localhost:8787
- **Production web:** https://unseenservant.safaakyuz.com
- **Production worker:** https://unseenservant-api.safaakyuz.com
- Worker env vars: `ENVIRONMENT`, `FRONTEND_URL`
- Secrets: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (set via `wrangler secret put`)
- Frontend env: `NEXT_PUBLIC_WORKER_URL` (defaults to http://localhost:8787)
- MCP Bridge env: `UNSEEN_ROOM_CODE` (required), `UNSEEN_WORKER_URL` (defaults to http://localhost:8787)

## Critical Files

### MCP Bridge (apps/mcp-bridge/src/)

- `index.ts` — Entry: starts WS client + MCP stdio server
- `mcp-server.ts` — MCP tool/resource registration
- `ws-client.ts` — WebSocket client to worker, owns GameStateManager, handles player_action dispatch + broadcast relay
- `message-queue.ts` — Async queue: WS pushes player messages, wait_for_message pops
- `services/game-state-manager.ts` — **Core game engine**: owns GameState, combat, dice, HP, conditions, spell slots, conversation history, check flow, battle map, rollback
- `services/campaign-manager.ts` — Campaign persistence: create/load/list campaigns, save/read files, session management, character snapshots
- `tools/game-tools.ts` — MCP tools: wait_for_message, send_response, get_players, get_game_state, get_character, apply_damage, heal, set_hp, add_condition, remove_condition, start_combat, end_combat, advance_turn, add_combatant, remove_combatant, move_combatant, use_spell_slot, restore_spell_slot, update_battle_map, add_item, update_item, remove_item, update_currency, grant_inspiration, use_inspiration, compact_history, get_combat_summary, get_map_info, show_aoe, apply_area_effect, dismiss_aoe
- `tools/dnd-tools.ts` — roll_dice (supports interactive player checks with targetCharacter)
- `tools/srd-tools.ts` — D&D 2024 database lookup tools: lookup_spell, lookup_monster, lookup_condition, lookup_magic_item, lookup_feat, lookup_class, lookup_species, lookup_background, search_rules
- `tools/campaign-tools.ts` — create_campaign, list_campaigns, load_campaign_context, save_campaign_file, read_campaign_file, list_campaign_files, end_session
- `types.ts` — Bridge message types, CampaignManifest, CampaignSummary

### DM Launcher (apps/dm-launcher/src/)

- `entry.ts` — npm bin entry point
- `cli.ts` — Spawns Claude Code with MCP config, writes DM_SYSTEM_PROMPT as CLAUDE.md
- `server.ts` — Express server for OAuth callback handling

### Backend (apps/worker/src/)

- `index.ts` — HTTP router + WebSocket upgrade endpoint
- `durable-objects/game-room.ts` — Pure multiplayer relay: forwards player_action to bridge, broadcasts bridge responses via client:broadcast
- `services/dice.ts` — Re-exports shared dice utils from `@unseen-servant/shared/utils`
- `auth/google.ts` — OAuth endpoints
- `auth/jwt.ts` — JWT signing/verification

### Frontend (apps/web/src/)

- `app/page.tsx` — Home: create/join room
- `app/rooms/[roomCode]/page.tsx` — Game room page (handles campaign config, DM config updates, character restoration)
- `hooks/useWebSocket.ts` — WebSocket lifecycle, reconnection, message validation
- `hooks/useAuth.ts` — Google OAuth flow
- `hooks/useCharacterImport.ts` — Character file import (.unseen.json)
- `components/chat/ChatPanel.tsx` — Main chat interface
- `components/character/CharacterSheet.tsx` — D&D character sheet display
- `components/character/LeftSidebar.tsx` — Left sidebar with character details
- `components/game/BattleMap.tsx` — Tactical grid combat map (CSS Grid, tokens, click-to-move)
- `components/game/InitiativeTracker.tsx` — Combat turn order
- `components/sidebar/Sidebar.tsx` — Right sidebar (room info, player list, campaign status, activity log)
- `components/sidebar/CampaignConfigModal.tsx` — Campaign configuration: new/existing campaign, pacing, encounter length, system prompt editor
- `components/sidebar/SystemPromptModal.tsx` — Standalone system prompt editor

### Shared (packages/shared/src/)

- `types/messages.ts` — ClientMessage/ServerMessage unions (WebSocket protocol) — includes player_action, broadcast, campaign config messages
- `types/character.ts` — CharacterData, CharacterStaticData, CharacterDynamicData
- `types/game-state.ts` — GameState, CombatState, GameEvent, EncounterState, CampaignJournal, MapTile (with TileObject, cover, elevation), AoEOverlay
- `types/ai-actions.ts` — AI parsed action types
- `schemas/messages.ts` — Zod schemas for runtime message validation
- `constants.ts` — DM_SYSTEM_PROMPT (single source of truth), room limits, token limits
- `utils/dice.ts` — Shared dice rolling (rollDie, rollDice, rollCheck, rollInitiative, rollDamage)
- `utils/check-helpers.ts` — Check modifier computation, label building from character sheets
- `data/index.ts` — D&D 2024 database: type-safe lookup maps + helpers (getSpell, getMonster, getClass, getClassSpellSlots, getCasterMultiplier, etc.)
- `data/types.ts` — Database types (SpellData, MonsterData, ClassData, etc.)
- `data/*.json` — Generated database files (490 spells, 580 monsters, 12 classes, 103 feats, 563 magic items, etc.)

## MCP Tools (exposed to Claude Code)

### Game Communication

| Tool               | Description                                                                                                                       |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| `wait_for_message` | Blocks until a player message arrives. Returns `{ requestId, systemPrompt, messages }`. Main loop driver.                         |
| `acknowledge`      | Silently observe a player message without responding. Use when players are talking to each other or roleplaying among themselves. |
| `send_response`    | Sends DM narrative back, stores in conversation history, broadcasts to all players.                                               |
| `get_players`      | Returns current player list with character summaries.                                                                             |
| `get_game_state`   | Full game state snapshot (combat, encounter, checks, events, characters).                                                         |
| `get_character`    | Specific character's full data (static + dynamic) by name.                                                                        |

### HP & Conditions

| Tool               | Description                                                        |
| ------------------ | ------------------------------------------------------------------ |
| `apply_damage`     | Deal damage to a character/combatant (handles temp HP absorption). |
| `heal`             | Restore HP (capped at max).                                        |
| `set_hp`           | Set exact HP value.                                                |
| `add_condition`    | Add condition (poisoned, stunned, etc.) with optional duration.    |
| `remove_condition` | Remove a condition.                                                |

### Combat Management

| Tool               | Description                                                 |
| ------------------ | ----------------------------------------------------------- |
| `start_combat`     | Initialize combat, auto-roll initiative, create turn order. |
| `end_combat`       | End combat, return to exploration phase.                    |
| `advance_turn`     | Next combatant's turn, increment round counter.             |
| `add_combatant`    | Add mid-fight reinforcements.                               |
| `remove_combatant` | Remove dead/fled/dismissed combatant.                       |
| `move_combatant`   | Move token on battle map (accepts A1 notation).             |

### Tactical Query

| Tool                 | Description                                                                                 |
| -------------------- | ------------------------------------------------------------------------------------------- |
| `get_combat_summary` | Compact combat summary (~200 tokens): turn order, HP, conditions, distances, active AoE.    |
| `get_map_info`       | Compact map summary of non-floor tiles with objects, cover, elevation. Optional area query. |

### Area of Effect

| Tool                | Description                                                                                 |
| ------------------- | ------------------------------------------------------------------------------------------- |
| `show_aoe`          | Place AoE overlay on map (shape, center in A1, radius, color). Returns affected combatants. |
| `apply_area_effect` | Apply damage to all combatants in area with saving throws. Use after show_aoe confirmation. |
| `dismiss_aoe`       | Remove a persistent AoE overlay (Wall of Fire, Fog Cloud, etc.).                            |

### Spell Slots

| Tool                 | Description                                         |
| -------------------- | --------------------------------------------------- |
| `use_spell_slot`     | Expend a spell slot at a given level.               |
| `restore_spell_slot` | Restore a slot (short rest, Arcane Recovery, etc.). |

### Heroic Inspiration

| Tool                | Description                                                         |
| ------------------- | ------------------------------------------------------------------- |
| `grant_inspiration` | Grant Heroic Inspiration to a character (binary flag).              |
| `use_inspiration`   | Spend a character's Heroic Inspiration for advantage on a d20 roll. |

### Battle Map

| Tool                | Description                                                                            |
| ------------------- | -------------------------------------------------------------------------------------- |
| `update_battle_map` | Set/update grid with dimensions, rich terrain tiles (objects, cover, elevation), name. |

### Inventory & Currency

| Tool              | Description                                                                     |
| ----------------- | ------------------------------------------------------------------------------- |
| `add_item`        | Add an item to a character's inventory (stacks if exists).                      |
| `update_item`     | Modify an existing item — equip/unequip, attune, change quantity, update stats. |
| `remove_item`     | Remove an item from inventory (decrement or remove entirely).                   |
| `update_currency` | Add or subtract currency (positive adds, negative subtracts).                   |

### Class Resources

| Tool                     | Description                                                                                    |
| ------------------------ | ---------------------------------------------------------------------------------------------- |
| `use_class_resource`     | Expend a use of a class resource (Bardic Inspiration, Channel Divinity, Rage, Ki Points, etc.) |
| `restore_class_resource` | Restore uses of a class resource (e.g., after rest). Use amount=999 to fully restore.          |

### D&D Reference (Unified 2024 Database)

| Tool                | Description                                                                                                                    |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `lookup_spell`      | Look up spell details from D&D 2024 database (490 spells).                                                                     |
| `lookup_monster`    | Look up monster stat block from D&D 2024 database (580 monsters).                                                              |
| `lookup_condition`  | Look up condition effects from D&D 2024 database (15 conditions).                                                              |
| `lookup_magic_item` | Look up a magic item from D&D 2024 database (563 items).                                                                       |
| `lookup_feat`       | Look up a feat from D&D 2024 database (103 feats).                                                                             |
| `lookup_class`      | Look up class details from D&D 2024 database (12 classes with subclasses).                                                     |
| `lookup_species`    | Look up species from D&D 2024 database (28 species).                                                                           |
| `lookup_background` | Look up background from D&D 2024 database (27 backgrounds).                                                                    |
| `search_rules`      | Search across all D&D data categories by keyword.                                                                              |
| `roll_dice`         | Roll dice — direct DM rolls (notation only) or interactive player checks (with targetCharacter, checkType, ability, skill, dc) |

### Campaign Persistence

| Tool                    | Description                                                                                         |
| ----------------------- | --------------------------------------------------------------------------------------------------- |
| `create_campaign`       | Create a new campaign directory with manifest                                                       |
| `list_campaigns`        | List all campaigns with metadata                                                                    |
| `load_campaign_context` | Load full campaign context (manifest + system prompt + active context + session notes + characters) |
| `save_campaign_file`    | Save/update a campaign file (notes, context, characters)                                            |
| `read_campaign_file`    | Read a specific campaign file                                                                       |
| `list_campaign_files`   | List all files in current campaign                                                                  |
| `end_session`           | End session workflow (save summary, update context, snapshot characters, increment count)           |

## WebSocket Protocol

- **Client→Server (browser):** chat, join, set_character, start_story, roll_dice, combat_action, move_token, end_turn, rollback, set_system_prompt, set_pacing, dm_override, set_password, kick_player, destroy_room, configure_campaign
- **Client→Server (bridge):** broadcast, dm_response, campaign_loaded, campaign_configured_ack, action_result
- **Server→Client:** chat, ai, system, error, room_joined, player_joined, player_left, character_updated, check_request, check_result, dice_roll, combat_update, game_state_sync, rollback, event_log, dm_config_update, campaign_loaded, campaign_configured, player_action, dm_roll_request, room_destroyed

## Message Flow (per DM turn)

1. Player types message → WebSocket → Worker broadcasts chat to all + forwards as `server:player_action` to bridge
2. Bridge's GameStateManager processes the action (adds to conversation history, creates dm_request)
3. Message queue resolves `wait_for_message` → Claude Code receives `{ requestId, systemPrompt, messages }`
4. Claude Code thinks, optionally calls MCP tools (`roll_dice`, `apply_damage`, `start_combat`, etc.)
5. Claude Code calls `send_response({ requestId, text: "The dragon..." })`
6. Bridge stores response in conversation history, sends `client:broadcast` with `server:ai` payload
7. Worker receives `client:broadcast` → relays AI narrative to all players

## GDD Progress (Phase Completion)

- Phase 1 (Foundation): COMPLETE — multiplayer chat, multi-provider AI, OAuth, reconnection
- Phase 2 (Character Integration): COMPLETE — character builder, character sheet, party list, native 5e.tools database
- Phase 3 (Game State & Rules): COMPLETE — dice, spell tracking, HP, state resolver, initiative, skill check flow, event log with rollback, editable system prompt
- Phase 4 (Battle Map): COMPLETE — CSS Grid map renderer, token placement, click-to-move with BFS range highlighting, conditions on tokens, InitiativeTracker integration. Architecture migration: extension → MCP bridge, worker → pure relay
- Phase 5 (Campaign Persistence): IN PROGRESS — campaign config UI (CampaignConfigModal), local file persistence (.unseen/campaigns/), campaign manifest with session tracking, character snapshots, system prompt persistence. D1 database NOT YET started
- Phase 6 (Polish): NOT STARTED

## Testing

- **Automated tests** (Playwright) live in `tests/` and `playwright.config.ts` at the repo root — these are committed to the repo.
- **Temporary test artifacts** (snapshots, reports, screenshots) go in `.testing/` which is gitignored. Always place disposable/generated test-related files here so they stay out of git.
- `pnpm test` — starts dev servers, runs all tests, then stops servers
- `pnpm test:ui` — opens Playwright UI runner (servers must be running)

## Coding Conventions

- TypeScript strict mode everywhere
- ESM modules (type: "module" in worker and mcp-bridge)
- No external LLM SDKs — AI runs through Claude Code MCP
- Zod 4 for all runtime validation
- Tailwind CSS 4 for styling (no CSS modules)
- React 19 patterns (use client directive, hooks)
- pnpm workspace protocol for internal deps (`workspace:*`)
