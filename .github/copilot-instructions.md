# Copilot Instructions for pssai

Purpose: concise, actionable guidance so an AI coding assistant can stay productive with this React + Vite app for exploring Pixel Starships AI scripts.

Keep this short — open the referenced files when in doubt.

- Project overview

  - Tech: React + Vite + TypeScript; styling with Tailwind (preferred) backed by `src/styles.css` for globals.
  - Goal: load crew and room AI JSON and display the rule order (linear list of rules).
  - Entry: `src/main.tsx` → `src/App.tsx`; UI logic lives under `src/components/`, rule helpers in `src/utils/`.

- Core domain ideas

  - Execution model (most important): rules evaluate strictly top→bottom within a subsystem. For each rule:
    - evaluate its condition;
    - if the rule is a Skip and the condition is true, the Skip suppresses the next valid rule (the next valid rule may be another Skip or a non-Skip action) and evaluation continues after that suppressed rule;
    - if the rule is a non-Skip action and its condition is true, that action fires and evaluation for the subsystem stops;
    - if the rule's condition is false, move to the next rule.
  - “None” is an always-true condition but can still be suppressed by a preceding Skip (so a Skip with condition "None" is an always-on skip).
  - Segmenting: treat every non-Skip action as the terminator for a segment — the segment is the sequence of rules from after the previous non-Skip action up to and including this action. That makes each action's IF-set local to its segment.
  - The app focuses on the view presenting rules in evaluation order. Advanced path enumeration and enhanced summaries were removed to keep the UI simple.

- Key files

  - `src/App.tsx` — orchestrates data loading and shared state.
  - `src/components/ListView.tsx`, `DetailView.tsx`, `Workspace.tsx` — sidebar, detail rendering, and workspace layout.
  - `src/utils/logic.ts` — normalization, subsystem bucketing, skip-aware segmentation, and rule evaluation helpers.
  - `src/utils/fixtures.ts` — loads bundled JSON fixtures.

- How it should work

  - Load `data/crew_ai*.json` / `data/room_ai*.json` via upload or dropdown.
  - The UI presents the view (linear list of rules). Workspace columns stay in sync; the app no longer supports multiple view modes.

# AI parsing & execution model (pssai)

This single-section doc explains how the app parses and reasons about Pixel Starships AI rule dumps. Keep this as the authoritative reference when changing `src/utils/logic.ts` or the enhanced view UI.

Summary (core contract)

- Rules are evaluated top→bottom within each subsystem.
- Each rule has: an index (show +1 to humans), a condition, and an action (which may be a Skip).
- Execution flow for a rule:
  1. Evaluate the condition.
  2. If the rule is a Skip and the condition is true, the Skip suppresses the _next valid rule_ (the next valid rule can be another Skip of the same type or a non-Skip action). After suppression, evaluation continues after that suppressed rule.
  3. If the rule is a non-Skip action and the condition is true, that action fires and evaluation for the subsystem stops.
  4. If the condition is false, continue to the next rule.

Definitions & normalization

- Normalization: incoming JSON is flattened into a list of rules with stable indices, phases, and a canonical shape. Display indices to users as `index + 1`.
- Subsystem bucketing: rules are grouped by inferred subsystem so analysis only runs inside each bucket.
- Segment: defined as the rules that belong to one terminating non-Skip action — i.e., each non-Skip action terminates its segment. The segment contains the rules after the previous non-Skip action up to and including this action. This keeps each action's IF-set local to its segment.

Skip semantics (important)

- "Next valid rule" means the next rule in evaluation order that is an actual candidate (not a placeholder). Implementations should scan forward to find that target rather than assuming array-adjacent indexing.
- Consecutive Skips chain: if Skip A fires and suppresses Skip B, then B does not run and therefore cannot suppress its own target. If B is not suppressed and fires, it suppresses its resolved next valid rule.
- "None" is an always-true condition but is still suppressible by an earlier Skip.

How the app presents firing conditions

- The UI shows each rule's condition and action in order. For non-skip rules we display a small IF/DO summary when a simple requirement expression can be computed.
- `src/utils/logic.ts` still produces `RuleInsight` and `SegmentInsight` shapes; the UI uses a subset of that data for the view and requirement summaries.

Edge cases to handle / tests to add

- Trailing Skip: a Skip at the end of a subsystem that resolves to no valid target should be handled gracefully (report suppressed=none).
- Placeholders or empty slots: skip-target resolution must skip placeholders and scan to the next real candidate.
- Deep chains of consecutive Skips: ensure DFS/enumeration logic does not explode — dedupe paths and cap depth sensibly in tests.
- Multiple distinct paths that reach the same action must not be collapsed into a single incorrect conjunction; display both alternatives or factor common parts.

Key files

- `src/utils/logic.ts` — normalization, subsystem bucketing, building segments, enumerating requirementPaths, and producing `RuleInsight`/`SegmentInsight`.
  - `src/types.ts` — canonical types (RuleInsight, SegmentInsight, ConditionRequirement).

Testing & verification

- Add unit tests for these scenarios: consecutive Skips, Skip suppressing a None, trailing Skip, and multiple paths to the same action. Use a small set of fixture JSONs from `data/` to validate.

Implementation notes / small rules

- Always display rule indices as `index + 1` to match human-facing references.
- Avoid reordering rules — preserve original dump order in analysis and UI.
- When computing requirementExpressions, prefer readable, factored expressions (factor common AND parts) instead of long monolithic AND lists.

---

Assistant reply style (project preference):

- Default replies: short (3–5 bullet points).
- Provide full/detailed responses only when explicitly requested (say "full" or "expand").
- Keep edits, file lists, and commands concise unless the developer asks for more.
- Important: do NOT attempt to execute or run project code, tests, or shell commands in the workspace. Only suggest commands, edits, or steps to run; never run them yourself or install packages.

Add this note so future AI contributors follow the repository owner's communication preference.
