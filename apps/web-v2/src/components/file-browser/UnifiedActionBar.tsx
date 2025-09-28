'use client'

import React from 'react'

type Props = {
  onSearch?: (q: string) => void
  onUpload?: () => void
  viewMode?: 'list' | 'ai' // controlled value (optional)
  onToggleView?: (mode: 'list' | 'ai') => void // controlled handler (optional)
  onSortClick?: () => void
}

/**
 * UnifiedActionBar with controllable/uncontrollable behavior:
 * - If onToggleView is provided, component is controlled via props.viewMode.
 * - Otherwise it manages its own internal state for view toggles.
 */
export default function UnifiedActionBar({
  onSearch,
  onUpload,
  viewMode = 'list',
  onToggleView,
  onSortClick,
}: Props) {
  const isControlled = typeof onToggleView === 'function'
  const [internalMode, setInternalMode] = React.useState<'list' | 'ai'>(
    viewMode
  )
  React.useEffect(() => {
    // sync internal mode when controlled prop changes
    if (isControlled) {
      setInternalMode(viewMode)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode])

  const currentMode = isControlled ? viewMode : internalMode

  const handleSetMode = (mode: 'list' | 'ai') => {
    if (!isControlled) setInternalMode(mode)
    onToggleView?.(mode)
  }

  const handleUpload = () => {
    onUpload?.()
  }

  return (
    <div
      data-testid="toolbar-strip"
      className="w-full border-b border-[var(--border)] bg-[var(--surface)]"
    >
      <div className="mx-auto max-w-7xl px-3 py-2 flex items-center gap-2">
        {/* Search */}
        <div className="relative flex-1">
          <input
            data-testid="search-input"
            type="text"
            placeholder="Search files"
            onChange={(e) => onSearch?.(e.target.value)}
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] pl-10 pr-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
          />
          <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)]">
            {/* magnifier icon (svg) */}
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden
            >
              <path
                d="M10.5 18a7.5 7.5 0 1 1 5.3-12.8l4.7 4.7-1.4 1.4-4.6-4.6A5.5 5.5 0 1 0 10.5 16v2z"
                fill="currentColor"
              />
            </svg>
          </div>
        </div>

        {/* Upload */}
        <button
          data-testid="btn-upload"
          onClick={handleUpload}
          className="rounded-lg bg-[color:var(--primary,theme(colors.blue.500))] text-white text-sm px-3 py-2 hover:bg-[color:var(--primary-600,theme(colors.blue.600))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
        >
          Upload
        </button>

        {/* View toggles */}
        <div className="flex items-center gap-1 rounded-md border border-[var(--border)] p-1 bg-[var(--surface)]">
          <button
            type="button"
            aria-pressed={currentMode === 'list'}
            data-testid="toolbar-list"
            onClick={() => handleSetMode('list')}
            className={`px-2 py-1 rounded-md text-sm hover:bg-[var(--accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] ${
              currentMode === 'list' ? 'bg-[var(--accent)]' : ''
            }`}
          >
            List
          </button>
          <button
            type="button"
            aria-pressed={currentMode === 'ai'}
            data-testid="toolbar-ai"
            onClick={() => handleSetMode('ai')}
            className={`px-2 py-1 rounded-md text-sm hover:bg-[var(--accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] ${
              currentMode === 'ai' ? 'bg-[var(--accent)]' : ''
            }`}
          >
            AI Relevance
          </button>
        </div>

        {/* Sort */}
        <button
          data-testid="toolbar-sort"
          onClick={onSortClick}
          className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-2 text-sm hover:bg-[var(--accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
          aria-label="Sort"
          title="Sort"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden
          >
            <path
              d="M7 6h10v2H7V6zm-2 5h14v2H5v-2zm4 5h6v2H9v-2z"
              fill="currentColor"
            />
          </svg>
        </button>
      </div>

      {/* Breadcrumb strip (muted) */}
      <div className="mx-auto max-w-7xl px-3 pb-2 -mt-1">
        <nav
          aria-label="Breadcrumb"
          className="text-sm text-[var(--muted-foreground)]"
        >
          <ol className="flex items-center gap-1">
            <li>
              <span
                className="hover:underline cursor-pointer"
                data-testid="crumb-root"
              >
                Home
              </span>
            </li>
            <li className="opacity-60">/</li>
            <li>
              <span
                className="hover:underline cursor-pointer"
                data-testid="crumb-files"
              >
                Files
              </span>
            </li>
            <li className="opacity-60">/</li>
            <li>
              <span
                className="text-[var(--foreground)]"
                data-testid="crumb-here"
              >
                All
              </span>
            </li>
          </ol>
        </nav>
      </div>
    </div>
  )
}
