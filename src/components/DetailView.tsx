import { type KeyboardEvent, useMemo, useEffect, useState, useRef, useCallback } from "react";
import type { Entity, EntityType, Rule } from "@/types";
import { humanizeSpecial, getAssetForName } from "@/utils";
import { useCatalogOptions, ensureCatalogOption, toSearchOptions } from "@/utils/catalog";
import { randomId } from "@/utils/random";
import { prepareEntityExport, downloadJson } from "@/utils/export";
import { SearchSelect, type SearchSelectOption } from "@/components/SearchSelect";
import { useSticky } from "@/hooks/useSticky";
import { useDragReorder } from "@/hooks/useDragReorder";
import { useEntitySprites } from "@/hooks/useEntitySprites";
import { useSegmentSummaries } from "@/hooks/useSegmentSummaries";
import { useClickOutside } from "@/hooks/useClickOutside";
import { type BuilderRule, toBuilderRules, rulesFromBuilder, rulesSignature } from "@/utils/ruleTransforms";
import { normalizeEntityType, extractEntityMetadata } from "@/utils/entityHelpers";

export type EntityEditPayload = {
  name: string;
  type: EntityType;
  rules: Rule[];
  spriteId?: string;
};

interface DetailViewProps {
  entity: Entity;
  onRemove: () => void;
  onUpdate: (payload: EntityEditPayload) => void;
  showSummaries: boolean;
}

export function DetailView({ entity, onRemove, onUpdate, showSummaries }: DetailViewProps) {
  const { containerRef, stickyRef: headerRef, isFixed, stickyHeight: headerHeight } = useSticky();

  const [draftName, setDraftName] = useState<string>(entity.name);
  const [draftType, setDraftType] = useState<EntityType>(normalizeEntityType(entity.type));
  const [draftRules, setDraftRules] = useState<BuilderRule[]>(() => toBuilderRules(entity.flatRules));
  const [selectedCondition, setSelectedCondition] = useState("");
  const [selectedAction, setSelectedAction] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [showEntitySettings, setShowEntitySettings] = useState(false);
  const [showAddRule, setShowAddRule] = useState(false);
  const [showActionsMenu, setShowActionsMenu] = useState(false);
  const actionsMenuRef = useRef<HTMLDivElement | null>(null);
  const addRuleFormRef = useRef<HTMLDivElement | null>(null);
  const rulesAddLinkRef = useRef<HTMLButtonElement | null>(null);
  const [selectedSpriteId, setSelectedSpriteId] = useState<string>("");
  const [nameManuallyEdited, setNameManuallyEdited] = useState(false);

  const { actions, conditions, isLoading: isLoadingCatalog, error: catalogError } = useCatalogOptions();
  const { spriteOptions, isLoading: isLoadingSprites } = useEntitySprites();

  const {
    draggingRuleId,
    dropIndicatorIndex,
    beginRuleDrag,
    endRuleDrag,
    handleRowDragOver,
    handleRowDrop,
    handleTopZoneDragOver,
    handleTopZoneDrop,
    handleEndZoneDragOver,
    handleEndZoneDrop,
  } = useDragReorder(draftRules, setDraftRules);

  const composerConditionOptions = useMemo(
    () => toSearchOptions(ensureCatalogOption(conditions, selectedCondition), { value: "", label: "None" }),
    [conditions, selectedCondition]
  );

  const composerActionOptions = useMemo(
    () =>
      toSearchOptions(ensureCatalogOption(actions, selectedAction), {
        value: "",
        label: "Select action…",
      }),
    [actions, selectedAction]
  );

  useEffect(() => {
    setDraftName(entity.name);
    setDraftType(normalizeEntityType(entity.type));
    setDraftRules(toBuilderRules(entity.flatRules));
    setSelectedCondition("");
    setSelectedAction("");
    setError(null);
    setSaveStatus(null);

    // Extract current sprite ID from entity source
    const sourceId = entity.source?.profile_sprite_id || entity.source?.image_sprite_id;
    setSelectedSpriteId(sourceId ? String(sourceId) : "");

    // Show entity settings by default ONLY for new unsaved drafts
    const meta = (entity.source as any)?.__builderMeta;
    if (meta?.isDraft && !meta?.saved) {
      setShowEntitySettings(true);
      setShowAddRule(false);
      setNameManuallyEdited(false); // Reset for new drafts so name can be auto-filled
    } else {
      setShowEntitySettings(false);
    }
  }, [entity.id]);

  useEffect(() => {
    setSelectedCondition(prev => {
      if (!prev) return conditions[0]?.value ?? "";
      if (conditions.some(option => option.value === prev)) return prev;
      return prev;
    });
  }, [conditions]);

  useEffect(() => {
    setSelectedAction(prev => {
      if (!prev) return actions[0]?.value ?? "";
      if (actions.some(option => option.value === prev)) return prev;
      return prev;
    });
  }, [actions]);

  // Close actions menu when clicking outside
  useClickOutside(actionsMenuRef, useCallback(() => setShowActionsMenu(false), []), showActionsMenu);

  const normalizedRules = useMemo(() => rulesFromBuilder(draftRules), [draftRules]);
  const segmentSummaries = useSegmentSummaries(normalizedRules);

  const originalSignature = useMemo(() => rulesSignature(entity.flatRules), [entity.flatRules]);
  const draftSignature = useMemo(() => rulesSignature(normalizedRules), [normalizedRules]);

  const trimmedName = draftName.trim();
  const displayName = trimmedName || entity.name;
  const isDirty =
    trimmedName !== (entity.name || "") ||
    normalizeEntityType(entity.type) !== draftType ||
    originalSignature !== draftSignature;

  const moveRuleToIndex = (sourceId: string, targetSlot: number | null) => {
    if (!sourceId || targetSlot == null) return;
    setDraftRules(prev => {
      const fromIndex = prev.findIndex(rule => rule.id === sourceId);
      if (fromIndex === -1) return prev;

      const clampedSlot = Math.max(0, Math.min(prev.length, targetSlot));
      if (clampedSlot === fromIndex || clampedSlot === fromIndex + 1) {
        return prev;
      }

      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      let insertionIndex = clampedSlot;
      if (fromIndex < clampedSlot) {
        insertionIndex -= 1;
      }
      next.splice(insertionIndex, 0, moved);
      return next;
    });
  };

  const addRule = () => {
    setError(null);
    if (!selectedAction.trim()) {
      setError("Select an action before adding the rule.");
      return;
    }
    const newId = randomId("rule");
    setDraftRules(prev => [
      ...prev,
      {
        id: newId,
        condition: selectedCondition.trim(),
        action: selectedAction.trim(),
      },
    ]);
    // Close the form after adding
    setShowAddRule(false);
    // Wait for React to render the new rule, then focus the Add Rule link so user can immediately add another
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (containerRef.current) {
          containerRef.current.scrollIntoView({ behavior: "auto", block: "end" });
        }
        rulesAddLinkRef.current?.focus();
      });
    });
  };

  const updateRule = (ruleId: string, field: "condition" | "action", value: string) => {
    setDraftRules(prev => prev.map(rule => (rule.id === ruleId ? { ...rule, [field]: value } : rule)));
  };

  const removeRule = (ruleId: string) => {
    setDraftRules(prev => prev.filter(rule => rule.id !== ruleId));
  };

  const resetDraft = () => {
    setDraftName(entity.name);
    setDraftType(normalizeEntityType(entity.type));
    setDraftRules(toBuilderRules(entity.flatRules));
    setSelectedCondition(conditions[0]?.value ?? "");
    setSelectedAction(actions[0]?.value ?? "");
    setError(null);
    setSaveStatus(null);
  };

  const handleSave = () => {
    const safeName = trimmedName || "(unnamed)";
    const payloadRules = rulesFromBuilder(draftRules);
    onUpdate({
      name: safeName,
      type: draftType,
      rules: payloadRules,
      spriteId: selectedSpriteId || undefined
    });
    setDraftName(safeName);
    setSaveStatus("Saved changes");
    setTimeout(() => setSaveStatus(null), 4000);
  };

  const handleDownload = async () => {
    const safeName = displayName || "new-ai";
    const payloadRules = rulesFromBuilder(draftRules);

    const exportData = await prepareEntityExport({
      source: entity.source as any,
      name: safeName,
      type: draftType,
      rules: payloadRules,
      spriteId: selectedSpriteId || undefined,
    });

    const filename = `${safeName.replace(/\s+/g, "-").toLowerCase()}-ai.json`;
    downloadJson(exportData, filename);
  };

  const { headerSpriteUrl, specialKey, sourceFileName } = extractEntityMetadata(entity.source);
  // If a sprite is selected in draft mode, prefer its special (for crew) over the source's
  const selectedSpriteMeta = useMemo(() => spriteOptions.find(opt => opt.value === selectedSpriteId)?.meta ?? {}, [spriteOptions, selectedSpriteId]);
  const effectiveSpecialKey: string | null = (selectedSpriteMeta?.specialKey as string | null) ?? specialKey;
  const specialHuman = humanizeSpecial(effectiveSpecialKey) ?? effectiveSpecialKey;
  const specialIconUrl = specialHuman ? getAssetForName(specialHuman) : undefined;

  // Use selected sprite ID if available, otherwise fall back to source
  const displaySpriteUrl = selectedSpriteId
    ? `https://api.pixelstarships.com/FileService/DownloadSprite?spriteId=${selectedSpriteId}`
    : headerSpriteUrl;

  // Placeholder avatar (question mark) when no sprite is selected yet
  const placeholderSvg = `
    <svg xmlns='http://www.w3.org/2000/svg' width='48' height='48' viewBox='0 0 48 48'>
      <defs>
        <linearGradient id='g' x1='0' y1='0' x2='0' y2='1'>
          <stop offset='0%' stop-color='#313a47'/>
          <stop offset='100%' stop-color='#0f172a'/>
        </linearGradient>
      </defs>
      <rect width='48' height='48' rx='4' fill='url(#g)'/>
      <text x='50%' y='55%' text-anchor='middle' dominant-baseline='middle' alignment-baseline='middle'
            font-size='28' fill='#94a3b8'
            font-family='system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif'>?</text>
    </svg>
  `;
  const placeholderSpriteUrl = 'data:image/svg+xml;utf8,' + encodeURIComponent(placeholderSvg);
  const headerImageUrl = displaySpriteUrl || placeholderSpriteUrl;

  return (
    <div className="entityColumn" ref={containerRef}>
      <div className={`entityColumnHeader${isFixed ? " fixed" : ""}`} ref={headerRef}>
        <div className="entityHeaderMain">
          <img src={headerImageUrl} alt={`${displayName} sprite`} className="entityHeaderAvatar" />
          <div className="entityHeaderName" title={displayName}>
            <div className="entityHeaderTitleRow">
              <span className="entityHeaderTitleText">{displayName}</span>
            </div>
            {specialHuman ? (
              <span className="entitySpecialBadge" title={String(specialHuman)}>
                {specialIconUrl ? <img src={specialIconUrl} alt={String(specialHuman)} className="specialIconHeader" /> : null}
                <span className="entitySpecialName">{specialHuman}</span>
              </span>
            ) : null}
            {sourceFileName ? <div className="entitySourceSubtitle">{sourceFileName}</div> : null}
          </div>
        </div>
        <div className="entityHeaderActions">
          <button
            type="button"
            className={`iconBtn addRule${showAddRule ? " active" : ""}`}
            onClick={() => {
              if (!showAddRule) {
                setShowAddRule(true);
                setShowEntitySettings(false);
                // Reset composer fields to placeholders on each open
                setSelectedCondition("");
                setSelectedAction("");
                window.scrollTo({ top: 0, behavior: "auto" });
              } else {
                setShowAddRule(false);
              }
            }}
            title="Add rule"
            aria-label="Toggle add rule form"
          >
            +
          </button>
          <button
            type="button"
            className="iconBtn saveBtn"
            onClick={handleSave}
            disabled={!isDirty}
            title="Save changes"
            aria-label="Save changes"
          >
            💾
          </button>
          <div className="actionsMenuWrapper" ref={actionsMenuRef}>
            <button
              type="button"
              className={`iconBtn${showActionsMenu ? " active" : ""}`}
              onClick={() => setShowActionsMenu(prev => !prev)}
              title="More actions"
              aria-label="More actions"
            >
              ☰
            </button>
            {showActionsMenu && (
              <div className="actionsMenu">
                <button
                  type="button"
                  className="actionsMenuItem"
                  onClick={() => {
                    setShowAddRule(true);
                    setShowEntitySettings(false);
                    setShowActionsMenu(false);
                    // Reset composer fields to placeholders on each open
                    setSelectedCondition("");
                    setSelectedAction("");
                    window.scrollTo({ top: 0, behavior: "auto" });
                  }}
                >
                  <span className="actionsMenuIcon">+</span>
                  <span>Add rule</span>
                </button>
                <button
                  type="button"
                  className="actionsMenuItem"
                  onClick={() => {
                    setShowEntitySettings(prev => !prev);
                    setShowAddRule(false);
                    setShowActionsMenu(false);
                  }}
                >
                  <span className="actionsMenuIcon">⚙</span>
                  <span>Entity settings</span>
                </button>
                <button
                  type="button"
                  className="actionsMenuItem"
                  onClick={() => {
                    handleSave();
                    setShowActionsMenu(false);
                  }}
                  disabled={!isDirty}
                >
                  <span className="actionsMenuIcon">💾</span>
                  <span>Save changes</span>
                </button>
                <button
                  type="button"
                  className="actionsMenuItem"
                  onClick={() => {
                    resetDraft();
                    setShowActionsMenu(false);
                  }}
                  disabled={!isDirty}
                >
                  <span className="actionsMenuIcon">↺</span>
                  <span>Revert to source</span>
                </button>
                <button
                  type="button"
                  className="actionsMenuItem"
                  onClick={() => {
                    handleDownload();
                    setShowActionsMenu(false);
                  }}
                >
                  <span className="actionsMenuIcon">⬇</span>
                  <span>Download JSON</span>
                </button>
              </div>
            )}
          </div>
          <div
            className="closeBtn"
            role="button"
            tabIndex={0}
            onClick={() => {
              onRemove();
              setTimeout(() => window.dispatchEvent(new Event("pss:columns-changed")), 0);
            }}
            onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onRemove();
                setTimeout(() => window.dispatchEvent(new Event("pss:columns-changed")), 0);
              }
            }}
          >
            ✕
          </div>
        </div>
      </div>
  {isFixed && <div aria-hidden style={{ height: headerHeight }} />}

      <div className="entityBody">
        {showEntitySettings ? (
          <div className="builderSplit">
            <div className="builderField">
              <label htmlFor={`entity-sprite-${entity.id}`}>Crew / Room</label>
              <SearchSelect
                key={`sprite-${entity.id}-${showEntitySettings}`}
                id={`entity-sprite-${entity.id}`}
                options={spriteOptions}
                value={selectedSpriteId}
                onChange={(value) => {
                  setSelectedSpriteId(value);
                  // Auto-detect type from selected sprite
                  const selected = spriteOptions.find(opt => opt.value === value);
                  if (selected?.meta?.type) {
                    setDraftType(selected.meta.type);
                  }
                  // Auto-update name for drafts if it hasn't been manually edited
                  const isDraft = (entity.source as any)?.__builderMeta?.isDraft;
                  if (isDraft && !nameManuallyEdited && selected) {
                    // Extract name without the "(Character)" or "(Room)" suffix
                    const cleanName = selected.label.replace(/\s*\(Character\)|\s*\(Room\)/i, "").trim();
                    setDraftName(cleanName);
                  }
                }}
                placeholder={isLoadingSprites ? "Loading..." : "Select crew/room…"}
                disabled={isLoadingSprites || spriteOptions.length === 0}
                autoFocus
              />
            </div>
            <div className="builderField">
              <label htmlFor={`entity-name-${entity.id}`}>Name</label>
              <input
                id={`entity-name-${entity.id}`}
                value={draftName}
                onChange={event => {
                  setDraftName(event.target.value);
                  setNameManuallyEdited(true);
                }}
                placeholder="Entity name"
              />
            </div>
          </div>
        ) : null}

        {showAddRule ? (
          <div className="ruleComposer" ref={addRuleFormRef}>
            <div className="ruleInputs">
              <div className="ruleInput">
                <span className="ruleInputLabel">Condition</span>
                <SearchSelect
                  key={`cond-${entity.id}-${showAddRule}`}
                  id={`rule-cond-${entity.id}`}
                  value={selectedCondition}
                  onChange={setSelectedCondition}
                  options={composerConditionOptions}
                  placeholder="None"
                  autoFocus
                />
              </div>
              <div className="ruleInput">
                <span className="ruleInputLabel">Action</span>
                <SearchSelect
                  id={`rule-action-${entity.id}`}
                  value={selectedAction}
                  onChange={value => {
                    setSelectedAction(value);
                    if (value.trim()) setError(null);
                  }}
                  options={composerActionOptions}
                  placeholder="Select action…"
                />
              </div>
              <button type="button" className="ruleAddBtn" onClick={addRule}>
                Add rule
              </button>
            </div>
            {isLoadingCatalog ? <div className="builderHint">Loading catalog…</div> : null}
            {catalogError ? <div className="builderHint warning">{catalogError}</div> : null}
          </div>
        ) : null}

        <div className="rulesSection">
          <h2 className="rulesSectionTitle">
            Rules ({draftRules.length})
            <button
              ref={rulesAddLinkRef}
              type="button"
              className="rulesAddLink"
              onClick={() => {
                if (!showAddRule) {
                  setShowAddRule(true);
                  setShowEntitySettings(false);
                  // Reset composer fields to placeholders on each open
                  setSelectedCondition("");
                  setSelectedAction("");
                  window.scrollTo({ top: 0, behavior: "auto" });
                } else {
                  // If composer is visible, clicking the link should act like the Add rule button
                  addRule();
                }
              }}
              title="Add rule"
              aria-label="Add rule"
            >
              Add Rule
            </button>
          </h2>
          {draftRules.length ? (
            <div className="ruleList">
              {draggingRuleId ? (
                <div
                  className={`ruleDropZone top${dropIndicatorIndex === 0 ? " dragOver" : ""}`}
                  onDragOver={handleTopZoneDragOver}
                  onDragEnter={handleTopZoneDragOver}
                  onDrop={handleTopZoneDrop}
                  aria-hidden
                />
              ) : null}
              {draftRules.map((rule, idx) => {
                const conditionOptions = ensureCatalogOption(conditions, rule.condition);
                const actionOptions = ensureCatalogOption(actions, rule.action);
                const conditionSearchOptions = toSearchOptions(conditionOptions, { value: "", label: "None" });
                const actionSearchOptions = toSearchOptions(actionOptions, {
                  value: "",
                  label: "Select action…",
                });
                const summary = segmentSummaries.get(idx);
                const isDragging = draggingRuleId === rule.id;
                const highlightRow = dropIndicatorIndex === idx + 1;
                const rowClass = [
                  "ruleListRow",
                  "editable",
                  isDragging ? "dragging" : "",
                  highlightRow ? "dragHover" : "",
                ]
                  .filter(Boolean)
                  .join(" ");
                return (
                  <div key={rule.id} className="ruleListGroup" data-rule-id={rule.id}>
                    <div
                      className={rowClass}
                      onDragOver={event => handleRowDragOver(event, idx)}
                      onDragEnter={event => handleRowDragOver(event, idx)}
                      onDrop={event => handleRowDrop(event, idx)}
                    >
                      <span
                        className={`ruleDragHandle${isDragging ? " active" : ""}`}
                        aria-hidden
                        draggable
                        onDragStart={event => beginRuleDrag(event, rule.id, idx)}
                        onDragEnd={endRuleDrag}
                      >
                        ⋮⋮
                      </span>
                      <span className="ruleIndex">{idx + 1}</span>
                      <SearchSelect
                        id={`rule-row-cond-${entity.id}-${rule.id}`}
                        value={rule.condition}
                        onChange={value => updateRule(rule.id, "condition", value)}
                        options={conditionSearchOptions}
                        placeholder="None"
                      />
                      <span className="ruleArrow">→</span>
                      <SearchSelect
                        id={`rule-row-action-${entity.id}-${rule.id}`}
                        value={rule.action}
                        onChange={value => updateRule(rule.id, "action", value)}
                        options={actionSearchOptions}
                        placeholder="Select action…"
                      />
                      <div className="ruleRowActions">
                        <button
                          type="button"
                          className="ruleRemoveBtn"
                          onClick={() => removeRule(rule.id)}
                          aria-label={`Remove rule ${idx + 1}`}
                          title="Remove rule"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                    {draggingRuleId && dropIndicatorIndex === idx + 1 ? <div className="ruleDropIndicator" aria-hidden /> : null}
                    {showSummaries && summary ? (
                      <div className="segmentSummaryBlock inline">
                        <div className="segmentSummaryText">
                          {summary.parts.map((part, partIdx) => (
                            <div className="segmentSummaryLine" key={`segment-${idx}-line-${partIdx}`}>
                              <span className="segmentSummaryLabel">{partIdx === 0 ? "IF" : "AND"}</span>
                              <span className="segmentSummaryContent">{` ${part}`}</span>
                            </div>
                          ))}
                          <div className="segmentSummaryLine">
                            <span className="segmentSummaryLabel">THEN</span>
                            <span className="segmentSummaryDo">{` ${summary.action}`}</span>
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
              {draggingRuleId ? (
                <div
                  className={`ruleDropZone bottom${dropIndicatorIndex === draftRules.length ? " dragOver" : ""}`}
                  onDragOver={handleEndZoneDragOver}
                  onDragEnter={handleEndZoneDragOver}
                  onDrop={handleEndZoneDrop}
                  aria-hidden
                />
              ) : null}
            </div>
          ) : (
            <div className="builderHint">No rules yet. Add one using the controls above.</div>
          )}
        </div>

        {error ? <div className="builderHint warning">{error}</div> : null}
        {saveStatus ? <div className="builderHint">{saveStatus}</div> : null}
      </div>
    </div>
  );
}
