import type { EntityType } from "@/types";

export function normalizeEntityType(type: EntityType | string | undefined): EntityType {
  if (!type) return "crew";
  const lower = String(type).toLowerCase();
  if (lower.includes("room")) return "room";
  if (lower.includes("crew")) return "crew";
  return "crew";
}

export interface EntityMetadata {
  headerSpriteId?: string;
  headerSpriteUrl?: string;
  specialKey: string | null;
  sourceFileName?: string;
}

export function extractEntityMetadata(source: unknown): EntityMetadata {
  const rawSource = (source as any) || {};
  const headerSpriteId = rawSource?.profile_sprite_id ?? rawSource?.image_sprite_id;
  const headerSpriteUrl = headerSpriteId
    ? `https://api.pixelstarships.com/FileService/DownloadSprite?spriteId=${headerSpriteId}`
    : undefined;
  const specialKey = rawSource?.special ?? null;
  const sourceFileName = rawSource?.__sourceFile?.fileName as string | undefined;

  return {
    headerSpriteId,
    headerSpriteUrl,
    specialKey,
    sourceFileName,
  };
}
