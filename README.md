# Unseen Servant

A multiplayer D&D 5e web app where an AI plays the Dungeon Master. Players create characters with the built-in character builder, join a shared room, and play through AI-generated campaigns with tactical combat — no human GM required.

- **AI Dungeon Master** — Claude Code acts as the DM via MCP bridge, narrating the story, running combat, adjudicating rules, and adapting to player choices
- **No API Keys** — AI runs through Claude Code's MCP protocol, no provider config needed
- **Native Character Builder** — Create D&D 2024 characters from scratch with species, class, background, abilities, spells, feats, and equipment — all powered by a built-in 5e.tools database
- **Character Import/Export** — Save characters as `.unseen.json` files and import them across sessions
- **Multiplayer** — Real-time WebSocket rooms with shared game state
- **D&D 2024 Database** — 490 spells, 580 monsters, 563 magic items, 103 feats, 12 classes, 28 species, 27 backgrounds — all searchable by the DM in real time
- **Battle Map** — Tactical grid with tokens, click-to-move, range highlighting, terrain, and conditions
- **Combat** — Initiative, turn order, attack rolls, saving throws, HP/damage/healing, spell slots
- **Campaign Persistence** — Save progress between sessions (campaign notes, character snapshots, system prompt)
- **In-App Guide** — Built-in "Tome of Knowledge" tutorial covering character creation, campaign setup, narrative play, and combat

## Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code/overview): `npm i -g @anthropic-ai/claude-code`

## How to Play

### Step 1: Download the Launcher

Grab `unseen-servant.mjs` from the [latest release](https://github.com/Squadrone61/unseen-servant/releases).

This is a single-file launcher that configures and spawns Claude Code as your AI Dungeon Master. No repo clone needed — just download and run.

### Step 2: Create a Room

1. Go to **https://unseenservant.safaakyuz.com**
2. Enter your name and click **Create Room**
3. A 6-character room code appears in the right sidebar (click it to copy)
4. Share this code with your players

> **Password protection (optional):** Once in the room, open **Settings** in the sidebar to set a room password. Players will need it to join.

### Step 3: Players Join

1. Players go to **https://unseenservant.safaakyuz.com**
2. Enter their name and the room code, then click **Join Room**
3. Each player appears in the party list in the right sidebar

Players can sign in with Google for a persistent identity, or join as guests.

### Step 4: Create or Import Characters

Each player needs a character. There are two options:

**Option A: Built-in Character Builder** (recommended)

1. Go to **My Characters** from the home page
2. Click **Create New Character**
3. Walk through the step-by-step builder: species, background, class, abilities, feats, skills, spells, equipment, and details
4. Your character is saved to the browser's local library
5. In the game room, click **Select Character** to use it

**Option B: Import a `.unseen.json` file**

If you have a character exported from a previous session:

1. Click **Import Character** in the left sidebar
2. Upload the `.unseen.json` file
3. Your character sheet appears with stats, spells, inventory, and class features

### Step 5: Launch the DM

In your terminal, run:

```bash
node unseen-servant.mjs
```

The launcher prompts for:

- **Room code** — the 6-character code from Step 2
- **Model** — which Claude model to use (`sonnet`, `opus`, or `haiku` — default: `sonnet`)

Or skip the prompts with CLI flags:

```bash
node unseen-servant.mjs --room ABC123 --model sonnet
```

Once connected, players will see the DM status indicator in the sidebar change from a yellow pulsing dot to a solid green **DM Connected**.

### Step 6: Configure the Campaign

Once the DM is connected, the host configures the campaign:

1. Click **Configure Campaign** in the right sidebar
2. Choose **New Campaign** and give it a name, or **Load Existing** to continue a previous campaign (shows session count)
3. Set gameplay preferences:
   - **Pacing** — Story-Heavy / Balanced / Combat-Heavy
   - **Encounter Length** — Quick / Standard / Epic
4. Optionally add **Custom DM Instructions** to shape the DM's style (tone, setting restrictions, homebrew rules, etc.)
5. Click **Configure** to save

### Step 7: Begin the Adventure

1. The host clicks **Begin the Adventure**
2. The AI DM generates an opening narrative based on the campaign config, player characters, and any prior session context
3. Players type actions in chat, and the DM responds with story, dice rolls, and combat

### Step 8: During Play

Here's what happens during a session:

- **Dice rolls** — When the DM calls for a check, players see a **Roll d20** button. The roll is made with the correct modifier from your character sheet.
- **Combat** — The DM starts an encounter, the battle map grid appears, and the initiative tracker shows turn order. Click your token to move it, and click **End Turn** when done.
- **Spells & HP** — Spell slots, HP, conditions, and temporary HP are all tracked automatically by the game engine.
- **Inventory & Currency** — Items gained/lost and gold changes are tracked on your character sheet.
- **Rollback** — The host can open the **Event Log** in the sidebar to undo any game event (damage, conditions, combat actions) if something goes wrong.

### Step 9: Ending a Session

When you're ready to stop:

1. Tell the DM you'd like to end the session
2. The DM saves campaign notes, a session summary, and character snapshots
3. Next time, load the existing campaign in Step 6 to pick up where you left off — the DM will have full context of previous sessions

---

## Development Setup

For contributors or anyone running the full stack locally.

### Prerequisites

- Node.js 20+
- pnpm 10+
- Claude Code CLI

### Install

```bash
git clone https://github.com/Squadrone61/unseen-servant.git
cd unseen-servant
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
2. Set the room code in `.mcp.json` → `UNSEEN_ROOM_CODE`
3. Claude Code connects via MCP — the bridge joins the room as "DM"

Then: players join, host configures campaign, clicks "Begin the Adventure".

### MCP Configuration (Local Dev)

The `.mcp.json` at the repo root configures the MCP bridge for local development:

```json
{
  "mcpServers": {
    "unseen-servant": {
      "command": "npx",
      "args": ["tsx", "apps/mcp-bridge/src/index.ts"],
      "env": {
        "UNSEEN_ROOM_CODE": "<your-room-code>",
        "UNSEEN_WORKER_URL": "http://localhost:8787"
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
packages/shared/   — Shared types, schemas, constants, dice/check utilities, D&D 2024 database
tests/             — Playwright E2E tests
```

## MCP Tools

Claude Code has access to these tools when acting as DM:

### Game Communication

| Tool               | Description                                              |
| ------------------ | -------------------------------------------------------- |
| `wait_for_message` | Blocks until a player message arrives (main loop driver) |
| `send_response`    | Sends DM narrative back to all players                   |
| `acknowledge`      | Silently observe a message without responding            |
| `get_players`      | Current player list with character summaries             |
| `get_game_state`   | Full game state snapshot                                 |
| `get_character`    | Specific character's full data by name                   |

### HP, Conditions & Spell Slots

| Tool                                            | Description                                 |
| ----------------------------------------------- | ------------------------------------------- |
| `apply_damage`                                  | Deal damage (handles temp HP)               |
| `heal`                                          | Restore HP                                  |
| `set_hp`                                        | Set exact HP                                |
| `add_condition` / `remove_condition`            | Manage conditions (poisoned, stunned, etc.) |
| `use_spell_slot` / `restore_spell_slot`         | Manage spell slots                          |
| `use_class_resource` / `restore_class_resource` | Manage class resources (Rage, Ki, etc.)     |
| `grant_inspiration` / `use_inspiration`         | Heroic Inspiration                          |

### Combat & Battle Map

| Tool                                 | Description                     |
| ------------------------------------ | ------------------------------- |
| `start_combat` / `end_combat`        | Start/end combat encounters     |
| `advance_turn`                       | Next combatant's turn           |
| `add_combatant` / `remove_combatant` | Add/remove combatants mid-fight |
| `move_combatant`                     | Move token on battle map        |
| `update_battle_map`                  | Set/update the tactical grid    |

### Inventory & Currency

| Tool                                       | Description                      |
| ------------------------------------------ | -------------------------------- |
| `add_item` / `update_item` / `remove_item` | Manage character inventory       |
| `update_currency`                          | Add or subtract gold/silver/etc. |

### D&D Reference

| Tool                                                    | Description                               |
| ------------------------------------------------------- | ----------------------------------------- |
| `lookup_spell`                                          | Spell details (490 spells)                |
| `lookup_monster`                                        | Monster stat blocks (580 monsters)        |
| `lookup_condition`                                      | Condition effects (15 conditions)         |
| `lookup_magic_item`                                     | Magic items (563 items)                   |
| `lookup_feat`                                           | Feat details (103 feats)                  |
| `lookup_class` / `lookup_species` / `lookup_background` | Class, species, background data           |
| `search_rules`                                          | Search across all D&D data categories     |
| `roll_dice`                                             | Direct rolls or interactive player checks |

### Campaign Persistence

| Tool                                                                | Description                                     |
| ------------------------------------------------------------------- | ----------------------------------------------- |
| `create_campaign` / `list_campaigns`                                | Manage campaigns                                |
| `load_campaign_context`                                             | Load full campaign context for session start    |
| `save_campaign_file` / `read_campaign_file` / `list_campaign_files` | Campaign file management                        |
| `end_session`                                                       | End session (save summary, snapshot characters) |

## How a Turn Works

1. Player types an action in chat → WebSocket → Worker forwards as `player_action` to bridge
2. Bridge's GameStateManager adds to conversation history, creates a DM request
3. Claude Code receives it via `wait_for_message`
4. Claude Code thinks, calls tools as needed (`roll_dice`, `apply_damage`, `start_combat`, etc.)
5. Claude Code calls `send_response` with narrative text
6. Bridge broadcasts the response to all players via the worker

## License

Private repository.
