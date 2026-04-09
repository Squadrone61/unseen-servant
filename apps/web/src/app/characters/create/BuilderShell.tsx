"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { TopBar } from "@/components/ui/TopBar";
import { Button } from "@/components/ui/Button";
import { useBuilder } from "./BuilderContext";
import { useComputedCharacter } from "./useComputedCharacter";
import { LivePreview } from "@/components/builder/LivePreview";
import { useCharacterLibrary } from "@/hooks/useCharacterLibrary";
import { SpeciesStep } from "./steps/SpeciesStep";
import { BackgroundStep } from "./steps/BackgroundStep";
import { ClassStep } from "./steps/ClassStep";
import { AbilitiesStep } from "./steps/AbilitiesStep";
import { FeatsStep } from "./steps/FeatsStep";
import { SpellsStep } from "./steps/SpellsStep";
import { DetailsStep } from "./steps/DetailsStep";
import type { BuilderState } from "./builder-state";

// ─── Step definitions ────────────────────────────────────────────────────────

type StepId = "species" | "background" | "class" | "abilities" | "feats" | "spells" | "details";

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
  { id: "details", label: "Details", number: 7 },
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

  const classDone = backgroundDone && Boolean(state.className);
  if (classDone) unlocked.add("abilities");

  const abilitiesDone = classDone && state.completedSteps.includes("abilities");
  if (abilitiesDone) {
    unlocked.add("feats");
    unlocked.add("spells");
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
  finishLabel?: string;
}

function StepSidebar({
  activeStep,
  unlockedSteps,
  completedSteps,
  onSelectStep,
  onFinish,
  finishLabel = "Finish",
}: StepSidebarProps) {
  return (
    <aside className="w-[200px] shrink-0 flex flex-col bg-gray-900/50 border-r border-gray-700/40">
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
        </ul>
      </div>

      <div className="p-3 border-t border-gray-700/40">
        <Button variant="primary" size="sm" fullWidth onClick={onFinish}>
          {finishLabel}
        </Button>
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
}

/**
 * Shared layout for both create and edit modes.
 * Must be rendered inside a BuilderProvider.
 */
export function BuilderShell({ mode, editId, editName }: BuilderShellProps) {
  const { state } = useBuilder();
  const [activeStep, setActiveStep] = useState<StepId>("species");
  const [finishError, setFinishError] = useState<string | null>(null);
  const router = useRouter();
  const { saveCharacter, updateCharacter } = useCharacterLibrary();
  const { character, warnings } = useComputedCharacter(state);

  const isEditMode = mode === "edit";
  const unlockedSteps = getUnlockedSteps(state, isEditMode);
  const completedSteps = getCompletedSteps(state);

  function handleFinish() {
    if (!character) {
      setFinishError(
        "Your character is incomplete. Complete at least Species, Class, and Abilities before finishing.",
      );
      return;
    }
    setFinishError(null);

    if (isEditMode && editId) {
      updateCharacter(editId, character);
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
        <StepSidebar
          activeStep={activeStep}
          unlockedSteps={unlockedSteps}
          completedSteps={completedSteps}
          onSelectStep={setActiveStep}
          onFinish={handleFinish}
          finishLabel={isEditMode ? "Save Changes" : "Finish"}
        />

        <main className="flex-1 overflow-y-auto p-6 min-w-0">
          {finishError && (
            <div className="mb-4 px-4 py-3 rounded-md bg-red-500/10 border border-red-500/30 text-sm text-red-400">
              {finishError}
            </div>
          )}
          <StepContent stepId={activeStep} />
        </main>

        <LivePreview character={character} warnings={warnings} />
      </div>
    </div>
  );
}
