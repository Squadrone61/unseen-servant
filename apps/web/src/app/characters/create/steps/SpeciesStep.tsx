"use client";

import { useMemo } from "react";
import { speciesArray } from "@unseen-servant/shared/data";
import type { SpeciesDb } from "@unseen-servant/shared/data";
import { EntityCard } from "@/components/builder/EntityCard";
import { EntityGrid } from "@/components/builder/EntityGrid";
import { ChoicePicker } from "@/components/builder/ChoicePicker";
import { useBuilder } from "../BuilderContext";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build the quick-stat strings shown below the species name on each card. */
function buildStats(s: SpeciesDb): string[] {
  const stats: string[] = [];

  // Size — collapse identical single entries, join multiples
  if (s.size.length === 1) {
    stats.push(s.size[0]);
  } else {
    stats.push(s.size.join("/"));
  }

  // Speed
  stats.push(`${s.speed} ft`);

  // Darkvision
  if (s.darkvision) {
    stats.push(`DV ${s.darkvision}`);
  }

  return stats;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SpeciesStep() {
  const { state, dispatch } = useBuilder();

  // Sort species alphabetically — the shared array order is insertion order
  const sortedSpecies = useMemo(
    () => [...speciesArray].sort((a, b) => a.name.localeCompare(b.name)),
    [],
  );

  const selectedSpecies = useMemo(
    () => (state.species ? (sortedSpecies.find((s) => s.name === state.species) ?? null) : null),
    [state.species, sortedSpecies],
  );

  function handleSelect(name: string) {
    if (state.species === name) {
      // Deselect — allow user to go back to the grid
      dispatch({ type: "CLEAR_SPECIES" });
    } else {
      dispatch({ type: "SET_SPECIES", species: name });
    }
  }

  function handleChoiceSelect(choiceId: string, values: string[]) {
    dispatch({ type: "SET_SPECIES_CHOICE", choiceId, values });
  }

  const hasChoices = (selectedSpecies?.choices?.length ?? 0) > 0;

  return (
    <section aria-labelledby="species-step-heading" className="flex flex-col gap-6">
      {/* ── Section header ── */}
      <div>
        <h1
          id="species-step-heading"
          className="text-xl font-[family-name:var(--font-cinzel)] text-amber-200/90 mb-1"
        >
          Choose Your Species
        </h1>
        <p className="text-sm text-gray-400">
          Your species shapes your physiology, innate abilities, and place in the world. You can
          search by name below.
        </p>
      </div>

      {/* ── Species grid ── */}
      <EntityGrid<SpeciesDb>
        items={sortedSpecies}
        selected={state.species}
        onSelect={handleSelect}
        searchable
        searchPlaceholder="Search species..."
        renderCard={(item, isSelected) => (
          <EntityCard
            name={item.name}
            description={item.description}
            effects={item.effects}
            stats={buildStats(item)}
            selected={isSelected}
            expandable
            // onClick is handled by the EntityGrid wrapper
          />
        )}
      />

      {/* ── Choices section (only when a species is selected and it has choices) ── */}
      {selectedSpecies && hasChoices && (
        <>
          {/* Divider */}
          <div
            className="h-px bg-gradient-to-r from-transparent via-amber-500/20 to-transparent my-6"
            aria-hidden="true"
          />

          {/* Choices header */}
          <div>
            <h2 className="text-xl font-[family-name:var(--font-cinzel)] text-amber-200/90 mb-1">
              {selectedSpecies.name} Traits
            </h2>
            <p className="text-sm text-gray-400">
              Make the following choices for your {selectedSpecies.name}.
            </p>
          </div>

          {/* One ChoicePicker per choice */}
          <div className="flex flex-col gap-4">
            {selectedSpecies.choices!.map((choice) => (
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
    </section>
  );
}
