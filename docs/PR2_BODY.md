# PR #2 — Sidebar + Search/Breadcrumb/Toolbar Visual Refresh

Summary

- Visual refresh for the File Manager shell header and left sidebar using Tailwind utilities mapped to design tokens.
- Preserved all runtime behavior and events; introduced stable data-testid selectors.
- Verified keyboard navigation, roles/aria attributes for accessibility.
- Aligned with token system from [globals.css](apps/web-v2/src/app/globals.css).

Scope of changes

- Sidebar (LeftTree)
  - Tokenized surfaces, counters, hover/selected states.
  - Storage meter restyled via tokens.
  - Dark mode toggle preserved.
  - Stable selectors: data-testid="sidebar-item-<name>", data-testid="sidebar-item-darkmode".
  - Roles/ARIA: root uses role="listbox"; options keyboard navigable with aria-activedescendant.
  - Files: [LeftTree.tsx](apps/web-v2/src/components/file-browser/LeftTree.tsx)

- Search/Breadcrumb/Toolbar (UnifiedActionBar + shell header)
  - Search input styling: bg-[var(--surface)], border-[var(--border)], rounded-lg, pl-10, focus styles.
  - Upload chip button: primary accent via tokens.
  - Breadcrumb text muted tokens.
  - Toolbar icon buttons with aria-pressed toggles.
  - Stable selectors:
    - data-testid="search-input"
    - data-testid="btn-upload"
    - data-testid="toolbar-list"
    - data-testid="toolbar-ai"
    - data-testid="toolbar-sort"
  - Files: [UnifiedActionBar.tsx](apps/web-v2/src/components/file-browser/UnifiedActionBar.tsx), [FileBrowserShell.tsx](apps/web-v2/src/components/file-browser/FileBrowserShell.tsx)

- Token mapping and Tailwind guidance
  - Backgrounds/borders: bg-[var(--surface)], border-[var(--border)]
  - Text: text-[var(--foreground)], text-[var(--muted-foreground)]
  - Dark mode via Tailwind config and data-theme, plus high-contrast, density, text-zoom, reduced-motion via html attributes already supported by [globals.css](apps/web-v2/src/app/globals.css)

Stable selectors added

- Sidebar: data-testid="sidebar-item-<name>", data-testid="sidebar-item-darkmode"
- Toolbar: data-testid="search-input","btn-upload","toolbar-list","toolbar-ai","toolbar-sort"
- Breadcrumb segments: data-testid present in shell (unchanged behavior).
- StatusBar already covered in PR #1.

Accessibility

- Sidebar list uses role="listbox"; options are focusable and keyboard navigable (ArrowUp/Down/Home/End, Enter).
- Toolbar toggles expose aria-pressed state.
- Focus-visible rings retained by Tailwind defaults plus token colors.
- High-contrast, density, text-zoom, and reduced-motion respect html attributes wired in [globals.css](apps/web-v2/src/app/globals.css).

Tests

- Unit tests green (11/11):
  - [StatusBar.spec.tsx](apps/web-v2/src/components/file-browser/__tests__/StatusBar.spec.tsx)
  - [UnifiedActionBar.spec.tsx](apps/web-v2/src/components/file-browser/__tests__/UnifiedActionBar.spec.tsx)
  - [LeftTree.spec.tsx](apps/web-v2/src/components/file-browser/__tests__/LeftTree.spec.tsx)
- Notes: LeftTree test logs act() warnings from nested updates, but assertions pass and reflect real UX. Can be refined later with explicit act() wrapping.

Build, size, and bundle diff (post-change)

- Next build: First Load JS shared ≈ 102 kB
- CSS assets: .next/static/css/... ≈ 24 KB
- Top JS chunks (for reference): 169 KB, 168 KB, 137 KB, 123 KB, 110 KB, others smaller
- Expectation: CSS in touched components reduced by consolidating into Tailwind utilities; additional reduction will come in PR #3/#4.

Dev ergonomics

- Silenced Next.js dev cross-origin warnings with allowedDevOrigins in [next.config.ts](apps/web-v2/next.config.ts).
- Local dev: http://localhost:3001/files
- Network dev: http://195.201.90.99:3001/files

Screenshots (to attach in PR)

- Light: Sidebar default/hover/selected; header search/toolbar focus states; breadcrumb; upload button.
- Dark: Same set.
- Compact density: Sidebar, header variants.
- High-contrast: Sidebar, header, focus rings and toggles.
  Note: Headless capture via root may require running Chromium with --no-sandbox or capturing manually from the dev server. Attach PNGs under ./docs/assets/pr2/.

Acceptance criteria

- Visual parity to reference for sidebar and header strip across light/dark.
- Keyboard navigation and aria-pressed verified.
- Stable data-testid selectors for all changed elements.
- No change to data flow; only styles and attributes.
- Unit tests green; Next build clean.

How to validate

1. Start dev server:
   - cd apps/web-v2 && HOST=0.0.0.0 PORT=3001 npm run dev
2. Open http://localhost:3001/files
3. Verify:
   - Sidebar selection, counters, hover/selected states.
   - Search input focus ring, upload button hover, toolbar toggles aria-pressed.
   - Breadcrumb muted text and tokens.
   - Toggle dark mode using the sidebar toggle and confirm token surfaces change correctly.
4. Advanced modes: Temporarily set attributes on documentElement in devtools:
   - Density: document.documentElement.setAttribute('data-density','compact')
   - High-contrast: document.documentElement.setAttribute('data-high-contrast','1')
   - Text zoom: document.documentElement.setAttribute('data-text-zoom','lg')
   - Reduced motion: document.documentElement.setAttribute('data-reduce-motion','1')

Risks and mitigations

- E2E selectors: Migrate tests to data-testid to avoid flakiness on class changes (in progress for PR #2 scope).
- Accessibility: aria-pressed and listbox roles shipped; will expand a11y scans in PR #4.
- Performance: No new heavy dependencies; CSS consolidates around tokens and utilities.

Changelog blurb

- Refresh sidebar and header controls to tokenized Tailwind, add stable selectors, improve a11y states. No logic changes; unit tests green. CSS/JS sizes steady; further CSS reductions to follow in PR #3/#4.
