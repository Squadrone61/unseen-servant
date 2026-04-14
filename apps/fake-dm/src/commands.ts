import { parseGridPosition } from "@unseen-servant/shared/utils";
import type { CreatureSize, GridPosition } from "@unseen-servant/shared/types";
import type { FakeDMClient } from "./fake-dm-client.js";
import { runPreset, listPresetNames } from "./presets.js";

interface PendingCombatant {
  name: string;
  maxHP: number;
  currentHP: number;
  armorClass: number;
  position?: GridPosition;
  size?: CreatureSize;
  tokenColor?: string;
  speed?: number;
}

interface CommandSpec {
  usage: string;
  example?: string;
  /** If true, empty args prints usage instead of running. */
  requiresArgs?: boolean;
  run: (ctx: CommandContext) => void | Promise<void>;
}

interface CommandContext {
  client: FakeDMClient;
  router: CommandRouter;
  args: string[];
  raw: string;
  playerName: string;
}

export class CommandRouter {
  /** Combatants queued before !start. */
  pending: PendingCombatant[] = [];

  private commands: Record<string, CommandSpec>;

  constructor(readonly client: FakeDMClient) {
    this.commands = this.buildCommands();
  }

  /** Resolve the calling player's character name (for "me" alias). */
  private resolveMe(playerName: string): string | null {
    const char = this.client.gsm.characters[playerName];
    return char?.static.name ?? null;
  }

  handle(playerName: string, raw: string): void {
    const trimmed = raw.trim().slice(1); // strip leading !
    const parts = trimmed.split(/\s+/);
    const [name, ...rawArgs] = parts;
    const me = this.resolveMe(playerName);
    const args = rawArgs.map((a) => (a.toLowerCase() === "me" && me ? me : a));
    const spec = this.commands[name.toLowerCase()];
    if (!spec) {
      this.client.sayToAll(`Unknown command: !${name} — try !help`);
      return;
    }
    if (spec.requiresArgs && args.length === 0) {
      this.client.sayToAll(
        `usage: !${name} ${spec.usage}${spec.example ? `  —  e.g. ${spec.example}` : ""}`,
      );
      return;
    }
    try {
      void spec.run({ client: this.client, router: this, args, raw, playerName });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.client.sayToAll(`!${name} error: ${msg}`);
    }
  }

  private handleResponse(res: { text: string; error?: boolean }): void {
    const prefix = res.error ? "⚠ " : "✓ ";
    this.client.sayToAll(prefix + res.text);
  }

  private buildCommands(): Record<string, CommandSpec> {
    const client = this.client;

    return {
      help: {
        usage: "",
        run: () => {
          const lines = Object.entries(this.commands)
            .map(([name, spec]) => `  !${name} ${spec.usage}`.trimEnd())
            .sort();
          client.sayToAll("Fake DM commands:\n" + lines.join("\n"));
        },
      },

      map: {
        usage: "[width=20] [height=20] [name]",
        example: "!map 15 15 Dungeon",
        run: ({ args }) => {
          const w = parseInt(args[0] ?? "20", 10);
          const h = parseInt(args[1] ?? "20", 10);
          const name = args.slice(2).join(" ") || "Fake DM Map";
          const tiles = Array.from({ length: h }, () =>
            Array.from({ length: w }, () => ({ type: "floor" as const })),
          );
          const res = client.gsm.updateBattleMap({
            id: crypto.randomUUID(),
            width: w,
            height: h,
            tiles,
            name,
          });
          this.handleResponse(res);
        },
      },

      spawn: {
        usage: "<name> [hp=10] [pos=A1] [ac=12]",
        example: "!spawn Goblin 7 B3 13",
        requiresArgs: true,
        run: ({ args }) => {
          const name = args[0];
          const hp = parseInt(args[1] ?? "10", 10);
          const posStr = args[2] ?? "A1";
          const ac = parseInt(args[3] ?? "12", 10);
          const position = parseGridPosition(posStr) ?? undefined;
          if (!position) {
            client.sayToAll(`⚠ Invalid position "${posStr}" — use A1 notation`);
            return;
          }

          if (client.gsm.gameState.encounter?.combat?.phase === "active") {
            const res = client.gsm.addCombatant({
              name,
              type: "enemy",
              maxHP: hp,
              currentHP: hp,
              armorClass: ac,
              position,
            });
            this.handleResponse(res);
          } else {
            this.pending.push({
              name,
              maxHP: hp,
              currentHP: hp,
              armorClass: ac,
              position,
            });
            client.sayToAll(
              `✓ Queued ${name} (hp=${hp} ac=${ac} @${posStr}) — ${this.pending.length} pending. Use !start to begin combat.`,
            );
          }
        },
      },

      start: {
        usage: "",
        example: "!start",
        run: () => {
          if (!client.gsm.gameState.encounter?.map) {
            client.sayToAll("⚠ No battle map — run !map first (or !preset <name>).");
            return;
          }
          const playerCombatants = Object.values(client.gsm.characters).map((c) => ({
            name: c.static.name,
            type: "player" as const,
          }));
          const enemyCombatants = this.pending.map((p) => ({
            name: p.name,
            type: "enemy" as const,
            maxHP: p.maxHP,
            currentHP: p.currentHP,
            armorClass: p.armorClass,
            position: p.position,
            size: p.size,
            tokenColor: p.tokenColor,
            speed: p.speed,
          }));
          const res = client.gsm.startCombat([...playerCombatants, ...enemyCombatants]);
          this.handleResponse(res);
          this.pending = [];
        },
      },

      end: {
        usage: "",
        run: () => this.handleResponse(client.gsm.endCombat()),
      },

      turn: {
        usage: "",
        run: () => this.handleResponse(client.gsm.advanceTurnMCP()),
      },

      init: {
        usage: "<name> <value>",
        example: "!init Goblin 15",
        requiresArgs: true,
        run: ({ args }) => {
          if (args.length < 2) {
            client.sayToAll("usage: !init <name> <value>");
            return;
          }
          const [name, valueStr] = args;
          const value = parseInt(valueStr, 10);
          this.handleResponse(client.gsm.setInitiative(name, value));
        },
      },

      move: {
        usage: "<name> <A1>",
        example: "!move Goblin D5",
        requiresArgs: true,
        run: ({ args }) => {
          if (args.length < 2) {
            client.sayToAll("usage: !move <name> <A1>");
            return;
          }
          const [name, posStr] = args;
          const pos = parseGridPosition(posStr);
          if (!pos) {
            client.sayToAll(`⚠ Invalid position "${posStr}"`);
            return;
          }
          this.handleResponse(client.gsm.moveCombatant(name, pos));
        },
      },

      damage: {
        usage: "<name> <amount> [type]",
        example: "!damage Goblin 8 fire",
        requiresArgs: true,
        run: ({ args }) => {
          if (args.length < 2) {
            client.sayToAll("usage: !damage <name> <amount> [type]");
            return;
          }
          const [name, amtStr, type] = args;
          this.handleResponse(client.gsm.applyDamage(name, parseInt(amtStr, 10), type));
        },
      },

      heal: {
        usage: "<name> <amount>",
        example: "!heal Tharion 10",
        requiresArgs: true,
        run: ({ args }) => {
          if (args.length < 2) {
            client.sayToAll("usage: !heal <name> <amount>");
            return;
          }
          const [name, amtStr] = args;
          this.handleResponse(client.gsm.heal(name, parseInt(amtStr, 10)));
        },
      },

      give: {
        usage: "<character> <item...>",
        example: "!give Tharion Longsword",
        requiresArgs: true,
        run: ({ args }) => {
          if (args.length < 2) {
            client.sayToAll("usage: !give <character> <item...>");
            return;
          }
          const [character, ...itemParts] = args;
          const itemName = itemParts.join(" ");
          this.handleResponse(client.gsm.addItem(character, { name: itemName, quantity: 1 }));
        },
      },

      aoe: {
        usage: "<sphere|cone|rect> <A1> <size|A1> [dir] [label...]",
        example: "!aoe sphere E5 20 Fireball",
        requiresArgs: true,
        run: ({ args }) => {
          const shape = args[0] as "sphere" | "cone" | "rectangle" | "rect";
          const normalized = shape === "rect" ? "rectangle" : shape;
          if (!["sphere", "cone", "rectangle"].includes(normalized)) {
            client.sayToAll(`⚠ Unknown shape "${shape}" — use sphere|cone|rect`);
            return;
          }

          if (normalized === "rectangle") {
            const from = args[1];
            const to = args[2];
            const label = args.slice(3).join(" ") || "AoE";
            this.handleResponse(
              client.gsm.showAoE({
                shape: "rectangle",
                from,
                to,
                color: "#ff6644",
                label,
                persistent: false,
              }),
            );
          } else {
            const center = args[1];
            const size = parseInt(args[2] ?? "20", 10);
            const maybeDir = normalized === "cone" ? parseInt(args[3] ?? "90", 10) : undefined;
            const labelStart = normalized === "cone" ? 4 : 3;
            const label = args.slice(labelStart).join(" ") || "AoE";
            this.handleResponse(
              client.gsm.showAoE({
                shape: normalized,
                center,
                size,
                direction: maybeDir,
                color: normalized === "cone" ? "#ffaa33" : "#ff6644",
                label,
                persistent: false,
              }),
            );
          }
        },
      },

      say: {
        usage: "<text...>",
        example: "!say The dragon roars.",
        requiresArgs: true,
        run: ({ args }) => {
          const text = args.join(" ");
          client.sayAsDM(text);
        },
      },

      sync: {
        usage: "",
        run: () => {
          client.gsm.broadcastGameStateSync();
          client.sayToAll("✓ State sync sent.");
        },
      },

      preset: {
        usage: `<${listPresetNames().join("|")}>`,
        example: "!preset dungeon",
        requiresArgs: true,
        run: async ({ args }) => {
          const name = args[0];
          try {
            await runPreset(name, this);
            client.sayToAll(`✓ Preset "${name}" loaded.`);
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            client.sayToAll(`⚠ Preset failed: ${msg}`);
          }
        },
      },
    };
  }
}
