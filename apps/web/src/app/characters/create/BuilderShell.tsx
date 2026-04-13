"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { TopBar } from "@/components/ui/TopBar";
import { Button } from "@/components/ui/Button";
import { useBuilder } from "./BuilderContext";
import { useComputedCharacter } from "./useComputedCharacter";
import { CharacterSheet } from "@/components/character/CharacterSheet";
import { useCharacterLibrary } from "@/hooks/useCharacterLibrary";
import { SpeciesStep } from "./steps/SpeciesStep";
import { BackgroundStep } from "./steps/BackgroundStep";
import { ClassStep } from "./steps/ClassStep";
import { AbilitiesStep } from "./steps/AbilitiesStep";
import { FeatsStep } from "./steps/FeatsStep";
import { SpellsStep } from "./steps/SpellsStep";
import { EquipmentStep } from "./steps/EquipmentStep";
import { DetailsStep } from "./steps/DetailsStep";
import type { BuilderState } from "./builder-state";
import { getHP } from "@unseen-servant/shared/character";

// ─── Step definitions ────────────────────────────────────────────────────────

type StepId =
  | "species"
  | "background"
  | "class"
  | "abilities"
  | "feats"
  | "spells"
  | "equipment"
  | "details";

interface StepDef {
  id: StepId;
  label: string;
  number: number;
}

const STEPS: StepDef[] = [
  { id: "species", label: "Species", number: 1 },
  { id: "background", label: "Background", number: 2 },
  { id: "class", label: "Class", number: 3 },
  { id: "abilities", label: "Abilities", number: 4 },
  { id: "feats", label: "Feats", number: 5 },
  { id: "spells", label: "Spells", number: 6 },
  { id: "equipment", label: "Equipment", number: 7 },
  { id: "details", label: "Details", number: 8 },
];

// ─── Unlock logic ─────────────────────────────────────────────────────────────

function getUnlockedSteps(
  state: ReturnType<typeof useBuilder>["state"],
  editMode: boolean,
): Set<StepId> {
  // In edit mode all steps are immediately available since the character
  // is already complete — the user should be able to jump to any step.
  if (editMode) {
    return new Set<StepId>(STEPS.map((s) => s.id));
  }

  const unlocked = new Set<StepId>();

  unlocked.add("species");
  unlocked.add("details");

  const speciesDone = Boolean(state.species);
  if (speciesDone) unlocked.add("background");

  const backgroundDone = speciesDone && Boolean(state.background);
  if (backgroundDone) unlocked.add("class");

  const classDone = backgroundDone && state.classes.length > 0;
  if (classDone) unlocked.add("abilities");

  const abilitiesDone = classDone && state.completedSteps.includes("abilities");
  if (abilitiesDone) {
    unlocked.add("feats");
    unlocked.add("spells");
    unlocked.add("equipment");
  }

  return unlocked;
}

function getCompletedSteps(state: BuilderState): Set<StepId> {
  const completed = new Set<StepId>();
  state.completedSteps.forEach((step) => completed.add(step as StepId));
  return completed;
}

// ─── Step content router ──────────────────────────────────────────────────────

function StepContent({ stepId }: { stepId: StepId }) {
  switch (stepId) {
    case "species":
      return <SpeciesStep />;
    case "background":
      return <BackgroundStep />;
    case "class":
      return <ClassStep />;
    case "abilities":
      return <AbilitiesStep />;
    case "feats":
      return <FeatsStep />;
    case "spells":
      return <SpellsStep />;
    case "equipment":
      return <EquipmentStep />;
    case "details":
      return <DetailsStep />;
  }
}

// ─── Step sidebar ─────────────────────────────────────────────────────────────

interface StepSidebarProps {
  activeStep: StepId;
  unlockedSteps: Set<StepId>;
  completedSteps: Set<StepId>;
  onSelectStep: (id: StepId) => void;
  onFinish: () => void;
  canFinish: boolean;
  finishError: string | null;
  finishLabel?: string;
}

function StepSidebar({
  activeStep,
  unlockedSteps,
  completedSteps,
  onSelectStep,
  onFinish,
  canFinish,
  finishError,
  finishLabel = "Finish",
}: StepSidebarProps) {
  return (
    <aside className="w-[200px] shrink-0 flex flex-col bg-gray-900/50 border-l border-gray-700/40">
      <div className="flex-1 py-4 overflow-y-auto">
        <ul className="flex flex-col gap-0.5 px-2">
          {STEPS.map((step) => {
            const isCurrent = step.id === activeStep;
            const isComplete = completedSteps.has(step.id);
            const isUnlocked = unlockedSteps.has(step.id);

            return (
              <li key={step.id}>
                <button
                  onClick={() => isUnlocked && onSelectStep(step.id)}
                  disabled={!isUnlocked}
                  className={[
                    "w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-left transition-colors duration-150 text-sm",
                    isCurrent
                      ? "bg-amber-500/10 text-amber-300"
                      : isUnlocked
                        ? "text-gray-400 hover:bg-gray-700/30 hover:text-gray-200"
                        : "text-gray-700 cursor-not-allowed",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  aria-current={isCurrent ? "step" : undefined}
                >
                  <span
                    className={[
                      "w-5 h-5 shrink-0 rounded-full flex items-center justify-center text-xs font-medium border",
                      isCurrent
                        ? "border-amber-500/50 bg-amber-500/20 text-amber-300"
                        : isComplete
                          ? "border-emerald-600/50 bg-emerald-600/20 text-emerald-400"
                          : isUnlocked
                            ? "border-gray-600/50 bg-gray-800/60 text-gray-500"
                            : "border-gray-700/30 bg-gray-900/30 text-gray-700",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    aria-hidden="true"
                  >
                    {isComplete && !isCurrent ? (
                      <svg
                        viewBox="0 0 12 12"
                        fill="none"
                        className="w-3 h-3"
                        stroke="currentColor"
                        strokeWidth={2}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M2 6l3 3 5-5" />
                      </svg>
                    ) : isCurrent ? (
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                    ) : (
                      step.number
                    )}
                  </span>

                  <span
                    className="truncate"
                    style={isCurrent ? { fontFamily: "var(--font-cinzel)" } : undefined}
                  >
                    {step.label}
                  </span>
                </button>
              </li>
            );
          })}

          {/* Finish action — last item in the stepper list */}
          <li className="mt-2 px-0">
            <button
              onClick={onFinish}
              disabled={!canFinish}
              title={!canFinish ? "Complete Species, Class, and Abilities first" : undefined}
              className={[
                "w-full px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 disabled:cursor-not-allowed",
                canFinish
                  ? "bg-amber-600/80 hover:bg-amber-500/80 text-amber-50 shadow-[0_0_12px_rgba(245,158,11,0.15)] hover:shadow-[0_0_20px_rgba(245,158,11,0.25)]"
                  : "bg-gray-700 text-gray-500",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {finishLabel} ✓
            </button>
            {finishError && (
              <p className="mt-1.5 px-1 text-xs text-red-400 leading-snug">{finishError}</p>
            )}
          </li>
        </ul>
      </div>
    </aside>
  );
}

// ─── BuilderShell ─────────────────────────────────────────────────────────────

export interface BuilderShellProps {
  mode: "create" | "edit";
  /** Present only in edit mode — the SavedCharacter id being edited. */
  editId?: string;
  /** Display name for the character being edited, shown in the header. */
  editName?: string;
  /** Original dynamic data to preserve during edit (HP, conditions, spell slots, etc.) */
  editDynamicData?: import("@unseen-servant/shared/types").CharacterDynamicData;
}

/**
 * Shared layout for both create and edit modes.
 * Must be rendered inside a BuilderProvider.
 */
export function BuilderShell({ mode, editId, editName, editDynamicData }: BuilderShellProps) {
  const { state } = useBuilder();
  const [activeStep, setActiveStep] = useState<StepId>("species");
  const [finishError, setFinishError] = useState<string | null>(null);
  const router = useRouter();
  const { saveCharacter, updateCharacter } = useCharacterLibrary();
  const { character, warnings: _warnings } = useComputedCharacter(state);

  const isEditMode = mode === "edit";
  const unlockedSteps = getUnlockedSteps(state, isEditMode);
  const completedSteps = getCompletedSteps(state);
  const canFinish = character !== null;

  // ── Step navigation helpers ─────────────────────────────────────────────────
  const currentIndex = STEPS.findIndex((s) => s.id === activeStep);
  const isFirstStep = currentIndex === 0;
  const isLastStep = currentIndex === STEPS.length - 1;
  const nextStep = !isLastStep ? STEPS[currentIndex + 1] : null;
  const prevStep = !isFirstStep ? STEPS[currentIndex - 1] : null;
  const nextStepLabel = nextStep?.label ?? "";

  function goToNextStep() {
    if (nextStep && unlockedSteps.has(nextStep.id)) {
      setActiveStep(nextStep.id);
    }
  }

  function goToPreviousStep() {
    if (prevStep) {
      setActiveStep(prevStep.id);
    }
  }

  // ── Finish ──────────────────────────────────────────────────────────────────
  function handleFinish() {
    if (!character) {
      setFinishError(
        "Your character is incomplete. Complete at least Species, Class, and Abilities before finishing.",
      );
      return;
    }
    setFinishError(null);

    if (isEditMode && editId) {
      // Merge: new static data from builder + preserved dynamic data from gameplay
      const mergedCharacter = editDynamicData
        ? {
            builder: state,
            static: character.static,
            dynamic: {
              ...editDynamicData,
              // Clamp currentHP if maxHP decreased
              currentHP: Math.min(editDynamicData.currentHP, getHP(character)),
            },
          }
        : character;
      updateCharacter(editId, mergedCharacter);
    } else {
      saveCharacter(character);
    }

    router.push("/characters");
  }

  const topBarCurrent = isEditMode ? `Editing: ${editName ?? "Character"}` : "Create Character";

  return (
    <div className="min-h-screen flex flex-col bg-gray-950">
      <TopBar items={[{ label: "Characters", href: "/characters" }]} current={topBarCurrent} />

      <div className="flex flex-1 overflow-hidden">
        {/* Character sheet — left panel */}
        <aside className="w-[380px] shrink-0 overflow-y-auto border-r border-gray-700/40 bg-gray-900/30">
          {character ? (
            <CharacterSheet character={character} />
          ) : (
            <div className="flex items-center justify-center h-full p-6">
              <p className="text-gray-600 text-sm text-center">
                Select a species and class to see your character sheet
              </p>
            </div>
          )}
        </aside>

        {/* Main content — center */}
        <main className="flex-1 overflow-y-auto p-6 min-w-0">
          <StepContent stepId={activeStep} />

          {/* Step navigation footer */}
          <div className="mt-8 flex items-center gap-3">
            {prevStep && (
              <Button variant="ghost" onClick={goToPreviousStep}>
                &larr; Back
              </Button>
            )}
            <div className="flex-1" />
            {nextStep && (
              <Button
                variant="primary"
                onClick={goToNextStep}
                disabled={!completedSteps.has(activeStep) && !isEditMode}
              >
                <span style={{ fontFamily: "var(--font-cinzel)" }}>
                  Continue to {nextStepLabel}
                </span>
              </Button>
            )}
          </div>
        </main>

        {/* Step sidebar — right panel */}
        <StepSidebar
          activeStep={activeStep}
          unlockedSteps={unlockedSteps}
          completedSteps={completedSteps}
          onSelectStep={setActiveStep}
          onFinish={handleFinish}
          canFinish={canFinish}
          finishError={finishError}
          finishLabel={isEditMode ? "Save Changes" : "Finish"}
        />
      </div>
    </div>
  );
}
