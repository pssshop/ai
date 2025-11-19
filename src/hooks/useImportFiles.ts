import { useCallback, useState } from "react";
import type { RawEntity } from "@/types";
import { readJsonFile, classifyEntitiesFromArray, parseCrewaiText } from "@/utils";
import { loadCharacters, loadRooms, findCharacterByName, findRoomByName } from "@/utils/sprites";

let __fileCounter = 0;

export function useImportFiles(onUpdate: (source: { id: string; name: string; crew: RawEntity[]; rooms: RawEntity[] }) => void) {
  const [error, setError] = useState<string | null>(null);

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
  // we'll report each file as its own source via onUpdate

      for (const file of Array.from(files)) {
        // support both JSON imports and the new "crewai" text format
        let items: any[] = [];

        if (file.type === "text/plain" || file.name.toLowerCase().endsWith(".txt")) {
          // parse the crewai text format (sections separated by blank lines)
          const text = await file.text();
          // load known characters/rooms so we can match by name
          const [chars, rooms] = await Promise.all([loadCharacters(), loadRooms()]);

          // also try to load actions/conditions catalogs so numeric tokens can be translated
          const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
          const actionsPath = import.meta.env.DEV ? "docs/actions.json" : "actions.json";
          const conditionsPath = import.meta.env.DEV ? "docs/conditions.json" : "conditions.json";

          const fetchJson = async (p: string) => {
            try {
              const resp = await fetch(`${base}/${p}`);
              if (!resp.ok) return null;
              return await resp.json();
            } catch {
              return null;
            }
          };

          const [actionsPayload, conditionsPayload] = await Promise.all([
            fetchJson(actionsPath),
            fetchJson(conditionsPath),
          ]);

          const buildMap = (payload: any): Record<string, string> => {
            const map: Record<string, string> = {};
            if (!payload) return map;
            // If it's an array of strings/numbers, map index or value -> value
            if (Array.isArray(payload)) {
              for (const entry of payload) {
                if (typeof entry === 'string' || typeof entry === 'number') {
                  const v = String(entry).trim();
                  map[v] = v;
                      } else if (entry && typeof entry === 'object') {
                        // try to find id and label
                        const idKey = Object.keys(entry).find(k => /(^|_)id$/i.test(k) || k === 'key');
                        const labelKey = Object.keys(entry).find(k => /name|label|title|text/i.test(k));
                        const rawId = idKey ? (entry as any)[idKey] : undefined;
                        const rawLabel = labelKey ? (entry as any)[labelKey] : undefined;
                        const idVal = rawId != null ? String(rawId).trim() : undefined;
                        let labelVal: string | undefined;
                        if (rawLabel == null) {
                          labelVal = "None";
                        } else {
                          labelVal = String(rawLabel).trim();
                          if (!labelVal.length) labelVal = "None";
                        }
                        if (idVal) map[idVal] = labelVal as string;
                      }
              }
            } else if (payload && typeof payload === 'object') {
              // If object of id->name pairs
              for (const [k, v] of Object.entries(payload)) {
                if (v == null) {
                  map[k] = "None";
                } else if (typeof v === 'string' || typeof v === 'number') {
                  const s = String(v).trim();
                  map[k] = s.length ? s : "None";
                } else if (v && typeof v === 'object') {
                  const labelKey = Object.keys(v).find(k => /name|label|title|text/i.test(k));
                  const raw = labelKey ? (v as any)[labelKey] : undefined;
                  if (raw == null) map[k] = "None";
                  else {
                    const s = String(raw).trim();
                    map[k] = s.length ? s : "None";
                  }
                }
              }
            }
            return map;
          };

          const actionsMap = buildMap(actionsPayload);
          const conditionsMap = buildMap(conditionsPayload);

          items = parseCrewaiText(text, file.name, chars, rooms, actionsMap, conditionsMap);
        } else {
          const data = await readJsonFile<RawEntity[]>(file);
          if (!Array.isArray(data)) {
            setError(`${file.name}: invalid JSON root (expected array)`);
            return;
          }
          items = data as any[];
        }

        // tag each item with provenance so later normalization can create per-file versions
        __fileCounter += 1;
        const fileId = `${file.name}#${Date.now()}#${__fileCounter}`;
        for (const item of items) {
          if (item && typeof item === "object") {
            try {
              (item as any).__sourceFile = { fileId, fileName: file.name };
            } catch (err) {
              // ignore
            }
          }
        }

        const { crew, rooms } = classifyEntitiesFromArray(items);

        // report this imported file as a source
        onUpdate({ id: fileId, name: file.name, crew, rooms });
  }

  setError(null);
    },
    [onUpdate]
  );

  return { handleFiles, error } as const;
}
