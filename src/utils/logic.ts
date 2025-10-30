import type {
  ConditionRequirement,
  Entity,
  EntityType,
  RawEntity,
  Rule,
  Segment,
  SegmentInsight,
  RuleInsight,
  SuppressionInfo,
} from "@/types";

const SKIP_PREFIX = "skip next ";

function toEntityType(type: string | undefined, fallback: EntityType): EntityType {
  if (!type) return fallback;
  const lower = type.toLowerCase();
  if (lower.includes("crew")) return "crew";
  if (lower.includes("room")) return "room";
  return fallback;
}

export function normalizeEntities(list: RawEntity[] | null | undefined, fallbackType: EntityType): Entity[] {
  if (!Array.isArray(list)) return [];

  const seenIds = new Set<string>();

  return list.map((raw, idx) => {
    const rules = Array.isArray(raw.ai)
      ? raw.ai.slice()
      : Array.isArray(raw.rules)
        ? raw.rules.slice()
        : [];

    rules.sort((a, b) => {
      const aIdx = Number(a?.index);
      const bIdx = Number(b?.index);
      if (Number.isFinite(aIdx) && Number.isFinite(bIdx)) {
        return aIdx - bIdx;
      }
      return 0;
    });

    const baseName = (raw.name && String(raw.name).trim()) || "(unnamed)";
    const identifier =
      raw.uid ?? raw.id ?? (raw as { characterId?: string | number }).characterId ?? (raw as { roomId?: string | number }).roomId ?? idx;

    let id = `${fallbackType}|${identifier}`;
    if (seenIds.has(id)) {
      id = `${fallbackType}|${identifier}|${idx}`;
    }
    seenIds.add(id);

    const type = toEntityType(raw.type, fallbackType);

    return {
      id,
      name: baseName,
      type,
      flatRules: rules,
      source: raw,
    } satisfies Entity;
  });
}

export function isSkip(rule: Rule | undefined | null): boolean {
  if (!rule) return false;
  const action = (rule.action || "").trim().toLowerCase();
  return action.startsWith(SKIP_PREFIX);
}

function subsystemOf(rule: Rule | undefined | null): string {
  if (!rule) return "(unknown)";
  const action = (rule.action || "").toLowerCase();

  if (action.includes("special power")) return "special";
  if (
    action.startsWith("target ") ||
    action.includes("continue current job") ||
    action.includes("set no target") ||
    action.includes("skip next target action")
  ) {
    return "target";
  }
  if (
    action.startsWith("set item") ||
    action.includes("set highest") ||
    action.includes("set cheapest") ||
    action.includes("skip next ammo action") ||
    action.includes("ammo")
  ) {
    return "ammo";
  }
  if (
    action.includes("set power") ||
    action.includes("increase power") ||
    action.includes("decrease power") ||
    action.includes("set zero power") ||
    action.includes("set maximum power") ||
    action.includes("skip next power action")
  ) {
    return "power";
  }

  if (rule.phase) return rule.phase;
  return "(unknown)";
}

export function bucketBySubsystem(rules: Rule[]): Record<string, Rule[]> {
  return rules.reduce<Record<string, Rule[]>>((acc, rule) => {
    const key = subsystemOf(rule);
    if (!acc[key]) {
      acc[key] = [];
    }
    acc[key].push(rule);
    return acc;
  }, {});
}

export function buildSegmentsForSubsystem(rules: Rule[]): Segment[] {
  const segments: Segment[] = [];
  let current: Rule[] = [];

  for (const rule of rules) {
    current.push(rule);

    // Terminate the segment when we reach a non-skip action.
    if (!isSkip(rule)) {
      segments.push({ rules: current });
      current = [];
    }
  }

  // If any trailing rules remain (e.g., trailing Skips with no terminating action), add them as their own segment.
  if (current.length) {
    segments.push({ rules: current });
  }

  return segments;
}

export function getRuleDisplayIndex(rule: Rule, fallbackIndex: number): string {
  const parsed = Number(rule.index);
  if (Number.isFinite(parsed)) {
    return String(parsed + 1);
  }
  return String(fallbackIndex + 1);
}

interface PendingSkip {
  index: number;
  displayIndex: string;
  always: boolean;
}

interface RequirementRecord {
  expects: boolean;
  displayIndex: string;
}

type RequirementMap = Map<string, RequirementRecord>;

function requirementMapSignature(map: RequirementMap): string {
  return Array.from(map.entries())
    .map(([condition, record]) => `${condition}|${record.expects ? "T" : "F"}`)
    .sort()
    .join(";");
}

function addRequirementToMap(map: RequirementMap, rule: RuleInsight, expects: boolean): RequirementMap | null {
  if (rule.alwaysTrue) {
    return expects ? map : null;
  }

  const condition = rule.condition;
  const existing = map.get(condition);
  if (existing) {
    if (existing.expects !== expects) {
      return null;
    }
    return map;
  }

  const next = new Map(map);
  next.set(condition, { expects, displayIndex: rule.displayIndex });
  return next;
}

function mapToRequirements(map: RequirementMap): ConditionRequirement[] {
  return Array.from(map.entries())
    .map(([condition, record]) => ({
      condition,
      expects: record.expects,
      displayIndex: record.displayIndex,
    }))
    .sort((a, b) => {
      const aNum = Number(a.displayIndex);
      const bNum = Number(b.displayIndex);
      if (Number.isFinite(aNum) && Number.isFinite(bNum)) {
        return aNum - bNum;
      }
      return a.displayIndex.localeCompare(b.displayIndex);
    });
}

function enumerateRequirementPaths(insights: RuleInsight[], targetIndex: number): ConditionRequirement[][] {
  const results: ConditionRequirement[][] = [];
  const visited = new Set<string>();

  const dfs = (index: number, skipNext: boolean, assignments: RequirementMap) => {
    if (index > targetIndex) {
      return;
    }

    const signature = `${index}|${skipNext}|${requirementMapSignature(assignments)}`;
    if (visited.has(signature)) {
      return;
    }
    visited.add(signature);

    const rule = insights[index];

    if (skipNext) {
      if (index === targetIndex) {
        return; // target suppressed, cannot fire
      }
      dfs(index + 1, false, assignments);
      return;
    }

    if (rule.isSkip) {
      const trueMap = addRequirementToMap(assignments, rule, true);
      if (trueMap) {
        dfs(index + 1, true, trueMap);
      }

      if (!rule.alwaysTrue) {
        const falseMap = addRequirementToMap(assignments, rule, false);
        if (falseMap) {
          dfs(index + 1, false, falseMap);
        }
      }
      return;
    }

    const trueMap = addRequirementToMap(assignments, rule, true);
    if (trueMap) {
      if (index === targetIndex) {
        results.push(mapToRequirements(trueMap));
      }
      // If action fires before target, evaluation stops
      if (index !== targetIndex) {
        return;
      }
    }

    if (!rule.alwaysTrue) {
      const falseMap = addRequirementToMap(assignments, rule, false);
      if (falseMap) {
        dfs(index + 1, false, falseMap);
      }
    }
  };

  dfs(0, false, new Map());
  return results;
}

interface InsightMeta {
  insight: RuleInsight;
  position: number;
}

function selectPreferredPaths(
  paths: ConditionRequirement[][],
  insightLookup: Map<string, InsightMeta>
): ConditionRequirement[][] {
  if (paths.length <= 1) return paths;

  const scored = paths.map(path => {
    let skipTrueCount = 0;
    let skipFalseCount = 0;

    path.forEach(req => {
      const linked = insightLookup.get(req.displayIndex);
      if (linked?.insight.isSkip) {
        if (req.expects) {
          skipTrueCount += 1;
        } else {
          skipFalseCount += 1;
        }
      }
    });

    return {
      path,
      skipTrueCount,
      skipFalseCount,
      length: path.length,
    };
  });

  scored.sort((a, b) => {
    if (a.skipTrueCount !== b.skipTrueCount) {
      return a.skipTrueCount - b.skipTrueCount;
    }
    if (b.skipFalseCount !== a.skipFalseCount) {
      return b.skipFalseCount - a.skipFalseCount;
    }
    if (a.length !== b.length) {
      return a.length - b.length;
    }
    return 0;
  });

  const best = scored[0];
  const bestSkipTrue = best.skipTrueCount;
  const bestSkipFalse = best.skipFalseCount;
  const bestLength = best.length;

  const preferred = scored.filter(item => {
    return (
      item.skipTrueCount === bestSkipTrue &&
      item.skipFalseCount === bestSkipFalse &&
      item.length === bestLength
    );
  });

  return preferred.map(entry => entry.path);
}

export function analyzeSegment(segment: Segment): SegmentInsight {
  if (!segment.rules.length) {
    return {
      rules: [],
      guaranteedActions: [],
      reachableActions: [],
      unreachableActions: [],
    };
  }

  const insights: RuleInsight[] = [];
  let pendingSkip: PendingSkip | null = null;

  segment.rules.forEach((rule, idx) => {
    const condition = (rule.condition ?? "None").trim() || "None";
    const action = (rule.action ?? "").trim();
    const parsedIndex = Number(rule.index);
    const zeroBased = Number.isFinite(parsedIndex) ? Number(parsedIndex) : idx;
    const displayIndex = getRuleDisplayIndex(rule, idx);
    const isSkipRule = isSkip(rule);
    const alwaysTrue = condition.toLowerCase() === "none";

    let suppressedBy: SuppressionInfo | undefined;
    if (pendingSkip) {
      suppressedBy = {
        ruleIndex: pendingSkip.index,
        displayIndex: pendingSkip.displayIndex,
        always: pendingSkip.always,
      } satisfies SuppressionInfo;
      pendingSkip = null;
    }

    const insight: RuleInsight = {
      rule,
      index: zeroBased,
      displayIndex,
      condition,
      action,
      isSkip: isSkipRule,
      alwaysTrue,
      suppressedBy,
    };

    insights.push(insight);

    if (suppressedBy?.always) {
      return;
    }

    if (!suppressedBy && isSkipRule) {
      const nextRule = segment.rules[idx + 1];
      pendingSkip = {
        index: zeroBased,
        displayIndex,
        always: alwaysTrue,
      } satisfies PendingSkip;

      if (nextRule) {
        insight.suppressesNext = {
          ruleIndex: Number.isFinite(Number(nextRule.index)) ? Number(nextRule.index) : idx + 1,
          displayIndex: getRuleDisplayIndex(nextRule, idx + 1),
          always: alwaysTrue,
        } satisfies SuppressionInfo;
      }
    }
  });

  const insightLookup = new Map<string, InsightMeta>();
  insights.forEach((insight, position) => {
    insightLookup.set(insight.displayIndex, { insight, position });
  });

  insights.forEach((insight, index) => {
    if (insight.isSkip) return;
    const rawPaths = enumerateRequirementPaths(insights, index);
    if (!rawPaths.length) return;

    const lastActionPosition = (() => {
      for (let i = index - 1; i >= 0; i -= 1) {
        if (!insights[i].isSkip) {
          return i;
        }
      }
      return -1;
    })();

    const trimmedPaths = rawPaths.map(path =>
      path.filter(req => {
        const linked = insightLookup.get(req.displayIndex);
        if (!linked) return true;
        if (linked.position >= index) return true;
        return linked.position > lastActionPosition;
      })
    );

    const dedupedPaths: ConditionRequirement[][] = [];
    const seenSignatures = new Set<string>();

    trimmedPaths.forEach(path => {
      if (!path.length) return;
      const map = new Map<string, RequirementRecord>();
      path.forEach(req => {
        map.set(req.condition, { expects: req.expects, displayIndex: req.displayIndex });
      });
      const signature = requirementMapSignature(map);
      if (seenSignatures.has(signature)) return;
      seenSignatures.add(signature);
      dedupedPaths.push(path);
    });

    const requirementPaths = dedupedPaths;
    if (!requirementPaths.length) return;

    const preferredPaths = selectPreferredPaths(requirementPaths, insightLookup);
    if (preferredPaths.length) {
      insight.requirements = preferredPaths[0];
    }

    if (preferredPaths.length > 1) {
      insight.requirementPaths = preferredPaths.slice(1);
    } else if (requirementPaths.length > 1) {
      insight.requirementPaths = requirementPaths.slice(1);
    }
  });

  const guaranteedActions: RuleInsight[] = [];
  const unreachableActions: RuleInsight[] = [];
  const reachableActions: RuleInsight[] = [];

  insights.forEach(insight => {
    if (insight.isSkip) return;
    if (insight.suppressedBy?.always) {
      unreachableActions.push(insight);
      return;
    }
    if (!insight.suppressedBy && insight.alwaysTrue) {
      guaranteedActions.push(insight);
      return;
    }
    reachableActions.push(insight);
  });

  return {
    rules: insights,
    guaranteedActions,
    reachableActions,
    unreachableActions,
  } satisfies SegmentInsight;
}
