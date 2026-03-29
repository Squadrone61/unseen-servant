import { GuideCallout } from "../GuideCallout";

export function TopicStartCampaign() {
  return (
    <div className="space-y-6">
      <p className="text-sm text-amber-200/60 italic leading-relaxed border-l-2 border-amber-500/30 pl-4">
        A great adventure needs a steady hand to guide it. As host, you set the stage.
      </p>

      <Section title="Creating a Room">
        <p>
          On the home page, enter your player name and click <strong>Create Room</strong>. You'll be
          taken to a game room with a unique 6-character code visible in the top bar.
        </p>
        <p>Click the room code to copy it, then share it with your players so they can join.</p>
        <GuideCallout type="tip">
          You can set a room password in <strong>Settings</strong> (gear icon, top-right) to keep
          uninvited guests out.
        </GuideCallout>
      </Section>

      <Section title="Launching the DM">
        <p>
          The AI Dungeon Master runs through a separate launcher. You need{" "}
          <strong>Claude Code CLI</strong> installed on your machine, plus the Unseen Servant
          launcher file (
          <code className="text-amber-300/70 bg-gray-800/60 px-1.5 py-0.5 rounded text-xs">
            unseen-servant.mjs
          </code>
          ).
        </p>
        <p>In your terminal, run:</p>
        <pre className="bg-gray-900/60 border border-gray-700/30 rounded-lg px-4 py-3 text-xs text-gray-300 font-mono overflow-x-auto">
          node unseen-servant.mjs
        </pre>
        <p>
          The launcher will ask for the room code and which Claude model to use. Once connected,
          you'll see the DM status indicator turn green in the top bar.
        </p>
      </Section>

      <Section title="Configuring the Campaign">
        <p>
          Once the DM is connected, click <strong>Configure Campaign</strong> in the sidebar. You
          can start a new campaign or load an existing one.
        </p>
        <p>For a new campaign, you'll set:</p>
        <ul className="list-disc list-inside space-y-1 text-gray-400">
          <li>
            <strong className="text-gray-300">Campaign Name</strong> — Give your adventure a title
          </li>
          <li>
            <strong className="text-gray-300">Pacing</strong> — Story-Heavy, Balanced, or
            Combat-Heavy
          </li>
          <li>
            <strong className="text-gray-300">Encounter Length</strong> — Quick, Standard, or Epic
          </li>
          <li>
            <strong className="text-gray-300">Custom DM Instructions</strong> — Optional text to
            shape the DM's style (tone, setting, homebrew rules)
          </li>
        </ul>
        <GuideCallout type="host">
          Custom DM Instructions are powerful. Try things like "Use a dark gothic horror tone" or
          "Be generous with loot" or "NPCs speak in riddles."
        </GuideCallout>
      </Section>

      <Section title="Beginning the Adventure">
        <p>
          After configuration, make sure all players have joined and selected their characters. Then
          click <strong>Begin the Adventure</strong>. The AI DM will generate an opening narrative
          based on your campaign settings and the party's characters.
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
