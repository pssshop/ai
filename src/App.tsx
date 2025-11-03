import { type ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
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
      allDrafts.push(
        ...src.crew.filter(raw => (raw.__builderMeta as any)?.isDraft && (raw.__builderMeta as any)?.saved)
      );
      allDrafts.push(
        ...src.rooms.filter(raw => (raw.__builderMeta as any)?.isDraft && (raw.__builderMeta as any)?.saved)
      );
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

  // Track a draft RawEntity we want to open once it's present in allEntities
  const pendingDraftRef = useRef<RawEntity | null>(null);

  // When allEntities updates, if we have a pending draft, open it in the workspace
  useEffect(() => {
    if (pendingDraftRef.current) {
      const pending = pendingDraftRef.current;
      const found = allEntities.find(e => e.source === pending);
      if (found) {
        add(found);
        pendingDraftRef.current = null;
        // Let columns recalc widths after mount
        setTimeout(() => window.dispatchEvent(new Event("pss:columns-changed")), 0);
      }
    }
  }, [allEntities, add]);

  // keep the legacy local ids in sync (if other code reads workspaceIds)
  useEffect(() => {
    setWorkspaceIds(workspaceEntities.map(e => e.id));
  }, [workspaceEntities]);

  const removeSource = (id: string) => {
    setSources(prev => prev.filter(s => s.id !== id));
  };

  // Close an entity; if it's an unsaved draft, remove it entirely from the Drafts source
  const handleCloseEntity = (entityId: string) => {
    const entity = allEntities.find(e => e.id === entityId);
    if (entity) {
      const meta = (entity.source as any)?.__builderMeta;
      const isDraft = Boolean(meta?.isDraft);
      const saved = Boolean(meta?.saved);
      if (isDraft && !saved) {
        setSources(prev =>
          prev
            .map(src => {
              if (src.name !== "Drafts") return src;
              const crew = src.crew.filter(raw => raw !== entity.source);
              const rooms = src.rooms.filter(raw => raw !== entity.source);
              return { ...src, crew, rooms };
            })
            // If Drafts is now empty, drop it entirely
            .filter(src => (src.name === "Drafts" ? src.crew.length + src.rooms.length > 0 : true))
        );
      }
    }
    remove(entityId);
    setTimeout(() => window.dispatchEvent(new Event("pss:columns-changed")), 0);
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

      // Immediately update localStorage (persist only saved drafts)
      const allDrafts: RawEntity[] = [];
      for (const src of updated) {
        allDrafts.push(
          ...src.crew.filter(raw => (raw.__builderMeta as any)?.isDraft && (raw.__builderMeta as any)?.saved)
        );
        allDrafts.push(
          ...src.rooms.filter(raw => (raw.__builderMeta as any)?.isDraft && (raw.__builderMeta as any)?.saved)
        );
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
        // Not saved yet – only saved drafts are listed/persisted
        saved: false,
      },
      __sourceFile: {
        fileName: "Draft",
        // Provide a stable fileId so normalized IDs don't depend on array index
        fileId: undefined as any, // placeholder, set just after object creation
      },
    };
    // After creation, set fileId to stable unique id (use draft id)
    (draftRaw as any).__sourceFile.fileId = draftRaw.id;

    // Insert into a single shared "Drafts" source in-memory (hidden until saved)
    setSources(prev => {
      // Find existing Drafts source (by name)
      const idx = prev.findIndex(s => s.name === "Drafts");
      if (idx >= 0) {
        const next = [...prev];
        const src = next[idx];
        src.crew = [...src.crew, draftRaw];
        // Mark to open after state updates
        pendingDraftRef.current = draftRaw;
        return next;
      }
      // Create a new Drafts source (hidden until any draft is saved)
      const newDraftsSource = {
        id: randomId("source"),
        name: "Drafts",
        crew: [draftRaw],
        rooms: [] as RawEntity[],
      };
      pendingDraftRef.current = draftRaw;
      return [newDraftsSource, ...prev];
    });

    // Opening will be handled in the effect when allEntities includes this draft
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

      const wasDraft = Boolean((entity.source as any)?.__builderMeta?.isDraft);
      const updatedRaw: RawEntity = {
        ...(entity.source as RawEntity),
        name: safeName,
        type: payload.type,
        ai: safeRules,
        __builderMeta: {
          ...((entity.source as any).__builderMeta ?? {}),
          updatedAt: new Date().toISOString(),
          // Mark draft as saved when the user explicitly saves
          ...(wasDraft ? { saved: true } : {}),
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
              {sources.map(s => {
                if (s.name === "Drafts") {
                  const crewSaved = s.crew.filter(raw => (raw as any)?.__builderMeta?.saved).length;
                  const roomSaved = s.rooms.filter(raw => (raw as any)?.__builderMeta?.saved).length;
                  if (crewSaved + roomSaved === 0) return null; // hide Drafts when nothing saved
                  return (
                    <div key={s.id} className="sourceRow">
                      <span className="sourceName">{s.name}</span>
                      <span className="sourceCounts">{crewSaved} crew / {roomSaved} rooms</span>
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
                  );
                }
                return (
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
                );
              })}
            </div>
          ) : null}
        </div>

        <ListView entities={allEntities} filter={filter} onFilterChange={setFilter} onSelect={add} onDeleteDraft={handleDeleteDraft} />
      </aside>

      <Workspace
        entities={workspaceEntities}
        onRemove={handleCloseEntity}
        onUpdate={handleUpdateEntity}
        showSummaries={showSummaries}
      />
    </>
  );
}
