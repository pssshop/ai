import type { RawEntity } from "@/types";

/**
 * Classify an array of raw objects into crew and room arrays using common
 * discriminator fields (`character_design_id` / `room_design_id`) and a
 * small fallback heuristic (presence of `profile_sprite_id`).
 */
export function classifyEntitiesFromArray(items: any[] = []): { crew: RawEntity[]; rooms: RawEntity[] } {
  const crew: RawEntity[] = [];
  const rooms: RawEntity[] = [];

  for (const item of items) {
    if (!item || typeof item !== "object") continue;

    if (Object.prototype.hasOwnProperty.call(item, "character_design_id")) {
      crew.push(item as RawEntity);
    } else if (Object.prototype.hasOwnProperty.call(item, "room_design_id")) {
      rooms.push(item as RawEntity);
    } else {
      // fallback: if it looks like a crew (has profile sprite), otherwise room
      if (Object.prototype.hasOwnProperty.call(item, "profile_sprite_id")) crew.push(item as RawEntity);
      else rooms.push(item as RawEntity);
    }
  }

  return { crew, rooms };
}
