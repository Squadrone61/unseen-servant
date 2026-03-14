"use client";

import { useReducer, useEffect, useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { Button } from "@/components/ui/Button";
import { motion, AnimatePresence } from "framer-motion";
import { buildCharacter } from "@aidnd/shared/builders";
import { useCharacterLibrary } from "@/hooks/useCharacterLibrary";
import { CharacterImport } from "@/components/character/CharacterImport";
import { useCharacterImport } from "@/hooks/useCharacterImport";
import { builderReducer, createInitialState } from "./reducer";
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
import { BUILDER_STEPS, STEP_LABELS, type BuilderStep, type BuilderState } from "./types";
import { isStepValid, isStepTouched, getStepsToSkip, assembleIdentifiers } from "./utils";
import { stepTransition } from "./animations";
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

  const {
    importState,
    character: importedCharacter,
    error: importError,
    importFromFile,
    clearCharacter: clearImportedCharacter,
  } = useCharacterImport();

  // Handle file import — save and redirect
  const handleFileImport = useCallback((json: string) => {
    try {
      const parsed = JSON.parse(json);
      if (parsed?.format !== "aidnd" || !parsed?.character) {
        importFromFile(json); // let the hook handle the error
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
      importFromFile(json); // let the hook handle the error
    }
  }, [editId, updateCharacter, saveCharacter, router, importFromFile]);

  // When import via hook succeeds, save and redirect
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

      // Migration: convert old single-class state to multiclass format
      const choices = saved.builderChoices as Record<string, unknown>;
      if (choices.className && !choices.classes) {
        hydrated.classes = [{
          className: choices.className as string,
          level: (choices.level as number) ?? 1,
          subclass: (choices.subclass as string | null) ?? null,
          optionalFeatureSelections: (choices.featureChoices as Record<string, string[]>) ?? {},
          weaponMasteries: (choices.weaponMasteries as string[]) ?? [],
        }];
        hydrated.activeClassIndex = 0;
      }

      // Migration: convert old flat spell selections to per-class format
      if (choices.selectedCantrips && !choices.spellSelections) {
        const className = (hydrated.classes as { className: string }[])?.[0]?.className;
        if (className) {
          hydrated.spellSelections = {
            [className]: {
              cantrips: (choices.selectedCantrips as string[]) ?? [],
              spells: (choices.selectedSpells as string[]) ?? [],
            },
          };
        }
      }

      // Migration: convert old ASI selections without classIndex
      if (Array.isArray(choices.asiSelections)) {
        const asiSels = choices.asiSelections as { classIndex?: number; level: number }[];
        if (asiSels.length > 0 && asiSels[0].classIndex === undefined) {
          hydrated.asiSelections = asiSels.map(s => ({ ...s, classIndex: 0 })) as BuilderState["asiSelections"];
        }
      }

      const charName = saved.character.static.name;
      if (charName && !hydrated.nameFromSpeciesStep) {
        hydrated.nameFromSpeciesStep = (hydrated as { name?: string }).name || charName;
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
    if (state.classes.length === 0) return;

    const ids = assembleIdentifiers(state);
    const { character } = buildCharacter(ids);

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
      <div className="relative bg-gray-800/80 border-b border-gray-700/50 px-6 py-3 shrink-0 backdrop-blur-sm">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-500/40 to-transparent" />

        <div className="max-w-6xl mx-auto">
          {editId ? (
            <Breadcrumb
              items={[
                { label: "Home", href: "/" },
                { label: "Characters", href: "/characters" },
                { label: getCharacter(editId)?.character.static.name ?? "Character", href: `/characters/${editId}` },
              ]}
              current="Edit"
            >
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  clearImportedCharacter();
                  setShowImportModal(true);
                }}
              >
                Import
              </Button>
              <Button variant="ghost" size="sm" href={`/characters/${editId}`}>
                Cancel
              </Button>
            </Breadcrumb>
          ) : (
            <Breadcrumb
              items={[
                { label: "Home", href: "/" },
                { label: "Characters", href: "/characters" },
              ]}
              current="Create"
            >
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  clearImportedCharacter();
                  setShowImportModal(true);
                }}
              >
                Import
              </Button>
            </Breadcrumb>
          )}
          <ProgressStepper
            steps={visibleSteps}
            currentStep={state.currentStep}
            state={state}
            onStepClick={goToStep}
          />
        </div>
      </div>

      {/* Step Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-6 py-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={state.currentStep}
              variants={stepTransition}
              initial="initial"
              animate="animate"
              exit="exit"
            >
              {renderStep(state.currentStep, state, dispatch)}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Footer Navigation */}
      <div className="relative bg-gray-800/80 border-t border-gray-700/50 px-6 py-3 shrink-0 backdrop-blur-sm">
        <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-amber-500/20 to-transparent" />
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <Button
            variant="secondary"
            size="sm"
            onClick={goBack}
            disabled={currentIndex === 0}
          >
            Back
          </Button>
          <div className="text-sm text-gray-600 tracking-wider uppercase" style={{ fontFamily: "var(--font-cinzel)" }}>
            Step {currentIndex + 1} of {visibleSteps.length}
          </div>
          {isLastStep ? (
            <Button
              variant="success"
              size="md"
              onClick={handleSave}
              disabled={!canGoNext}
            >
              {state.editingId ? "Save Changes" : "Save Character"}
            </Button>
          ) : (
            <Button
              size="md"
              onClick={goNext}
              disabled={!canGoNext}
            >
              Next
            </Button>
          )}
        </div>
      </div>

      {/* Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-gray-950/80 backdrop-blur-sm"
            onClick={() => setShowImportModal(false)}
          />
          <div className="relative bg-gray-800 border border-gray-600/50 rounded-xl shadow-2xl max-w-md w-full p-5 space-y-3">
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-500/30 to-transparent rounded-t-xl" />
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-200" style={{ fontFamily: "var(--font-cinzel)" }}>
                Import Character
              </h3>
              <Button
                variant="icon"
                onClick={() => setShowImportModal(false)}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </Button>
            </div>
            <CharacterImport
              importState={importState}
              character={importedCharacter}
              error={importError}
              onImportFile={handleFileImport}
              onClear={clearImportedCharacter}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Progress Stepper ───────────────────────────────────

function ProgressStepper({
  steps,
  currentStep,
  state,
  onStepClick,
}: {
  steps: BuilderStep[];
  currentStep: BuilderStep;
  state: BuilderState;
  onStepClick: (step: BuilderStep) => void;
}) {
  const currentIndex = steps.indexOf(currentStep);

  return (
    <div className="flex items-center gap-1">
      {steps.map((step, i) => {
        const isActive = step === currentStep;
        const touched = isStepTouched(state, step);
        const valid = isStepValid(state, step);
        const isCompleted = !isActive && touched && valid;
        const isPast = i < currentIndex;

        return (
          <div key={step} className="flex items-center flex-1 last:flex-none">
            <button
              onClick={() => onStepClick(step)}
              className="group flex items-center gap-1.5 relative"
              title={STEP_LABELS[step]}
            >
              {/* Step indicator */}
              <div
                className={`relative flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold shrink-0 transition-all duration-300 ${
                  isActive
                    ? "bg-amber-500/25 text-amber-300 ring-2 ring-amber-400/60 shadow-[0_0_12px_rgba(245,158,11,0.35)]"
                    : isCompleted
                      ? "bg-emerald-600/25 text-emerald-400 ring-1 ring-emerald-500/40"
                      : isPast
                        ? "bg-gray-700/50 text-gray-500 ring-1 ring-gray-600/30"
                        : "bg-gray-800/80 text-gray-600 group-hover:bg-gray-700/60 group-hover:text-gray-400"
                }`}
              >
                {isCompleted ? (
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  i + 1
                )}
              </div>
              <span
                className={`hidden lg:inline text-xs font-medium whitespace-nowrap transition-colors ${
                  isActive
                    ? "text-amber-300"
                    : isCompleted
                      ? "text-emerald-400/70"
                      : "text-gray-600 group-hover:text-gray-400"
                }`}
              >
                {STEP_LABELS[step]}
              </span>
            </button>
            {/* Connector */}
            {i < steps.length - 1 && (
              <div className="flex-1 mx-1.5 h-px min-w-2">
                <div
                  className={`h-full transition-colors duration-300 ${
                    isCompleted || isPast ? "bg-emerald-500/30" : "bg-gray-700/40"
                  }`}
                />
              </div>
            )}
          </div>
        );
      })}
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
