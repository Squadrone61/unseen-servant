"use client";

import { useMemo, useState } from "react";
import { speciesArray, getBackground } from "@unseen-servant/shared/data";
import type { SpeciesDb } from "@unseen-servant/shared/data";
import type { ResolveChoiceContext } from "@unseen-servant/shared/builders";
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
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-gray-600/30 bg-gray-700/50 px-2 py-0.5 text-xs text-gray-300">
            {species.size.join("/")}
          </span>
          <span className="rounded-full border border-gray-600/30 bg-gray-700/50 px-2 py-0.5 text-xs text-gray-300">
            {species.speed} ft
          </span>
          {(species.effects?.properties ?? []).find(
            (p) => p.type === "sense" && (p as { sense?: string }).sense === "darkvision",
          ) && (
            <span className="rounded-full border border-blue-700/30 bg-blue-900/40 px-2 py-0.5 text-xs text-blue-300">
              Darkvision{" "}
              {
                (
                  (species.effects?.properties ?? []).find(
                    (p) => p.type === "sense" && (p as { sense?: string }).sense === "darkvision",
                  ) as { range: number }
                ).range
              }{" "}
              ft
            </span>
          )}
        </div>

        {/* Effect badges */}
        {species.effects && <EffectSummary effects={species.effects} />}

        {/* Description — never truncated */}
        <div className="text-sm leading-relaxed text-gray-300">
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
        w-full rounded-lg border px-4 py-3 text-left transition-all duration-200
        ${
          isSelected
            ? "border-amber-500/50 bg-amber-950/20 ring-1 ring-amber-500/20"
            : "border-gray-700/30 bg-gray-800/40 hover:border-gray-600/50 hover:bg-gray-800/60"
        }
      `}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <span
            className={`font-cinzel text-sm ${isSelected ? "text-amber-200" : "text-gray-200"}`}
          >
            {species.name}
          </span>
          <InfoButton onClick={onDetailsClick} />
        </div>
        <span className="shrink-0 text-xs whitespace-nowrap text-gray-500">
          {species.size.join("/")} · {species.speed} ft
          {(species.effects?.properties ?? []).find(
            (p) => p.type === "sense" && (p as { sense?: string }).sense === "darkvision",
          )
            ? ` · DV ${((species.effects?.properties ?? []).find((p) => p.type === "sense" && (p as { sense?: string }).sense === "darkvision") as { range: number }).range}`
            : ""}
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
        <h1 id="species-step-heading" className="mb-1 font-cinzel text-xl text-amber-200/90">
          Choose Your Species
        </h1>
        <p className="text-sm text-gray-400">
          Your species shapes your physiology, innate abilities, and place in the world. Click a
          card to select it, or use the info icon to view full details.
        </p>
      </div>

      {/* Selected banner */}
      {selectedSpecies && (
        <div className="flex items-center gap-3 rounded-lg border border-amber-500/30 bg-amber-950/15 px-4 py-3">
          <span className="text-sm font-medium text-amber-200">✓ {selectedSpecies.name}</span>
          <span className="text-xs text-gray-500">
            {selectedSpecies.size.join("/")} · {selectedSpecies.speed} ft
            {(selectedSpecies.effects?.properties ?? []).find(
              (p) => p.type === "sense" && (p as { sense?: string }).sense === "darkvision",
            )
              ? ` · Darkvision ${((selectedSpecies.effects?.properties ?? []).find((p) => p.type === "sense" && (p as { sense?: string }).sense === "darkvision") as { range: number }).range} ft`
              : ""}
          </span>
          <div className="flex-1" />
          <button
            onClick={(e) => handleDetailsClick(selectedSpecies, e)}
            className="text-xs text-amber-400/70 transition-colors hover:text-amber-300"
          >
            View Details
          </button>
          <button
            onClick={() => dispatch({ type: "CLEAR_SPECIES" })}
            className="text-xs text-gray-500 transition-colors hover:text-red-400"
          >
            Change
          </button>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <span className="absolute top-1/2 left-3 -translate-y-1/2 text-sm text-gray-500">🔍</span>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search species..."
          className="w-full rounded-lg border border-gray-700/40 bg-gray-800/60 py-2.5 pr-4 pl-9 text-sm text-gray-200 placeholder-gray-500 transition-colors focus:border-amber-500/50 focus:outline-none"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery("")}
            className="absolute top-1/2 right-3 -translate-y-1/2 text-gray-500 hover:text-gray-300"
          >
            ✕
          </button>
        )}
      </div>

      {/* Compact grid */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
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
          <p className="col-span-full py-6 text-center text-sm text-gray-500">
            No species match your search.
          </p>
        )}
      </div>

      <p className="text-center text-xs text-gray-600">{sortedSpecies.length} species available</p>

      {/* Choices section (inline, below grid) */}
      {selectedSpecies && selectedSpecies.choices && selectedSpecies.choices.length > 0 && (
        <>
          <div className="h-px bg-linear-to-r from-transparent via-amber-500/20 to-transparent" />
          <div>
            <h2 className="mb-1 font-cinzel text-lg text-amber-200/90">
              {selectedSpecies.name} Traits
            </h2>
            <p className="text-sm text-gray-400">
              Make the following choices for your {selectedSpecies.name}.
            </p>
          </div>
          <div className="flex flex-col gap-4">
            {selectedSpecies.choices.map((choice) => {
              // For feat pool choices, exclude the background's origin feat
              let ctx: ResolveChoiceContext | undefined;
              if ("pool" in choice && choice.pool === "feat" && state.background) {
                const bgFeat = getBackground(state.background)?.feat;
                if (bgFeat) ctx = { excludeIds: [bgFeat] };
              }
              return (
                <ChoicePicker
                  key={choice.id}
                  choice={choice}
                  selected={state.speciesChoices[choice.id] ?? []}
                  onSelect={(values) => handleChoiceSelect(choice.id, values)}
                  nestedSelections={state.speciesChoices}
                  onNestedSelect={(nestedId, values) => handleChoiceSelect(nestedId, values)}
                  ctx={ctx}
                />
              );
            })}
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
