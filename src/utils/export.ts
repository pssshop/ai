import type { EntityType, RawEntity, Rule } from "@/types";
import { loadCharacters, loadRooms } from "./sprites";

export interface ExportOptions {
  source: RawEntity;
  name: string;
  type: EntityType;
  rules: Rule[];
  spriteId?: string;
}

/**
 * Prepare entity data for export by:
 * - Spreading source object
 * - Updating name and AI rules
 * - Removing internal metadata fields
 * - Enriching with sprite/design data when available
 */
export async function prepareEntityExport(options: ExportOptions): Promise<Record<string, unknown>> {
  const { source, name, type, rules, spriteId } = options;

  const exportData: Record<string, unknown> = {
    ...source,
    name,
    ai: rules,
  };

  // Remove internal fields from export
  delete (exportData as any).id;
  delete (exportData as any).rules;
  delete (exportData as any).__builderMeta;
  delete (exportData as any).__sourceFile;
  delete (exportData as any).type;

  // Update sprite/design fields based on selection and enrich with design id/special when available
  if (spriteId) {
    const spriteNum = parseInt(spriteId, 10);

    if (type === "crew") {
      exportData.profile_sprite_id = spriteNum;
      try {
        const chars = await loadCharacters();
        const match = chars.find(c => Number(c.profile_sprite_id) === spriteNum);
        if (match) {
          exportData.character_design_id = String(match.character_design_id);
          if (match.special_ability_type) {
            exportData.special = match.special_ability_type;
          }
        }
      } catch (e) {
        console.warn("Export: failed to enrich character fields", e);
      }
    } else if (type === "room") {
      exportData.image_sprite_id = spriteNum;
      try {
        const rooms = await loadRooms();
        const match = rooms.find(r => Number(r.image_sprite_id) === spriteNum);
        if (match) {
          exportData.room_design_id = String(match.room_design_id);
        }
      } catch (e) {
        console.warn("Export: failed to enrich room fields", e);
      }
    }
  }

  return exportData;
}

/**
 * Trigger a browser download of JSON data
 */
export function downloadJson(data: Record<string, unknown>, filename: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
