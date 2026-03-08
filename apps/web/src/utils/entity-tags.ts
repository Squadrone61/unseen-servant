const ENTITY_REGEX = /\{(place|npc|pc|item|faction):([^}]+)\}/g;

export function preprocessEntityTags(text: string): string {
  return text.replace(ENTITY_REGEX, '<span class="entity-$1">$2</span>');
}

export function stripEntityTags(text: string): string {
  return text.replace(ENTITY_REGEX, "$2");
}
