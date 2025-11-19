import { type DragEvent, useState, useCallback, useRef, useEffect } from "react";
import type { BuilderRule } from "@/utils/ruleTransforms";

export function useDragReorder(rules: BuilderRule[], setRules: (updater: (prev: BuilderRule[]) => BuilderRule[]) => void) {
  const [draggingRuleId, setDraggingRuleId] = useState<string | null>(null);
  const [dropIndicatorIndex, setDropIndicatorIndex] = useState<number | null>(null);
  const draggingRef = useRef<string | null>(null);
  const lastIndicatorRef = useRef<number | null>(null);
  // track last preview move to avoid redundant setRules on repeated dragover
  const previewRef = useRef<{ sourceId: string | null; target: number | null }>({ sourceId: null, target: null });

  const moveRuleToIndex = useCallback((sourceId: string, targetSlot: number | null) => {
    if (!sourceId || targetSlot == null) return;
    setRules((prev: BuilderRule[]) => {
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
  }, [setRules]);

  const endRuleDrag = useCallback(() => {
    setDraggingRuleId(null);
    setDropIndicatorIndex(null);
    lastIndicatorRef.current = null;
    draggingRef.current = null;
    previewRef.current = { sourceId: null, target: null };
  }, []);

  // keep refs in sync so global handlers can read latest values
  useEffect(() => {
    draggingRef.current = draggingRuleId;
  }, [draggingRuleId]);

  useEffect(() => {
    lastIndicatorRef.current = dropIndicatorIndex;
  }, [dropIndicatorIndex]);

  // If the user drops outside the column, listen on window and apply the last indicator
  useEffect(() => {
    const onWindowDrop = (ev: DragEvent) => {
      try {
        const id = draggingRef.current ?? (ev.dataTransfer && ev.dataTransfer.getData ? ev.dataTransfer.getData("text/plain") : null);
        if (!id) return;
        ev.preventDefault();
        ev.stopPropagation();
        const target = lastIndicatorRef.current != null ? lastIndicatorRef.current : rules.length;
        if (!(previewRef.current.sourceId === id && previewRef.current.target === target)) {
          moveRuleToIndex(id, target);
        }
      } catch (e) {
        // ignore
      } finally {
        endRuleDrag();
      }
    };

    const onWindowDragEnd = () => {
      endRuleDrag();
    };

    window.addEventListener("drop", onWindowDrop as any);
    window.addEventListener("dragend", onWindowDragEnd as any);
    return () => {
      window.removeEventListener("drop", onWindowDrop as any);
      window.removeEventListener("dragend", onWindowDragEnd as any);
    };
  }, [moveRuleToIndex, endRuleDrag, rules.length]);

  const beginRuleDrag = useCallback((event: DragEvent<HTMLElement>, ruleId: string, index: number) => {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", ruleId);
    setDraggingRuleId(ruleId);
    const v = index + 1;
    setDropIndicatorIndex(v);
    lastIndicatorRef.current = v;
    // store immediately so fast drops can read it
    draggingRef.current = ruleId;
  }, []);

  // Determine target slot (insertion index) for a row based on pointer position.
  // If the pointer is in the top half of the row, insert before the row (slot = rowIndex),
  // otherwise insert after the row (slot = rowIndex + 1).
  const slotForRowEvent = useCallback((event: DragEvent<HTMLDivElement>, rowIndex: number) => {
    try {
      const el = event.currentTarget as HTMLElement | null;
      if (el) {
        const rect = el.getBoundingClientRect();
        const mid = rect.top + rect.height / 2;
        return event.clientY < mid ? rowIndex : rowIndex + 1;
      }
    } catch (e) {
      // fallthrough to safe default
    }
    return rowIndex + 1;
  }, []);

  const handleRowDragOver = useCallback((event: DragEvent<HTMLDivElement>, rowIndex: number) => {
    const sourceId = draggingRef.current ?? draggingRuleId ?? (event.dataTransfer && event.dataTransfer.getData ? event.dataTransfer.getData("text/plain") : null);
    if (!sourceId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    const v = slotForRowEvent(event, rowIndex);

    // Apply preview move BEFORE showing the visual indicator so fast drops already have the order saved.
    if (previewRef.current.sourceId !== sourceId || previewRef.current.target !== v) {
      // perform preview move
      moveRuleToIndex(sourceId, v);
      previewRef.current = { sourceId, target: v };
    }

    setDropIndicatorIndex(v);
    lastIndicatorRef.current = v;
  }, [draggingRuleId, slotForRowEvent]);

  const handleRowDrop = useCallback((event: DragEvent<HTMLDivElement>, rowIndex: number) => {
    event.preventDefault();
    event.stopPropagation();
    const sourceId = draggingRef.current ?? draggingRuleId ?? (event.dataTransfer && event.dataTransfer.getData ? event.dataTransfer.getData("text/plain") : null);
    if (!sourceId) {
      endRuleDrag();
      return;
    }
    // Use the last-known visual indicator (synchronous ref) as authoritative for fast drops.
    const targetSlot = lastIndicatorRef.current != null ? lastIndicatorRef.current : slotForRowEvent(event, rowIndex);
    if (!(previewRef.current.sourceId === sourceId && previewRef.current.target === targetSlot)) {
      moveRuleToIndex(sourceId, targetSlot);
    }
    endRuleDrag();
  }, [draggingRuleId, slotForRowEvent, moveRuleToIndex, endRuleDrag, dropIndicatorIndex]);

  const handleEndZoneDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    const sourceId = draggingRef.current ?? draggingRuleId ?? (event.dataTransfer && event.dataTransfer.getData ? event.dataTransfer.getData("text/plain") : null);
    if (!sourceId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    const v = rules.length;
    // preview move
    if (previewRef.current.sourceId !== sourceId || previewRef.current.target !== v) {
      moveRuleToIndex(sourceId, v);
      previewRef.current = { sourceId, target: v };
    }
    setDropIndicatorIndex(v);
    lastIndicatorRef.current = v;
  }, [draggingRuleId, rules.length]);

  const handleEndZoneDrop = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const sourceId = draggingRef.current ?? draggingRuleId ?? (event.dataTransfer && event.dataTransfer.getData ? event.dataTransfer.getData("text/plain") : null);
    if (!sourceId) {
      endRuleDrag();
      return;
    }
    const target = lastIndicatorRef.current != null ? lastIndicatorRef.current : rules.length;
    if (!(previewRef.current.sourceId === sourceId && previewRef.current.target === target)) {
      moveRuleToIndex(sourceId, target);
    }
    endRuleDrag();
  }, [draggingRuleId, rules.length, moveRuleToIndex, endRuleDrag]);

  const handleTopZoneDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    const sourceId = draggingRef.current ?? draggingRuleId ?? (event.dataTransfer && event.dataTransfer.getData ? event.dataTransfer.getData("text/plain") : null);
    if (!sourceId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    const v = 0;
    if (previewRef.current.sourceId !== sourceId || previewRef.current.target !== v) {
      moveRuleToIndex(sourceId, v);
      previewRef.current = { sourceId, target: v };
    }
    setDropIndicatorIndex(v);
    lastIndicatorRef.current = v;
  }, [draggingRuleId]);

  const handleTopZoneDrop = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const sourceId = draggingRef.current ?? draggingRuleId ?? (event.dataTransfer && event.dataTransfer.getData ? event.dataTransfer.getData("text/plain") : null);
    if (!sourceId) {
      endRuleDrag();
      return;
    }
    const target = lastIndicatorRef.current != null ? lastIndicatorRef.current : 0;
    if (!(previewRef.current.sourceId === sourceId && previewRef.current.target === target)) {
      moveRuleToIndex(sourceId, target);
    }
    endRuleDrag();
  }, [draggingRuleId, moveRuleToIndex, endRuleDrag]);

  return {
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
  };
}
