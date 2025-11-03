import { type DragEvent, useState, useCallback } from "react";
import type { BuilderRule } from "@/utils/ruleTransforms";

export function useDragReorder(rules: BuilderRule[], setRules: (updater: (prev: BuilderRule[]) => BuilderRule[]) => void) {
  const [draggingRuleId, setDraggingRuleId] = useState<string | null>(null);
  const [dropIndicatorIndex, setDropIndicatorIndex] = useState<number | null>(null);

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
  }, []);

  const beginRuleDrag = useCallback((event: DragEvent<HTMLElement>, ruleId: string, index: number) => {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", ruleId);
    setDraggingRuleId(ruleId);
    setDropIndicatorIndex(index + 1);
  }, []);

  const slotForRowEvent = useCallback((_event: DragEvent<HTMLDivElement>, rowIndex: number) => {
    return rowIndex + 1;
  }, []);

  const handleRowDragOver = useCallback((event: DragEvent<HTMLDivElement>, rowIndex: number) => {
    const sourceId = draggingRuleId ?? event.dataTransfer.getData("text/plain");
    if (!sourceId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDropIndicatorIndex(slotForRowEvent(event, rowIndex));
  }, [draggingRuleId, slotForRowEvent]);

  const handleRowDrop = useCallback((event: DragEvent<HTMLDivElement>, rowIndex: number) => {
    event.preventDefault();
    event.stopPropagation();
    const sourceId = draggingRuleId ?? event.dataTransfer.getData("text/plain");
    if (!sourceId) {
      endRuleDrag();
      return;
    }
    const targetSlot = slotForRowEvent(event, rowIndex);
    moveRuleToIndex(sourceId, targetSlot);
    endRuleDrag();
  }, [draggingRuleId, slotForRowEvent, moveRuleToIndex, endRuleDrag]);

  const handleEndZoneDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    const sourceId = draggingRuleId ?? event.dataTransfer.getData("text/plain");
    if (!sourceId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDropIndicatorIndex(rules.length);
  }, [draggingRuleId, rules.length]);

  const handleEndZoneDrop = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const sourceId = draggingRuleId ?? event.dataTransfer.getData("text/plain");
    if (!sourceId) {
      endRuleDrag();
      return;
    }
    moveRuleToIndex(sourceId, rules.length);
    endRuleDrag();
  }, [draggingRuleId, rules.length, moveRuleToIndex, endRuleDrag]);

  const handleTopZoneDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    const sourceId = draggingRuleId ?? event.dataTransfer.getData("text/plain");
    if (!sourceId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDropIndicatorIndex(0);
  }, [draggingRuleId]);

  const handleTopZoneDrop = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const sourceId = draggingRuleId ?? event.dataTransfer.getData("text/plain");
    if (!sourceId) {
      endRuleDrag();
      return;
    }
    moveRuleToIndex(sourceId, 0);
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
