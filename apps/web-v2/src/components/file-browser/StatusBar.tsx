'use client'

import React, { useEffect, useState } from 'react'
import { SettingsPanel } from '@/components/settings/SettingsPanel'

export type StatusBarProps = {
  selectedCount: number
  selectedSizeBytes: number
  totalItems: number
  loading: boolean
  opStatus?: string
  traceId?: string
}

/**
 * StatusBar with expanded system indicators:
 * - Online/offline and basic network health
 * - Upload queue depth (from afm:state)
 * - Page cache metrics (from afm:perf): size/limit, hits/misses, prefetches, aborts, retries
 *
 * Tailwind-only visuals using design tokens via CSS variables:
 * - bg-[var(--surface)], border-[var(--border)], text-[var(--foreground)], text-[var(--muted-foreground)]
 */
export default function StatusBar(props: StatusBarProps) {
  const { selectedCount, selectedSizeBytes, totalItems, loading, opStatus, traceId } = props
  const [settingsOpen, setSettingsOpen] = useState(false)
  // Hydration-safe: defer dynamic online state until mounted
  const [mounted, setMounted] = useState(false)
  const [online, setOnline] = useState<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Upload queue depth and perf metrics (live via CustomEvent bridge)
  const [queueCount, setQueueCount] = useState<number>(0)
  const [perf, setPerf] = useState<{
    pageCacheSize: number
    pageCacheLimit: number
    cacheHits: number
    cacheMisses: number
    prefetches: number
    aborts: number
    retries: number
  }>({
    pageCacheSize: 0,
    pageCacheLimit: 0,
    cacheHits: 0,
    cacheMisses: 0,
    prefetches: 0,
    aborts: 0,
    retries: 0,
  })

  // Optional: Network information API (best-effort)
  const [rtt, setRtt] = useState<number | null>(null)
  const [downlink, setDownlink] = useState<number | null>(null)
  const [effectiveType, setEffectiveType] = useState<string | null>(null)

  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)

    const onState = (e: Event) => {
      try {
        const d = (e as CustomEvent)?.detail || {}
        // e.g., { uploadQueueCount, selectionCount, viewMode, ... }
        if (typeof d.uploadQueueCount === 'number') {
          setQueueCount(d.uploadQueueCount)
        }
      } catch {}
    }

    const onPerf = (e: Event) => {
      try {
        const d = (e as CustomEvent)?.detail || {}
        // Accept only known numeric fields
        setPerf((prev) => ({
          pageCacheSize: numberOr(prev.pageCacheSize, d.pageCacheSize),
          pageCacheLimit: numberOr(prev.pageCacheLimit, d.pageCacheLimit),
          cacheHits: numberOr(prev.cacheHits, d.cacheHits),
          cacheMisses: numberOr(prev.cacheMisses, d.cacheMisses),
          prefetches: numberOr(prev.prefetches, d.prefetches),
          aborts: numberOr(prev.aborts, d.aborts),
          retries: numberOr(prev.retries, d.retries),
        }))
      } catch {}
    }

    // Hook NetworkInformation if available
    let conn: any = null
    try {
      conn =
        (navigator as any)?.connection ||
        (navigator as any)?.mozConnection ||
        (navigator as any)?.webkitConnection ||
        null
      if (conn) {
        const updateConn = () => {
          try {
            setRtt(typeof conn.rtt === 'number' ? conn.rtt : null)
            setDownlink(typeof conn.downlink === 'number' ? conn.downlink : null)
            setEffectiveType(typeof conn.effectiveType === 'string' ? conn.effectiveType : null)
          } catch {}
        }
        updateConn()
        conn.addEventListener?.('change', updateConn)
      }
    } catch {}

    if (typeof window !== 'undefined') {
      window.addEventListener('online', on)
      window.addEventListener('offline', off)
      window.addEventListener('afm:state', onState as any)
      window.addEventListener('afm:perf', onPerf as any)
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', on)
        window.removeEventListener('offline', off)
        window.removeEventListener('afm:state', onState as any)
        window.removeEventListener('afm:perf', onPerf as any)
      }
      try {
        conn?.removeEventListener?.('change', () => {})
      } catch {}
    }
  }, [])

  return (
    <div
      className="sticky bottom-0 left-0 right-0 h-9 grid grid-cols-[1fr_auto_1fr] items-center px-3 bg-[var(--surface)] border-t border-[var(--border)] text-[var(--foreground)] text-[13px] z-10"
      role="status"
      aria-live="polite"
      suppressHydrationWarning
      data-testid="statusbar"
    >
      {/* Left: totals and selection + queue */}
      <div className="flex items-center gap-2">
        <span
          className="rounded-full bg-[var(--accent)]/40 border border-[var(--border)] px-2 py-0.5 text-xs text-[var(--foreground)]"
          title="Total items in current view"
        >
          {totalItems} item{totalItems === 1 ? '' : 's'}
        </span>
        <span className="text-[var(--muted-foreground)]" aria-hidden>
          |
        </span>
        <span
          className="rounded-full bg-[var(--accent)]/40 border border-[var(--border)] px-2 py-0.5 text-xs text-[var(--foreground)]"
          title="Selection summary"
        >
          {selectedCount} selected
          {selectedCount > 0 ? ` · ${formatBytes(selectedSizeBytes)}` : ''}
        </span>
        {queueCount > 0 ? (
          <>
            <span className="text-[var(--muted-foreground)]" aria-hidden>
              |
            </span>
            <span
              className="rounded-full bg-amber-50 border border-amber-200 text-amber-800 px-2 py-0.5 text-xs dark:text-[var(--warning,#f59e0b)]"
              title="Upload queue depth"
              data-testid="statusbar-queue"
            >
              ⬆ {queueCount}
            </span>
          </>
        ) : null}
      </div>

      {/* Center: status/op + trace */}
      <div className="justify-self-center flex items-center gap-2">
        {loading ? (
          <span className="text-primary-600" aria-label="Loading">
            Loading…
          </span>
        ) : opStatus ? (
          <span className="text-[var(--foreground)]" aria-label="Operation status">
            {opStatus}
          </span>
        ) : (
          <span className="text-[var(--muted-foreground)]" aria-label="Idle">
            Idle
          </span>
        )}
        {traceId ? (
          <span
            className="text-[12px] text-[var(--muted-foreground)] font-mono bg-[color-mix(in_oklab,var(--foreground)_4%,transparent)] border border-[color-mix(in_oklab,var(--foreground)_10%,transparent)] rounded px-1.5 py-0.5"
            title="Last backend trace ID"
          >
            trace:{short(traceId)}
          </span>
        ) : null}
      </div>

      {/* Right: perf metrics + network + advanced settings */}
      <div className="flex items-center gap-2 justify-end flex-wrap" data-testid="statusbar-perf">
        {/* Compact metrics */}
        <span
          className="text-[11px] text-[var(--muted-foreground)] bg-[var(--surface)] border border-[var(--border)] rounded px-1.5 py-0.5"
          title="Page cache size / limit"
        >
          Cache {perf.pageCacheSize}/{perf.pageCacheLimit}
        </span>
        <span
          className="text-[11px] text-[var(--muted-foreground)] bg-[var(--surface)] border border-[var(--border)] rounded px-1.5 py-0.5"
          title="Cache hits / misses"
        >
          H/M {perf.cacheHits}/{perf.cacheMisses}
        </span>
        <span
          className="text-[11px] text-[var(--muted-foreground)] bg-[var(--surface)] border border-[var(--border)] rounded px-1.5 py-0.5"
          title="Prefetches"
        >
          Pref {perf.prefetches}
        </span>
        <span
          className={`text-[11px] rounded px-1.5 py-0.5 ${
            perf.aborts > 0
              ? 'text-amber-700 bg-amber-50 border border-amber-200'
              : 'text-[var(--muted-foreground)] bg-[var(--surface)] border border-[var(--border)]'
          }`}
          title="Aborted in-flight ops"
        >
          Abort {perf.aborts}
        </span>
        <span
          className={`text-[11px] rounded px-1.5 py-0.5 ${
            perf.retries > 0
              ? 'text-amber-700 bg-amber-50 border border-amber-200'
              : 'text-[var(--muted-foreground)] bg-[var(--surface)] border border-[var(--border)]'
          }`}
          title="Transient retries"
        >
          Retry {perf.retries}
        </span>

        {mounted ? (
          <>
            <span
              className={`inline-block w-2 h-2 rounded-full ${online ? 'bg-green-600' : 'bg-red-600'}`}
              aria-hidden
            />
            <span
              className={`${online ? 'text-green-600' : 'text-red-600'}`}
              aria-label={`Network ${online ? 'online' : 'offline'}`}
              data-testid="statusbar-net"
            >
              {online ? 'Online' : 'Offline'}
            </span>
            {online && (rtt != null || downlink != null || effectiveType) ? (
              <span
                className="text-[11px] text-[var(--muted-foreground)] bg-[var(--surface)] border border-[var(--border)] rounded px-1.5 py-0.5"
                title="Network stats (best-effort)"
              >
                {effectiveType ? effectiveType : ''}
                {effectiveType && (rtt != null || downlink != null) ? ' · ' : ''}
                {rtt != null ? `${rtt}ms` : ''}
                {rtt != null && downlink != null ? ' · ' : ''}
                {downlink != null ? `${downlink}Mbps` : ''}
              </span>
            ) : null}
          </>
        ) : (
          <>
            <span
              suppressHydrationWarning
              className="inline-block w-2 h-2 rounded-full bg-[var(--border)]"
              aria-hidden
            />
            <span
              suppressHydrationWarning
              className="text-[var(--muted-foreground)]"
              aria-label="Network"
            >
              —
            </span>
          </>
        )}

        {/* Advanced Settings entry point */}
        <button
          className="h-6 px-2.5 rounded-md border border-[var(--border)] bg-[var(--surface)] text-[12px] text-[var(--foreground)] hover:bg-[color-mix(in_oklab,var(--surface)_85%,white)] hover:border-[color-mix(in_oklab,var(--border)_80%,#a5b4fc)] transition-colors"
          onClick={() => setSettingsOpen(true)}
          aria-haspopup="dialog"
          aria-controls="settings-dialog"
          title="Open advanced settings"
        >
          Advanced Settings
        </button>
      </div>

      {/* Globally mounted settings modal */}
      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  )
}

function numberOr(prev: number, next: any) {
  return typeof next === 'number' && Number.isFinite(next) ? next : prev
}

function short(s?: string) {
  if (!s) return ''
  if (s.length <= 8) return s
  return `${s.slice(0, 4)}…${s.slice(-3)}`
}

function formatBytes(bytes: number) {
  if (!bytes || bytes <= 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}
