"use client";

import { useBuilder } from "../BuilderContext";
import type { CharacterAppearance, CharacterTraits } from "@unseen-servant/shared/types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ALIGNMENTS = [
  "Lawful Good",
  "Neutral Good",
  "Chaotic Good",
  "Lawful Neutral",
  "True Neutral",
  "Chaotic Neutral",
  "Lawful Evil",
  "Neutral Evil",
  "Chaotic Evil",
  "Unaligned",
];

const APPEARANCE_FIELDS: { key: keyof CharacterAppearance; label: string; placeholder: string }[] =
  [
    { key: "height", label: "Height", placeholder: "e.g. 5'10\"" },
    { key: "weight", label: "Weight", placeholder: "e.g. 175 lbs" },
    { key: "eyes", label: "Eye Color", placeholder: "e.g. Amber" },
    { key: "hair", label: "Hair", placeholder: "e.g. Black, shoulder-length" },
    { key: "skin", label: "Skin", placeholder: "e.g. Olive" },
    { key: "age", label: "Age", placeholder: "e.g. 28" },
  ];

// ---------------------------------------------------------------------------
// Shared input class strings
// ---------------------------------------------------------------------------

const INPUT_CLASS =
  "w-full bg-gray-800/60 border border-gray-700/40 rounded-lg px-4 py-2 text-gray-200 placeholder-gray-600 focus:border-amber-500/50 focus:outline-none text-sm";

const LABEL_CLASS = "block text-sm font-medium text-gray-400 mb-1";

const SECTION_HEADING_CLASS =
  "text-base font-[family-name:var(--font-cinzel)] text-amber-200/80 mb-3";

// ---------------------------------------------------------------------------
// Section divider
// ---------------------------------------------------------------------------

function SectionDivider() {
  return (
    <div
      className="h-px bg-gradient-to-r from-transparent via-amber-500/20 to-transparent"
      aria-hidden="true"
    />
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DetailsStep() {
  const { state, dispatch } = useBuilder();

  function handleAppearanceChange(key: keyof CharacterAppearance, value: string) {
    dispatch({
      type: "SET_APPEARANCE",
      appearance: { [key]: value },
    });
  }

  function handleTraitsChange(key: keyof CharacterTraits, value: string) {
    dispatch({
      type: "SET_TRAITS",
      traits: { [key]: value },
    });
  }

  function handleCurrencyChange(key: keyof typeof state.currency, raw: string) {
    const parsed = parseInt(raw, 10);
    const value = isNaN(parsed) || parsed < 0 ? 0 : parsed;
    dispatch({
      type: "SET_CURRENCY",
      currency: { ...state.currency, [key]: value },
    });
  }

  return (
    <section aria-labelledby="details-step-heading" className="flex flex-col gap-6">
      {/* ── Header ── */}
      <div>
        <h1
          id="details-step-heading"
          className="text-xl font-[family-name:var(--font-cinzel)] text-amber-200/90 mb-1"
        >
          Character Details
        </h1>
        <p className="text-sm text-gray-400">
          Give your character a name and a story. Only the name is required.
        </p>
      </div>

      {/* ── Identity ── */}
      <div className="flex flex-col gap-4">
        <h2 className={SECTION_HEADING_CLASS}>Identity</h2>

        {/* Name */}
        <div>
          <label htmlFor="character-name" className={LABEL_CLASS}>
            Name{" "}
            <span className="text-red-400" aria-hidden="true">
              *
            </span>
          </label>
          <input
            id="character-name"
            type="text"
            value={state.name}
            onChange={(e) => dispatch({ type: "SET_NAME", name: e.target.value })}
            placeholder="Enter your character's name..."
            className={INPUT_CLASS}
            required
            aria-required="true"
          />
        </div>

        {/* Alignment */}
        <div>
          <label htmlFor="character-alignment" className={LABEL_CLASS}>
            Alignment
          </label>
          <select
            id="character-alignment"
            value={state.alignment}
            onChange={(e) => dispatch({ type: "SET_ALIGNMENT", alignment: e.target.value })}
            className={[
              INPUT_CLASS,
              "appearance-none cursor-pointer",
              !state.alignment ? "text-gray-600" : "",
            ].join(" ")}
            style={{ colorScheme: "dark" }}
          >
            <option value="" disabled>
              Choose alignment...
            </option>
            {ALIGNMENTS.map((alignment) => (
              <option key={alignment} value={alignment} className="bg-gray-900 text-gray-200">
                {alignment}
              </option>
            ))}
          </select>
        </div>
      </div>

      <SectionDivider />

      {/* ── Backstory ── */}
      <div className="flex flex-col gap-4">
        <h2 className={SECTION_HEADING_CLASS}>Backstory</h2>

        <div>
          <label htmlFor="character-backstory" className={LABEL_CLASS}>
            Backstory
          </label>
          <textarea
            id="character-backstory"
            value={state.backstory}
            onChange={(e) => dispatch({ type: "SET_BACKSTORY", backstory: e.target.value })}
            placeholder="Describe your character's history, motivations, and how they came to be an adventurer..."
            className={[INPUT_CLASS, "min-h-[120px] resize-y leading-relaxed"].join(" ")}
          />
        </div>
      </div>

      <SectionDivider />

      {/* ── Personality ── */}
      <div className="flex flex-col gap-4">
        <h2 className={SECTION_HEADING_CLASS}>Personality</h2>
        <p className="text-xs text-gray-500 -mt-2">
          These fields are optional and help the AI DM portray your character authentically.
        </p>

        <div>
          <label htmlFor="character-personality-traits" className={LABEL_CLASS}>
            Personality Traits
          </label>
          <textarea
            id="character-personality-traits"
            value={state.traits.personalityTraits ?? ""}
            onChange={(e) => handleTraitsChange("personalityTraits", e.target.value)}
            placeholder="Describe how your character typically behaves, speaks, or presents themselves..."
            rows={2}
            className={[INPUT_CLASS, "resize-y leading-relaxed"].join(" ")}
          />
        </div>

        <div>
          <label htmlFor="character-ideals" className={LABEL_CLASS}>
            Ideals
          </label>
          <textarea
            id="character-ideals"
            value={state.traits.ideals ?? ""}
            onChange={(e) => handleTraitsChange("ideals", e.target.value)}
            placeholder="What principles or beliefs does your character hold above all else?"
            rows={2}
            className={[INPUT_CLASS, "resize-y leading-relaxed"].join(" ")}
          />
        </div>

        <div>
          <label htmlFor="character-bonds" className={LABEL_CLASS}>
            Bonds
          </label>
          <textarea
            id="character-bonds"
            value={state.traits.bonds ?? ""}
            onChange={(e) => handleTraitsChange("bonds", e.target.value)}
            placeholder="What connects your character to the world — people, places, or memories?"
            rows={2}
            className={[INPUT_CLASS, "resize-y leading-relaxed"].join(" ")}
          />
        </div>

        <div>
          <label htmlFor="character-flaws" className={LABEL_CLASS}>
            Flaws
          </label>
          <textarea
            id="character-flaws"
            value={state.traits.flaws ?? ""}
            onChange={(e) => handleTraitsChange("flaws", e.target.value)}
            placeholder="What weakness, fear, or vice could get your character into trouble?"
            rows={2}
            className={[INPUT_CLASS, "resize-y leading-relaxed"].join(" ")}
          />
        </div>
      </div>

      <SectionDivider />

      {/* ── Appearance ── */}
      <div className="flex flex-col gap-4">
        <h2 className={SECTION_HEADING_CLASS}>Appearance</h2>
        <p className="text-xs text-gray-500 -mt-2">
          All appearance fields are optional and help the AI DM describe your character.
        </p>

        <div className="grid grid-cols-2 gap-3">
          {APPEARANCE_FIELDS.map(({ key, label, placeholder }) => (
            <div key={key}>
              <label htmlFor={`appearance-${key}`} className={LABEL_CLASS}>
                {label}
              </label>
              <input
                id={`appearance-${key}`}
                type="text"
                value={state.appearance[key] ?? ""}
                onChange={(e) => handleAppearanceChange(key, e.target.value)}
                placeholder={placeholder}
                className={INPUT_CLASS}
              />
            </div>
          ))}
        </div>
      </div>

      <SectionDivider />

      {/* ── Starting Currency ── */}
      <div className="flex flex-col gap-3">
        <h2 className={SECTION_HEADING_CLASS}>Starting Currency</h2>
        <p className="text-xs text-gray-500 -mt-2">
          Set your starting gold and coins. Leave at zero to let the AI DM assign starting wealth.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {(["gp", "sp", "cp", "pp"] as const).map((coin) => (
            <div key={coin}>
              <label htmlFor={`currency-${coin}`} className={LABEL_CLASS}>
                {coin.toUpperCase()}
              </label>
              <input
                id={`currency-${coin}`}
                type="number"
                min={0}
                value={state.currency[coin]}
                onChange={(e) => handleCurrencyChange(coin, e.target.value)}
                className={[
                  INPUT_CLASS,
                  "text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none",
                ].join(" ")}
              />
            </div>
          ))}
        </div>
      </div>

      <SectionDivider />

      {/* ── Starting Equipment ── */}
      <div className="flex flex-col gap-3">
        <h2 className={SECTION_HEADING_CLASS}>Starting Equipment</h2>

        <div className="bg-gray-800/30 border border-gray-700/20 rounded-lg px-4 py-3">
          <p className="text-sm text-gray-500 leading-relaxed">
            Starting equipment will be based on your class and background. The AI Dungeon Master
            will equip your character with appropriate gear when your adventure begins.
          </p>
          {(state.classes[0]?.name ?? null) && (
            <p className="mt-2 text-xs text-amber-400/70">
              Class: {state.classes[0]?.name ?? null}
              {state.background ? ` · Background: ${state.background}` : ""}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
