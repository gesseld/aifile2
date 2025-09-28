/* eslint-env browser */
/* eslint-disable semi */
'use client'

import React from 'react';

type NavItem = {
  key: string
  label: string
  count?: number
  active?: boolean
}

type Props = {
  items?: NavItem[]
  onNavigate?: (key: string) => void
  onToggleDark?: (enabled: boolean) => void
  darkEnabled?: boolean
  usedBytes?: number
  totalBytes?: number
}

const formatCount = (n?: number) => (typeof n === 'number' ? n : undefined)

const defaultItems: NavItem[] = [
  { key: 'all', label: 'All Files', count: 128, active: true },
  { key: 'recent', label: 'Recent', count: 9 },
  { key: 'shared', label: 'Shared with me', count: 3 },
  { key: 'starred', label: 'Starred', count: 6 },
  { key: 'trash', label: 'Trash', count: 2 },
]

function bytesToHuman(n?: number) {
  if (!n && n !== 0) return ''
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let v = n
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(1)} ${units[i]}`
}

export default function LeftTree({
  items = defaultItems,
  onNavigate,
  onToggleDark,
  darkEnabled = false,
  usedBytes = 42 * 1024 * 1024,
  totalBytes = 256 * 1024 * 1024,
}: Props) {
  const usagePct =
    totalBytes > 0
      ? Math.min(100, Math.round((usedBytes / totalBytes) * 100))
      : 0

  return (
    <aside
      className="h-full w-64 shrink-0 border-r border-[var(--border)] bg-[var(--surface)]"
      aria-label="Sidebar Navigation"
      data-testid="sidebar"
    >
      <div className="p-3 flex flex-col h-full gap-3">
        {/* Section: Navigation */}
        <div>
          <div className="px-2 py-1 text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wide">
            Navigation
          </div>
          <ul role="listbox" className="mt-1 space-y-1">
            {items.map((it) => {
              const count = formatCount(it.count)
              return (
                <li key={it.key}>
                  <button
                    type="button"
                    data-testid={`sidebar-item-${it.key}`}
                    className={`w-full flex items-center justify-between gap-2 rounded-md px-3 py-2 text-sm border border-transparent hover:bg-[var(--accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] ${
                      it.active ? 'bg-[var(--accent)]' : ''
                    }`}
                    aria-selected={it.active}
                    onClick={() => onNavigate?.(it.key)}
                  >
                    <span className="text-[var(--foreground)]">{it.label}</span>
                    {typeof count === 'number' ? (
                      <span className="text-[var(--foreground)]/80 text-xs px-2 py-1 rounded-md bg-[var(--accent)]/40 border border-[var(--border)]">
                        {count}
                      </span>
                    ) : null}
                  </button>
                </li>
              )
            })}
          </ul>
        </div>

        {/* Divider */}
        <div className="h-px bg-[var(--border)] my-2" />

        {/* Section: Projects (simple static accordion placeholder) */}
        <div>
          <div className="px-2 py-1 text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wide">
            Projects
          </div>
          <div className="mt-1 space-y-1">
            <button
              type="button"
              data-testid="sidebar-item-projects-alpha"
              className="w-full flex items-center justify-between gap-2 rounded-md px-3 py-2 text-sm border border-transparent hover:bg-[var(--accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
            >
              <span className="text-[var(--foreground)]">Alpha</span>
              <span className="text-[var(--foreground)]/80 text-xs px-2 py-1 rounded-md bg-[var(--accent)]/40 border border-[var(--border)]">
                12
              </span>
            </button>
            <button
              type="button"
              data-testid="sidebar-item-projects-beta"
              className="w-full flex items-center justify-between gap-2 rounded-md px-3 py-2 text-sm border border-transparent hover:bg-[var(--accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
            >
              <span className="text-[var(--foreground)]">Beta</span>
              <span className="text-[var(--foreground)]/80 text-xs px-2 py-1 rounded-md bg-[var(--accent)]/40 border border-[var(--border)]">
                7
              </span>
            </button>
          </div>
        </div>

        {/* Spacer pushes controls to bottom */}
        <div className="flex-1" />

        {/* Section: Dark mode toggle */}
        <div className="rounded-md border border-[var(--border)] p-3 bg-[var(--surface)]">
          <div className="flex items-center justify-between">
            <div className="text-sm text-[var(--foreground)]">Dark mode</div>
            <button
              type="button"
              role="switch"
              aria-checked={darkEnabled}
              data-testid="sidebar-item-darkmode"
              className={`px-2 py-1 text-xs rounded-md border border-[var(--border)] hover:bg-[var(--accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] ${
                darkEnabled ? 'bg-[var(--accent)]' : ''
              }`}
              onClick={() => onToggleDark?.(!darkEnabled)}
            >
              {darkEnabled ? 'On' : 'Off'}
            </button>
          </div>
        </div>

        {/* Section: Storage meter */}
        <div className="rounded-md border border-[var(--border)] p-3 bg-[var(--surface)]">
          <div className="text-sm text-[var(--foreground)] mb-2">Storage</div>
          <div className="h-2 w-full rounded-full bg-[var(--accent)]/30 overflow-hidden border border-[var(--border)]">
            <div
              className="h-full bg-[var(--accent)]"
              style={{ width: `${usagePct}%` }}
              data-testid="sidebar-storage-fill"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={usagePct}
              role="progressbar"
            />
          </div>
          <div className="mt-2 text-xs text-[var(--muted-foreground)]">
            {bytesToHuman(usedBytes)} / {bytesToHuman(totalBytes)} ({usagePct}%)
          </div>
        </div>
      </div>
    </aside>
  )
}
