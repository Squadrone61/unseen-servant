import { GuideCallout } from "../GuideCallout";

export function TopicResumeCampaign() {
  return (
    <div className="space-y-6">
      <p className="text-sm text-amber-200/60 italic leading-relaxed border-l-2 border-amber-500/30 pl-4">
        The story does not end when the candles burn low. It waits, patient, for your return.
      </p>

      <Section title="Loading an Existing Campaign">
        <p>
          When the host opens <strong>Configure Campaign</strong>, they can choose{" "}
          <strong>Load Existing</strong> instead of starting a new campaign. The dropdown shows all
          saved campaigns with their session counts.
        </p>
        <p>
          Select the campaign you want to continue and click <strong>Configure</strong>. The DM will
          load the full campaign context — previous session summaries, character snapshots, world
          notes — and pick up the story where you left off.
        </p>
      </Section>

      <Section title="What Gets Restored">
        <ul className="list-disc list-inside space-y-1 text-gray-400">
          <li>
            <strong className="text-gray-300">Campaign notes</strong> — The DM remembers NPCs,
            locations, plot threads, and decisions from prior sessions
          </li>
          <li>
            <strong className="text-gray-300">Character snapshots</strong> — HP, spell slots,
            inventory, and conditions from the end of the last session
          </li>
          <li>
            <strong className="text-gray-300">Session history</strong> — A summary of what happened
            previously, so the DM can reference past events
          </li>
          <li>
            <strong className="text-gray-300">Custom DM instructions</strong> — Any tone or style
            preferences you set are preserved
          </li>
        </ul>
        <GuideCallout type="tip">
          Players should select the same character they used in the previous session. The DM will
          recognize them and restore their progress.
        </GuideCallout>
      </Section>

      <Section title="Changing the Party">
        <p>
          It's fine if the party composition changes between sessions. New players can join with
          fresh characters, and absent players won't break anything. The DM adapts to whoever is at
          the table.
        </p>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h3
        className="text-sm font-semibold text-amber-200/80 uppercase tracking-wider"
        style={{ fontFamily: "var(--font-cinzel)" }}
      >
        {title}
      </h3>
      <div className="space-y-3 text-sm text-gray-400 leading-relaxed">{children}</div>
    </div>
  );
}
