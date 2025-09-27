# PR #1 — StatusBar refactor to Tailwind tokens; logic/events preserved

Base branch: feat/ui-refresh-file-manager

Summary

- Component migrated to Tailwind-only visuals using our token system
- All logic/events preserved: online/offline, perf metrics (afm:perf), upload queue depth (afm:state), network info
- Stable data-testid selectors added for E2E reliability
- Aligned repo to Next.js 15 with monorepo tracing fix

Scope

- Component: [StatusBar()](../apps/web-v2/src/components/file-browser/StatusBar.tsx:24)
- Tokens: [globals.css](../apps/web-v2/src/app/globals.css:1)
- Tailwind config: [tailwind.config.ts](../apps/web-v2/tailwind.config.ts:1)
- Next.js config: [next.config.ts](../apps/web-v2/next.config.ts:1) (outputFileTracingRoot fix)
- Next 15 upgrade/hardened scripts: [package.json](../apps/web-v2/package.json:1)

Data-testid selectors (for E2E)

- statusbar
- statusbar-queue (upload queue depth)
- statusbar-net (online/offline indicator)

Acceptance criteria mapping

- Tailwind-only visuals with tokens (bg-[var(--surface)], border-[var(--border)], text-[var(--foreground)], text-[var(--muted-foreground)], ring-[var(--ring)], shadow-soft)
- Layout unchanged: sticky bottom, 3 columns
- Online/offline, perf metrics, upload queue depth unchanged
- Test selectors added as above
- No hydration warnings; Next.js 15 build/start verified

Screenshots to attach (artifacts)

- Light mode: ./assets/pr1/statusbar-light.png
- Dark mode: ./assets/pr1/statusbar-dark.png
- Compact density [data-density="compact"]: ./assets/pr1/statusbar-compact.png
- High contrast [data-high-contrast="1"]: ./assets/pr1/statusbar-high-contrast.png

How to capture screenshots

1. Run: `cd apps/web-v2 && npm run build && npm run start` (Next 15)
2. Open the StatusBar in the app page; for mode screenshots, toggle attributes on <html> via dev tools:
   - Dark: `document.documentElement.setAttribute('data-theme', 'dark')`
   - Compact: `document.documentElement.setAttribute('data-density', 'compact')`
   - High-contrast: `document.documentElement.setAttribute('data-high-contrast', '1')`
   - Reset attributes as needed between shots

Bundle/CSS diff summary (StatusBar scope)

- Inline styles removed; utilities + tokens applied
- Expect reduced component-scoped CSS and consistent theming
- To baseline:
  - Pre-refactor vs post-refactor First Load JS/CSS (Next build output)
  - Confirm no growth attributable to this change

Verification checklist

- Online/offline indicator responds to connection changes
- afm:state updates queue depth in badge (selector: statusbar-queue)
- afm:perf updates cache size/limit, H/M, prefetches, aborts, retries
- Network info (rtt/downlink/effectiveType) renders when supported
- Focus-visible styles are present and legible across modes
- No hydration warnings in console on Next 15

Notes on Next.js 15 alignment

- Monorepo tracing issues resolved via [next.config.ts](../apps/web-v2/next.config.ts:1) outputFileTracingRoot
- Upgraded Next and hardened scripts with NEXT_TELEMETRY_DISABLED=1 in [package.json](../apps/web-v2/package.json:1)
- Production build and server verified for / and /files

E2E guidance (selectors)

- Query by testid:
  - `[data-testid="statusbar"]`
  - `[data-testid="statusbar-queue"]`
  - `[data-testid="statusbar-net"]`

Changelog

- Refactor(StatusBar): Tailwind-only visuals with design tokens
- Chore(Next): align to Next 15; add outputFileTracingRoot; harden scripts
- Test(E2E): target stable testid selectors for StatusBar
- Docs: attach multi-mode screenshots and include bundle/CSS diff notes
