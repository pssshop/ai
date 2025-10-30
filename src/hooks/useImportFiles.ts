import { useCallback, useState } from "react";
import type { RawEntity } from "@/types";
import { readJsonFile, classifyEntitiesFromArray } from "@/utils";

export function useImportFiles(onUpdate: (crew: RawEntity[], rooms: RawEntity[]) => void) {
  const [error, setError] = useState<string | null>(null);

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      const newCrew: RawEntity[] = [];
      const newRooms: RawEntity[] = [];

      for (const file of Array.from(files)) {
        const data = await readJsonFile<RawEntity[]>(file);
        if (!Array.isArray(data)) {
          setError(`${file.name}: invalid JSON root (expected array)`);
          return;
        }

        const { crew, rooms } = classifyEntitiesFromArray(data);
        newCrew.push(...crew);
        newRooms.push(...rooms);
      }

      setError(null);
      onUpdate(newCrew, newRooms);
    },
    [onUpdate]
  );

  return { handleFiles, error } as const;
}
