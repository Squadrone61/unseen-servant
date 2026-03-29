import { GuideCallout } from "../GuideCallout";

export function TopicCombat() {
  return (
    <div className="space-y-6">
      <p className="text-sm text-amber-200/60 italic leading-relaxed border-l-2 border-amber-500/30 pl-4">
        Steel yourself, adventurer. Initiative has been rolled.
      </p>

      <Section title="When Combat Starts">
        <p>
          The DM starts combat when a hostile encounter begins. When this happens, several things
          appear automatically:
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-400">
          <li>
            <strong className="text-gray-300">Battle Map</strong> — A tactical grid showing the
            environment with tokens for each combatant
          </li>
          <li>
            <strong className="text-gray-300">Initiative Tracker</strong> — Turn order displayed
            above the map, showing who goes when
          </li>
          <li>
            <strong className="text-gray-300">Combat State</strong> — HP bars, conditions, and round
            counter
          </li>
        </ul>
      </Section>

      <Section title="The Battle Map">
        <p>
          The battle map is a grid where each cell represents a 5-foot square. Tokens represent
          characters and enemies.
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-400">
          <li>
            <strong className="text-gray-300">Your token</strong> — Click it to select it, then
            click an empty highlighted cell to move there
          </li>
          <li>
            <strong className="text-gray-300">Movement range</strong> — When you select your token,
            cells you can reach are highlighted based on your movement speed
          </li>
          <li>
            <strong className="text-gray-300">Terrain</strong> — Some cells may have objects (walls,
            trees, furniture), cover, or different elevation
          </li>
          <li>
            <strong className="text-gray-300">Area effects</strong> — Spell effects like Fireball or
            Fog Cloud appear as colored overlays on the map
          </li>
        </ul>
        <GuideCallout type="tip">
          You can also describe movement in chat ("I move behind the pillar") and the DM will move
          your token for you.
        </GuideCallout>
      </Section>

      <Section title="Taking Your Turn">
        <p>When it's your turn, the initiative tracker highlights your name. You can:</p>
        <ol className="list-decimal list-inside space-y-1 text-gray-400">
          <li>
            <strong className="text-gray-300">Move</strong> — Click your token, then click where you
            want to go
          </li>
          <li>
            <strong className="text-gray-300">Act</strong> — Describe your action in chat: "I attack
            the goblin with my longsword" or "I cast Fireball centered on the group"
          </li>
          <li>
            <strong className="text-gray-300">End Turn</strong> — Click <strong>End Turn</strong> in
            the initiative tracker when you're done
          </li>
        </ol>
        <p>
          The DM handles all the mechanics — attack rolls, damage, saving throws, spell effects. You
          just describe what you want to do.
        </p>
      </Section>

      <Section title="Spells in Combat">
        <p>
          When you cast a spell, the DM automatically tracks your spell slots. You can see your
          remaining slots on your character sheet. The DM will:
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-400">
          <li>Deduct the spell slot at the appropriate level</li>
          <li>Apply the spell's effects (damage, conditions, healing)</li>
          <li>Track concentration if the spell requires it</li>
          <li>Show area-of-effect overlays on the battle map for AoE spells</li>
        </ul>
        <GuideCallout type="note">
          If you're concentrating on a spell and take damage, the DM will call for a Constitution
          saving throw to maintain concentration.
        </GuideCallout>
      </Section>

      <Section title="HP, Damage & Conditions">
        <p>
          Your HP bar is visible on the battle map token and in your character sheet. The DM handles
          all damage and healing automatically. You'll see updates in real time:
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-400">
          <li>Damage reduces your HP (temporary HP absorbs damage first)</li>
          <li>Healing restores HP up to your maximum</li>
          <li>
            Conditions (poisoned, stunned, prone, etc.) appear as icons on your token and in the
            initiative tracker
          </li>
          <li>If you drop to 0 HP, the DM will manage death saving throws</li>
        </ul>
      </Section>

      <Section title="The Event Log & Rollback">
        <p>
          Every game event (damage dealt, conditions applied, combatants added) is logged. The host
          can open the <strong>Events</strong> panel in the top bar to see the full log and undo any
          event if something went wrong.
        </p>
        <GuideCallout type="host">
          Rollback is a host-only feature. If the DM makes a mistake (wrong damage amount, wrong
          target), use the event log to undo it. The game state reverts cleanly.
        </GuideCallout>
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
