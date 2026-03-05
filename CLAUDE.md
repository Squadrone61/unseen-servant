# AI Dungeon Master (AIDND)

## Project Overview
AI-powered D&D 5e web app where an AI acts as the Dungeon Master. Players import D&D Beyond characters, join multiplayer rooms via WebSocket, and play through AI-generated campaigns. Claude Code acts as the AI DM via an MCP bridge that connects directly to the game server.

**Notion GDD:** https://www.notion.so/309fc254bf8381c18e37c2b5ee4d8641

## Architecture

```
[Players' Browsers] ←WebSocket→ [Cloudflare Worker]  (multiplayer relay + rooms + auth)
                                       ↕ WebSocket (DM participant)
                                [MCP Bridge Server]  (game engine + D&D tools + campaign docs)
                                    ↕ stdio MCP
                                [Claude Code]  (AI Dungeon Master)
```

### Monorepo Structure (pnpm workspaces + Turborepo)
```
apps/web/        → Next.js 16.1 frontend (React 19, Tailwind CSS 4)
apps/worker/     → Cloudflare Worker backend (Durable Objects, KV) — thin multiplayer relay
apps/mcp-bridge/ → MCP server: WebSocket client to worker + D&D tools + campaign notes
apps/extension/  → Chrome extension (minimal — no longer in AI path)
packages/shared/ → Shared types (Zod 4 schemas), constants, utils
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
- **CharacterData split:** `static` (from D&D Beyond import) + `dynamic` (HP, spell slots, conditions — owned by our system)
- **MCP tool-use** for D&D reference (spells, monsters, conditions), dice rolling, campaign notes
- **dm_request/dm_response** WebSocket contract: worker sends requests to DM bridge participant, awaits response
- **WebSocket Hibernation API** for Durable Objects (persistent connections survive hibernation)

## Dev Commands
```bash
pnpm dev:all        # Run both web (port 3000) and worker (port 8787)
pnpm dev:web        # Next.js dev server only (port 3000)
pnpm dev:worker     # Wrangler dev server only (port 8787)
pnpm dev:mcp        # Run MCP bridge (needs AIDND_ROOM_CODE env var)
pnpm build          # Build all packages
pnpm type-check     # TypeScript type checking
pnpm deploy         # Deploy all to Cloudflare
pnpm deploy:worker  # Deploy worker only
pnpm deploy:web     # Deploy web only
```

### Running a Game Session
1. `pnpm dev:all` — start web + worker
2. Create a room in the browser, note the room code
3. Set room code in `.mcp.json` → `AIDND_ROOM_CODE`
4. Claude Code connects via MCP, bridge joins the room as "DM"
5. Players join, host clicks "Begin the Adventure"
6. Claude Code receives dm_requests via `wait_for_message`, responds via `send_response`

## Environment
- **Web dev:** http://localhost:3000
- **Worker dev:** http://localhost:8787
- **Production web:** https://aidnd-web.safats61.workers.dev
- **Production worker:** deployed as `aidnd-worker`
- Worker env vars: `ENVIRONMENT`, `FRONTEND_URL`
- Secrets: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (set via `wrangler secret put`)
- Frontend env: `NEXT_PUBLIC_WORKER_URL` (defaults to http://localhost:8787)
- MCP Bridge env: `AIDND_ROOM_CODE` (required), `AIDND_WORKER_URL` (defaults to http://localhost:8787)

## Critical Files

### MCP Bridge (apps/mcp-bridge/src/)
- `index.ts` — Entry: starts WS client + MCP stdio server
- `mcp-server.ts` — MCP tool/resource registration
- `ws-client.ts` — WebSocket client to worker (joins room as DM participant)
- `message-queue.ts` — Async queue: WS pushes dm_requests, wait_for_message pops
- `tools/game-tools.ts` — wait_for_message, send_response, get_players
- `tools/dnd-tools.ts` — lookup_spell, lookup_monster, lookup_condition, roll_dice
- `tools/campaign-tools.ts` — save_campaign_note, read_campaign_note, list_campaign_notes
- `services/dnd-api.ts` — D&D 5e SRD API client (in-memory cache)
- `types.ts` — Bridge message types

### Backend (apps/worker/src/)
- `index.ts` — HTTP router + WebSocket upgrade endpoint
- `durable-objects/game-room.ts` — Multiplayer state, dm_request/dm_response relay, dice, combat
- `services/dice.ts` — D&D dice rolling (d20, advantage/disadvantage, etc.)
- `auth/google.ts` — OAuth endpoints
- `auth/jwt.ts` — JWT signing/verification

### Frontend (apps/web/src/)
- `app/page.tsx` — Home: create/join room
- `app/rooms/[roomCode]/page.tsx` — Game room page
- `hooks/useWebSocket.ts` — WebSocket lifecycle, reconnection, message validation
- `hooks/useAuth.ts` — Google OAuth flow
- `hooks/useCharacterImport.ts` — D&D Beyond character import
- `components/chat/ChatPanel.tsx` — Main chat interface
- `components/character/CharacterSheet.tsx` — D&D character sheet display
- `components/character/LeftSidebar.tsx` — Left sidebar with character details
- `components/game/BattleMap.tsx` — Tactical grid combat map (CSS Grid, tokens, click-to-move)
- `components/game/InitiativeTracker.tsx` — Combat turn order
- `components/sidebar/Sidebar.tsx` — Right sidebar (room info, player list, activity log)

### Shared (packages/shared/src/)
- `types/messages.ts` — ClientMessage/ServerMessage unions (WebSocket protocol)
- `types/character.ts` — CharacterData, CharacterStaticData, CharacterDynamicData
- `types/game-state.ts` — GameState, CombatState, GameEvent
- `types/ai-actions.ts` — AI parsed action types
- `schemas/messages.ts` — Zod schemas for runtime message validation
- `constants.ts` — AI_PROVIDERS registry, room limits, token limits

## MCP Tools (exposed to Claude Code)

### Game Communication
| Tool | Description |
|------|-------------|
| `wait_for_message` | Blocks until a player message/dm_request arrives. Returns `{ requestId, systemPrompt, messages }`. Main loop driver. |
| `send_response` | Sends DM narrative back via WebSocket as `client:dm_response`. |
| `get_players` | Returns current player list with character summaries. |

### D&D Reference
| Tool | Description |
|------|-------------|
| `lookup_spell` | Look up spell details from D&D 5e SRD API |
| `lookup_monster` | Look up monster stats |
| `lookup_condition` | Look up condition effects |
| `roll_dice` | Roll dice (e.g., "2d6+3", "d20 advantage") |

### Campaign Documentation
| Tool | Description |
|------|-------------|
| `save_campaign_note` | Save/update a campaign note (stored in `.aidnd/campaigns/{roomCode}/`) |
| `read_campaign_note` | Read a specific note |
| `list_campaign_notes` | List all notes for current campaign |

## WebSocket Protocol
- **Client→Server:** chat, join, dm_response, dm_config, set_character, start_story, roll_dice, combat_action, move_token, end_turn, rollback, set_system_prompt, set_pacing, dm_override, set_password, kick_player, destroy_room
- **Server→Client:** chat, ai, system, error, room_joined, player_joined, player_left, character_updated, check_request, check_result, dice_roll, combat_update, game_state_sync, rollback, event_log, dm_request, room_destroyed

## Message Flow (per DM turn)
1. Player types message → WebSocket → Worker broadcasts to all room participants
2. Worker sends `server:dm_request` to DM participant (MCP bridge)
3. MCP bridge ws-client receives dm_request → pushes to message-queue
4. message-queue resolves `wait_for_message` → Claude Code receives `{ requestId, systemPrompt, messages }`
5. Claude Code thinks, optionally calls `lookup_spell` / `roll_dice` / etc.
6. Claude Code calls `send_response({ requestId, text: "The dragon..." })`
7. MCP bridge ws-client sends `client:dm_response` via WebSocket
8. Worker receives dm_response → broadcasts AI narrative to all players

## GDD Progress (Phase Completion)
- Phase 1 (Foundation): COMPLETE — multiplayer chat, multi-provider AI, OAuth, reconnection
- Phase 2 (Character Integration): COMPLETE — D&D Beyond import, character sheet, party list
- Phase 3 (Game State & Rules): COMPLETE — dice, spell tracking, HP, state resolver, initiative, skill check flow, event log with rollback, editable system prompt
- Phase 4 (Battle Map): COMPLETE — CSS Grid map renderer, token placement, click-to-move with BFS range highlighting, conditions on tokens, InitiativeTracker integration
- Phase 5 (Campaign Persistence): NOT STARTED (D1 database)
- Phase 6 (Polish): NOT STARTED

## Testing
- **Automated tests** (Playwright) live in `tests/` and `playwright.config.ts` at the repo root — these are committed to the repo.
- **Temporary test artifacts** (snapshots, reports, screenshots, DDB JSON dumps) go in `.testing/` which is gitignored. Always place disposable/generated test-related files here so they stay out of git.
- `pnpm test` — starts dev servers, runs all tests, then stops servers
- `pnpm test:only` — runs tests without starting servers (use when `pnpm dev:all` is already running)
- `pnpm test:ui` — opens Playwright UI runner (servers must be running)

## Coding Conventions
- TypeScript strict mode everywhere
- ESM modules (type: "module" in worker and mcp-bridge)
- No external LLM SDKs — AI runs through Claude Code MCP
- Zod 4 for all runtime validation
- Tailwind CSS 4 for styling (no CSS modules)
- React 19 patterns (use client directive, hooks)
- pnpm workspace protocol for internal deps (`workspace:*`)
