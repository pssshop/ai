import type { RawEntity } from "@/types";
import { parseCrewaiText } from "./parseEntities";
import { loadCharacters, loadRooms } from "@/utils/sprites";

export interface SampleOption {
  id: string;
  label: string;
  load: () => Promise<RawEntity[]>;
}

function createSampleList(records: Record<string, () => Promise<RawEntity[]>>): SampleOption[] {
  return Object.entries(records)
    .map(([path, loader]) => {
      const label = path.split("/").pop() ?? path;
      return {
        id: label,
        label,
        load: loader,
      } satisfies SampleOption;
    })
    .sort((a, b) => b.label.localeCompare(a.label));
}

// In development we load local JSON fixtures from `data/` using Vite's import.meta.glob.
// For production builds (Pages) we intentionally do NOT include local data to avoid
// bundling potentially private character dumps. In production the app will require
// users to upload JSON files via the file input.
let allModules: Record<string, () => Promise<RawEntity[]>> = {};

if (import.meta.env.DEV) {
  const crewModules: Record<string, () => Promise<RawEntity[]>> = {
    ...import.meta.glob<RawEntity[]>("../../data/*crew_ai*.json", { import: "default" }),
    ...import.meta.glob<RawEntity[]>("../../data/*character_ai*.json", { import: "default" }),
  };

  const roomModules: Record<string, () => Promise<RawEntity[]>> = {
    ...import.meta.glob<RawEntity[]>("../../data/*room_ai*.json", { import: "default" }),
  };

  // Also include plain-text crewai exports (*.txt) under data for dev convenience.
  const textModules: Record<string, () => Promise<string>> = {
    ...import.meta.glob<string>("../../data/crewai_*.txt", { as: "raw" }),
    ...import.meta.glob<string>("../../data/roomai_*.txt", { as: "raw" }),
  };

  // Combine crew and room modules into a single samples list.
  // Wrap text modules so they return parsed RawEntity[] using the shared parser.
  const textWrappers: Record<string, () => Promise<RawEntity[]>> = {};
  for (const [p, loader] of Object.entries(textModules)) {
    textWrappers[p] = async () => {
      try {
        const text = await loader();
        const [chars, rooms] = await Promise.all([loadCharacters(), loadRooms()]);

        // attempt to fetch actions/conditions from docs like the import flow does
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
          if (Array.isArray(payload)) {
            for (const entry of payload) {
              if (typeof entry === 'string' || typeof entry === 'number') {
                const v = String(entry).trim();
                map[v] = v;
              } else if (entry && typeof entry === 'object') {
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

        return parseCrewaiText(text, p.split('/').pop() ?? 'crewai.txt', chars, rooms, actionsMap, conditionsMap);
      } catch (err) {
        console.error("Failed to parse text sample", err);
        return [];
      }
    };
  }

  allModules = {
    ...crewModules,
    ...roomModules,
    ...textWrappers,
  };
}

export const samples: SampleOption[] = createSampleList(allModules);
