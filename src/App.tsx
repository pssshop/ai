import { type ChangeEvent, useEffect, useMemo, useState } from "react";
import { ListView } from "@/components/ListView";
import { Workspace } from "@/components/Workspace";
import { SearchSelect } from "@/components/SearchSelect";
import type { EntityEditPayload } from "@/components/DetailView";
import type { Entity, RawEntity } from "@/types";
import { normalizeEntities, combineStatus, samples } from "@/utils";
import { useImportFiles } from "@/hooks/useImportFiles";
import { useSamples } from "@/hooks/useSamples";
import { useWorkspace } from "@/hooks/useWorkspace";
import { randomId } from "@/utils/random";

export default function App() {
  const [sources, setSources] = useState<Array<{ id: string; name: string; crew: RawEntity[]; rooms: RawEntity[] }>>(() => {
    // Load drafts from localStorage on mount
    const savedDrafts = localStorage.getItem("pssai:drafts");
    if (savedDrafts) {
      try {
        const drafts = JSON.parse(savedDrafts) as RawEntity[];
        if (drafts.length > 0) {
          return [{
            id: randomId("source"),
            name: "Drafts",
            crew: drafts.filter(d => d.type === "crew"),
            rooms: drafts.filter(d => d.type === "room"),
          }];
        }
      } catch (e) {
        console.error("Failed to load drafts from localStorage:", e);
      }
    }
    return [];
  });
  const [filter, setFilter] = useState("");
  const [sampleValue, setSampleValue] = useState("");
  const [workspaceIds, setWorkspaceIds] = useState<string[]>([]);
  const [loadStatus, setLoadStatus] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showSummaries, setShowSummaries] = useState(() => {
    const saved = localStorage.getItem("pssai:showSummaries");
    return saved !== null ? saved === "true" : false;
  });

  // Save showSummaries preference to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem("pssai:showSummaries", String(showSummaries));
  }, [showSummaries]);

  // Save drafts to localStorage whenever sources change
  useEffect(() => {
    const allDrafts: RawEntity[] = [];
    for (const src of sources) {
      allDrafts.push(...src.crew.filter(raw => (raw.__builderMeta as any)?.isDraft));
      allDrafts.push(...src.rooms.filter(raw => (raw.__builderMeta as any)?.isDraft));
    }
    localStorage.setItem("pssai:drafts", JSON.stringify(allDrafts));
  }, [sources]);

  const allEntities = useMemo<Entity[]>(() => {
    const out: Entity[] = [];
    for (const src of sources) {
      out.push(...normalizeEntities(src.crew, "crew"));
      out.push(...normalizeEntities(src.rooms, "room"));
    }
    return out;
  }, [sources]);

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
  const { workspaceEntities, add, remove, setIds } = useWorkspace(allEntities);

  // keep the legacy local ids in sync (if other code reads workspaceIds)
  useEffect(() => {
    setWorkspaceIds(workspaceEntities.map(e => e.id));
  }, [workspaceEntities]);

  const removeSource = (id: string) => {
    setSources(prev => prev.filter(s => s.id !== id));
  };

  const handleDeleteDraft = (entityId: string) => {
    // Find the entity to get its source RawEntity
    const entity = allEntities.find(e => e.id === entityId);
    if (!entity) return;

    // Remove from workspace if open
    remove(entityId);

    // Remove from sources and update localStorage immediately
    setSources(prevSources => {
      const updated = prevSources.map(source => ({
        ...source,
        crew: source.crew.filter(raw => raw !== entity.source),
        rooms: source.rooms.filter(raw => raw !== entity.source),
      })).filter(source => source.crew.length > 0 || source.rooms.length > 0);

      // Immediately update localStorage
      const allDrafts: RawEntity[] = [];
      for (const src of updated) {
        allDrafts.push(...src.crew.filter(raw => (raw.__builderMeta as any)?.isDraft));
        allDrafts.push(...src.rooms.filter(raw => (raw.__builderMeta as any)?.isDraft));
      }
      localStorage.setItem("pssai:drafts", JSON.stringify(allDrafts));

      return updated;
    });
  };

  const handleCreateDraft = () => {
    const draftRaw: RawEntity = {
      id: randomId("draft"),
      name: "New AI",
      type: "crew",
      ai: [],
      __builderMeta: {
        createdAt: new Date().toISOString(),
        isDraft: true,
      },
      __sourceFile: {
        fileName: "Draft",
      },
    };

    const draftSource = {
      id: randomId("source"),
      name: "Draft",
      crew: [draftRaw],
      rooms: [] as RawEntity[],
    };

    setSources(prev => [...prev, draftSource]);

    const draftEntity = normalizeEntities(draftSource.crew, "crew")[0];
    if (draftEntity) {
      add(draftEntity);
    }

    setTimeout(() => window.dispatchEvent(new Event("pss:columns-changed")), 0);
  };

  const handleUpdateEntity = (entity: Entity, payload: EntityEditPayload) => {
    const safeName = payload.name.trim() || "(unnamed)";
    const safeRules = payload.rules.map((rule, idx) => ({
      ...rule,
      index: idx,
    }));

    let replacementId: string | null = null;

    setSources(prevSources => prevSources.map(source => {
      const crewIndex = source.crew.findIndex(raw => raw === entity.source);
      const roomIndex = source.rooms.findIndex(raw => raw === entity.source);

      if (crewIndex === -1 && roomIndex === -1) {
        return source;
      }

      const updatedRaw: RawEntity = {
        ...(entity.source as RawEntity),
        name: safeName,
        type: payload.type,
        ai: safeRules,
        __builderMeta: {
          ...((entity.source as any).__builderMeta ?? {}),
          updatedAt: new Date().toISOString(),
        },
      };

      // Remove legacy duplicate field if present; we only keep `ai`
      delete (updatedRaw as any).rules;

      // Update sprite ID in source if provided
      if (payload.spriteId) {
        if (payload.type === "crew") {
          updatedRaw.profile_sprite_id = parseInt(payload.spriteId, 10);
        } else if (payload.type === "room") {
          updatedRaw.image_sprite_id = parseInt(payload.spriteId, 10);
        }
      }

      if (crewIndex >= 0) {
        if (payload.type === "crew") {
          const newCrew = [...source.crew];
          newCrew[crewIndex] = updatedRaw;
          if (!replacementId) {
            const normalized = normalizeEntities(newCrew, "crew");
            const found = normalized.find(item => item.source === updatedRaw);
            if (found) replacementId = found.id;
          }
          return { ...source, crew: newCrew };
        }

        const newCrew = source.crew.filter((_, idx) => idx !== crewIndex);
        const newRooms = [...source.rooms, updatedRaw];
        if (!replacementId) {
          const normalized = normalizeEntities(newRooms, "room");
          const found = normalized.find(item => item.source === updatedRaw);
          if (found) replacementId = found.id;
        }
        return { ...source, crew: newCrew, rooms: newRooms };
      }

      if (roomIndex >= 0) {
        if (payload.type === "room") {
          const newRooms = [...source.rooms];
          newRooms[roomIndex] = updatedRaw;
          if (!replacementId) {
            const normalized = normalizeEntities(newRooms, "room");
            const found = normalized.find(item => item.source === updatedRaw);
            if (found) replacementId = found.id;
          }
          return { ...source, rooms: newRooms };
        }

        const newRooms = source.rooms.filter((_, idx) => idx !== roomIndex);
        const newCrew = [...source.crew, updatedRaw];
        if (!replacementId) {
          const normalized = normalizeEntities(newCrew, "crew");
          const found = normalized.find(item => item.source === updatedRaw);
          if (found) replacementId = found.id;
        }
        return { ...source, crew: newCrew, rooms: newRooms };
      }

      return source;
    }));

    if (replacementId && replacementId !== entity.id) {
      const nextId = replacementId;
      setIds(prev => prev.map(id => (id === entity.id ? nextId : id)));
    }

    setTimeout(() => window.dispatchEvent(new Event("pss:columns-changed")), 0);
  };

  return (
    <>
      <aside id="sidebar">
        <div id="sidebarTop">
            <img src={`${import.meta.env.BASE_URL}favicon.png`} alt="PSS AI" className="sideLogo" />
            <h1>PSS AI</h1>
        </div>

        <div id="listActions">
          <button type="button" className="listActionBtn" onClick={handleCreateDraft}>
            Create AI
          </button>
          <button
            type="button"
            className={`listActionBtn summariesToggle${showSummaries ? " active" : ""}`}
            onClick={() => setShowSummaries(prev => !prev)}
            title={showSummaries ? "Hide AI summaries" : "Show AI summaries"}
          >
            🧠
          </button>
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
            <SearchSelect
              id="sampleSelect"
              value={sampleValue}
              onChange={value => {
                if (!value) return;
                setSampleValue(value);
                handleSampleSelect({ target: { value } });
                setTimeout(() => setSampleValue(""), 0);
              }}
              options={[{ value: "", label: "Load from /data…" }, ...samples.map(sample => ({ value: sample.id, label: sample.label }))]}
              placeholder="Load from /data…"
            />
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
                  <button
                    type="button"
                    onClick={() => removeSource(s.id)}
                    className="sourceRemoveBtn"
                    aria-label={`Remove ${s.name}`}
                    title="Remove source"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <ListView entities={allEntities} filter={filter} onFilterChange={setFilter} onSelect={add} onDeleteDraft={handleDeleteDraft} />
      </aside>

      <Workspace
        entities={workspaceEntities}
        onRemove={remove}
        onUpdate={handleUpdateEntity}
        showSummaries={showSummaries}
      />
    </>
  );
}
