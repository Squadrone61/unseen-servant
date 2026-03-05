# AI Dungeon Master

A multiplayer D&D 5e web app where an AI plays the Dungeon Master. Players import their D&D Beyond characters, join a shared room, and play through AI-generated campaigns with tactical combat — no human GM required.

## Features

- **AI Dungeon Master** — Claude Code acts as the DM via MCP bridge, narrating the story, running combat, adjudicating rules, and adapting to player choices
- **No API Keys** — AI runs through Claude Code's MCP protocol, no provider config needed
- **D&D Beyond Import** — Paste a character URL or JSON. Stats, spells, inventory, proficiencies, and class features are all parsed
- **Multiplayer** — Real-time WebSocket rooms with shared game state
- **D&D 5e Rules** — Spells, monsters, and conditions looked up from the SRD API in real time
- **Battle Map** — Tactical grid with tokens, click-to-move, range highlighting, terrain, and conditions
- **Combat** — Initiative, turn order, attack rolls, saving throws, HP/damage/healing, spell slots
- **Campaign Persistence** — Save progress between sessions (campaign notes, character snapshots, system prompt)

## Quick Start (Play on Production)

The game is hosted at **https://aidnd.safaakyuz.com**. To run a session you need someone acting as the AI DM using the standalone launcher.

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code/overview): `npm i -g @anthropic-ai/claude-code`

### 1. Download the DM Launcher

Grab `aidnd-dm.mjs` from the [latest release](https://github.com/Squadrone61/AIDND/releases).

### 2. Create a Room

Go to https://aidnd.safaakyuz.com, enter your name, and click **Create Room**. Note the room code.

### 3. Launch the AI DM

```bash
node aidnd-dm.mjs
```

The launcher will ask for:
- **Room code** — the code from step 2
- **Model** — Claude model to use (default: sonnet)

Claude Code connects to the room as the DM. Share the room code with your players.

### 4. Play

1. Players go to https://aidnd.safaakyuz.com, enter their name and the room code
2. Players import their D&D Beyond characters (URL or JSON paste)
3. Host configures the campaign (name, pacing, encounter length) in the sidebar
4. Host clicks **Begin the Adventure**
5. Players type actions in chat, the AI DM responds with narrative, dice rolls, and combat

### DM Launcher Options

```bash
node aidnd-dm.mjs --room ABC123 --model sonnet
node aidnd-dm.mjs --worker-url http://localhost:8787  # override worker URL
```

---

## Development Setup

For contributors or anyone running the full stack locally.

### Prerequisites

- Node.js 20+
- pnpm 10+
- Claude Code CLI

### Install

```bash
git clone https://github.com/Squadrone61/AIDND.git
cd AIDND
pnpm install
```

### Run Dev Servers

```bash
pnpm dev:all     # Starts web (localhost:3000) + worker (localhost:8787)
```

### Run a Local Game Session

**Option A: Using the dev DM launcher**

```bash
pnpm dev:dm    # builds dev bundle + launches DM pointed at localhost:8787
```

**Option B: Using `.mcp.json` with Claude Code**

1. Open `http://localhost:3000`, create a room, note the room code
2. Set the room code in `.mcp.json` → `AIDND_ROOM_CODE`
3. Claude Code connects via MCP — the bridge joins the room as "DM"

Then: players join, host configures campaign, clicks "Begin the Adventure".

### MCP Configuration (Local Dev)

The `.mcp.json` at the repo root configures the MCP bridge for local development:

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

### Commands

```bash
pnpm dev:all        # Web + worker dev servers
pnpm dev:web        # Next.js only (port 3000)
pnpm dev:worker     # Wrangler only (port 8787)
pnpm build          # Build all packages
pnpm build:dm       # Build dm-launcher (production)
pnpm dev:dm         # Build + launch DM pointed at localhost:8787
pnpm type-check     # TypeScript checking
pnpm dead-code      # Knip dead code detection
pnpm test           # Start servers + run Playwright tests
pnpm test:only      # Run tests (servers already running)
pnpm test:ui        # Playwright UI runner
pnpm deploy         # Deploy all to Cloudflare
pnpm deploy:worker  # Worker only
pnpm deploy:web     # Web only
```

---

## Architecture

```
[Players' Browsers] ←WebSocket→ [Cloudflare Worker]     (pure multiplayer relay + auth)
                                       ↕ WebSocket (DM participant)
                                [MCP Bridge Server]      (game engine + state + D&D tools + campaigns)
                                  ↕ stdio MCP
                                [Claude Code]            (AI Dungeon Master)
```

The **MCP bridge** owns all game logic — combat, dice, HP, conditions, spell slots, conversation history, battle maps. The **worker** is a pure multiplayer relay that forwards player actions to the bridge and broadcasts responses to clients.

### Project Structure

```
apps/web/          — Next.js frontend (React 19, Tailwind CSS 4)
apps/worker/       — Cloudflare Worker (Durable Objects, KV) — multiplayer relay + auth
apps/mcp-bridge/   — Game engine: GameStateManager + MCP tools + WebSocket client
apps/dm-launcher/  — Standalone CLI to launch Claude Code as DM
packages/shared/   — Shared types, schemas, constants, dice/check utilities
tests/             — Playwright E2E tests
```

## MCP Tools

Claude Code has access to these tools when acting as DM:

### Game Communication
| Tool | Description |
|------|-------------|
| `wait_for_message` | Blocks until a player message arrives (main loop driver) |
| `send_response` | Sends DM narrative back to all players |
| `get_players` | Current player list with character summaries |
| `get_game_state` | Full game state snapshot |
| `get_character` | Specific character's full data by name |

### HP, Conditions & Spell Slots
| Tool | Description |
|------|-------------|
| `apply_damage` | Deal damage (handles temp HP) |
| `heal` | Restore HP |
| `set_hp` | Set exact HP |
| `add_condition` / `remove_condition` | Manage conditions (poisoned, stunned, etc.) |
| `use_spell_slot` / `restore_spell_slot` | Manage spell slots |

### Combat & Battle Map
| Tool | Description |
|------|-------------|
| `start_combat` / `end_combat` | Start/end combat encounters |
| `advance_turn` | Next combatant's turn |
| `add_combatant` / `remove_combatant` | Add/remove combatants mid-fight |
| `move_combatant` | Move token on battle map |
| `update_battle_map` | Set/update the tactical grid |

### D&D Reference
| Tool | Description |
|------|-------------|
| `lookup_spell` | Spell details from D&D 5e SRD |
| `lookup_monster` | Monster stat blocks |
| `lookup_condition` | Condition effects |
| `roll_dice` | Direct rolls or interactive player checks |

### Campaign Persistence
| Tool | Description |
|------|-------------|
| `create_campaign` / `list_campaigns` | Manage campaigns |
| `load_campaign_context` | Load full campaign context for session start |
| `save_campaign_file` / `read_campaign_file` / `list_campaign_files` | Campaign file management |
| `end_session` | End session (save summary, snapshot characters) |

## How a Turn Works

1. Player types an action in chat → WebSocket → Worker forwards as `player_action` to bridge
2. Bridge's GameStateManager adds to conversation history, creates a DM request
3. Claude Code receives it via `wait_for_message`
4. Claude Code thinks, calls tools as needed (`roll_dice`, `apply_damage`, `start_combat`, etc.)
5. Claude Code calls `send_response` with narrative text
6. Bridge broadcasts the response to all players via the worker

## License

Private repository.
