export type EntityType = "crew" | "room" | "unknown";

export interface Rule {
  index?: number | string;
  condition?: string;
  action?: string;
  phase?: string;
}

export interface RawEntity {
  id?: string | number;
  uid?: string | number;
  name?: string;
  type?: string;
  ai?: Rule[];
  rules?: Rule[];
  [key: string]: unknown;
}

export interface Entity {
  id: string;
  /** base identifier for the logical entity across files, e.g. "crew|123" */
  baseId?: string;
  name: string;
  type: EntityType;
  flatRules: Rule[];
  source: RawEntity;
}

export interface Segment {
  rules: Rule[];
}

export interface SuppressionInfo {
  ruleIndex: number;
  displayIndex: string;
  always: boolean;
}

export interface ConditionRequirement {
  condition: string;
  expects: boolean;
  displayIndex: string;
}

export interface RuleInsight {
  rule: Rule;
  index: number;
  displayIndex: string;
  condition: string;
  action: string;
  isSkip: boolean;
  alwaysTrue: boolean;
  suppressedBy?: SuppressionInfo;
  suppressesNext?: SuppressionInfo;
  requirements?: ConditionRequirement[];
  requirementPaths?: ConditionRequirement[][];
}

export interface SegmentInsight {
  rules: RuleInsight[];
  guaranteedActions: RuleInsight[];
  reachableActions: RuleInsight[];
  unreachableActions: RuleInsight[];
}
