import { useMemo } from "react";
import { buildCharacter } from "@unseen-servant/shared/builders";
import { CharacterSheet } from "@/components/character/CharacterSheet";
import type { StepProps } from "./types";
import { assembleIdentifiers, isStepValid } from "./utils";
import { BUILDER_STEPS } from "./types";

interface StepReviewProps extends StepProps {
  onSave: () => void;
}

export function StepReview({ state }: StepReviewProps) {
  const result = useMemo(() => {
    if (state.classes.length === 0) return null;
    try {
      const ids = assembleIdentifiers(state);
      return buildCharacter(ids);
    } catch (e) {
      return { error: String(e) };
    }
  }, [state]);

  // Validation warnings
  const validationIssues = useMemo(() => {
    const issues: string[] = [];
    for (const step of BUILDER_STEPS) {
      if (!isStepValid(state, step)) {
        issues.push(`Step "${step}" is not complete`);
      }
    }
    return issues;
  }, [state]);

  if (!result || "error" in result) {
    return (
      <div className="text-center py-12">
        <div className="text-red-400 text-sm mb-2">Could not build character</div>
        <p className="text-xs text-gray-500">
          {"error" in (result ?? {})
            ? (result as { error: string }).error
            : "Please complete all required steps."}
        </p>
      </div>
    );
  }

  const { character, warnings } = result;

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h2
          className="text-xl font-semibold text-amber-200/90 tracking-wide"
          style={{ fontFamily: "var(--font-cinzel)" }}
        >
          Review Your Character
        </h2>
        <p className="text-sm text-gray-500">
          Review your character below. Click "Save Character" when you're ready.
        </p>
        <div className="h-px bg-gradient-to-r from-amber-500/30 via-gray-700/50 to-transparent mt-2" />
      </div>

      {/* Warnings */}
      {(warnings.length > 0 || validationIssues.length > 0) && (
        <div className="bg-yellow-900/10 border border-yellow-800/20 rounded-lg p-3">
          {validationIssues.map((issue: string, i: number) => (
            <div key={`v${i}`} className="text-xs text-yellow-500">
              {issue}
            </div>
          ))}
          {warnings.map((w: string, i: number) => (
            <div key={`w${i}`} className="text-xs text-yellow-500">
              {w}
            </div>
          ))}
        </div>
      )}

      {/* Character Sheet */}
      <div className="bg-gray-800/60 border border-gray-700/40 rounded-lg overflow-hidden">
        <CharacterSheet character={character} />
      </div>
    </div>
  );
}
