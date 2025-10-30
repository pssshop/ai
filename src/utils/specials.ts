// Lightweight mapping of special ability keys to human-friendly names.
// Add entries here as needed; user will add more.

export const SPECIAL_NAMES: Record<string, string> = {
  // starter entry requested by user
  ProtectRoom: "Stasis Shield",
  HealRoomHp: "Urgent Repair",
  Freeze: "Cryo Blast",
  DamageToSameRoomCharacters: "Poison Gas",
  DamageToCurrentEnemy: "Critical Attack",
  HealSameRoomCharacters: "Healing Rain",
  AddReload: "Rush Command",
  HealSelfHp: "First Aid"
};

export function humanizeSpecial(key?: string | null): string | null {
  if (!key) return null;
  if (SPECIAL_NAMES[key]) return SPECIAL_NAMES[key];
  // Fallback: split camel case / PascalCase and add spaces
//   const spaced = key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/_/g, " ");
  return key;
}

export default humanizeSpecial;
