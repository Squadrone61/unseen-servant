# AI Dungeon Master (AIDND)

## Project Overview
AI-powered D&D 5e web app where an AI acts as the Dungeon Master. Players import D&D Beyond characters, join multiplayer rooms via WebSocket, and play through AI-generated campaigns. Host provides their own API key (BYOK model).

**Notion GDD:** https://www.notion.so/309fc254bf8381c18e37c2b5ee4d8641

## Architecture

### Monorepo Structure (pnpm workspaces + Turborepo)
```
apps/web/        → Next.js 16.1 frontend (React 19, Tailwind CSS 4)
apps/worker/     → Cloudflare Worker backend (Durable Objects, KV)
packages/shared/ → Shared types (Zod 4 schemas), constants, utils
```

### Tech Stack
- **Frontend:** Next.js 16.1, React 19, TypeScript 5.9, Tailwind CSS 4
- **Backend:** Cloudflare Workers + Durable Objects (stateful game rooms) + KV (room metadata, D&D API cache)
- **Real-time:** Native WebSocket over Durable Objects (no Socket.io)
- **AI:** Multi-provider via raw fetch() — Anthropic, OpenAI, Gemini, Groq, DeepSeek, xAI, Mistral, OpenRouter. 3 format handlers (openai-compatible, anthropic, gemini). No SDK dependencies.
- **Auth:** Google OAuth + JWT tokens + guest mode (sessionStorage guestId)
- **Validation:** Zod 4 for all WebSocket message schemas
- **Build:** Turbo, pnpm 10.4.1, Wrangler 4
- **Deploy:** Cloudflare Pages (web) + Cloudflare Workers (worker)

### Key Patterns
- **Discriminated unions** for all message types (ClientMessage/ServerMessage)
- **Event sourcing** for game state changes (GameEvent log)
- **CharacterData split:** `static` (from D&D Beyond import) + `dynamic` (HP, spell slots, conditions — owned by our system)
- **Tool-use loop** for Anthropic/OpenAI providers; **context injection** fallback for non-tool providers
- **DM Prep phase** on story start: pre-fetches party spell details from dnd5eapi.co
- **WebSocket Hibernation API** for Durable Objects (persistent connections survive hibernation)

## Dev Commands
```bash
pnpm dev:all        # Run both web (port 3000) and worker (port 8787)
pnpm dev:web        # Next.js dev server only (port 3000)
pnpm dev:worker     # Wrangler dev server only (port 8787)
pnpm build          # Build all packages
pnpm type-check     # TypeScript type checking
pnpm deploy         # Deploy all to Cloudflare
pnpm deploy:worker  # Deploy worker only
pnpm deploy:web     # Deploy web only
```

## Environment
- **Web dev:** http://localhost:3000
- **Worker dev:** http://localhost:8787
- **Production web:** https://aidnd-web.safats61.workers.dev
- **Production worker:** deployed as `aidnd-worker`
- Worker env vars: `ENVIRONMENT`, `FRONTEND_URL`
- Secrets: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (set via `wrangler secret put`)
- Frontend env: `NEXT_PUBLIC_WORKER_URL` (defaults to http://localhost:8787)

## Critical Files

### Backend (apps/worker/src/)
- `index.ts` — HTTP router + WebSocket upgrade endpoint
- `durable-objects/game-room.ts` — Core game logic: multiplayer state, AI calls, dice, combat
- `services/ai-service.ts` — LLM provider integration (callAI, callAIRaw, format handlers)
- `services/ai-tool-loop.ts` — Tool-use loop for Anthropic/OpenAI
- `services/ai-parser.ts` — Parse structured game actions from AI responses
- `services/state-resolver.ts` — Apply game state changes atomically
- `services/dice.ts` — D&D dice rolling (d20, advantage/disadvantage, etc.)
- `services/dnd-api.ts` — D&D 5e SRD API client with KV caching (30-day TTL)
- `services/dnd-tools.ts` — Tool definitions + executor for AI tool-use
- `services/context-detector.ts` — Spell/condition reference detection for non-tool providers
- `services/dm-prep.ts` — Pre-fetch party spell data on story start
- `services/ddb-parser.ts` — Parse D&D Beyond character JSON
- `services/ddb-fetcher.ts` — Fetch characters from D&D Beyond URLs
- `prompts/dm-system.ts` — DM system prompt generation
- `auth/google.ts` — OAuth endpoints
- `auth/jwt.ts` — JWT signing/verification

### Frontend (apps/web/src/)
- `app/page.tsx` — Home: create/join room, AI provider config
- `app/rooms/[roomCode]/page.tsx` — Game room page
- `hooks/useWebSocket.ts` — WebSocket lifecycle, reconnection, message validation
- `hooks/useAuth.ts` — Google OAuth flow
- `hooks/useModels.ts` — Fetch available models from AI provider APIs
- `hooks/useCharacterImport.ts` — D&D Beyond character import
- `components/chat/ChatPanel.tsx` — Main chat interface
- `components/character/CharacterSheet.tsx` — D&D character sheet display
- `components/character/LeftSidebar.tsx` — Left sidebar with character details
- `components/game/InitiativeTracker.tsx` — Combat turn order
- `components/sidebar/Sidebar.tsx` — Right sidebar (room info, player list, activity log)

### Shared (packages/shared/src/)
- `types/messages.ts` — ClientMessage/ServerMessage unions (WebSocket protocol)
- `types/character.ts` — CharacterData, CharacterStaticData, CharacterDynamicData
- `types/game-state.ts` — GameState, CombatState, GameEvent
- `types/ai-actions.ts` — AI parsed action types
- `schemas/messages.ts` — Zod schemas for runtime message validation
- `constants.ts` — AI_PROVIDERS registry (8 providers), room limits, token limits

## WebSocket Protocol
- **Client→Server:** chat, join, set_ai_config, set_character, start_story, roll_dice, combat_action, kick_player, set_password, dm_override
- **Server→Client:** chat, ai, system, error, room_joined, player_joined, player_left, check_request, check_result, dice_roll, combat_update, game_state_sync, ai_config_updated, player_list

## Game Flow
1. Host creates room (POST /api/rooms/create) → gets room code
2. Players join via WebSocket (/api/rooms/:code/ws)
3. First player = host (can set AI config, manage room)
4. Players import D&D Beyond characters
5. Host clicks "Begin the Adventure" → AI generates opening narrative
6. Players send chat messages → AI responds with narrative + structured actions
7. AI can request skill checks → dice rolled → results fed back to AI
8. Combat tracked via CombatState with initiative order

## GDD Progress (Phase Completion)
- Phase 1 (Foundation): COMPLETE — multiplayer chat, multi-provider AI, OAuth, reconnection
- Phase 2 (Character Integration): COMPLETE — D&D Beyond import, character sheet, party list
- Phase 3 (Game State & Rules): COMPLETE — dice, spell tracking, HP, state resolver, initiative, skill check flow, event log with rollback, editable system prompt
- Phase 4 (Battle Map): NOT STARTED
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
- ESM modules (type: "module" in worker)
- No external LLM SDKs — raw fetch() to provider APIs
- Zod 4 for all runtime validation
- Tailwind CSS 4 for styling (no CSS modules)
- React 19 patterns (use client directive, hooks)
- pnpm workspace protocol for internal deps (`workspace:*`)
