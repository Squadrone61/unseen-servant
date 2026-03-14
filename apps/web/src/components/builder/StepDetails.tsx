import type { StepProps } from "./types";
import { ALIGNMENTS } from "./utils";

export function StepDetails({ state, dispatch }: StepProps) {
  return (
    <div className="space-y-6 max-w-3xl">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold text-amber-200/90 tracking-wide" style={{ fontFamily: "var(--font-cinzel)" }}>
          Character Details
        </h2>
        <p className="text-sm text-gray-500">Personalize your character with a name, appearance, and personality.</p>
        <div className="h-px bg-gradient-to-r from-amber-500/30 via-gray-700/50 to-transparent mt-2" />
      </div>

      {/* Name + Alignment row */}
      <div className="flex gap-4">
        <div className="flex-1">
          <label className="text-sm text-gray-500 uppercase tracking-wider block mb-1" style={{ fontFamily: "var(--font-cinzel)" }}>
            Character Name
          </label>
          <input
            type="text"
            value={state.name || state.nameFromSpeciesStep}
            onChange={(e) => dispatch({ type: "SET_NAME", name: e.target.value })}
            placeholder="Enter your character's name..."
            className="w-full bg-gray-900/60 border border-gray-700/60 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-amber-500/50 focus:border-transparent"
          />
        </div>
        <div className="w-48">
          <label className="text-sm text-gray-500 uppercase tracking-wider block mb-1" style={{ fontFamily: "var(--font-cinzel)" }}>
            Alignment
          </label>
          <select
            value={state.alignment}
            onChange={(e) =>
              dispatch({ type: "SET_ALIGNMENT", alignment: e.target.value })
            }
            className="w-full bg-gray-900/60 border border-gray-700/60 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-1 focus:ring-amber-500/50"
          >
            <option value="">None</option>
            {ALIGNMENTS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Appearance */}
      <div>
        <div className="text-sm text-amber-200/60 font-medium mb-2" style={{ fontFamily: "var(--font-cinzel)" }}>
          Appearance
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {(
            [
              ["gender", "Gender"],
              ["age", "Age"],
              ["height", "Height"],
              ["weight", "Weight"],
              ["hair", "Hair"],
              ["eyes", "Eyes"],
              ["skin", "Skin"],
            ] as const
          ).map(([field, label]) => (
            <div key={field}>
              <label className="text-xs text-gray-500 block mb-0.5">
                {label}
              </label>
              <input
                type="text"
                value={(state.appearance[field] as string) ?? ""}
                onChange={(e) =>
                  dispatch({
                    type: "SET_APPEARANCE",
                    appearance: { [field]: e.target.value },
                  })
                }
                placeholder={label}
                className="w-full bg-gray-900/60 border border-gray-700/60 rounded px-2 py-1.5 text-xs text-gray-100 placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-amber-500/50"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Traits */}
      <div>
        <div className="text-sm text-amber-200/60 font-medium mb-2" style={{ fontFamily: "var(--font-cinzel)" }}>
          Personality
        </div>
        <div className="space-y-3">
          {(
            [
              ["personalityTraits", "Personality Traits"],
              ["ideals", "Ideals"],
              ["bonds", "Bonds"],
              ["flaws", "Flaws"],
            ] as const
          ).map(([field, label]) => (
            <div key={field}>
              <label className="text-xs text-gray-500 block mb-0.5">
                {label}
              </label>
              <textarea
                value={(state.traits[field] as string) ?? ""}
                onChange={(e) =>
                  dispatch({
                    type: "SET_TRAITS",
                    traits: { [field]: e.target.value },
                  })
                }
                placeholder={`Describe your character's ${label.toLowerCase()}...`}
                rows={2}
                className="w-full bg-gray-900/60 border border-gray-700/60 rounded px-2 py-1.5 text-xs text-gray-100 placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-amber-500/50 resize-y"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Backstory */}
      <div>
        <div className="text-sm text-amber-200/60 font-medium mb-2" style={{ fontFamily: "var(--font-cinzel)" }}>
          Backstory
        </div>
        <textarea
          value={state.backstory}
          onChange={(e) =>
            dispatch({ type: "SET_BACKSTORY", backstory: e.target.value })
          }
          placeholder="Write your character's backstory..."
          rows={5}
          className="w-full bg-gray-900/60 border border-gray-700/60 rounded px-2 py-1.5 text-xs text-gray-100 placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-amber-500/50 resize-y"
        />
      </div>
    </div>
  );
}
