// Lightweight mapping of special ability keys to human-friendly names.
// Add entries here as needed; user will add more.

export const SPECIAL_NAMES: Record<string, string> = {
  SetFire: "Arson",
  // Bloodlust already maps
  DamageToCurrentEnemy: "Critical Attack",
  Freeze: "Cryo Blast",
  //Firewalk already maps
  HealSelfHp: "First Aid",
  HealSameRoomCharacters: "Healing Rain",
  Invulnerability: "Phase Shift",
  DamageToSameRoomCharacters: "Poison Gas",
  AddReload: "Rush Command",
  ProtectRoom: "Stasis Shield",
  DeductReload: "System Hack",
  DamageToRoom: "Ultra Dismantle",
  HealRoomHp: "Urgent Repair",
};

export function humanizeSpecial(key?: string | null): string | null {
  if (!key) return null;
  if (SPECIAL_NAMES[key]) return SPECIAL_NAMES[key];
  // Fallback: split camel case / PascalCase and add spaces
//   const spaced = key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/_/g, " ");
  return key;
}

export default humanizeSpecial;
