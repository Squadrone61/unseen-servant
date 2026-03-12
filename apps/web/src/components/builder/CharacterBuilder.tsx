"use client";

import { useReducer, useEffect, useCallback, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { buildCharacter } from "@aidnd/shared/builders";
import { useCharacterLibrary } from "@/hooks/useCharacterLibrary";
import { useCharacterImport } from "@/hooks/useCharacterImport";
import { CharacterImport } from "@/components/character/CharacterImport";
import { builderReducer, createInitialState } from "./reducer";
import { BuilderStepper } from "./BuilderStepper";
import { StepSpecies } from "./StepSpecies";
import { StepBackground } from "./StepBackground";
import { StepClass } from "./StepClass";
import { StepAbilities } from "./StepAbilities";
import { StepFeats } from "./StepFeats";
import { StepSkills } from "./StepSkills";
import { StepSpells } from "./StepSpells";
import { StepEquipment } from "./StepEquipment";
import { StepDetails } from "./StepDetails";
import { StepReview } from "./StepReview";
import { BUILDER_STEPS, type BuilderStep, type BuilderState } from "./types";
import { isStepValid, getStepsToSkip, assembleIdentifiers } from "./utils";
import type { CharacterData } from "@aidnd/shared/types";

interface CharacterBuilderProps {
  editId: string | null;
}

export function CharacterBuilder({ editId }: CharacterBuilderProps) {
  const router = useRouter();
  const { getCharacter, saveCharacter, updateCharacter } =
    useCharacterLibrary();
  const [state, dispatch] = useReducer(
    builderReducer,
    editId,
    createInitialState
  );

  // Import modal state
  const [showImportModal, setShowImportModal] = useState(false);
  const freshImportRef = useRef(false);

  const existingCharacter = editId ? getCharacter(editId)?.character ?? null : null;

  const {
    importState,
    character: importedCharacter,
    error: importError,
    fallbackHint: importFallbackHint,
    warnings: importWarnings,
    importFromUrl,
    importFromJson,
    clearCharacter: clearImportedCharacter,
    setFreshImport,
  } = useCharacterImport({
    existingCharacter: freshImportRef.current ? null : existingCharacter,
  });

  // Handle native .aidnd.json import
  const handleImportNative = useCallback((json: string) => {
    try {
      const parsed = JSON.parse(json);
      if (parsed?.format !== "aidnd" || !parsed?.character) {
        return;
      }
      const char = parsed.character as CharacterData;
      if (editId) {
        updateCharacter(editId, char, parsed.builderChoices);
        router.push(`/characters/${editId}`);
      } else {
        const saved = saveCharacter(char, { builderChoices: parsed.builderChoices });
        router.push(`/characters/${saved.id}`);
      }
    } catch {
      // Invalid JSON silently ignored
    }
  }, [editId, updateCharacter, saveCharacter, router]);

  // When DDB import succeeds, save and redirect
  useEffect(() => {
    if (importState !== "success" || !importedCharacter) return;
    if (editId) {
      updateCharacter(editId, importedCharacter);
      router.push(`/characters/${editId}`);
    } else {
      const saved = saveCharacter(importedCharacter);
      router.push(`/characters/${saved.id}`);
    }
  }, [importState, importedCharacter, editId, updateCharacter, saveCharacter, router]);

  // Hydrate from existing character in edit mode
  useEffect(() => {
    if (!editId) return;
    const saved = getCharacter(editId);
    if (saved?.builderChoices) {
      const hydrated: Partial<BuilderState> = {
        ...saved.builderChoices,
        editingId: editId,
      };
      // Ensure the name is visible on the species step (which shows first on edit)
      const charName = saved.character.static.name;
      if (charName && !hydrated.nameFromSpeciesStep) {
        hydrated.nameFromSpeciesStep = hydrated.name || charName;
      }
      dispatch({ type: "HYDRATE", state: hydrated });
    }
  }, [editId, getCharacter]);

  const skip = getStepsToSkip(state);
  const visibleSteps = BUILDER_STEPS.filter((s) => !skip.has(s));
  const currentIndex = visibleSteps.indexOf(state.currentStep);

  const goNext = useCallback(() => {
    if (currentIndex < visibleSteps.length - 1) {
      dispatch({ type: "SET_STEP", step: visibleSteps[currentIndex + 1] });
    }
  }, [currentIndex, visibleSteps]);

  const goBack = useCallback(() => {
    if (currentIndex > 0) {
      dispatch({ type: "SET_STEP", step: visibleSteps[currentIndex - 1] });
    }
  }, [currentIndex, visibleSteps]);

  const goToStep = useCallback(
    (step: BuilderStep) => {
      dispatch({ type: "SET_STEP", step });
    },
    []
  );

  const handleSave = useCallback(() => {
    if (!state.className) return;

    const ids = assembleIdentifiers(state);
    const { character } = buildCharacter(ids);

    // Extract builder choices for edit mode persistence
    const { currentStep: _, editingId: __, ...builderChoices } = state;

    if (state.editingId) {
      updateCharacter(state.editingId, character, builderChoices);
      router.push(`/characters/${state.editingId}`);
    } else {
      const saved = saveCharacter(character, { builderChoices });
      router.push(`/characters/${saved.id}`);
    }
  }, [state, saveCharacter, updateCharacter, router]);

  const canGoNext = isStepValid(state, state.currentStep);
  const isLastStep = state.currentStep === "review";

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <div className="bg-gray-800 border-b border-gray-700 px-6 py-3 shrink-0">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-lg font-bold text-purple-400">
              {state.editingId ? "Edit Character" : "Create Character"}
            </h1>
            <div className="flex items-center gap-2">
              {state.editingId && (
                <button
                  onClick={() => {
                    freshImportRef.current = false;
                    setFreshImport(false);
                    clearImportedCharacter();
                    setShowImportModal(true);
                  }}
                  className="text-xs px-3 py-1.5 rounded bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 transition-colors"
                >
                  Update
                </button>
              )}
              <button
                onClick={() => {
                  freshImportRef.current = true;
                  setFreshImport(true);
                  clearImportedCharacter();
                  setShowImportModal(true);
                }}
                className="text-xs px-3 py-1.5 rounded bg-purple-600/20 text-purple-400 hover:bg-purple-600/30 transition-colors"
              >
                Import
              </button>
              <Link
                href="/characters"
                className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
              >
                Cancel
              </Link>
            </div>
          </div>
          <BuilderStepper state={state} onStepClick={goToStep} />
        </div>
      </div>

      {/* Step Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-6 py-6">
          {renderStep(state.currentStep, state, dispatch)}
        </div>
      </div>

      {/* Footer Navigation */}
      <div className="bg-gray-800 border-t border-gray-700 px-6 py-3 shrink-0">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <button
            onClick={goBack}
            disabled={currentIndex === 0}
            className="text-sm px-4 py-2 rounded-lg bg-gray-700 text-gray-300 hover:bg-gray-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            Back
          </button>
          <div className="text-xs text-gray-500">
            Step {currentIndex + 1} of {visibleSteps.length}
          </div>
          {isLastStep ? (
            <button
              onClick={handleSave}
              disabled={!canGoNext}
              className="text-sm px-6 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors font-medium"
            >
              {state.editingId ? "Save Changes" : "Save Character"}
            </button>
          ) : (
            <button
              onClick={goNext}
              disabled={!canGoNext}
              className="text-sm px-6 py-2 rounded-lg bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors font-medium"
            >
              Next
            </button>
          )}
        </div>
      </div>

      {/* Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-gray-950/80"
            onClick={() => setShowImportModal(false)}
          />
          <div className="relative bg-gray-800 border border-gray-600 rounded-lg shadow-xl max-w-md w-full p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-200">
                {freshImportRef.current ? "Import Character" : "Update from D&D Beyond"}
              </h3>
              <button
                onClick={() => setShowImportModal(false)}
                className="text-gray-500 hover:text-gray-300 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            {!freshImportRef.current && (
              <p className="text-[10px] text-gray-500 leading-relaxed">
                Re-imports from D&D Beyond while preserving HP, conditions, and other in-game state.
              </p>
            )}
            <CharacterImport
              importState={importState}
              character={importedCharacter}
              error={importError}
              fallbackHint={importFallbackHint}
              warnings={importWarnings}
              onImportUrl={importFromUrl}
              onImportJson={importFromJson}
              onImportNative={handleImportNative}
              onClear={clearImportedCharacter}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function renderStep(
  step: BuilderStep,
  state: Parameters<typeof StepSpecies>[0]["state"],
  dispatch: Parameters<typeof StepSpecies>[0]["dispatch"]
) {
  switch (step) {
    case "species":
      return <StepSpecies state={state} dispatch={dispatch} />;
    case "background":
      return <StepBackground state={state} dispatch={dispatch} />;
    case "class":
      return <StepClass state={state} dispatch={dispatch} />;
    case "abilities":
      return <StepAbilities state={state} dispatch={dispatch} />;
    case "feats":
      return <StepFeats state={state} dispatch={dispatch} />;
    case "skills":
      return <StepSkills state={state} dispatch={dispatch} />;
    case "spells":
      return <StepSpells state={state} dispatch={dispatch} />;
    case "equipment":
      return <StepEquipment state={state} dispatch={dispatch} />;
    case "details":
      return <StepDetails state={state} dispatch={dispatch} />;
    case "review":
      return <StepReview state={state} dispatch={dispatch} onSave={() => {}} />;
  }
}
