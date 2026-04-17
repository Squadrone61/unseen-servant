import { GuideCallout } from "../GuideCallout";

export function TopicEndSession() {
  return (
    <div className="space-y-6">
      <p className="border-l-2 border-amber-500/30 pl-4 text-sm leading-relaxed text-amber-200/60 italic">
        Even the bravest adventurers must rest. The story will be here when you return.
      </p>

      <Section title="How to End a Session">
        <p>
          When you're ready to stop playing, simply tell the DM in chat:{" "}
          <em className="text-gray-300">"Let's end the session"</em> or{" "}
          <em className="text-gray-300">"We'd like to wrap up for today."</em>
        </p>
        <p>The DM will then:</p>
        <ol className="list-inside list-decimal space-y-1 text-gray-400">
          <li>Narrate a natural stopping point in the story</li>
          <li>Save a session summary with key events and decisions</li>
          <li>Snapshot each character's current state (HP, spell slots, inventory, conditions)</li>
          <li>Update the campaign context for next time</li>
        </ol>
      </Section>

      <Section title="What Gets Saved">
        <p>
          Campaign data is saved locally on the host's machine (where Claude Code is running). This
          includes:
        </p>
        <ul className="list-inside list-disc space-y-1 text-gray-400">
          <li>Session summary and narrative notes</li>
          <li>Character snapshots with all dynamic state</li>
          <li>World context (NPCs, locations, plot threads)</li>
          <li>Campaign configuration and custom DM instructions</li>
        </ul>
        <GuideCallout type="note">
          Campaign files are stored in a{" "}
          <code className="rounded bg-gray-800/60 px-1.5 py-0.5 text-xs text-amber-300/70">
            .unseen/campaigns/
          </code>{" "}
          folder on the host's machine. You can back these up or share them.
        </GuideCallout>
      </Section>

      <Section title="Exporting Your Character">
        <p>
          After a session, you can export your character from the character library as a{" "}
          <code className="rounded bg-gray-800/60 px-1.5 py-0.5 text-xs text-amber-300/70">
            .unseen.json
          </code>{" "}
          file. This preserves your character's full state and lets you import it in future sessions
          or share it with others.
        </p>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h3
        className="text-sm font-semibold tracking-wider text-amber-200/80 uppercase"
        style={{ fontFamily: "var(--font-cinzel)" }}
      >
        {title}
      </h3>
      <div className="space-y-3 text-sm leading-relaxed text-gray-400">{children}</div>
    </div>
  );
}
