import { type ChangeEvent, useEffect, useMemo, useState } from "react";
import { ListView } from "@/components/ListView";
import { Workspace } from "@/components/Workspace";
import type { Entity, RawEntity } from "@/types";
import { normalizeEntities, combineStatus, samples } from "@/utils";
import { useImportFiles } from "@/hooks/useImportFiles";
import { useSamples } from "@/hooks/useSamples";
import { useWorkspace } from "@/hooks/useWorkspace";

export default function App() {
  const [sources, setSources] = useState<Array<{ id: string; name: string; crew: RawEntity[]; rooms: RawEntity[] }>>([]);
  const [filter, setFilter] = useState("");
  const [workspaceIds, setWorkspaceIds] = useState<string[]>([]);
  const [loadStatus, setLoadStatus] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const allEntities = useMemo<Entity[]>(() => {
    const out: Entity[] = [];
    for (const src of sources) {
      out.push(...normalizeEntities(src.crew, "crew"));
      out.push(...normalizeEntities(src.rooms, "room"));
    }
    return out;
  }, [sources]);

  const entityMap = useMemo(() => new Map(allEntities.map((entity: Entity) => [entity.id, entity] as const)), [allEntities]);

  const isEntity = (entity: Entity | undefined): entity is Entity => Boolean(entity);

  // keep a local ids state for compatibility; primary workspace state is inside the hook

  // wire the import and sample hooks — append sources instead of replacing
  const { handleFiles, error: importError } = useImportFiles((source) => {
    setSources(prev => [...prev, source]);
  });

  const { handleSampleSelect, error: sampleError } = useSamples((source) => {
    setSources(prev => [...prev, source]);
  });

  useEffect(() => {
    const crewCount = allEntities.filter(e => e.type === "crew").length;
    const roomCount = allEntities.filter(e => e.type === "room").length;
    setLoadStatus(combineStatus(crewCount, roomCount));
  }, [allEntities]);

  // workspace hook manages the selected ids and provides add/remove
  const { workspaceEntities, add, remove } = useWorkspace(allEntities);

  // keep the legacy local ids in sync (if other code reads workspaceIds)
  useEffect(() => {
    setWorkspaceIds(workspaceEntities.map(e => e.id));
  }, [workspaceEntities]);

  const removeSource = (id: string) => {
    setSources(prev => prev.filter(s => s.id !== id));
  };

  return (
    <>
      <aside id="sidebar">
        <div id="sidebarTop">
            <h1>PSS AI</h1>
            <div className="note">
                Load dumps → click an entity to compare.
            </div>
        </div>

        <div id="fileInputs">
          <label htmlFor="importFile">Import AI JSON (characters or rooms)</label>
          <input
            id="importFile"
            type="file"
            accept="application/json"
            multiple
            onChange={(event: ChangeEvent<HTMLInputElement>) => handleFiles(event.target.files ?? null)}
          />

          {import.meta.env.DEV && samples.length ? (
            <select id="sampleSelect" defaultValue="" onChange={handleSampleSelect}>
              <option value="" disabled>
                Load from /data…
              </option>
              {samples.map((sample) => (
                <option key={sample.id} value={sample.id}>
                  {sample.label}
                </option>
              ))}
            </select>
          ) : null}

          <div id="loadStatus">{loadStatus}</div>
          {importError || sampleError || errorMessage ? (
            <div className="unreachableNote errorMessage">{importError ?? sampleError ?? errorMessage}</div>
          ) : null}

          {sources.length ? (
            <div id="sourcesList">
              {sources.map(s => (
                <div key={s.id} className="sourceRow">
                  <span className="sourceName">{s.name}</span>
                  <span className="sourceCounts">{s.crew.length} crew / {s.rooms.length} rooms</span>
                  <button type="button" onClick={() => removeSource(s.id)} className="sourceRemoveBtn">Remove</button>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <ListView entities={allEntities} filter={filter} onFilterChange={setFilter} onSelect={add} />
      </aside>

      <Workspace entities={workspaceEntities} onRemove={remove} />
    </>
  );
}
