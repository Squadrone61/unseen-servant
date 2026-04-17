import { GuideCallout } from "../GuideCallout";

export function TopicCharacterBuilder() {
  return (
    <div className="space-y-6">
      <p className="border-l-2 border-amber-500/30 pl-4 text-sm leading-relaxed text-amber-200/60 italic">
        Every hero begins with a name, a past, and the courage to face the unknown.
      </p>

      <Section title="The Character Builder">
        <p>
          From the home page, click <strong>My Characters</strong> (bottom-right) then{" "}
          <strong>Create New Character</strong>. The builder walks you through each step:
        </p>
        <ol className="list-inside list-decimal space-y-1 text-gray-400">
          <li>
            <strong className="text-gray-300">Species</strong> — Choose your race (Human, Elf,
            Dwarf, etc.) and any species traits
          </li>
          <li>
            <strong className="text-gray-300">Background</strong> — Your character&apos;s history
            and origin, which grants skill proficiencies and a feat
          </li>
          <li>
            <strong className="text-gray-300">Class</strong> — Fighter, Wizard, Rogue, and more.
            This determines your abilities and play style
          </li>
          <li>
            <strong className="text-gray-300">Abilities</strong> — Set your six ability scores
            (Strength, Dexterity, Constitution, Intelligence, Wisdom, Charisma)
          </li>
          <li>
            <strong className="text-gray-300">Skills & Feats</strong> — Pick proficiencies and
            special abilities
          </li>
          <li>
            <strong className="text-gray-300">Spells</strong> — If your class uses magic, choose
            your cantrips and prepared spells
          </li>
          <li>
            <strong className="text-gray-300">Equipment</strong> — Select starting gear, weapons,
            and armor
          </li>
          <li>
            <strong className="text-gray-300">Details</strong> — Name your character, write a
            backstory, choose alignment and appearance
          </li>
        </ol>
        <GuideCallout type="tip">
          You can go back to any step to make changes before finishing. Your character is saved to
          your browser&apos;s local storage — no account required.
        </GuideCallout>
      </Section>

      <Section title="Importing a Character">
        <p>
          If you have a character from a previous session, you can import it. Character files use
          the{" "}
          <code className="rounded bg-gray-800/60 px-1.5 py-0.5 text-xs text-amber-300/70">
            .unseen.json
          </code>{" "}
          format.
        </p>
        <p>
          Go to <strong>My Characters</strong> and click <strong>Import Character</strong>, then
          upload the file. Your full character sheet — stats, spells, inventory, class features —
          will be restored.
        </p>
      </Section>

      <Section title="Selecting a Character In-Game">
        <p>
          Once you&apos;re in a game room, click the character icon in the top-left area to open
          your character selection. Pick from your saved characters or import one on the spot. Your
          character sheet will appear in the left sidebar with all your stats, spells, and
          inventory.
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
