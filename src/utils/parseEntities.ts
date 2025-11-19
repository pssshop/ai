import type { RawEntity } from "@/types";
import { findCharacterByName, findRoomByName } from "./sprites";

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

export function parseCrewaiText(
  text: string,
  fileName = "crewai.txt",
  chars?: any[],
  rooms?: any[],
  actionsMap?: Record<string, string>,
  conditionsMap?: Record<string, string>
) {
  // Sections separated by one or more blank lines
  const sections = text.split(/\n\s*\n+/g).map(s => s.trim()).filter(Boolean);
  const out: any[] = [];

  for (const sec of sections) {
    const lines = sec.split(/\n+/).map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) continue;

    // first line is the title; it may include a parenthesized suffix (e.g. coordinates)
    const nameLine = lines[0];
    // capture prefix and optional parenthesized content at end
    const titleMatch = nameLine.match(/^(.*?)(?:\s*\(([^)]+)\))?\s*$/);
    const titlePrefix = (titleMatch && titleMatch[1] ? titleMatch[1].trim() : nameLine).replace(/\s*\(room\)\s*$/i, "").replace(/\s*\(crew\)\s*$/i, "").trim();
    const titleParen = titleMatch && titleMatch[2] ? titleMatch[2].trim() : undefined;
    // default name used for lookup/room naming; crew names will prefer the parenthesized value
    let name = titlePrefix;

    // find AI: line
    const aiLine = lines.find(l => /^AI:/i.test(l) || /cmds=/i.test(l));
    let aiUrl: string | undefined;
    if (aiLine) {
      const idx = aiLine.indexOf("AI:");
      aiUrl = idx >= 0 ? aiLine.slice(idx + 3).trim() : aiLine.trim();
    }

    const entity: any = { name };

    // Try to match the title prefix against known characters or rooms (use shared helpers)
    let matchedChar: any | undefined;
    let matchedRoom: any | undefined;
    if (Array.isArray(chars) && chars.length) matchedChar = findCharacterByName(titlePrefix, chars as any[]);
    if (Array.isArray(rooms) && rooms.length) matchedRoom = findRoomByName(titlePrefix, rooms as any[]);

    if (matchedChar) {
      entity.character_design_id = matchedChar.character_design_id;
      entity.profile_sprite_id = matchedChar.profile_sprite_id;
      // For crews, prefer the parenthesized title as the actual name when available
      entity.name = titleParen || titlePrefix;
    } else if (matchedRoom) {
      entity.room_design_id = matchedRoom.room_design_id;
      entity.image_sprite_id = matchedRoom.image_sprite_id;
      entity.name = titlePrefix;
    } else {
      // fallback heuristic: if the name included (room) or the first line looks like a room, mark as room
      if (/\(room\)/i.test(nameLine) || /\broom\b/i.test(nameLine)) {
        entity.room_design_id = `imported:${fileName}`;
        entity.name = titlePrefix;
      } else {
        // mark as crew (use profile_sprite_id presence so classifyEntitiesFromArray buckets it as crew)
        entity.profile_sprite_id = `imported:${fileName}`;
        entity.name = titleParen || titlePrefix;
      }
    }

    if (aiUrl) {
      // try to parse cmds query param (token format: condxaction|condxaction|...)
      try {
        const url = new URL(aiUrl);
        const cmds = url.searchParams.get("cmds");
        if (cmds) {
          entity.ai = cmds.split("|").map(token => {
            const parts = token.split(/x/i).map(p => (p || "").trim());
            const condRaw = parts[0] || "";
            const actRaw = parts[1] || "";
            const condition = (conditionsMap && conditionsMap[condRaw]) || condRaw;
            const action = (actionsMap && actionsMap[actRaw]) || actRaw;
            return { condition, action };
          });
        }
      } catch (err) {
        // fallback: try to extract cmds=... manually
        const m = aiUrl.match(/[?&]cmds=([^&]+)/i);
        if (m && m[1]) {
          const cmdsStr = decodeURIComponent(m[1]);
          entity.ai = cmdsStr.split("|").map(token => {
            const parts = token.split(/x/i).map(p => (p || "").trim());
            const condRaw = parts[0] || "";
            const actRaw = parts[1] || "";
            const condition = (conditionsMap && conditionsMap[condRaw]) || condRaw;
            const action = (actionsMap && actionsMap[actRaw]) || actRaw;
            return { condition, action };
          });
        }
      }
    }

    out.push(entity);
  }

  return out;
}
