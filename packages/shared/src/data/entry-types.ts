// 5e.tools Rich Text Entry Types
// Recursive union type for structured text content

// ─── Dice / Bonus inline types ──────────────────────────

export interface EntryDice {
  type: "dice";
  toRoll?: { number: number; faces: number; modifier?: number }[];
  rollable?: boolean;
}

export interface EntryBonus {
  type: "bonus";
  value: number;
}

export interface EntryBonusSpeed {
  type: "bonusSpeed";
  value: number;
}

export interface EntryAbilityDc {
  type: "abilityDc";
  name: string;
  attributes: string[];
}

export interface EntryAbilityAttackMod {
  type: "abilityAttackMod";
  name: string;
  attributes: string[];
}

// ─── Structural entry types ─────────────────────────────

export interface EntryEntries {
  type: "entries";
  name?: string;
  entries: Entry[];
  data?: Record<string, unknown>;
  page?: number;
  source?: string;
}

export interface EntryInset {
  type: "inset";
  name?: string;
  entries: Entry[];
  source?: string;
  page?: number;
}

export interface EntryInsetReadaloud {
  type: "insetReadaloud";
  name?: string;
  entries: Entry[];
}

export interface EntryQuote {
  type: "quote";
  entries: Entry[];
  by?: string;
  from?: string;
}

export interface EntrySection {
  type: "section";
  name?: string;
  entries: Entry[];
}

// ─── Lists ──────────────────────────────────────────────

export interface EntryList {
  type: "list";
  style?: string;
  items: (string | EntryItem | EntryListItem | Entry)[];
  name?: string;
  columns?: number;
}

export interface EntryItem {
  type: "item";
  name: string;
  entry?: Entry;
  entries?: Entry[];
  style?: string;
}

export interface EntryListItem {
  type: "itemSub" | "itemSpell";
  name: string;
  entry?: Entry;
  entries?: Entry[];
}

// ─── Tables ─────────────────────────────────────────────

export interface EntryTable {
  type: "table";
  caption?: string;
  colLabels?: string[];
  colStyles?: string[];
  rows: (string | Entry)[][];
}

export interface EntryTableGroup {
  type: "tableGroup";
  tables: EntryTable[];
}

// ─── Inline types ───────────────────────────────────────

export interface EntryInline {
  type: "inline";
  entries: Entry[];
}

export interface EntryInlineBlock {
  type: "inlineBlock";
  entries: Entry[];
}

export interface EntryLink {
  type: "link";
  text: string;
  href: { type: string; path: string } | { type: "external"; url: string };
}

export interface EntryOptions {
  type: "options";
  entries: Entry[];
  count?: number;
}

// ─── Special ────────────────────────────────────────────

export interface EntryCell {
  type: "cell";
  roll?: { min: number; max: number } | { exact: number; pad?: boolean };
  entry?: Entry;
  width?: number;
}

export interface EntryOptionalFeature {
  type: "refOptionalfeature";
  optionalfeature: string;
}

export interface EntrySubclassFeature {
  type: "refSubclassFeature";
  subclassFeature: string;
}

export interface EntryClassFeature {
  type: "refClassFeature";
  classFeature: string;
}

export interface EntryHr {
  type: "hr";
}

export interface EntrySpellcasting {
  type: "spellcasting";
  name: string;
  headerEntries?: Entry[];
  footerEntries?: Entry[];
  will?: string[];
  daily?: Record<string, string[]>;
  spells?: Record<string, { spells: string[]; slots?: number; lower?: number; atWill?: boolean }>;
  ability?: string;
  displayAs?: string;
  hidden?: string[];
}

export interface EntryFlowchart {
  type: "flowchart";
  blocks: EntryFlowBlock[];
}

export interface EntryFlowBlock {
  type: "flowBlock";
  name?: string;
  entries: Entry[];
}

export interface EntryImage {
  type: "image";
  href: { type: string; path: string; url?: string };
  title?: string;
  altText?: string;
  width?: number;
  height?: number;
}

export interface EntryAbilityGeneric {
  type: "abilityGeneric";
  name?: string;
  text: string;
  attributes?: string[];
}

// ─── Union type ─────────────────────────────────────────

export type Entry =
  | string
  | EntryEntries
  | EntrySection
  | EntryInset
  | EntryInsetReadaloud
  | EntryQuote
  | EntryList
  | EntryItem
  | EntryListItem
  | EntryTable
  | EntryTableGroup
  | EntryInline
  | EntryInlineBlock
  | EntryLink
  | EntryOptions
  | EntryDice
  | EntryBonus
  | EntryBonusSpeed
  | EntryAbilityDc
  | EntryAbilityAttackMod
  | EntryAbilityGeneric
  | EntryCell
  | EntryOptionalFeature
  | EntrySubclassFeature
  | EntryClassFeature
  | EntryHr
  | EntrySpellcasting
  | EntryFlowchart
  | EntryFlowBlock
  | EntryImage;
