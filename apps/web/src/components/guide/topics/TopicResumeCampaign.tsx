import { GuideCallout } from "../GuideCallout";

export function TopicResumeCampaign() {
  return (
    <div className="space-y-6">
      <p className="text-sm text-amber-200/60 italic leading-relaxed border-l-2 border-amber-500/30 pl-4">
        The story does not end when the candles burn low. It waits, patient, for your return.
      </p>

      <Section title="Resuming the DM Session">
        <p>
          The host needs to re-launch the DM in their terminal. Use the{" "}
          <code className="text-amber-300/70 bg-gray-800/60 px-1 py-0.5 rounded text-xs">
            --resume
          </code>{" "}
          flag with the campaign name to pick up the DM's conversation where it left off:
        </p>
        <pre className="bg-gray-900/60 border border-gray-700/30 rounded-lg px-4 py-3 text-xs text-gray-300 font-mono overflow-x-auto whitespace-pre-wrap">
          {`node unseen-servant.mjs --room ABC123 --resume "Curse of Strahd"`}
        </pre>
        <p>
          This restores the DM's full conversation history, so it remembers everything from previous
          sessions without needing to reload context.
        </p>
        <GuideCallout type="host">
          If you don't use <strong>--resume</strong>, you can still load the campaign through the
          in-app <strong>Configure Campaign</strong> dialog — choose <strong>Load Existing</strong>{" "}
          and select your campaign. The DM will load saved campaign notes, but won't have the
          previous conversation history.
        </GuideCallout>
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
