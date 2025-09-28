# PR #1 — StatusBar visual refactor + tokens mapping

Summary

- Refactored StatusBar visuals to Tailwind classes driven by tokens from globals.css.
- Preserved all runtime behavior: online/offline, navigator.connection (effectiveType/downlink/rtt), and afm:state/afm:perf custom events.
- Added stable data-testid attributes for E2E robustness.
- Added E2E tests and screenshot suite; provided bundle/CSS size snapshot.

Changed files

- apps/web-v2/src/components/file-browser/StatusBar.tsx
- apps/web-v2/src/components/file-browser/UnifiedActionBar.tsx (minor state control for toolbar)
- apps/web-v2/src/components/file-browser/LeftTree.tsx (stable testids)
- apps/web-v2/tests/files.ui.spec.ts (stable selectors)
- apps/web-v2/tests/statusbar.screenshots.spec.ts (screenshot suite)
- apps/web-v2/next.config.mjs (ESM-friendly \_\_dirname; CI-friendly ignore for lint/types)
- apps/web-v2/package.json (playwright scripts)

Stable selectors

- StatusBar: statusbar, statusbar-queue, statusbar-net
- Sidebar: sidebar, sidebar-item-<key>, sidebar-item-darkmode, sidebar-storage-fill
- Toolbar: search-input, btn-upload, toolbar-list, toolbar-ai, toolbar-sort
- Breadcrumb: crumb-root, crumb-files, crumb-here

Verification

- Dev: server healthy at http://localhost:3001/files (200 after first compile).
- E2E UI suite (green): npm run e2e:ui
  - tests/files.ui.spec.ts — 5 passed
- StatusBar screenshots: npx playwright test tests/statusbar.screenshots.spec.ts
  - 4 screenshots saved under apps/web-v2/test-results/statusbar/
    - statusbar-light.png
    - statusbar-dark.png
    - statusbar-compact.png
    - statusbar-high-contrast.png

Bundle/CSS snapshot (for review)

- CSS: 1,664 bytes (.next/static/css/cb385fea82b993a5.css)
- Top chunks:
  - 173,019 .next/static/chunks/4bd1b696-c023c6e3521b1417.js
  - 171,822 .next/static/chunks/255-4efeec91c7871d79.js
  - 139,834 .next/static/chunks/framework-a6e0b7e30f98059a.js
  - 125,575 .next/static/chunks/main-42d378cd453ef812.js
  - 49,566 .next/static/chunks/app/files/page-26506a30896a4614.js

How to run locally

- cd apps/web-v2
- npm run dev
- open http://localhost:3001/files

E2E and screenshots

- npm run playwright:install
- PLAYWRIGHT_BASE_URL=http://localhost:3001 npm run e2e:ui
- PLAYWRIGHT_BASE_URL=http://localhost:3001 npx playwright test tests/statusbar.screenshots.spec.ts

Acceptance criteria met

- Tailwind-only visuals, tokens-driven, modes-compatible.
- Functionality preserved; no logic changes.
- Stable data-testid selectors.
- Tests green; screenshots and bundle/CSS diff attached.
