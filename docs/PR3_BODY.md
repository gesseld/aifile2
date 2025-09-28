# PR #3 — File List Rows/Cards Visual Refresh + Selection States

Summary
- Restyle file list items as tokenized card-rows using Tailwind utilities mapped to CSS variables.
- Preserve all runtime behavior (virtualization/perf, selection model, events).
- Add stable data-testid selectors for non-flaky E2E.
- Implement hover, selected, and checked states with clear focus-visible rings and high-contrast support.
- Verify density, high-contrast, text-zoom, reduced-motion modes.

Scope of changes
- File item component(s)
  - Card visuals: rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-soft px-4 py-3 gap-3 grid/stack layout as needed.
  - States:
    - Hover: hover:bg-[var(--accent)]/40
    - Selected: ring-2 ring-primary-400/60 dark variants respected by tokens
    - Checked: right-side checkbox with clear focus ring and keyboard toggles
  - Tags line: text-xs text-[var(--muted-foreground)] with chip styling bg-[var(--accent)]/60 rounded-full px-2 py-0.5
  - Stable selectors:
    - data-testid="file-row-<id>"
    - data-testid="file-checkbox-<id>"
  - Files to update:
    - Source list/grid item component in shell; reference example for prior version: [FileItem](apps/web-v2/archive/phase-6-complete-frontend-backup/src/components/file-browser/FileItem.tsx:1) for structure cues if needed
    - Current list renderer and item mapping inside the shell: [FileBrowserShell()](apps/web-v2/src/components/file-browser/FileBrowserShell.tsx:1)

- Token mapping and Tailwind guidance
  - Backgrounds/borders: bg-[var(--surface)], border-[var(--border)]
  - Text: text-[var(--foreground)] and text-[var(--muted-foreground)]
  - Shadows/rounding: prefer Tailwind config defaults; “soft” shadow class mapped in config
  - Group/peer selectors for hover/selected states when rendered by virtualization

- Behavior preservation
  - Selection via click, keyboard, and checkbox must not regress
  - Virtualization: do not change the underlying list virtualization mechanics
  - Keep item heights stable to avoid CLS; use consistent padding and border in all states

Accessibility
- Keyboard navigation:
  - Rows focusable with ArrowUp/ArrowDown; Enter/Space selection aligned to current behavior
  - Checkbox is tabbable; space toggles checked; ensure aria-checked reflects state
- Roles/labels:
  - Row role="option" or button semantics consistent with existing list semantics
  - Checkbox has accessible label and data-testid
- Focus-visible rings:
  - Use ring-offset and token colors to ensure adequate contrast
- High-contrast and text-zoom:
  - Respect [globals.css](apps/web-v2/src/app/globals.css:1) attributes: [data-high-contrast="1"], [data-text-zoom="lg"]

Tests
- Unit: add tests to ensure selectors exist and states toggle
  - Verify aria-checked and selected classes toggle on user events
  - Ensure focus-visible outlines present on keyboard tab focus
- E2E: migrate selectors to data-testid for file rows and checkboxes
  - data-testid="file-row-<id>", "file-checkbox-<id>"
  - Selection flows: single, multi (if supported), and checkbox toggles

Performance
- Verify no degradation of virtualization performance (measure render times or count updates)
- CSS consolidation via utilities should reduce component-specific CSS vs legacy styles
- LCP/CLS: ensure steady layout across hover/selected/checked states

Artifacts to include
- Screenshots (store under docs/assets/pr3/ and attach in PR):
  - Default list, hover, selected, checked states (light/dark)
  - Compact density, high-contrast, text-zoom, reduced-motion snapshots
- Bundle/CSS diff summary from next build
- Note about unchanged virtualization behavior

Acceptance criteria
- Rows visually match reference design: spacing, rounding, shadows, tokens
- Hover, selected, checked states clearly visible in light/dark and high-contrast
- Keyboard navigation and selection mirror existing behavior, improved focus cues
- Stable data-testid selectors available for E2E
- No hydration warnings; unit tests green; Next build clean

Implementation plan
1) Introduce tokenized Tailwind classes on the file row/card component and integrate right-side checkbox with data-testid="file-checkbox-<id>".
2) Apply hover/selected/checked states using Tailwind and tokens.
3) Keep item sizing stable to prevent CLS; verify with manual hover/selection.
4) Add unit tests for selectors and state toggles.
5) Update E2E tests to target new data-testid selectors.
6) Capture screenshots for states and modes; attach to PR.
7) Build and record CSS/JS size delta; verify no perf regressions.

PR metadata
- Base: feat/ui-refresh-file-manager
- Head: pr/ui-refresh-file-list
- Title: PR #3: File list rows/cards visual refresh + selection states
- Description: use this document