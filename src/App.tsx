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

const ENTITY_COLUMN_WIDTH = 565;

export default function App() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sources, setSources] = useState<Array<{ id: string; name: string; crew: RawEntity[]; rooms: RawEntity[] }>>(() => {
    // Load drafts from localStorage on mount
    const savedDrafts = localStorage.getItem("pssai:drafts");
    if (savedDrafts) {
      try {
        const drafts = JSON.parse(savedDrafts) as RawEntity[];
        if (drafts.length > 0) {
          return [{
            id: randomId("source"),
            name: "In Browser",
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

  // Trigger sticky header recalculation when sidebar collapses/expands
  useEffect(() => {
    window.dispatchEvent(new Event("pss:columns-changed"));
  }, [sidebarCollapsed]);

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

  // Close an entity; if it's an unsaved draft, remove it entirely from the In Browser source
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
              if (src.name !== "In Browser") return src;
              const crew = src.crew.filter(raw => raw !== entity.source);
              const rooms = src.rooms.filter(raw => raw !== entity.source);
              return { ...src, crew, rooms };
            })
            // If In Browser is now empty, drop it entirely
            .filter(src => (src.name === "In Browser" ? src.crew.length + src.rooms.length > 0 : true))
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
    if (!sidebarCollapsed && typeof window !== "undefined" && window.innerWidth < ENTITY_COLUMN_WIDTH) {
      setSidebarCollapsed(true);
    }

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
        fileName: "In Browser",
        // Provide a stable fileId so normalized IDs don't depend on array index
        fileId: undefined as any, // placeholder, set just after object creation
      },
    };
    // After creation, set fileId to stable unique id (use draft id)
    (draftRaw as any).__sourceFile.fileId = draftRaw.id;

    // Insert into a single shared "In Browser" source in-memory (hidden until saved)
    setSources(prev => {
      // Find existing In Browser source (by name)
      const idx = prev.findIndex(s => s.name === "In Browser");
      if (idx >= 0) {
        const next = [...prev];
        const src = next[idx];
        src.crew = [...src.crew, draftRaw];
        // Mark to open after state updates
        pendingDraftRef.current = draftRaw;
        return next;
      }
      // Create a new In Browser source (hidden until any draft is saved)
      const newDraftsSource = {
        id: randomId("source"),
        name: "In Browser",
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

    setSources(prevSources => {
      // Work on a shallow copy
      const next = prevSources.map(s => ({ ...s, crew: [...s.crew], rooms: [...s.rooms] }));

      // Find the source that contains the original raw
      let srcIndex = -1;
      let isCrew = false;
      for (let i = 0; i < next.length; i++) {
        const s = next[i];
        if (s.crew.includes(entity.source as RawEntity)) {
          srcIndex = i;
          isCrew = true;
          break;
        }
        if (s.rooms.includes(entity.source as RawEntity)) {
          srcIndex = i;
          isCrew = false;
          break;
        }
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
          // If this was already a draft we mark saved; if not, when saving we promote it to saved in-browser
          ...(wasDraft ? { saved: true } : { isDraft: true, saved: true, createdAt: new Date().toISOString() }),
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

      // If the original source is the In Browser source we replace the raw there.
      // Otherwise (an imported file/source) we leave it untouched so saving only creates
      // a copy in the In Browser source and does not modify the original imported structure.
      if (srcIndex >= 0) {
        const s = next[srcIndex];
        if (s.name === "In Browser") {
          if (isCrew) s.crew = s.crew.filter(r => r !== entity.source);
          else s.rooms = s.rooms.filter(r => r !== entity.source);
        }
      }

      // Find or create the In Browser source
      let inIdx = next.findIndex(s => s.name === "In Browser");
      if (inIdx === -1) {
        const newSrc = { id: randomId("source"), name: "In Browser", crew: [] as RawEntity[], rooms: [] as RawEntity[] };
        next.unshift(newSrc);
        inIdx = 0;
      }

      // Add updatedRaw to the appropriate list in In Browser
      if (payload.type === "crew") {
        next[inIdx].crew.push(updatedRaw);
      } else {
        next[inIdx].rooms.push(updatedRaw);
      }

      // Compute replacementId for normalized IDs
      try {
        const normalized = normalizeEntities(next[inIdx].crew.concat(next[inIdx].rooms), payload.type === "crew" ? "crew" : "room");
        const found = normalized.find(item => item.source === updatedRaw);
        if (found) replacementId = found.id;
      } catch (e) {
        // ignore
      }

      return next;
    });

    if (replacementId && replacementId !== entity.id) {
      const nextId = replacementId;
      setIds(prev => prev.map(id => (id === entity.id ? nextId : id)));
    }

    setTimeout(() => window.dispatchEvent(new Event("pss:columns-changed")), 0);
  };

  return (
    <>
      <aside id="sidebar" className={sidebarCollapsed ? "collapsed" : ""}>
        <div id="sidebarTop" className={sidebarCollapsed ? "collapsed" : ""}>
          {!sidebarCollapsed ? (
            <>
              <img src={`${import.meta.env.BASE_URL}favicon.png`} alt="PSS AI" className="sideLogo" />
              <div className="sidebarTitleWrap">
                <h1>pssshop.github.io/ai</h1>
                <a
                  href="https://pssshop.github.io"
                  className="sidebarBackLink"
                  aria-label="Back to main site"
                  title="Back to pssshop.github.io"
                >
                  ← Back to main site
                </a>
              </div>
            </>
          ) : null}
          <button
            type="button"
            className="sidebarCollapseBtn"
            onClick={() => setSidebarCollapsed(prev => !prev)}
            aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <span aria-hidden>{sidebarCollapsed ? "»" : "«"}</span>
          </button>
        </div>

        {!sidebarCollapsed ? (
          <div className="sidebarContent">
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
                <label htmlFor="importFile">Import AI (JSON or .txt)</label>
                <input
                  id="importFile"
                  type="file"
                  accept=".json,.txt,application/json,text/plain"
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
          </div>
        ) : null}
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
