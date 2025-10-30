/** Small UI helpers for status strings. */
export function combineStatus(crewCount: number, roomCount: number): string {
  const parts: string[] = [];
  if (crewCount) parts.push(`Loaded crew: ${crewCount}`);
  if (roomCount) parts.push(`Loaded rooms: ${roomCount}`);
  return parts.join("\n");
}
