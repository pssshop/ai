import { useEffect, useState } from "react";
import { loadCharacters, loadRooms } from "@/utils/sprites";
import type { SearchSelectOption } from "@/components/SearchSelect";

export function useEntitySprites() {
  const [spriteOptions, setSpriteOptions] = useState<SearchSelectOption[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const loadSprites = async () => {
      setIsLoading(true);
      try {
        const [chars, rooms] = await Promise.all([loadCharacters(), loadRooms()]);

        const charOptions = chars.map(c => ({
          value: String(c.profile_sprite_id),
          label: `${c.character_design_name} (Character)`,
          meta: { type: "crew" as const, specialKey: c.special_ability_type ?? null },
        }));

        const roomOptions = rooms.map(r => ({
          value: String(r.image_sprite_id),
          label: `${r.room_name} (Room)`,
          meta: { type: "room" as const, specialKey: null },
        }));

        setSpriteOptions([...charOptions, ...roomOptions]);
      } catch (err) {
        console.error("Failed to load sprite data:", err);
        setSpriteOptions([]);
      } finally {
        setIsLoading(false);
      }
    };
    loadSprites();
  }, []);

  return { spriteOptions, isLoading };
}
