import type { BattleMapState, MapTile } from "@unseen-servant/shared/types";
import type { CommandRouter } from "./commands.js";

type Preset = (router: CommandRouter) => Promise<void>;

function floor(): MapTile {
  return { type: "floor" };
}
function wall(): MapTile {
  return { type: "wall", cover: "full" };
}
function pillar(): MapTile {
  return {
    type: "floor",
    object: { name: "Pillar", category: "furniture", height: 10 },
    cover: "half",
  };
}
function pit(): MapTile {
  return { type: "pit", elevation: -10 };
}
function chest(): MapTile {
  return { type: "floor", object: { name: "Treasure Chest", category: "container" } };
}
function torch(): MapTile {
  return { type: "floor", object: { name: "Torch", category: "interactable" } };
}
function rock(): MapTile {
  return {
    type: "floor",
    object: { name: "Rock", category: "furniture", height: 3 },
    cover: "half",
  };
}
function tree(): MapTile {
  return {
    type: "floor",
    object: { name: "Tree", category: "furniture", height: 20 },
    cover: "full",
  };
}
function lava(): MapTile {
  return {
    type: "difficult_terrain",
    object: { name: "Lava", category: "hazard" },
    label: "lava",
  };
}

function blankMap(w: number, h: number, name: string): BattleMapState {
  return {
    id: crypto.randomUUID(),
    width: w,
    height: h,
    name,
    tiles: Array.from({ length: h }, () => Array.from({ length: w }, () => floor())),
  };
}

const presets: Record<string, Preset> = {
  dungeon: async (router) => {
    const client = router.client;
    const map = blankMap(20, 20, "Goblin Warren");

    // Walls lining the north/south edges of a corridor (rows 8 and 13)
    for (let x = 4; x < 16; x++) {
      map.tiles[8][x] = wall();
      map.tiles[13][x] = wall();
    }
    // Pit 3x3 in the middle
    for (let y = 10; y < 13; y++) {
      for (let x = 9; x < 12; x++) {
        map.tiles[y][x] = pit();
      }
    }
    // Pillars
    map.tiles[10][6] = pillar();
    map.tiles[11][14] = pillar();
    // Chest + torch
    map.tiles[11][17] = chest();
    map.tiles[9][3] = torch();

    client.gsm.updateBattleMap(map);

    router.pending = [
      { name: "Goblin A", maxHP: 7, currentHP: 7, armorClass: 13, position: { x: 2, y: 2 } },
      { name: "Goblin B", maxHP: 7, currentHP: 7, armorClass: 13, position: { x: 2, y: 4 } },
      { name: "Goblin C", maxHP: 7, currentHP: 7, armorClass: 13, position: { x: 2, y: 6 } },
      {
        name: "Hobgoblin Captain",
        maxHP: 22,
        currentHP: 22,
        armorClass: 16,
        position: { x: 7, y: 4 },
      },
    ];

    const playerCombatants = Object.values(client.gsm.characters).map((c) => ({
      name: c.static.name,
      type: "player" as const,
    }));
    const enemyCombatants = router.pending.map((p) => ({
      name: p.name,
      type: "enemy" as const,
      maxHP: p.maxHP,
      currentHP: p.currentHP,
      armorClass: p.armorClass,
      position: p.position,
    }));
    client.gsm.startCombat([...playerCombatants, ...enemyCombatants]);
    router.pending = [];
  },

  "open-field": async (router) => {
    const client = router.client;
    const map = blankMap(25, 25, "Open Field");
    map.tiles[5][7] = rock();
    map.tiles[6][8] = rock();
    map.tiles[15][20] = rock();
    map.tiles[12][12] = tree();
    client.gsm.updateBattleMap(map);

    router.pending = [
      { name: "Wolf A", maxHP: 11, currentHP: 11, armorClass: 12, position: { x: 20, y: 5 } },
      { name: "Wolf B", maxHP: 11, currentHP: 11, armorClass: 12, position: { x: 22, y: 20 } },
    ];
    // No startCombat — exploration phase
  },

  boss: async (router) => {
    const client = router.client;
    const map = blankMap(15, 15, "Boss Chamber");
    // Lava ring around edges
    for (let x = 0; x < 15; x++) {
      map.tiles[0][x] = lava();
      map.tiles[14][x] = lava();
    }
    for (let y = 0; y < 15; y++) {
      map.tiles[y][0] = lava();
      map.tiles[y][14] = lava();
    }
    // Ring of pillars around the center
    const ring = [
      [6, 5],
      [8, 5],
      [5, 7],
      [9, 7],
      [6, 9],
      [8, 9],
    ];
    for (const [x, y] of ring) map.tiles[y][x] = pillar();

    client.gsm.updateBattleMap(map);
    router.pending = [
      {
        name: "Ogre",
        maxHP: 59,
        currentHP: 59,
        armorClass: 11,
        position: { x: 7, y: 7 },
        size: "large",
      },
    ];

    const playerCombatants = Object.values(client.gsm.characters).map((c) => ({
      name: c.static.name,
      type: "player" as const,
    }));
    const enemyCombatants = router.pending.map((p) => ({
      name: p.name,
      type: "enemy" as const,
      maxHP: p.maxHP,
      currentHP: p.currentHP,
      armorClass: p.armorClass,
      position: p.position,
      size: p.size,
    }));
    client.gsm.startCombat([...playerCombatants, ...enemyCombatants]);
    router.pending = [];
  },

  "aoe-test": async (router) => {
    const client = router.client;
    const map = blankMap(20, 20, "AoE Test");
    client.gsm.updateBattleMap(map);

    router.pending = [
      { name: "Goblin 1", maxHP: 5, currentHP: 5, armorClass: 12, position: { x: 4, y: 4 } },
      { name: "Goblin 2", maxHP: 5, currentHP: 5, armorClass: 12, position: { x: 5, y: 4 } },
      { name: "Goblin 3", maxHP: 5, currentHP: 5, armorClass: 12, position: { x: 6, y: 4 } },
      { name: "Goblin 4", maxHP: 5, currentHP: 5, armorClass: 12, position: { x: 4, y: 6 } },
      { name: "Goblin 5", maxHP: 5, currentHP: 5, armorClass: 12, position: { x: 5, y: 6 } },
      { name: "Goblin 6", maxHP: 5, currentHP: 5, armorClass: 12, position: { x: 6, y: 6 } },
    ];

    const playerCombatants = Object.values(client.gsm.characters).map((c) => ({
      name: c.static.name,
      type: "player" as const,
    }));
    const enemyCombatants = router.pending.map((p) => ({
      name: p.name,
      type: "enemy" as const,
      maxHP: p.maxHP,
      currentHP: p.currentHP,
      armorClass: p.armorClass,
      position: p.position,
    }));
    client.gsm.startCombat([...playerCombatants, ...enemyCombatants]);
    router.pending = [];
  },
};

export function listPresetNames(): string[] {
  return Object.keys(presets);
}

export async function runPreset(name: string, router: CommandRouter): Promise<void> {
  const fn = presets[name];
  if (!fn) {
    throw new Error(`unknown preset "${name}" — available: ${listPresetNames().join(", ")}`);
  }
  await fn(router);
}
