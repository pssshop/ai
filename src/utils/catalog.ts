import { useEffect, useState } from "react";

export type CatalogOption = {
  value: string;
  label: string;
};

function normalizeOption(entry: unknown): CatalogOption | null {
  if (typeof entry === "string" || typeof entry === "number") {
    const str = String(entry).trim();
    if (!str) return null;
    return { value: str, label: str };
  }

  if (entry && typeof entry === "object") {
    const record = entry as Record<string, unknown>;

    const stringEntries = Object.entries(record)
      .filter(([, raw]) => typeof raw === "string")
      .map(([key, raw]) => [key, (raw as string).trim()])
      .filter(([, value]) => value.length > 0);

    const numericEntries = Object.entries(record)
      .filter(([, raw]) => typeof raw === "number" || typeof raw === "bigint")
      .map(([key, raw]) => [key, String(raw)]);

    const findString = (pattern: RegExp): string | undefined => {
      const entryMatch = stringEntries.find(([key]) => pattern.test(key));
      return entryMatch ? entryMatch[1] : undefined;
    };

    const findNumeric = (pattern: RegExp): string | undefined => {
      const entryMatch = numericEntries.find(([key]) => pattern.test(key));
      return entryMatch ? entryMatch[1] : undefined;
    };

    const labelCandidate =
      findString(/(_|^)(condition|action).*name$/i) ??
      findString(/name$/i) ??
      findString(/label|title|text$/i) ??
      stringEntries[0]?.[1] ??
      findNumeric(/(_|^)id$/i);

    if (!labelCandidate) {
      return null;
    }

    const valueCandidate =
      findString(/value$/i) ??
      findString(/code|key|slug$/i) ??
      findString(/(_|^)(condition|action).*name$/i) ??
      findString(/name$/i) ??
      labelCandidate;

    const value = valueCandidate?.trim();
    const label = labelCandidate.trim();

    if (!value || !label) {
      return null;
    }

    return { value, label };
  }

  return null;
}

function collectOptions(payload: unknown): CatalogOption[] | null {
  const deriveKey = (item: unknown, option: CatalogOption): string => {
    if (item && typeof item === "object") {
      const record = item as Record<string, unknown>;
      const idEntry = Object.entries(record).find(([key, raw]) => /(^|_)(id|key)$/i.test(key) && raw != null);
      if (idEntry) {
        const idValue = String(idEntry[1]).trim();
        if (idValue.length) {
          return `${idEntry[0]}:${idValue}`;
        }
      }
    }
    return option.value;
  };

  const buildFromArray = (items: unknown[]): CatalogOption[] => {
    const map = new Map<string, CatalogOption>();
    items.forEach(item => {
      const option = normalizeOption(item);
      if (!option) return;
      const dedupeKey = deriveKey(item, option);
      if (!map.has(dedupeKey)) {
        map.set(dedupeKey, option);
      }
    });
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
  };

  if (Array.isArray(payload)) {
    return buildFromArray(payload);
  }

  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    const candidateKeys = ["options", "values", "items", "actions", "conditions", "list", "data"];
    for (const key of candidateKeys) {
      const nested = record[key];
      if (Array.isArray(nested)) {
        const result = buildFromArray(nested);
        if (result.length) return result;
      }
    }

    const objectValues = Object.values(record);
    if (objectValues.every(item => typeof item === "string" || typeof item === "number")) {
      return buildFromArray(objectValues);
    }
  }

  return null;
}

function withBase(path: string): string {
  const base = (import.meta.env.BASE_URL ?? "/").replace(/\/?$/, "");
  const trimmed = path.replace(/^\//, "");
  return `${base}/${trimmed}` || `/${trimmed}`;
}

async function fetchCatalog(path: string): Promise<CatalogOption[] | null> {
  try {
    const response = await fetch(withBase(path), { cache: "no-cache" });
    if (!response.ok) {
      return null;
    }
    const payload = await response.json();
    return collectOptions(payload);
  } catch {
    return null;
  }
}

export function useCatalogOptions() {
  const [conditions, setConditions] = useState<CatalogOption[]>([]);
  const [actions, setActions] = useState<CatalogOption[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      const actionsPath = import.meta.env.DEV ? "docs/actions.json" : "actions.json";
      const conditionsPath = import.meta.env.DEV ? "docs/conditions.json" : "conditions.json";
      const [actionsList, conditionsList] = await Promise.all([
        fetchCatalog(actionsPath),
        fetchCatalog(conditionsPath),
      ]);
      if (cancelled) return;

      setIsLoading(false);
      if (!actionsList && !conditionsList) {
        setError("Could not load actions/conditions catalog; using defaults.");
      } else {
        setError(null);
      }

      if (actionsList?.length) {
        setActions(actionsList);
      }
      if (conditionsList?.length) {
        setConditions(conditionsList);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return { actions, conditions, isLoading, error };
}

export function ensureCatalogOption(options: CatalogOption[], value: string): CatalogOption[] {
  const trimmed = value.trim();
  if (!trimmed) return options;
  // If an option already matches this value by value or label (case-insensitive), don't add a duplicate
  const lower = trimmed.toLowerCase();
  if (options.some(option => option.value === trimmed || option.label.toLowerCase() === lower)) {
    return options;
  }
  return [{ value: trimmed, label: trimmed }, ...options];
}

/**
 * Convert catalog options to SearchSelect format with a placeholder option
 */
export function toSearchOptions<T extends { value: string; label: string; meta?: any }>(
  items: T[],
  placeholder: { value: string; label: string }
): Array<{ value: string; label: string; meta?: any }> {
  const seen = new Set<string>();
  // If an existing item already has the same label (case-insensitive) or the same value
  // as the placeholder, don't include the placeholder to avoid duplicate labels like "None".
  const placeholderLabelLower = placeholder.label.trim().toLowerCase();
  const hasPlaceholderDuplicate = items.some(i => i.value === placeholder.value || i.label.trim().toLowerCase() === placeholderLabelLower);
  const list: Array<{ value: string; label: string; meta?: any }> = hasPlaceholderDuplicate ? [] : [placeholder];
  items.forEach(option => {
    if (!seen.has(option.value)) {
      seen.add(option.value);
      list.push({ value: option.value, label: option.label, ...(option.meta ? { meta: option.meta } : {}) });
    }
  });
  return list;
}
