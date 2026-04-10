"use client";

import { useMemo, useState } from "react";
import { speciesArray } from "@unseen-servant/shared/data";
import type { SpeciesDb } from "@unseen-servant/shared/data";
import { DetailPopover } from "@/components/character/DetailPopover";
import { EffectSummary } from "@/components/builder/EffectSummary";
import { ChoicePicker } from "@/components/builder/ChoicePicker";
import { RichText } from "@/components/ui/RichText";
import { InfoButton } from "@/components/builder/InfoButton";
import { useBuilder } from "../BuilderContext";

// ─── Species Detail Popover ──────────────────────────────────────────────────

function SpeciesPopover({
  species,
  onClose,
  position,
}: {
  species: SpeciesDb;
  onClose: () => void;
  position: { x: number; y: number };
}) {
  return (
    <DetailPopover title={species.name} onClose={onClose} position={position}>
      <div className="space-y-3">
        {/* Quick stats */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-700/50 text-gray-300 border border-gray-600/30">
            {species.size.join("/")}
          </span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-700/50 text-gray-300 border border-gray-600/30">
            {species.speed} ft
          </span>
          {species.darkvision && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-blue-900/40 text-blue-300 border border-blue-700/30">
              Darkvision {species.darkvision} ft
            </span>
          )}
        </div>

        {/* Effect badges */}
        {species.effects && <EffectSummary effects={species.effects} />}

        {/* Description — never truncated */}
        <div className="text-sm text-gray-300 leading-relaxed">
          <RichText text={species.description} />
        </div>
      </div>
    </DetailPopover>
  );
}

// ─── Compact Species Card ────────────────────────────────────────────────────

function SpeciesCard({
  species,
  isSelected,
  onClick,
  onDetailsClick,
}: {
  species: SpeciesDb;
  isSelected: boolean;
  onClick: () => void;
  onDetailsClick: (e: React.MouseEvent) => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`
        w-full text-left px-4 py-3 rounded-lg border transition-all duration-200
        ${
          isSelected
            ? "border-amber-500/50 bg-amber-950/20 ring-1 ring-amber-500/20"
            : "border-gray-700/30 bg-gray-800/40 hover:border-gray-600/50 hover:bg-gray-800/60"
        }
      `}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span
            className={`font-[family-name:var(--font-cinzel)] text-sm ${
              isSelected ? "text-amber-200" : "text-gray-200"
            }`}
          >
            {species.name}
          </span>
          <InfoButton onClick={onDetailsClick} />
        </div>
        <span className="text-xs text-gray-500 shrink-0 whitespace-nowrap">
          {species.size.join("/")} · {species.speed} ft
          {species.darkvision ? ` · DV ${species.darkvision}` : ""}
        </span>
      </div>
    </button>
  );
}

// ─── Main Step ───────────────────────────────────────────────────────────────

export function SpeciesStep() {
  const { state, dispatch } = useBuilder();
  const [popover, setPopover] = useState<{
    species: SpeciesDb;
    position: { x: number; y: number };
  } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const sortedSpecies = useMemo(
    () => [...speciesArray].sort((a, b) => a.name.localeCompare(b.name)),
    [],
  );

  const filteredSpecies = useMemo(() => {
    if (!searchQuery.trim()) return sortedSpecies;
    const q = searchQuery.toLowerCase();
    return sortedSpecies.filter((s) => s.name.toLowerCase().includes(q));
  }, [sortedSpecies, searchQuery]);

  const selectedSpecies = useMemo(
    () => (state.species ? (sortedSpecies.find((s) => s.name === state.species) ?? null) : null),
    [state.species, sortedSpecies],
  );

  function handleDetailsClick(species: SpeciesDb, e: React.MouseEvent) {
    setPopover({ species, position: { x: e.clientX, y: e.clientY } });
  }

  function handleToggleSelect(name: string) {
    if (state.species === name) {
      dispatch({ type: "CLEAR_SPECIES" });
    } else {
      dispatch({ type: "SET_SPECIES", species: name });
    }
  }

  function handleChoiceSelect(choiceId: string, values: string[]) {
    dispatch({ type: "SET_SPECIES_CHOICE", choiceId, values });
  }

  return (
    <section aria-labelledby="species-step-heading" className="flex flex-col gap-5">
      {/* Header */}
      <div>
        <h1
          id="species-step-heading"
          className="text-xl font-[family-name:var(--font-cinzel)] text-amber-200/90 mb-1"
        >
          Choose Your Species
        </h1>
        <p className="text-sm text-gray-400">
          Your species shapes your physiology, innate abilities, and place in the world. Click a
          card to select it, or use the info icon to view full details.
        </p>
      </div>

      {/* Selected banner */}
      {selectedSpecies && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg border border-amber-500/30 bg-amber-950/15">
          <span className="text-sm text-amber-200 font-medium">✓ {selectedSpecies.name}</span>
          <span className="text-xs text-gray-500">
            {selectedSpecies.size.join("/")} · {selectedSpecies.speed} ft
            {selectedSpecies.darkvision ? ` · Darkvision ${selectedSpecies.darkvision} ft` : ""}
          </span>
          <div className="flex-1" />
          <button
            onClick={(e) => handleDetailsClick(selectedSpecies, e)}
            className="text-xs text-amber-400/70 hover:text-amber-300 transition-colors"
          >
            View Details
          </button>
          <button
            onClick={() => dispatch({ type: "CLEAR_SPECIES" })}
            className="text-xs text-gray-500 hover:text-red-400 transition-colors"
          >
            Change
          </button>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">🔍</span>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search species..."
          className="w-full pl-9 pr-4 py-2.5 bg-gray-800/60 border border-gray-700/40 rounded-lg text-sm text-gray-200 placeholder-gray-500 focus:border-amber-500/50 focus:outline-none transition-colors"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
          >
            ✕
          </button>
        )}
      </div>

      {/* Compact grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {filteredSpecies.map((species) => (
          <SpeciesCard
            key={species.name}
            species={species}
            isSelected={state.species === species.name}
            onClick={() => handleToggleSelect(species.name)}
            onDetailsClick={(e) => handleDetailsClick(species, e)}
          />
        ))}
        {filteredSpecies.length === 0 && (
          <p className="col-span-full text-center text-gray-500 text-sm py-6">
            No species match your search.
          </p>
        )}
      </div>

      <p className="text-xs text-gray-600 text-center">{sortedSpecies.length} species available</p>

      {/* Choices section (inline, below grid) */}
      {selectedSpecies && selectedSpecies.choices && selectedSpecies.choices.length > 0 && (
        <>
          <div className="h-px bg-gradient-to-r from-transparent via-amber-500/20 to-transparent" />
          <div>
            <h2 className="text-lg font-[family-name:var(--font-cinzel)] text-amber-200/90 mb-1">
              {selectedSpecies.name} Traits
            </h2>
            <p className="text-sm text-gray-400">
              Make the following choices for your {selectedSpecies.name}.
            </p>
          </div>
          <div className="flex flex-col gap-4">
            {selectedSpecies.choices.map((choice) => (
              <ChoicePicker
                key={choice.id}
                choice={choice}
                selected={state.speciesChoices[choice.id] ?? []}
                onSelect={(values) => handleChoiceSelect(choice.id, values)}
                nestedSelections={state.speciesChoices}
                onNestedSelect={(nestedId, values) => handleChoiceSelect(nestedId, values)}
              />
            ))}
          </div>
        </>
      )}

      {/* Popover */}
      {popover && (
        <SpeciesPopover
          species={popover.species}
          onClose={() => setPopover(null)}
          position={popover.position}
        />
      )}
    </section>
  );
}
