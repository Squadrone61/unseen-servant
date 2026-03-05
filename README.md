# AI Dungeon Master

A multiplayer D&D 5e web app where an AI plays the Dungeon Master. Players import their D&D Beyond characters, join a shared room via WebSocket, and play through AI-generated campaigns in real time.

## Features

- **AI Dungeon Master** — Claude Code acts as the DM via MCP bridge, generating narrative, adjudicating rules, managing combat, and adapting to player choices
- **No API Keys Needed** — AI runs through Claude Code's MCP protocol; no provider configuration or API keys required
- **D&D Beyond Import** — Import characters by URL or JSON paste. Ability scores, spells, inventory, proficiencies, and class features are all parsed
- **Multiplayer** — Real-time WebSocket rooms with party list, activity log, and shared game state
- **D&D 5e Rules** — MCP tools look up spells, monsters, and conditions from the D&D 5e SRD API in real time
- **Battle Map** — Tactical CSS Grid combat map with token placement, click-to-move, BFS range highlighting, and condition badges
- **Combat System** — Initiative tracking, turn order, attack rolls, saving throws, and HP management
- **Character Sheet** — Full interactive sheet with abilities, skills, saves, spells (prepared/ritual/known), actions, inventory, and features
- **Campaign Notes** — DM can save and recall campaign notes locally across sessions
- **Auth** — Google OAuth or guest mode

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | Next.js 16, React 19, TypeScript 5.9, Tailwind CSS 4 |
| Backend | Cloudflare Workers, Durable Objects, KV |
| Real-time | Native WebSocket (Durable Objects Hibernation API) |
| AI | Claude Code via MCP bridge (no SDK, no API keys) |
| MCP Bridge | @modelcontextprotocol/sdk, ws, tsx |
| Validation | Zod 4 |
| Monorepo | pnpm workspaces, Turborepo |

## Architecture

```
[Players' Browsers] ←WebSocket→ [Cloudflare Worker]  (multiplayer relay + rooms + auth)
                                       ↕ WebSocket (DM participant)
                                [MCP Bridge Server]  (game engine + D&D tools + campaign docs)
                                    ↕ stdio MCP
                                [Claude Code]  (AI Dungeon Master)
```

The worker is a thin multiplayer relay — it manages rooms, WebSocket connections, and auth. It does NOT do any AI processing.

The MCP bridge connects to the worker as a "DM" participant via WebSocket, receives player messages as `dm_request`s, and exposes them to Claude Code via MCP tools. Claude Code thinks, optionally looks up D&D rules, and sends a response back through the bridge.

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm 10+
- Claude Code CLI (for AI DM)

### Install

```bash
pnpm install
```

### Development

```bash
pnpm dev:all     # Starts web (localhost:3000) + worker (localhost:8787)
```

### Running a Game Session

1. `pnpm dev:all` — start web + worker
2. Create a room in the browser at `http://localhost:3000`, note the room code
3. Set the room code in `.mcp.json` → `AIDND_ROOM_CODE`
4. Claude Code connects via MCP — the bridge joins the room as "DM"
5. Players join via room code and import their D&D Beyond characters
6. Host clicks "Begin the Adventure"
7. Claude Code receives `dm_request`s via `wait_for_message`, responds via `send_response`

### MCP Configuration

The `.mcp.json` at the repo root configures the MCP bridge:

```json
{
  "mcpServers": {
    "aidnd-dm": {
      "command": "npx",
      "args": ["tsx", "apps/mcp-bridge/src/index.ts"],
      "env": {
        "AIDND_ROOM_CODE": "<your-room-code>",
        "AIDND_WORKER_URL": "http://localhost:8787"
      }
    }
  }
}
```

### Testing

```bash
pnpm test       # Starts dev servers, runs Playwright tests, stops servers
pnpm test:only  # Runs tests (servers must already be running)
pnpm test:ui    # Opens Playwright UI runner
```

### Deploy

```bash
pnpm deploy         # Deploy everything to Cloudflare
pnpm deploy:worker  # Worker only
pnpm deploy:web     # Web only
```

## Project Structure

```
apps/web/        — Next.js frontend
apps/worker/     — Cloudflare Worker backend (thin multiplayer relay)
apps/mcp-bridge/ — MCP server (WebSocket client + D&D tools + campaign notes)
packages/shared/ — Shared types, schemas, constants, utilities
tests/           — Playwright E2E tests
```

## MCP Tools

Claude Code has access to these tools when acting as DM:

| Tool | Description |
|------|-------------|
| `wait_for_message` | Blocks until a player message/dm_request arrives |
| `send_response` | Sends DM narrative back to all players |
| `get_players` | Returns current player list with character summaries |
| `lookup_spell` | Look up spell details from D&D 5e SRD API |
| `lookup_monster` | Look up monster stats |
| `lookup_condition` | Look up condition effects |
| `roll_dice` | Roll dice (e.g., "2d6+3", "d20 advantage") |
| `save_campaign_note` | Save/update a campaign note |
| `read_campaign_note` | Read a specific note |
| `list_campaign_notes` | List all notes for current campaign |

## How It Works

1. Host creates a room and starts the dev servers
2. Players join via room code and import their D&D Beyond characters
3. Host clicks "Begin the Adventure" — the server sends a `dm_request` to the MCP bridge
4. Claude Code receives the request via `wait_for_message`, thinks about the narrative, and optionally looks up spells/monsters/rules from the SRD
5. Claude Code calls `send_response` — the bridge sends the response back through the worker to all players
6. Players describe actions in chat — each message triggers a new `dm_request` → Claude Code → `send_response` cycle
7. Campaign notes persist locally in `.aidnd/campaigns/{roomCode}/`

## License

Private repository.
