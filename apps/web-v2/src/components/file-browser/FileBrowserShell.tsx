'use client'

import React from 'react'
import LeftTree from './LeftTree'
import UnifiedActionBar from './UnifiedActionBar'
import FileDetailsPanel from './FileDetailsPanel'
import StatusBar from './StatusBar'

export default function FileBrowserShell() {
  const [dark, setDark] = React.useState(false)

  React.useEffect(() => {
    const html = document.documentElement
    if (dark) {
      html.setAttribute('data-theme', 'dark')
    } else {
      html.removeAttribute('data-theme')
    }
  }, [dark])

  return (
    <div
      className="h-full w-full flex bg-[var(--app-bg,transparent)] text-[var(--foreground)]"
      data-testid="file-browser-shell"
      role="application"
      aria-label="File Manager"
    >
      {/* Sidebar */}
      <LeftTree
        darkEnabled={dark}
        onToggleDark={setDark}
        onNavigate={() => {}}
      />

      {/* Main content area */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Header: Search / Upload / Toolbar / Breadcrumb */}
        <div className="sticky top-0 z-10 border-b border-[var(--border)] bg-[var(--surface)]/95 backdrop-blur supports-[backdrop-filter]:bg-[var(--surface)]/80">
          <UnifiedActionBar />
        </div>

        {/* Content: File list placeholder - integrate real list in PR #3 */}
        <div className="flex-1 min-h-0 p-4">
          <div
            className="rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-sm p-6 text-sm text-[var(--muted-foreground)]"
            data-testid="file-list-placeholder"
            aria-live="polite"
          >
            File list renders here (PR #3 will supply visual-refresh rows/cards).
          </div>
        </div>

        {/* Bottom Status Bar */}
        <StatusBar />
      </div>

      {/* Right details panel */}
      <aside
        className="w-80 shrink-0 border-l border-[var(--border)] bg-[var(--surface)]"
        data-testid="right-details-panel"
        aria-label="File details"
      >
        <div className="h-full p-3">
          <FileDetailsPanel />
        </div>
      </aside>
    </div>
  )
}