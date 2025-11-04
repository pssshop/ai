function withBase(path: string): string {
  const isDev = import.meta.env.DEV;
  const base = import.meta.env.BASE_URL || "/";
  const prefixed = isDev ? `docs/${path}` : path;
  return base.endsWith("/") ? `${base}${prefixed}` : `${base}/${prefixed}`;
}

interface Character {
  character_design_id: number | string;
  character_design_name: string;
  profile_sprite_id: number | string;
  rarity?: string;
  special_ability_type?: string;
}

interface Room {
  room_design_id: number | string;
  room_name: string;
  room_short_name: string | null;
  room_type: string;
  image_sprite_id: number | string;
}

let charactersCache: Character[] | null = null;
let roomsCache: Room[] | null = null;

export async function loadCharacters(): Promise<Character[]> {
  if (charactersCache) return charactersCache;

  const url = withBase("characters.json");
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load characters: ${response.statusText}`);
  }
  const raw = await response.json();
  // Normalize IDs to numbers for consistent usage
  charactersCache = raw.map((c: any) => ({
    ...c,
    character_design_id: typeof c.character_design_id === 'string' ? parseInt(c.character_design_id, 10) : c.character_design_id,
    profile_sprite_id: typeof c.profile_sprite_id === 'string' ? parseInt(c.profile_sprite_id, 10) : c.profile_sprite_id,
  }));
  return charactersCache!;
}

export async function loadRooms(): Promise<Room[]> {
  if (roomsCache) return roomsCache;

  const url = withBase("rooms.json");
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load rooms: ${response.statusText}`);
  }
  const raw = await response.json();
  // Normalize IDs to numbers for consistent usage
  roomsCache = raw.map((r: any) => ({
    ...r,
    room_design_id: typeof r.room_design_id === 'string' ? parseInt(r.room_design_id, 10) : r.room_design_id,
    image_sprite_id: typeof r.image_sprite_id === 'string' ? parseInt(r.image_sprite_id, 10) : r.image_sprite_id,
  }));
  return roomsCache!;
}

export function findCharacterById(id: number, characters: Character[]): Character | undefined {
  return characters.find(c => c.character_design_id === id);
}

export function findRoomById(id: number, rooms: Room[]): Room | undefined {
  return rooms.find(r => r.room_design_id === id);
}

export function findCharacterByName(name: string, characters: Character[]): Character | undefined {
  const normalized = name.trim().toLowerCase();
  return characters.find(c => c.character_design_name.toLowerCase() === normalized);
}

export function findRoomByName(name: string, rooms: Room[]): Room | undefined {
  const normalized = name.trim().toLowerCase();
  return rooms.find(r => r.room_name.toLowerCase() === normalized);
}
