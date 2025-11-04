# Copilot Instructions for pssai

Purpose: concise, actionable guidance so an AI coding assistant can stay productive with this React + Vite app for exploring and building Pixel Starships AI scripts.

Keep this short — open the referenced files when in doubt.

- Project overview

  - Tech: React + Vite + TypeScript; styling with Tailwind (preferred) backed by `src/styles.css` for globals.
  - Goal: load crew and room AI JSON, display rules in evaluation order, and provide a builder for creating/editing AI scripts.
  - Entry: `src/main.tsx` → `src/App.tsx`; UI logic lives under `src/components/`, rule helpers in `src/utils/`, custom hooks in `src/hooks/`.

- Core domain ideas

  - Execution model (most important): rules evaluate strictly top→bottom within a subsystem. For each rule:
    - evaluate its condition;
    - if the rule is a Skip and the condition is true, the Skip suppresses the next valid rule (the next valid rule may be another Skip or a non-Skip action) and evaluation continues after that suppressed rule;
    - if the rule is a non-Skip action and its condition is true, that action fires and evaluation for the subsystem stops;
    - if the rule's condition is false, move to the next rule.
  - “None” is an always-true condition but can still be suppressed by a preceding Skip (so a Skip with condition "None" is an always-on skip).
  - Segmenting: treat every non-Skip action as the terminator for a segment — the segment is the sequence of rules from after the previous non-Skip action up to and including this action. That makes each action's IF-set local to its segment.
  - The app shows rules in linear evaluation order and provides optional IF/DO summaries (togglable via brain icon, default off, persisted to localStorage).

- Key files

  - `src/App.tsx` — orchestrates data loading, shared state, workspace management, drafts lifecycle, and localStorage persistence. Manages a single "Drafts" source; only persists drafts with `saved: true` flag.
  - `src/components/ListView.tsx` — sidebar with file inputs, entity browser, filter, version buttons, and draft management (delete button for saved drafts).
  - `src/components/DetailView.tsx` — entity editor with header (avatar, name, special badge, actions), settings panel (sprite picker, name input), rule composer (keyboard-friendly), rules list (drag-reorder, inline edit), and optional summaries.
  - `src/components/SearchSelect.tsx` — keyboard-friendly searchable dropdown with autoFocus, Enter-to-select, Tab-to-advance behavior.
  - `src/components/Workspace.tsx` — horizontal scrollable workspace holding entity columns.
  - `src/utils/logic.ts` — normalization, subsystem bucketing, skip-aware segmentation, and rule evaluation helpers.
  - `src/utils/sprites.ts` — loads characters.json and rooms.json for sprite picker.
  - `src/utils/export.ts` — prepares entity JSON for download (strips internal metadata, enriches with design IDs/specials).
  - `src/hooks/useEntitySprites.ts` — loads sprite options with meta (type, specialKey).
  - `src/hooks/useSegmentSummaries.ts` — computes IF/DO summaries for each rule.
  - `src/hooks/useSticky.ts` — sticky header behavior for entity columns.
  - `src/hooks/useDragReorder.ts` — drag-and-drop reordering for rules.

- How it works

  - **Load data**: upload JSON or select from dropdown; entities appear in sidebar grouped by source file.
  - **Browse/open**: click entity or version button to open in workspace column; multiple columns can be open side-by-side.
  - **Edit**: inline edit rules (condition/action dropdowns), drag to reorder, delete with ✕ button.
  - **Builder (drafts)**: click "Create AI" to start a new draft; auto-opens entity settings; select crew/room sprite (auto-fills name and special power); add rules via composer; save to persist draft to localStorage; delete draft via ListView.
  - **Keyboard navigation**: Create AI auto-focuses sprite picker; Add Rule auto-focuses condition field; Enter selects, Tab advances to next field; after adding rule, focus returns to "Add Rule" link for rapid entry.
  - **Export**: download individual entity JSON via header menu.
  - **Summaries**: toggle brain icon in ListView to show/hide IF/DO summaries; preference persisted to localStorage (default off).

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

- The UI shows each rule's condition and action in order. For non-skip rules we display optional IF/DO summaries when enabled (toggled via brain icon).
- `src/utils/logic.ts` produces `RuleInsight` and `SegmentInsight` shapes; `useSegmentSummaries` hook computes summaries; DetailView conditionally renders them based on `showSummaries` prop.

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

## Key workflows & UX patterns

### Drafts lifecycle

- **Create**: New draft added with `__builderMeta: { isDraft: true, saved: false, fileId: randomId() }`.
- **Save**: Sets `saved: true`, persists to localStorage (key: `pssai-drafts`).
- **Delete**: Removes from sources and localStorage.
- **Close**: Unsaved drafts discarded; saved drafts remain.
- **Persist**: Only drafts with `isDraft: true && saved: true` are persisted.
- **Sources**: Single "Drafts" source; unsaved drafts hidden from ListView.

### Keyboard navigation

#### Entity settings (Create AI)
- Auto-focus sprite picker when panel opens (uses `key` prop to force remount).
- Flow: Type → Enter selects → Tab to name field → type name → Tab out.

#### Rule composer (Add Rule)
- Auto-focus condition field when composer opens (uses `key` prop to force remount).
- Flow: Type → Enter selects → Tab to action → type → Enter selects → Tab to "Add rule" button → Enter adds rule.
- **Rapid entry**: After adding rule, focus returns to "Add Rule" link → hit Enter to add another.

#### SearchSelect behavior
- **Enter**: Selects highlighted option without blur (allows Tab to advance naturally).
- **Tab**: Selects highlighted option and programmatically focuses next tabbable element.
- **Click**: Selects and blurs.
- **autoFocus prop**: Focuses input on mount with 50ms delay; remount via `key` prop when parent panels open.

### Header & layout

- **Sticky headers**: Entity column headers stick on scroll using `useSticky` hook; spacer div added when `isFixed` to prevent layout jump.
- **Header structure**: Single flex container (`.entityColumnHeader`) with two children: `.entityHeaderMain` (avatar, name, badges) and `.entityHeaderActions` (buttons).
- **Min-height**: Enforced to prevent shifts when sprite loads or changes.
- **Placeholder avatar**: Question mark SVG shown when no sprite selected.

### Special powers

- When selecting sprite in draft mode, special power is resolved from sprite's `meta.specialKey` (from `characters.json` `special_ability_type`).
- Humanized via `SPECIAL_NAMES` map in `src/utils/specials.ts`; icon loaded via `getAssetForName` from `src/utils/assets.ts`.
- Badge displays next to entity name in header.

### Export enrichment

- Strips `__builderMeta` and `__sourceFile` internal metadata.
- Enriches with design IDs and special keys for import compatibility.

## Common patterns

### Adding auto-focus to a form field

1. Add `autoFocus` prop to SearchSelect.
2. Add `key` prop that changes when panel opens (e.g., `key={`field-${entity.id}-${showPanel}`}`).
3. SearchSelect will remount and trigger focus effect.

### Adding a new draft-only field

1. Add state in DetailView: `const [myField, setMyField] = useState("");`.
2. Add to init effect (reset when `entity.id` changes).
3. Add to `isDirty` check if field should trigger save.
4. Add to `handleSave` payload.
5. Add input/SearchSelect in entity settings panel.
6. Update export logic in `src/utils/export.ts` if needed.

### Modifying keyboard shortcuts

1. Add handler in `handleKeyDown` within SearchSelect or component.
2. Use `event.preventDefault()` if overriding default.
3. Test Enter, Tab, Escape behavior thoroughly.
4. Ensure focus management (blur/focus) is correct for natural tab flow.

---

Assistant reply style (project preference):

- Default replies: short (3–5 bullet points).
- Provide full/detailed responses only when explicitly requested (say "full" or "expand").
- Keep edits, file lists, and commands concise unless the developer asks for more.
- Important: do NOT attempt to execute or run project code, tests, or shell commands in the workspace. Only suggest commands, edits, or steps to run; never run them yourself or install packages.

Add this note so future AI contributors follow the repository owner's communication preference.
