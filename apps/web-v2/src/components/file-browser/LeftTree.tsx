'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ContextMenu, { type MenuItem } from '@/components/file-browser/ContextMenu'
import { BucketsClient } from '@/lib/file-manager-client'
import ErrorBanner from '@/components/ui/ErrorBanner'

export type BucketItem = { name: string }

// Favorite entry persisted in localStorage
type FavoriteItem = {
  bucket: string
  prefix: string // '' means root
  label?: string // optional user label
}

export type LeftTreeProps = {
  buckets: BucketItem[]
  activeBucket?: string
  onChangeBucket: (name?: string) => void

  // Current prefix and updater owned by parent
  prefix: string
  onChangePrefix: (p: string) => void

  // Optional: called when user drops onto a bucket or a typed prefix
  // opts.op: 'move' | 'copy' (default 'move')
  onDropToBucket?: (bucket: string, opts?: { op?: 'move' | 'copy' }) => void
  onDropToPrefix?: (bucket: string, prefix: string, opts?: { op?: 'move' | 'copy' }) => void

  // Click-to-filter by type; when provided we enable StorageQuota breakdown interactions
  onFilterCategory?: (cat?: 'document' | 'image' | 'video' | 'audio' | 'archive' | 'other') => void

  // Optional admin access flag to guard context menu operations
  canAdminBucket?: boolean
}

/**
 * LeftTree (best-of-class sidebar v1)
 * - Favorites section (pin/unpin current, drag-to-reorder, quick shortcuts)
 * - Filter/search buckets
 * - Virtualized rendering for large bucket lists (no extra deps)
 * - DnD target highlighting (bucket-level)
 * - Inline prefix control
 * - Context menu on bucket rows with Admin/Set Active/Rename/Delete
 */
export default function LeftTree(props: LeftTreeProps) {
  const {
    buckets,
    activeBucket,
    onChangeBucket,
    prefix,
    onChangePrefix,
    onDropToBucket,
    onDropToPrefix,
    onFilterCategory,
    canAdminBucket = true,
  } = props

  const [filter, setFilter] = useState('')
  const [ctxOpen, setCtxOpen] = useState(false)
  const [ctxX, setCtxX] = useState(0)
  const [ctxY, setCtxY] = useState(0)
  const [ctxBucket, setCtxBucket] = useState<string | null>(null)
  const [dragOverBucket, setDragOverBucket] = useState<string | null>(null)
  // Keyboard focus index for bucket virtual list (-1 = none)
  const [focusIndex, setFocusIndex] = useState<number>(-1)
  // SR live region
  const [srMessage, setSrMessage] = useState<string>('')
  const liveRef = useRef<HTMLDivElement | null>(null)

  // Storage quota/usage for active bucket
  const [usageLoading, setUsageLoading] = useState(false)
  const [usageError, setUsageError] = useState<string | null>(null)
  const [usage, setUsage] = useState<{
    bucket: string
    totalBytes: number
    objectCount: number
    byType: Record<'image'|'video'|'audio'|'document'|'archive'|'other', { bytes: number; count: number }>
    generatedAt: string
  } | null>(null)

  // Load usage whenever active bucket changes or reload requested
  const [reloadTick, setReloadTick] = useState(0)
  useEffect(() => {
    let abort = false
    if (!activeBucket) {
      setUsage(null)
      return
    }
    setUsageLoading(true)
    setUsageError(null)
    BucketsClient.usage(activeBucket)
      .then((u) => { if (!abort) setUsage(u as any) })
      .catch((e: any) => { if (!abort) setUsageError(e?.message || 'Failed to load usage') })
      .finally(() => { if (!abort) setUsageLoading(false) })
    return () => { abort = true }
  }, [activeBucket, reloadTick])

  const onRetryUsage = useCallback(() => setReloadTick((n) => n + 1), [])

  // Auto-retry when back online
  useEffect(() => {
    function onOnline() {
      if (usageError) onRetryUsage()
    }
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [usageError, onRetryUsage])

  // Favorites state (localStorage persistence)
  const FAV_KEY = 'afm.favorites.v1'
  const [favorites, setFavorites] = useState<FavoriteItem[]>([])
  const [favDragIndex, setFavDragIndex] = useState<number | null>(null)

  const loadFavorites = useCallback(() => {
    try {
      const raw = localStorage.getItem(FAV_KEY)
      if (!raw) return []
      const arr = JSON.parse(raw)
      return Array.isArray(arr) ? (arr.filter(Boolean) as FavoriteItem[]) : []
    } catch {
      return []
    }
  }, [])

  const saveFavorites = useCallback((arr: FavoriteItem[]) => {
    setFavorites(arr)
    try {
      localStorage.setItem(FAV_KEY, JSON.stringify(arr))
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    setFavorites(loadFavorites())
  }, [loadFavorites])

  const pinCurrent = useCallback(() => {
    if (!activeBucket) return
    const item: FavoriteItem = {
      bucket: activeBucket,
      prefix: (prefix || '').replace(/^\/+|\/+$/g, ''),
      label: undefined,
    }
    const exists = favorites.some(
      (f) => f.bucket === item.bucket && (f.prefix || '') === item.prefix
    )
    if (exists) return
    saveFavorites([...favorites, item])
  }, [activeBucket, prefix, favorites, saveFavorites])

  const unpin = useCallback((idx: number) => {
    const next = favorites.slice()
    next.splice(idx, 1)
    saveFavorites(next)
  }, [favorites, saveFavorites])

  const gotoFavorite = useCallback((f: FavoriteItem) => {
    onChangeBucket(f.bucket)
    onChangePrefix(f.prefix || '')
  }, [onChangeBucket, onChangePrefix])

  // Reorder favorites via drag-and-drop
  const onFavDragStart = useCallback((idx: number) => setFavDragIndex(idx), [])
  const onFavDragOver = useCallback((e: React.DragEvent) => e.preventDefault(), [])
  const onFavDrop = useCallback((idx: number) => {
    if (favDragIndex == null || favDragIndex === idx) return
    const next = favorites.slice()
    const [moved] = next.splice(favDragIndex, 1)
    next.splice(idx, 0, moved)
    saveFavorites(next)
    setFavDragIndex(null)
  }, [favDragIndex, favorites, saveFavorites])

  // Virtualization config
  const rowHeight = 32
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(300)

  useEffect(() => {
    const el = viewportRef.current
    if (!el) return

    function onScroll() {
      const node = viewportRef.current
      if (!node) return
      setScrollTop(node.scrollTop)
    }
    function onResize() {
      const node = viewportRef.current
      setViewportHeight((node?.clientHeight ?? 300))
    }

    // initialize measurements
    onResize()

    el.addEventListener('scroll', onScroll)
    window.addEventListener('resize', onResize)
    return () => {
      el.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onResize)
    }
  }, [])

  const filtered = useMemo(() => {
    const f = filter.trim().toLowerCase()
    if (!f) return buckets
    return buckets.filter(b => b.name.toLowerCase().includes(f))
  }, [buckets, filter])

  // Clamp focus index to filtered length and announce result count on filter change
  useEffect(() => {
    setFocusIndex((idx) => {
      const next = Math.min(Math.max(idx, -1), Math.max(0, filtered.length - 1))
      return next
    })
    try {
      setSrMessage(`Buckets filtered: ${filtered.length} result${filtered.length === 1 ? '' : 's'}`)
    } catch {}
  }, [filtered.length])

  // Compute the active option id for aria-activedescendant
  const activeId = useMemo(() => {
    if (focusIndex < 0 || focusIndex >= filtered.length) return undefined
    const b = filtered[focusIndex]
    return b ? `bucket-option-${b.name}` : undefined
  }, [focusIndex, filtered])

  const total = filtered.length
  const visibleCount = Math.ceil(viewportHeight / rowHeight) + 4 // buffer
  const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - 2)
  const endIndex = Math.min(total, startIndex + visibleCount)
  const topSpacer = startIndex * rowHeight
  const bottomSpacer = Math.max(0, (total - endIndex) * rowHeight)

  // Context menu actions for buckets
  const openCtx = useCallback((e: React.MouseEvent, bucket: string) => {
    e.preventDefault()
    setCtxBucket(bucket)
    setCtxX(e.clientX)
    setCtxY(e.clientY)
    setCtxOpen(true)
  }, [])

  const doAdmin = useCallback((bucket: string) => {
    onChangeBucket(bucket)
  }, [onChangeBucket])

  const doDeleteBucket = useCallback(async (bucket: string) => {
    if (!confirm(`Delete bucket "${bucket}"? You may need to force empty on server.`)) return
    try {
      await BucketsClient.delete(bucket, true)
      alert('Delete requested. Refresh buckets to see changes.')
    } catch (e: any) {
      alert(e?.message || 'Bucket delete failed')
    }
  }, [])

  const doRenameBucket = useCallback(async (bucket: string) => {
    const to = prompt('New bucket name (mirror-based rename):', `${bucket}-renamed`)
    if (!to || to === bucket) return
    try {
      await BucketsClient.renameViaMirror(bucket, to)
      alert('Mirror-based rename requested. Monitor tasks for progress.')
    } catch (e: any) {
      alert(e?.message || 'Bucket rename (mirror) failed')
    }
  }, [])

  const menuItems: MenuItem[] = useMemo(() => {
    if (!ctxBucket) return []
    return [
      { label: 'Set Active', onClick: () => onChangeBucket(ctxBucket) },
      { label: 'Open Admin', onClick: () => doAdmin(ctxBucket), disabled: !canAdminBucket },
      { label: 'Rename (Mirror)', onClick: () => doRenameBucket(ctxBucket), disabled: !canAdminBucket },
      { label: 'Delete (Force)', onClick: () => doDeleteBucket(ctxBucket), disabled: !canAdminBucket },
    ]
  }, [ctxBucket, onChangeBucket, doAdmin, doRenameBucket, doDeleteBucket, canAdminBucket])

  // DnD handlers (buckets and prefix)
  const onDragOverBucket = useCallback((e: React.DragEvent, bucket: string) => {
    e.preventDefault()
    // Hint browser about a copy if ctrl/cmd held
    try {
      e.dataTransfer.dropEffect = (e.ctrlKey || e.metaKey) ? 'copy' : 'move'
    } catch {}
    setDragOverBucket(bucket)
  }, [])
  const onDragLeaveBucket = useCallback((_e: React.DragEvent, bucket: string) => {
    setDragOverBucket(prev => (prev === bucket ? null : prev))
  }, [])
  const parseOpFromEvent = (e: React.DragEvent): 'move' | 'copy' => {
    try {
      const payload = e.dataTransfer?.getData('application/x-afm-dnd')
      if (payload) {
        const obj = JSON.parse(payload)
        if (obj?.op === 'copy') return 'copy'
      }
    } catch { /* ignore */ }
    if (e.ctrlKey || e.metaKey) return 'copy'
    const eff = e.dataTransfer?.dropEffect
    if (eff === 'copy') return 'copy'
    return 'move'
  }
  const onDropBucket = useCallback((e: React.DragEvent, bucket: string) => {
    e.preventDefault()
    setDragOverBucket(null)
    const op = parseOpFromEvent(e)
    onDropToBucket?.(bucket, { op })
  }, [onDropToBucket])

  const onDropPrefixField = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    if (!activeBucket) return
    const op = parseOpFromEvent(e)
    onDropToPrefix?.(activeBucket, prefix || '', { op })
  }, [onDropToPrefix, activeBucket, prefix])

  return (
    <div className="lt-root animate-fade-in" onDrop={onDropPrefixField}>
      <style>{css}</style>
      {/* Screen-reader live region */}
      <div ref={liveRef} aria-live="polite" aria-atomic="true" className="sr-only">{srMessage}</div>

      {/* Favorites */}
      <div className="lt-fav">
        <div className="lt-fav-head">
          <div className="lt-fav-title">Favorites</div>
          <button
            className="lt-fav-pin"
            onClick={pinCurrent}
            disabled={!activeBucket}
            title={activeBucket ? `Pin ${activeBucket}/${prefix || ''}` : 'Select a bucket first'}
          >
            ★ Pin current
          </button>
        </div>
        {favorites.length === 0 ? (
          <div className="lt-fav-empty">No favorites yet</div>
        ) : (
          <ul className="lt-fav-list" onDragOver={onFavDragOver}>
            {favorites.map((f, idx) => {
              const active = f.bucket === activeBucket && (f.prefix || '') === (prefix || '').replace(/^\/+|\/+$/g, '')
              return (
                <li
                  key={`${f.bucket}/${f.prefix}`}
                  className={`lt-fav-item ${active ? 'active' : ''}`}
                  draggable
                  onDragStart={() => onFavDragStart(idx)}
                  onDrop={() => onFavDrop(idx)}
                  title={`${f.bucket}/${f.prefix || ''}`}
                >
                  <button className="lt-fav-jump" onClick={() => gotoFavorite(f)}>
                    <span className="lt-fav-star" aria-hidden>★</span>
                    <span className="lt-fav-text">
                      <strong>{f.bucket}</strong>{f.prefix ? `/${f.prefix}` : '/'}
                    </span>
                  </button>
                  <button className="lt-fav-unpin" onClick={() => unpin(idx)} aria-label="Unpin">✕</button>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {/* Buckets */}
      <div className="lt-head">
        <div className="lt-title">Buckets</div>
        <input
          className="lt-filter"
          placeholder="Filter buckets…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        {usageError ? (
          <div className="mt-2">
            <ErrorBanner error={usageError} onRetry={onRetryUsage} compact />
          </div>
        ) : null}
      </div>

      <div
        ref={viewportRef}
        className="lt-list"
        role="listbox"
        aria-label="Buckets"
        tabIndex={0}
        aria-activedescendant={activeId}
        onKeyDown={(e) => {
          if (!filtered.length) return
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setFocusIndex((i) => {
              const next = Math.min((i < 0 ? -1 : i) + 1, filtered.length - 1)
              try { setSrMessage(`Focus ${filtered[next]?.name}`) } catch {}
              return next
            })
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setFocusIndex((i) => {
              const base = i < 0 ? 0 : i
              const next = Math.max(base - 1, 0)
              try { setSrMessage(`Focus ${filtered[next]?.name}`) } catch {}
              return next
            })
          } else if (e.key === 'Home') {
            e.preventDefault()
            setFocusIndex(() => {
              try { setSrMessage(`Focus ${filtered[0]?.name}`) } catch {}
              return 0
            })
          } else if (e.key === 'End') {
            e.preventDefault()
            setFocusIndex(() => {
              try { setSrMessage(`Focus ${filtered[filtered.length - 1]?.name}`) } catch {}
              return filtered.length - 1
            })
          } else if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            const idx = focusIndex < 0 ? 0 : Math.min(focusIndex, filtered.length - 1)
            const target = filtered[idx]
            if (target) {
              onChangeBucket(target.name)
              try { setSrMessage(`Activated ${target.name}`) } catch {}
            }
          }
        }}
      >
        <div style={{ height: topSpacer }} />
        {filtered.slice(startIndex, endIndex).map((b, i) => {
          const idx = startIndex + i
          const isActive = activeBucket === b.name
          const isDragOver = dragOverBucket === b.name
          const isFocused = idx === focusIndex
          return (
            <div
              key={b.name}
              id={`bucket-option-${b.name}`}
              className={`lt-row ${isActive ? 'active' : ''} ${isDragOver ? 'dragover' : ''} ${isFocused ? 'focused' : ''}`}
              data-testid={`sidebar-item-${b.name}`}
              role="option"
              aria-selected={isActive}
              onClick={() => onChangeBucket(b.name)}
              onMouseEnter={() => setFocusIndex(idx)}
              onContextMenu={(e) => openCtx(e, b.name)}
              onDragOver={(e) => onDragOverBucket(e, b.name)}
              onDragLeave={(e) => onDragLeaveBucket(e, b.name)}
              onDrop={(e) => onDropBucket(e, b.name)}
              onKeyDown={(e) => {
                // Keyboard context menu support: Shift+F10 or ContextMenu key
                if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
                  e.preventDefault()
                  const el = e.currentTarget as HTMLElement
                  const rect = el.getBoundingClientRect()
                  const cx = Math.round(rect.left + rect.width / 2)
                  const cy = Math.round(rect.top + rect.height / 2)
                  setCtxBucket(b.name)
                  setCtxX(cx)
                  setCtxY(cy)
                  setCtxOpen(true)
                }
              }}
              tabIndex={0}
              style={{ height: rowHeight }}
              title={b.name}
            >
              <span className="lt-dot" aria-hidden>•</span>
              <span className="lt-name">{b.name}</span>
            </div>
          )
        })}
        <div style={{ height: bottomSpacer }} />
      </div>

      {/* Prefix editor */}
      <div className="lt-prefix">
        <div className="lt-subtitle">Prefix</div>
        <input
          className="lt-prefix-input"
          placeholder="folder/subfolder/"
          value={prefix}
          onChange={(e) => onChangePrefix(e.target.value)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDropPrefixField}
          title="Drop here to move/copy into current prefix"
        />
      </div>

      <ContextMenu open={ctxOpen} x={ctxX} y={ctxY} items={menuItems} onClose={() => setCtxOpen(false)} />
    </div>
  )
}

// Local helper: human-readable bytes
function formatBytes(bytes: number) {
  if (!bytes || bytes <= 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  const n = Math.min(i, sizes.length - 1)
  return `${parseFloat((bytes / Math.pow(k, n)).toFixed(2))} ${sizes[n]}`
}

const css = `
.lt-root {
  display: grid;
  grid-template-rows: auto auto 1fr auto;
  gap: var(--space-2, 8px);
  height: 100%;
}

/* Favorites */
.lt-fav { display: grid; gap: var(--space-1, 6px); }
.lt-fav-head { display: flex; align-items: center; justify-content: space-between; }
.lt-fav-title { font-weight: 600; color: var(--foreground, #111827); }
.lt-fav-pin {
  font-size: 12px;
  color: var(--warning, #f59e0b);
  background: color-mix(in oklab, var(--warning, #f59e0b) 10%, transparent);
  border: 1px solid color-mix(in oklab, var(--warning, #f59e0b) 40%, var(--border, #e5e7eb));
  padding: 3px 6px;
  border-radius: var(--radius-sm, 6px);
  cursor: pointer;
  transition: background-color var(--transition-fast) var(--ease-standard),
              border-color var(--transition-fast) var(--ease-standard),
              transform var(--transition-fast) var(--ease-standard);
}
.lt-fav-pin:hover {
  background: color-mix(in oklab, var(--warning, #f59e0b) 16%, transparent);
  border-color: var(--border-strong, #d1d5db);
}
.lt-fav-pin:active { transform: scale(var(--press-scale, .98)); }
.lt-fav-pin:disabled { opacity: 0.6; cursor: not-allowed; }
.lt-fav-empty { color: var(--muted, #6b7280); font-size: 12px; }
.lt-fav-list { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--space-1, 6px); }
.lt-fav-item {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  gap: var(--space-1, 6px);
  padding: 6px 8px;
  border: 1px solid var(--border, #e5e7eb);
  border-radius: var(--radius-sm, 6px);
  background: var(--surface, #fff);
  transition: background-color var(--transition-fast) var(--ease-standard),
              border-color var(--transition-fast) var(--ease-standard),
              box-shadow var(--transition-fast) var(--ease-standard);
}
.lt-fav-item:hover { background: var(--accent, #f8fafc); }
.lt-fav-item.active { background: color-mix(in oklab, var(--primary, #0ea5e9) 10%, transparent); border-color: color-mix(in oklab, var(--primary, #0ea5e9) 40%, var(--border)); }
.lt-fav-jump {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: transparent;
  border: none;
  cursor: pointer;
  color: var(--foreground, #374151);
  text-align: left;
  transition: transform var(--transition-fast) var(--ease-standard);
}
.lt-fav-jump:active { transform: scale(var(--press-scale, .98)); }
.lt-fav-star { color: var(--warning, #f59e0b); }
.lt-fav-unpin {
  background: color-mix(in oklab, var(--error, #ef4444) 10%, transparent);
  border: 1px solid color-mix(in oklab, var(--error, #ef4444) 40%, var(--border));
  color: var(--error, #991b1b);
  border-radius: var(--radius-sm, 6px);
  padding: 2px 6px;
  cursor: pointer;
  transition: background-color var(--transition-fast) var(--ease-standard),
              border-color var(--transition-fast) var(--ease-standard),
              transform var(--transition-fast) var(--ease-standard);
}
.lt-fav-unpin:hover {
  background: color-mix(in oklab, var(--error, #ef4444) 16%, transparent);
  border-color: var(--border-strong, #d1d5db);
}
.lt-fav-unpin:active { transform: scale(var(--press-scale, .98)); }

/* Buckets */
.lt-head { display: grid; gap: var(--space-1, 6px); }
.lt-title { font-weight: 600; color: var(--foreground, #111827); }
.lt-filter {
  padding: 6px 8px;
  border: 1px solid var(--border, #e5e7eb);
  border-radius: var(--radius-sm, 6px);
  font-size: 13px;
  color: var(--foreground);
  background: var(--surface);
  transition: border-color var(--transition-fast) var(--ease-standard), box-shadow var(--transition-fast) var(--ease-standard);
}
.lt-filter:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px var(--ring), 0 0 0 4px rgba(14,165,233,0.12);
  border-color: var(--ring);
}

.lt-list {
  overflow: auto;
  border: 1px solid var(--border, #e5e7eb);
  border-radius: var(--radius-sm, 6px);
  background: var(--surface, #fff);
}

.lt-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  cursor: pointer;
  border-bottom: 1px solid color-mix(in oklab, var(--border, #e5e7eb) 70%, transparent);
  transition: background-color var(--transition-fast) var(--ease-standard);
}
.lt-row:hover { background: var(--accent, #f8fafc); }
.lt-row.active { background: color-mix(in oklab, var(--primary, #0ea5e9) 10%, transparent); font-weight: 600; }
.lt-row.dragover { outline: 2px dashed color-mix(in oklab, var(--info, #3b82f6) 70%, #ffffff); outline-offset: -4px; }

.lt-dot { color: var(--muted, #9ca3af); }
.lt-name {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Keyboard focus style */
.lt-row.focused,
.lt-row:focus-visible {
  outline: 2px solid color-mix(in oklab, var(--ring, #0ea5e9) 70%, #ffffff);
  outline-offset: -2px;
  background: color-mix(in oklab, var(--primary, #0ea5e9) 8%, transparent);
}

/* Prefix editor */
.lt-prefix { display: grid; gap: var(--space-1, 6px); }
.lt-subtitle { color: var(--muted, #6b7280); font-size: 12px; }
.lt-prefix-input {
  padding: 6px 8px;
  border: 1px solid var(--border, #e5e7eb);
  border-radius: var(--radius-sm, 6px);
  font-size: 13px;
  color: var(--foreground);
  background: var(--surface);
  transition: border-color var(--transition-fast) var(--ease-standard), box-shadow var(--transition-fast) var(--ease-standard);
}
.lt-prefix-input:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px var(--ring), 0 0 0 4px rgba(14,165,233,0.12);
  border-color: var(--ring);
}

/* Dark scheme tweaks (tokens will handle most) */
@media (prefers-color-scheme: dark) {
  .lt-row.dragover { outline-color: color-mix(in oklab, var(--info, #3b82f6) 70%, #000000); }
}
`