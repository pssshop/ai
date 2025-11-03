import type { Rule } from "@/types";
import { randomId } from "@/utils/random";

export type BuilderRule = {
  id: string;
  condition: string;
  action: string;
  phase?: string;
};

export function toBuilderRules(rules: Rule[] = []): BuilderRule[] {
  return rules.map(rule => ({
    id: randomId("rule"),
    condition: (rule.condition ?? "").trim(),
    action: (rule.action ?? "").trim(),
    phase: rule.phase,
  }));
}

export function rulesFromBuilder(rules: BuilderRule[]): Rule[] {
  return rules.map((rule, idx) => ({
    index: idx,
    condition: rule.condition,
    action: rule.action,
    phase: rule.phase,
  } satisfies Rule));
}

export function rulesSignature(rules: Rule[]): string {
  return rules
    .map(rule => `${(rule.condition ?? "").trim()}→${(rule.action ?? "").trim()}`)
    .join("|");
}
