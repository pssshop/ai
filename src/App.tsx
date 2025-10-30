import { type ChangeEvent, useEffect, useMemo, useState } from "react";
import { ListView } from "@/components/ListView";
import { Workspace } from "@/components/Workspace";
import type { Entity, RawEntity } from "@/types";
import { normalizeEntities, samples } from "@/utils";
import { readJsonFile, classifyEntitiesFromArray, combineStatus } from "@/utils";

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

  const workspaceEntities = useMemo(
    () => workspaceIds.map((id: string) => entityMap.get(id)).filter(isEntity),
    [workspaceIds, entityMap]
  );

  useEffect(() => {
    setWorkspaceIds((ids: string[]) => ids.filter(id => entityMap.has(id)));
  }, [entityMap]);

  const handleImportFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    // Accumulate new crew/room entries and merge with existing sets
    const newCrew: RawEntity[] = [];
    const newRooms: RawEntity[] = [];

    for (const file of Array.from(files)) {
      const data = await readJsonFile<RawEntity[]>(file);
      if (!Array.isArray(data)) {
        setErrorMessage(`${file.name}: invalid JSON root (expected array)`);
        return;
      }

      const { crew, rooms } = classifyEntitiesFromArray(data);
      newCrew.push(...crew);
      newRooms.push(...rooms);
    }

    setErrorMessage(null);
    setCrewRaw(prev => (prev ? [...prev, ...newCrew] : newCrew));
    setRoomRaw(prev => (prev ? [...prev, ...newRooms] : newRooms));
  };

  const handleSampleSelect = async (event: ChangeEvent<HTMLSelectElement>) => {
    const sampleId = event.target.value;
    if (!sampleId) return;
    const sample = samples.find(option => option.id === sampleId);
    if (!sample) return;
    try {
      const data = await sample.load();
      if (!Array.isArray(data)) {
        setErrorMessage("Sample: invalid JSON root (expected array)");
      } else {
        const { crew: newCrew, rooms: newRooms } = classifyEntitiesFromArray(data);

        setErrorMessage(null);
        setCrewRaw(newCrew.length ? structuredClone(newCrew) : null);
        setRoomRaw(newRooms.length ? structuredClone(newRooms) : null);
      }
    } catch (error) {
      console.error("Failed to load data", error);
      setErrorMessage("Failed to load data");
    } finally {
      event.target.value = "";
    }
  };

  useEffect(() => {
    setLoadStatus(combineStatus(crewEntities.length, roomEntities.length));
  }, [crewEntities.length, roomEntities.length]);

  const addToWorkspace = (entity: Entity) => {
    setWorkspaceIds((ids: string[]) => (ids.includes(entity.id) ? ids : [...ids, entity.id]));
  };

  const removeFromWorkspace = (id: string) => {
    setWorkspaceIds((ids: string[]) => ids.filter(existing => existing !== id));
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
            onChange={(event: ChangeEvent<HTMLInputElement>) => handleImportFiles(event.target.files ?? null)}
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
          {errorMessage ? <div className="unreachableNote errorMessage">{errorMessage}</div> : null}
        </div>

  <ListView entities={allEntities} filter={filter} onFilterChange={setFilter} onSelect={addToWorkspace} />
      </aside>

      <Workspace entities={workspaceEntities} onRemove={removeFromWorkspace} />
    </>
  );
}
