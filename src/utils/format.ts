import type { ConditionRequirement, RuleInsight } from "@/types";

export function formatRequirementExpression(requirements: ConditionRequirement[] | undefined): string | null {
  if (!requirements || !requirements.length) return null;
  const parts = requirements
    .map(req => {
      const trimmed = req.condition.trim();
      if (!trimmed || trimmed.toLowerCase() === "none") return null;
      return req.expects ? trimmed : transformNegation(trimmed);
    })
    .filter((item): item is string => Boolean(item));

  if (!parts.length) return null;
  return parts.join(" AND ");
}

/**
 * Transform a negated condition (text that would be shown as `!X`) into a
 * readable negation where possible.
 */
export function transformNegation(text: string): string {
  const t = (text || "").trim();
  if (!t) return t;

  // Numeric/comparison form: LHS <op> RHS
  const compMatch = t.match(/^(.+?)\s*(<=|>=|<|>|==|!=)\s*(.+)$/);
  if (compMatch) {
    const lhs = compMatch[1].trim();
    const op = compMatch[2];
    const rhs = compMatch[3].trim();
    const negMap: Record<string, string> = {">": "<=", "<": ">=", ">=": "<", "<=" : ">", "==": "!=", "=": "!=", "!=": "=="};
    const neg = negMap[op] ?? "NOT";
    if (neg === "NOT") return `NOT ${t}`;
    return `${lhs} ${neg} ${rhs}`;
  }

  if (/\bHas No\b/i.test(t)) return t.replace(/\bHas No\b/i, "Has");
  if (/\bHas\b/i.test(t)) return t.replace(/\bHas\b/i, match => `${match} No`);

  if (/\bIs Not\b/i.test(t)) return t.replace(/\bIs Not\b/i, "Is");
  if (/\bIs\b/i.test(t)) return t.replace(/\bIs\b/i, match => `${match} Not`);

  if (/\bNot Available\b/i.test(t)) return t.replace(/\bNot Available\b/i, "Available");
  if (/\bAvailable\b/i.test(t)) return t.replace(/\bAvailable\b/i, "Not Available");

  if (/\bNo Enemy Crew\b/i.test(t)) return t.replace(/\bNo Enemy Crew\b/i, "Enemy Crew");
  if (/\bEnemy Crew\b/i.test(t)) return t.replace(/\bEnemy Crew\b/i, "No Enemy Crew");

  return `Not ${t}`;
}

export function summarizeRuleRequirements(rule: RuleInsight): string | null {
  const primary = formatRequirementExpression(rule.requirements);
  if (primary) return primary;

  if (rule.requirementPaths?.length) {
    const pathSummaries = rule.requirementPaths
      .map(path => formatRequirementExpression(path))
      .filter((entry): entry is string => Boolean(entry));

    if (!pathSummaries.length) return null;
    if (pathSummaries.length === 1) return pathSummaries[0];

    return pathSummaries.map((entry, idx) => `Path ${idx + 1}: ${entry}`).join(" | ");
  }

  return null;
}
