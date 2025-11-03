import { useMemo } from "react";
import type { Rule } from "@/types";
import {
  buildSegmentsForSubsystem,
  analyzeSegment,
  getRuleDisplayIndex,
  isSkip,
  summarizeRuleRequirements,
} from "@/utils";

export function useSegmentSummaries(rules: Rule[]) {
  return useMemo(() => {
    const summaryMap = new Map<number, { parts: string[]; action: string }>();
    const segments = buildSegmentsForSubsystem(rules);

    segments.forEach(segment => {
      const analysis = analyzeSegment(segment);
      const requirementMap = new Map<string, string>();

      analysis.rules.forEach(ruleInsight => {
        if (ruleInsight.isSkip) return;
        const summary = summarizeRuleRequirements(ruleInsight);
        if (summary) requirementMap.set(ruleInsight.displayIndex, summary);
      });

      const terminating = [...segment.rules].reverse().find(rule => !isSkip(rule));
      if (!terminating) return;

      const termIndex = rules.indexOf(terminating);
      if (termIndex < 0) return;

      const termDisplayIndex = getRuleDisplayIndex(terminating, termIndex);
      const requirement = requirementMap.get(termDisplayIndex);
      if (!requirement) return;

      const parts = requirement.split(/\s+AND\s+/);
      const action = (terminating.action ?? "").trim() || "(no action)";
      summaryMap.set(termIndex, { parts, action });
    });

    return summaryMap;
  }, [rules]);
}
