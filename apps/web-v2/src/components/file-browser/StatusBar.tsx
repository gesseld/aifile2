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
      conn = (navigator as any)?.connection || (navigator as any)?.mozConnection || (navigator as any)?.webkitConnection || null
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
    <div className="fm-statusbar" role="status" aria-live="polite" suppressHydrationWarning data-testid="statusbar">
      <div className="sb-left">
        <span className="tag" title="Total items in current view">
          {totalItems} item{totalItems === 1 ? '' : 's'}
        </span>
        <span className="sep" aria-hidden>|</span>
        <span className="tag" title="Selection summary">
          {selectedCount} selected
          {selectedCount > 0 ? ` · ${formatBytes(selectedSizeBytes)}` : ''}
        </span>
        {queueCount > 0 ? (
          <>
            <span className="sep" aria-hidden>|</span>
            <span className="tag warn" title="Upload queue depth" data-testid="statusbar-queue">
              ⬆ {queueCount}
            </span>
          </>
        ) : null}
      </div>

      <div className="sb-center">
        {loading ? (
          <span className="op loading" aria-label="Loading">Loading…</span>
        ) : opStatus ? (
          <span className="op" aria-label="Operation status">{opStatus}</span>
        ) : (
          <span className="muted" aria-label="Idle">Idle</span>
        )}
        {traceId ? <span className="trace" title="Last backend trace ID">trace:{short(traceId)}</span> : null}
      </div>

      {/* Right controls: perf + network + Advanced Settings */}
      <div className="sb-right" data-testid="statusbar-perf">
        {/* Existing compact metrics */}
        <span className="mini" title="Page cache size / limit">
          Cache {perf.pageCacheSize}/{perf.pageCacheLimit}
        </span>
        <span className="mini" title="Cache hits / misses">
          H/M {perf.cacheHits}/{perf.cacheMisses}
        </span>
        <span className="mini" title="Prefetches">
          Pref {perf.prefetches}
        </span>
        <span className={`mini ${perf.aborts > 0 ? 'warn' : ''}`} title="Aborted in-flight ops">
          Abort {perf.aborts}
        </span>
        <span className={`mini ${perf.retries > 0 ? 'warn' : ''}`} title="Transient retries">
          Retry {perf.retries}
        </span>

        {mounted ? (
          <>
            <span className={`dot ${online ? 'ok' : 'bad'}`} aria-hidden />
            <span className={`net ${online ? 'ok' : 'bad'}`} aria-label={`Network ${online ? 'online' : 'offline'}`} data-testid="statusbar-net">
              {online ? 'Online' : 'Offline'}
            </span>
            {online && (rtt != null || downlink != null || effectiveType) ? (
              <span className="mini muted" title="Network stats (best-effort)">
                {effectiveType ? effectiveType : ''}{effectiveType && (rtt!=null || downlink!=null) ? ' · ' : ''}
                {rtt != null ? `${rtt}ms` : ''}{rtt != null && downlink != null ? ' · ' : ''}
                {downlink != null ? `${downlink}Mbps` : ''}
              </span>
            ) : null}
          </>
        ) : (
          <>
            <span suppressHydrationWarning className="dot" aria-hidden />
            <span suppressHydrationWarning className="net" aria-label="Network">—</span>
          </>
        )}

        {/* Advanced Settings entry point */}
        <button
          className="sb-adv-btn"
          onClick={() => setSettingsOpen(true)}
          aria-haspopup="dialog"
          aria-controls="settings-dialog"
          title="Open advanced settings"
        >
          Advanced Settings
        </button>
      </div>

      {/* Mount SettingsModal here so it’s globally available */}
      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />

      <div className="sb-right">
        {/* Cache metrics (compact) */}
        <span className="mini" title="Page cache size / limit">
          Cache {perf.pageCacheSize}/{perf.pageCacheLimit}
        </span>
        <span className="mini" title="Cache hits / misses">
          H/M {perf.cacheHits}/{perf.cacheMisses}
        </span>
        <span className="mini" title="Prefetches">
          Pref {perf.prefetches}
        </span>
        <span className={`mini ${perf.aborts > 0 ? 'warn' : ''}`} title="Aborted in-flight ops">
          Abort {perf.aborts}
        </span>
        <span className={`mini ${perf.retries > 0 ? 'warn' : ''}`} title="Transient retries">
          Retry {perf.retries}
        </span>

        {/* Network (hydration-safe: placeholders until mounted) */}
        {mounted ? (
          <>
            <span className={`dot ${online ? 'ok' : 'bad'}`} aria-hidden />
            <span className={`net ${online ? 'ok' : 'bad'}`} aria-label={`Network ${online ? 'online' : 'offline'}`} data-testid="statusbar-net">
              {online ? 'Online' : 'Offline'}
            </span>
            {online && (rtt != null || downlink != null || effectiveType) ? (
              <span className="mini muted" title="Network stats (best-effort)">
                {effectiveType ? effectiveType : ''}{effectiveType && (rtt!=null || downlink!=null) ? ' · ' : ''}
                {rtt != null ? `${rtt}ms` : ''}{rtt != null && downlink != null ? ' · ' : ''}
                {downlink != null ? `${downlink}Mbps` : ''}
              </span>
            ) : null}
          </>
        ) : (
          <>
            <span suppressHydrationWarning className="dot" aria-hidden />
            <span suppressHydrationWarning className="net" aria-label="Network">—</span>
          </>
        )}
      </div>

      <style jsx>{`
        .fm-statusbar {
          position: sticky;
          bottom: 0;
          left: 0; right: 0;
          height: 34px;
          display: grid;
          grid-template-columns: 1fr auto 1fr;
          align-items: center;
          padding: 0 12px;
          background: #ffffff;
          border-top: 1px solid #e5e7eb;
          color: #374151;
          font-size: 13px;
          z-index: 5;
        }
        .sb-left, .sb-right {
          display: flex; align-items: center; gap: 8px;
        }
        .sb-right { justify-content: flex-end; flex-wrap: wrap; }
        .sb-center { justify-self: center; display: flex; align-items: center; gap: 10px; }

        .sb-adv-btn {
          height: 24px;
          padding: 0 10px;
          border-radius: 8px;
          border: 1px solid #e2e8f0;
          background: #f8fafc;
          color: #334155;
          font-size: 12px;
          cursor: pointer;
        }
        .sb-adv-btn:hover {
          background: #f1f5f9;
          border-color: #cbd5e1;
        }
        .tag {
          background: #f3f4f6; border: 1px solid #e5e7eb; border-radius: 12px;
          padding: 2px 8px; font-size: 12px; color: #374151;
        }
        .tag.warn { background: #fff7ed; border-color: #fed7aa; color: #9a3412; }
        .sep { color: #9ca3af; }
        .op { color: #374151; }
        .op.loading { color: #2563eb; }
        .muted { color: #9ca3af; }
        .trace {
          color: #6b7280; font-family: ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono","Courier New",monospace;
          background: #f9fafb; border: 1px dashed #e5e7eb; border-radius: 6px; padding: 2px 6px;
        }
        .mini {
          font-size: 11px; color: #475569; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 1px 6px;
        }
        .mini.warn { color: #9a3412; background: #fff7ed; border-color: #fed7aa; }
        .mini.muted { color: #64748b; background: #f8fafc; border-color: #e2e8f0; }
        .dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
        .dot.ok { background: #16a34a; }
        .dot.bad { background: #dc2626; }
        .net.ok { color: #16a34a; }
        .net.bad { color: #dc2626; }

        .sb-adv-btn {
          border-color: #1e293b;
          background: #0f172a;
          color: #cbd5e1;
        }
        .sb-adv-btn:hover {
          background: #0b1220;
          border-color: #334155;
        }

        @media (prefers-color-scheme: dark) {
          .fm-statusbar { background: #0b1220; border-top-color: rgba(148,163,184,0.18); color: #cbd5e1; }
          .tag { background: #0f172a; border-color: #1e293b; color: #cbd5e1; }
          .tag.warn { background: #251a10; border-color: #573616; color: #f59e0b; }
          .sep { color: #94a3b8; }
          .op { color: #cbd5e1; }
          .op.loading { color: #60a5fa; }
          .muted { color: #94a3b8; }
          .trace { background: rgba(148,163,184,0.08); border-color: rgba(148,163,184,0.18); color: #a3b2c7; }
          .mini { color: #a3b2c7; background: #0f172a; border-color: #1e293b; }
          .mini.warn { color: #f59e0b; background: #251a10; border-color: #573616; }
          .mini.muted { color: #94a3b8; background: #0f172a; border-color: #1e293b; }
        }

        @media (max-width: 768px) {
          .sb-center { display: none; }
          .fm-statusbar { grid-template-columns: 1fr 1fr; }
        }
      `}</style>
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
