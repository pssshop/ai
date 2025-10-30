import { useCallback, useState } from "react";
import type { RawEntity } from "@/types";
import { readJsonFile, classifyEntitiesFromArray } from "@/utils";

let __fileCounter = 0;

export function useImportFiles(onUpdate: (source: { id: string; name: string; crew: RawEntity[]; rooms: RawEntity[] }) => void) {
  const [error, setError] = useState<string | null>(null);

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
  // we'll report each file as its own source via onUpdate

      for (const file of Array.from(files)) {
        const data = await readJsonFile<RawEntity[]>(file);
        if (!Array.isArray(data)) {
          setError(`${file.name}: invalid JSON root (expected array)`);
          return;
        }

        // tag each item with provenance so later normalization can create per-file versions
  __fileCounter += 1;
  const fileId = `${file.name}#${Date.now()}#${__fileCounter}`;
        for (const item of data) {
          if (item && typeof item === "object") {
            try {
              (item as any).__sourceFile = { fileId, fileName: file.name };
            } catch (err) {
              // ignore
            }
          }
        }

  const { crew, rooms } = classifyEntitiesFromArray(data);

  // report this imported file as a source
  onUpdate({ id: fileId, name: file.name, crew, rooms });
  }

  setError(null);
    },
    [onUpdate]
  );

  return { handleFiles, error } as const;
}
