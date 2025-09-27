# PR #1 — StatusBar refactor to Tailwind tokens; logic/events preserved

Changeset overview

- Component: [StatusBar()](../apps/web-v2/src/components/file-browser/StatusBar.tsx:24)
- Visuals moved to Tailwind token utilities (no local style jsx)
- Logic/events preserved:
  - Online/offline indicators (window online/offline)
  - NetworkInformation API best-effort stats (rtt/downlink/effectiveType)
  - Upload queue depth via afm:state
  - Perf metrics via afm:perf (page cache size/limit, hits/misses, prefetches, aborts, retries)
- Stable selectors (for E2E):
  - data-testid="statusbar"
  - data-testid="statusbar-queue"
  - data-testid="statusbar-net"
- Next.js 15 alignment prerequisites:
  - [next.config.ts](../apps/web-v2/next.config.ts:1) outputFileTracingRoot to fix monorepo root inference
  - [package.json](../apps/web-v2/package.json:1) Next 15 upgrade + hardened scripts (NEXT_TELEMETRY_DISABLED=1)

Acceptance criteria mapping

- Tailwind-only visuals referencing tokens in [globals.css](../apps/web-v2/src/app/globals.css:1):
  - Surfaces/borders/text/ring/accent mapped with arbitrary values:
    - bg-[var(--surface)] border-[var(--border)] text-[var(--foreground)] text-[var(--muted-foreground)] ring-[var(--ring)]
  - Shadow: shadow-soft (mapped to token)
- Layout unchanged: sticky bottom, 3 columns (left totals/selection/queue, center op status, right perf/net/settings)
- data-testid added: statusbar, statusbar-queue, statusbar-net
- A11y preserved: role="status", aria-live="polite", focus-visible compatible with tokens
- Advanced modes verified:
  - dark mode [data-theme="dark"]
  - density [data-density="compact"]
  - high-contrast [data-high-contrast="1"]
  - text-zoom [data-text-zoom="lg"]
  - reduced-motion [data-reduce-motion="1"]

Screenshots to attach (placeholders)

- Light: ./assets/pr1/statusbar-light.png
- Dark: ./assets/pr1/statusbar-dark.png
- Compact density: ./assets/pr1/statusbar-compact.png
- High-contrast: ./assets/pr1/statusbar-high-contrast.png

Bundle/CSS diff summary (StatusBar scope)

- Removed inline styles; replaced with Tailwind utility classes
- Expected improvement: smaller component-scoped CSS and consistent token usage across themes
- To reproduce size snapshot:
  1. Production build: `cd apps/web-v2 && npm run build`
  2. Record total First Load JS (Next build output) and verify no growth from this component refactor
  3. Confirm no hydration warnings introduced

How to verify locally

1. Run production server (Next 15)
   - `cd apps/web-v2 && npm run build && npm run start`
   - Confirm routes:
     - `/` renders landing
     - `/files` stubbed
2. Inspect StatusBar behaviors:
   - Selection counts/sizes update when interacting with FileBrowserShell (when wired)
   - Upload queue count: increments when uploads queue (afm:state)
   - Perf metric events: afm:perf emits page cache stats and retries/aborts during navigation
   - Network indicator shows Online/Offline; if supported, rtt/downlink/effectiveType
3. Toggle advanced modes to confirm readability and focus states:
   - Add attributes to the html tag (via dev tools or app wrapper):
     - `data-theme="dark"`
     - `data-density="compact"`
     - `data-high-contrast="1"`
     - `data-text-zoom="lg"`
     - `data-reduce-motion="1"`

Tests

- E2E selectors updated to use data-testid (example):
  - `[data-testid="statusbar"]`
  - `[data-testid="statusbar-queue"]`
  - `[data-testid="statusbar-net"]`
- CI expected green on Next 15 with outputFileTracingRoot fix

Notes

- No changes were made to data fetching or store logic
- Component visuals are token-driven to ensure parity across light/dark and high-contrast modes

Changelog (for PR body)

- Refactor(StatusBar): Tailwind-only visuals using design tokens
- Chore(Next): align to Next 15 and add outputFileTracingRoot in next.config.ts
- Test(E2E): target data-testid selectors for StatusBar UI
- Docs: attach screenshots and include bundle/CSS diff notes
