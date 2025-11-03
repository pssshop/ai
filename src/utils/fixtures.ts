import type { RawEntity } from "@/types";

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

  // Combine crew and room modules into a single samples list.
  allModules = {
    ...crewModules,
    ...roomModules,
  };
}

export const samples: SampleOption[] = createSampleList(allModules);
