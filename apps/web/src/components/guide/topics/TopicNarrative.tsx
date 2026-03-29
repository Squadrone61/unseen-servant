import { GuideCallout } from "../GuideCallout";

export function TopicNarrative() {
  return (
    <div className="space-y-6">
      <p className="text-sm text-amber-200/60 italic leading-relaxed border-l-2 border-amber-500/30 pl-4">
        The world responds to your words. Speak boldly, act wisely, and the story unfolds.
      </p>

      <Section title="Talking to the DM">
        <p>
          Type your actions and dialogue in the chat panel at the bottom of the screen. The AI DM
          reads what you write and responds with narrative, NPC dialogue, and consequences.
        </p>
        <p>You can write in any style:</p>
        <ul className="list-disc list-inside space-y-1 text-gray-400">
          <li>
            <strong className="text-gray-300">Actions:</strong>{" "}
            <em>"I search the room for hidden doors"</em>
          </li>
          <li>
            <strong className="text-gray-300">Dialogue:</strong>{" "}
            <em>"I ask the innkeeper about the missing merchant"</em>
          </li>
          <li>
            <strong className="text-gray-300">Roleplay:</strong>{" "}
            <em>"Thorin slams his fist on the table. 'We march at dawn!'"</em>
          </li>
          <li>
            <strong className="text-gray-300">Questions:</strong>{" "}
            <em>"What does the room look like? Are there any exits?"</em>
          </li>
        </ul>
      </Section>

      <Section title="Dice Rolls & Checks">
        <p>
          When the DM calls for an ability check, saving throw, or attack roll, a{" "}
          <strong>Roll d20</strong> button appears in the chat. Click it and the roll is made
          automatically with the correct modifier from your character sheet.
        </p>
        <p>
          The DM decides when rolls are needed — you don't need to ask to roll. Just describe what
          you want to do, and if it requires a check, the DM will call for one.
        </p>
        <GuideCallout type="tip">
          You can see your modifiers on your character sheet in the left sidebar. The DM uses these
          automatically when computing roll results.
        </GuideCallout>
      </Section>

      <Section title="Multiplayer Etiquette">
        <p>
          Everyone types in the same chat. The DM reads all messages and responds to the group. A
          few tips for smooth play:
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-400">
          <li>Take turns — let others act before sending your next message</li>
          <li>Be specific about what your character does, not just what you want to happen</li>
          <li>
            The DM adapts to the party — if everyone is quiet, try prompting the story forward
          </li>
        </ul>
      </Section>

      <Section title="Your Character Sheet">
        <p>
          The left sidebar shows your full character sheet — ability scores, skills, spells,
          inventory, and class features. Everything updates in real time as the DM applies damage,
          grants items, or uses your spell slots.
        </p>
        <p>Click on any spell, item, or feature to see its full description.</p>
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
