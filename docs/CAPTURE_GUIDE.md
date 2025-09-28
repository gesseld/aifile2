# Visual Capture Guide — PR #2 and PR #3

Purpose
This guide provides exact steps to capture and commit screenshot artifacts for:
- PR #2: Sidebar + Search/Breadcrumb/Toolbar visual refresh
- PR #3: File list rows/cards + selected/hover/checkbox states

Where to store screenshots
- PR #2 screenshots: docs/assets/pr2/
- PR #3 screenshots: docs/assets/pr3/

Use consistent filenames so reviewers can diff across modes/states.

Dev server
- Local: http://localhost:3001/files
- Network: http://195.201.90.99:3001/files
- Cross-origin dev warning has been silenced via allowedDevOrigins in [next.config.ts](apps/web-v2/next.config.ts:1)

Mode toggles (set on documentElement in DevTools Console)
- Density (compact): document.documentElement.setAttribute('data-density','compact')
- High-contrast: document.documentElement.setAttribute('data-high-contrast','1')
- Text zoom large: document.documentElement.setAttribute('data-text-zoom','lg')
- Reduced motion: document.documentElement.setAttribute('data-reduce-motion','1')
- Dark mode (if not already toggled by UI): document.documentElement.setAttribute('data-theme','dark')
- Reset any attribute: document.documentElement.removeAttribute('<attr>')

Keyboard navigation cues (for captures that show focus styles)
- Sidebar list: ArrowUp/ArrowDown/Home/End; Enter to toggle selection
- Toolbar toggles: Tab to focus; Space/Enter to toggle aria-pressed
- Check that focus-visible rings are apparent in captures

PR #2 — Required captures (docs/assets/pr2/)
1) Sidebar (light)
   - sidebar_default_light.png (no hover, default selection)
   - sidebar_hover_light.png (hover a list item)
   - sidebar_selected_light.png (selected state with counters visible)
2) Sidebar (dark)
   - sidebar_default_dark.png
   - sidebar_hover_dark.png
   - sidebar_selected_dark.png
3) Header strip (light)
   - header_search_focus_light.png (cursor in search input showing focus ring)
   - header_upload_hover_light.png (hover upload button)
   - header_toolbar_toggles_light.png (list/ai/sort visible, one toggle aria-pressed="true")
4) Header strip (dark)
   - header_search_focus_dark.png
   - header_upload_hover_dark.png
   - header_toolbar_toggles_dark.png
5) Modes (at least one combined shot each)
   - header_compact.png (set data-density='compact'; include part of sidebar + header strip)
   - header_high_contrast.png (set data-high-contrast='1')
   - header_text_zoom_lg.png (set data-text-zoom='lg')
   - header_reduced_motion.png (set data-reduce-motion='1')

How to capture (manual)
- Use your OS screenshot tool or the browser’s built-in full/partial page capture.
- Prefer 1x scale and consistent browser width (e.g., 1280px) to keep diffs sensible.
- For hover states, hold the mouse steady over the element; for focus states, tab to the element so focus-visible is captured.
- Save PNGs using the filenames listed above under docs/assets/pr2/.

Commit recipe
- mkdir -p docs/assets/pr2
- Copy PNGs into docs/assets/pr2/
- git add docs/assets/pr2
- git commit -m "docs(pr2): add UI screenshots (light/dark + modes)"
- git push

Link screenshots in PR #2 (optional)
- In PR description, add a small gallery section referencing the stored PNGs:
  - Sidebar (Light): docs/assets/pr2/sidebar_default_light.png
  - Header (Dark, toggles): docs/assets/pr2/header_toolbar_toggles_dark.png
  - Modes: docs/assets/pr2/header_high_contrast.png, etc.

PR #3 — Required captures (docs/assets/pr3/)
States to show for the file list row/card component:
- default
- hover
- selected
- checked (checkbox on the right)

Light
- files_default_light.png
- files_hover_light.png
- files_selected_light.png
- files_checked_light.png

Dark
- files_default_dark.png
- files_hover_dark.png
- files_selected_dark.png
- files_checked_dark.png

Modes
- files_compact.png (data-density='compact')
- files_high_contrast.png (data-high-contrast='1')
- files_text_zoom_lg.png (data-text-zoom='lg')
- files_reduced_motion.png (data-reduce-motion='1')

Commit recipe
- mkdir -p docs/assets/pr3
- Copy PNGs into docs/assets/pr3/
- git add docs/assets/pr3
- git commit -m "docs(pr3): add file list row/card screenshots (states + modes)"
- git push

Verification checklist (visual + a11y)
- Tokens: surfaces, borders, text, muted text map to variables from [globals.css](apps/web-v2/src/app/globals.css:1)
- Focus-visible: rings are clear on interactive elements in light/dark/high-contrast
- aria-pressed set correctly on toolbar toggles; listbox semantics maintained on sidebar
- No content jumps on hover/selection (CLS); padding/border consistent
- Reduced motion: animated effects minimized
- Text zoom large: layout remains legible and usable

Tips
- If an element loses hover during capture, narrow the window so the element is near the center and easier to hover and capture quickly.
- For deterministic captures, you can temporarily add outline utilities in DevTools to make focus/hover more visible; remove before final screenshots.
