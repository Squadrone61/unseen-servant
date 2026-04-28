const KNOWN_PREFIXES = new Set(["place", "npc", "pc", "item", "faction"]);
const ENTITY_REGEX = /\{([a-z]+):([^}]+)\}/g;

export function preprocessEntityTags(text: string): string {
  return text.replace(ENTITY_REGEX, (_match, prefix: string, name: string) => {
    const cls = KNOWN_PREFIXES.has(prefix) ? `entity-${prefix}` : "entity-unknown";
    return `<span class="${cls}">${name}</span>`;
  });
}
