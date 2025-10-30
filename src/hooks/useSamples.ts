import { useCallback, useState } from "react";
import type { RawEntity } from "@/types";
import { samples, classifyEntitiesFromArray } from "@/utils";

export function useSamples(onUpdate: (source: { id: string; name: string; crew: RawEntity[]; rooms: RawEntity[] }) => void) {
  const [error, setError] = useState<string | null>(null);

  const handleSampleSelect = useCallback(
    async (event: Event | { target: { value: string } }) => {
      try {
        // support both a real Event and a fake object with target.value
        const sampleId = (event as any).target?.value;
        if (!sampleId) return;
        const sample = samples.find(option => option.id === sampleId);
        if (!sample) return;
        const data = await sample.load();
        if (!Array.isArray(data)) {
          setError("Sample: invalid JSON root (expected array)");
        } else {
            // tag each sample item with provenance (sample id/label) so they behave like file imports
            for (const item of data) {
              if (item && typeof item === "object") {
                try {
                  (item as any).__sourceFile = { fileId: sample.id, fileName: sample.label };
                } catch (err) {
                  // ignore
                }
              }
            }

            const { crew: newCrew, rooms: newRooms } = classifyEntitiesFromArray(data);
            // report sample as its own source
            onUpdate({ id: sample.id, name: sample.label, crew: newCrew, rooms: newRooms });
            setError(null);
        }
      } catch (err) {
        console.error(err);
        setError("Failed to load data");
      }
    },
    [onUpdate]
  );

  return { handleSampleSelect, error } as const;
}
