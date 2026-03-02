# AI Dungeon Master

A multiplayer D&D 5e web app where an AI plays the Dungeon Master. Players import their D&D Beyond characters, join a shared room via WebSocket, and play through AI-generated campaigns in real time.

## Features

- **AI Dungeon Master** — Narrative generation, skill checks, combat encounters, and spell resolution powered by LLMs
- **Bring Your Own Key** — Supports 8 AI providers via a Chrome extension: Anthropic, OpenAI, Gemini, Groq, DeepSeek, xAI, Mistral, OpenRouter
- **D&D Beyond Import** — Import characters by URL or JSON paste. Ability scores, spells, inventory, proficiencies, and class features are all parsed
- **Multiplayer** — Real-time WebSocket rooms with party list, activity log, and shared game state
- **D&D 5e Rules** — Tool-use integration with the D&D 5e SRD API for accurate spell mechanics, monster stat blocks, conditions, and rules
- **Battle Map** — Tactical CSS Grid combat map with token placement, click-to-move, BFS range highlighting, and condition badges
- **Combat System** — Initiative tracking, turn order, attack rolls, saving throws, and HP management
- **Character Sheet** — Full interactive sheet with abilities, skills, saves, spells (prepared/ritual/known), actions, inventory, and features
- **Auth** — Google OAuth or guest mode

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | Next.js 16, React 19, TypeScript, Tailwind CSS 4 |
| Backend | Cloudflare Workers, Durable Objects, KV |
| Real-time | Native WebSocket (Durable Objects Hibernation API) |
| AI | Chrome extension makes AI calls (raw fetch, no SDK dependencies) |
| Extension | Chrome Manifest V3, esbuild |
| Validation | Zod 4 |
| Monorepo | pnpm workspaces, Turborepo |

## Architecture

```
Player  -->  WebSocket  -->  Worker (prompt builder + state processor)
                                |
                          dm_request (via WS to host)
                                |
                          Host's Browser  -->  Extension  -->  AI Provider API
                                |
                          dm_response (via WS back to server)
                                |
                          Worker parses response, applies state changes
                                |
                          Broadcasts to all players
```

The server builds the system prompt and conversation history, then sends it to the host's browser via WebSocket. The Chrome extension intercepts the request, calls the AI provider using the host's API key, and returns the response. The server never sees the API key.

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm 10+
- Chrome or Chromium-based browser (for the DM extension)

### Install

```bash
pnpm install
```

### Development

```bash
pnpm dev:all         # Starts web (localhost:3000) + worker (localhost:8787)
pnpm build:extension # Build the Chrome extension
```

### DM Extension Setup

The host needs to install the Chrome extension to connect an AI provider.

**Option A: Download from Releases (recommended)**

1. Download the latest `aidnd-extension-v*.zip` from [GitHub Releases](https://github.com/Squadrone61/AIDND/releases)
2. Unzip to a folder

**Option B: Build from source**

```bash
pnpm build:extension
```

**Load in Chrome**

1. Open `chrome://extensions`
2. Enable **Developer mode** (toggle in top right)
3. Click **Load unpacked**
4. Select the unzipped folder (Option A) or the `apps/extension/` directory (Option B)

**3. Configure a provider**

1. Click the extension icon in the Chrome toolbar
2. Select a provider from the dropdown (Anthropic, OpenAI, Gemini, etc.)
3. Enter your API key
4. Choose a model (the dropdown auto-populates after entering a valid key)
5. Click **Save & Connect**

**4. Play**

1. Open the game at `http://localhost:3000`
2. Create a room — the sidebar should show "Extension connected"
3. Start the adventure

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
apps/worker/     — Cloudflare Worker backend (Durable Objects for game rooms)
apps/extension/  — Chrome extension (AI provider integration)
packages/shared/ — Shared types, schemas, constants, utilities
tests/           — Playwright E2E tests
```

## How It Works

1. Host creates a room and installs the AIDND DM Extension
2. Host configures an AI provider in the extension popup (API key never leaves their browser)
3. Players join via room code and import their D&D Beyond characters
4. Host starts the adventure — the server sends a prompt request to the extension, which calls the AI and returns the narrative
5. Players describe actions in chat — the AI responds with narrative and game mechanics
6. The AI can request dice rolls, manage combat, track HP/spell slots, and apply conditions

For providers that support tool-use (Anthropic, OpenAI), the extension runs a tool-use loop — looking up spells, monsters, and rules from the D&D 5e SRD in real time. Other providers get context injected automatically.

## License

Private repository.
