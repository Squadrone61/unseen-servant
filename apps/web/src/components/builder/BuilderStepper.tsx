import { BUILDER_STEPS, STEP_LABELS, type BuilderStep } from "./types";
import { type BuilderState } from "./types";
import { isStepValid, isStepTouched, getStepsToSkip } from "./utils";

interface BuilderStepperProps {
  state: BuilderState;
  onStepClick: (step: BuilderStep) => void;
}

export function BuilderStepper({ state, onStepClick }: BuilderStepperProps) {
  const skip = getStepsToSkip(state);
  const visibleSteps = BUILDER_STEPS.filter((s) => !skip.has(s));

  return (
    <div className="flex items-center gap-0.5 overflow-x-auto pb-1">
      {visibleSteps.map((step, i) => {
        const isActive = step === state.currentStep;
        const touched = isStepTouched(state, step);
        const valid = isStepValid(state, step);
        const isCompleted = !isActive && touched && valid;
        const isInvalid = !isActive && touched && !valid;

        return (
          <div key={step} className="flex items-center">
            <button
              onClick={() => onStepClick(step)}
              className={`group flex items-center gap-1.5 px-2 py-1.5 rounded text-xs font-medium whitespace-nowrap transition-all duration-200 cursor-pointer ${
                isActive
                  ? "text-amber-300"
                  : isInvalid
                    ? "text-red-400 hover:text-red-300"
                    : isCompleted
                      ? "text-emerald-400 hover:text-emerald-300"
                      : "text-gray-500 hover:text-gray-300"
              }`}
            >
              <span
                className={`relative flex items-center justify-center w-5 h-5 rounded-full text-xs font-bold shrink-0 transition-all duration-200 ${
                  isActive
                    ? "bg-amber-500/20 text-amber-300 ring-1 ring-amber-400/50 shadow-[0_0_8px_rgba(245,158,11,0.3)]"
                    : isInvalid
                      ? "bg-red-600/20 text-red-400 ring-1 ring-red-500/30"
                      : isCompleted
                        ? "bg-emerald-600/20 text-emerald-400 ring-1 ring-emerald-500/30"
                        : "bg-gray-800 text-gray-600 group-hover:bg-gray-700"
                }`}
              >
                {isInvalid ? (
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                  </svg>
                ) : isCompleted ? (
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  i + 1
                )}
              </span>
              <span className="hidden sm:inline">{STEP_LABELS[step]}</span>
            </button>
            {/* Connector line */}
            {i < visibleSteps.length - 1 && (
              <div
                className={`w-3 h-px mx-0.5 transition-colors ${
                  isCompleted ? "bg-emerald-500/30" : "bg-gray-700/50"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
