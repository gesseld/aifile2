# PR #4: File Details panel visual refresh + Ask-AI integration

Scope

- Visual refresh of the right-side File Details panel using design tokens (Tailwind via globals.css variables).
- New Ask-AI section with:
  - Input field and submit button to query the AI backend
  - Results surfaces: AI Summary, Suggested Tags (click-to-add to tags editor), Detected Entities (type/value/score)
- Stable selectors for E2E/data-tests:
  - data-testid="ask-ai-input"
  - data-testid="ask-ai-submit"
- Adapter wiring
  - Resilient AI adapter that tries NEXT_PUBLIC_AI_ENDPOINT, /api/ai/ask, /api/ai, /api/ask-ai
  - Normalizes responses to text, summary, tags, entities
  - Fallback helpers to extract tags/entities from text-only responses (heuristic, never override backend-provided values)

Files changed/added

- [FileDetailsPanel.tsx](apps/web-v2/src/components/file-browser/FileDetailsPanel.tsx:1)
  - Ask-AI state and UI + sections for summary/tags/entities
  - Preserves existing logic (save, versions, presigned share, collaborators, activity)
- [ai-adapter.ts](apps/web-v2/src/lib/ai-adapter.ts:1)
  - askAI(), extractTagsFromText(), extractEntitiesFromText()

Unit tests

- Adapter tests: [ai-adapter.spec.ts](apps/web-v2/src/lib/__tests__/ai-adapter.spec.ts:1)
  - Normalization from JSON
  - Text-only response (consumer uses helpers)
  - Multi-endpoint retry with meaningful error on total failure
- UI tests: [FileDetailsPanel.spec.tsx](apps/web-v2/src/components/file-browser/__tests__/FileDetailsPanel.spec.tsx:1)
  - Submit Ask-AI and render sections
  - Click Suggested Tag to add to editor
  - Error case shows message from adapter

How to run

- Dev: Next dev container "webv2-dev" on port 3001 (bind-mounts apps/web-v2 into /app)
- Unit: cd apps/web-v2 && npx vitest run --reporter=dot
- Manual check: http://localhost:3001/files (select one file) → Details pane → Ask AI

Design system compliance

- Uses token-based Tailwind utility classes
  - bg-[var(--surface)], border-[var(--border)], text-[var(--foreground)], text-[var(--muted-foreground)], focus-visible:ring-[var(--ring)]
- Honors advanced modes through tokens (dark, density, high-contrast, text-zoom, reduced-motion)

Screenshots (attach in PR)

- Details panel (light/dark), compact density, high-contrast
- With Ask-AI results: summary, suggested tags, entities
- With error state (failed request)
- Keyboard focus states for input and buttons

A11y

- Labels and roles consistent with existing patterns
- Keyboard navigation preserved; focus-visible ring uses tokens
- Live-region limited to error line to avoid verbosity

Perf/Bundle

- CSS scoped to tokens; no additional heavy deps
- Adapter is small utility, no vendor SDK

Risks/Mitigations

- Backend response variance: normalized in adapter; text-only fallbacks
- Endpoint drift: set NEXT_PUBLIC_AI_ENDPOINT or rely on built-in paths

Acceptance criteria

- Visual parity in Details panel (light/dark)
- Ask-AI flow functional with backend
- Unit tests green; E2E selectors stable
