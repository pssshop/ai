import { type ChangeEvent, useEffect, useMemo, useState } from "react";
import { ListView } from "@/components/ListView";
import { Workspace } from "@/components/Workspace";
import type { Entity, RawEntity } from "@/types";
import { normalizeEntities, combineStatus, samples } from "@/utils";
import { useImportFiles } from "@/hooks/useImportFiles";
import { useSamples } from "@/hooks/useSamples";
import { useWorkspace } from "@/hooks/useWorkspace";

export default function App() {
  const [crewRaw, setCrewRaw] = useState<RawEntity[] | null>(null);
  const [roomRaw, setRoomRaw] = useState<RawEntity[] | null>(null);
  const [filter, setFilter] = useState("");
  const [workspaceIds, setWorkspaceIds] = useState<string[]>([]);
  const [loadStatus, setLoadStatus] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const crewEntities = useMemo(() => normalizeEntities(crewRaw, "crew"), [crewRaw]);
  const roomEntities = useMemo(() => normalizeEntities(roomRaw, "room"), [roomRaw]);

  const allEntities = useMemo<Entity[]>(() => [...crewEntities, ...roomEntities], [crewEntities, roomEntities]);

  const entityMap = useMemo(() => new Map(allEntities.map((entity: Entity) => [entity.id, entity] as const)), [allEntities]);

  const isEntity = (entity: Entity | undefined): entity is Entity => Boolean(entity);

  // keep a local ids state for compatibility; primary workspace state is inside the hook

  // wire the import and sample hooks
  const { handleFiles, error: importError } = useImportFiles((newCrew, newRooms) => {
    setCrewRaw(prev => (prev ? [...prev, ...newCrew] : newCrew));
    setRoomRaw(prev => (prev ? [...prev, ...newRooms] : newRooms));
  });

  const { handleSampleSelect, error: sampleError } = useSamples((newCrew, newRooms) => {
    setCrewRaw(newCrew.length ? structuredClone(newCrew) : null);
    setRoomRaw(newRooms.length ? structuredClone(newRooms) : null);
  });

  useEffect(() => {
    setLoadStatus(combineStatus(crewEntities.length, roomEntities.length));
  }, [crewEntities.length, roomEntities.length]);

  // workspace hook manages the selected ids and provides add/remove
  const { workspaceEntities, add, remove } = useWorkspace(allEntities);

  // keep the legacy local ids in sync (if other code reads workspaceIds)
  useEffect(() => {
    setWorkspaceIds(workspaceEntities.map(e => e.id));
  }, [workspaceEntities]);

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
        </div>

        <ListView entities={allEntities} filter={filter} onFilterChange={setFilter} onSelect={add} />
      </aside>

      <Workspace entities={workspaceEntities} onRemove={remove} />
    </>
  );
}
