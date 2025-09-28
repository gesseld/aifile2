/* eslint-env browser */
/* eslint-disable semi, no-undef */
'use client'

import React from 'react'

type NetInfo = {
  effectiveType?: string
  downlink?: number
  rtt?: number
}

type QueueInfo = {
  uploading?: number
  queued?: number
  errors?: number
}

type PerfInfo = {
  lcp?: number
  cls?: number
  ttfb?: number
}

declare global {
  interface Navigator {
    connection?: {
      effectiveType?: string
      downlink?: number
      rtt?: number
      addEventListener?: (type: 'change', cb: () => void) => void
      removeEventListener?: (type: 'change', cb: () => void) => void
      onchange?: () => void
    }
  }

  interface WindowEventMap {
    'afm:state': CustomEvent<Partial<QueueInfo>>
    'afm:perf': CustomEvent<Partial<PerfInfo>>
  }
}

/**
 * StatusBar: Tailwind-only visual implementation
 * - 3 columns: left (online/offline + perf), center (upload queue), right (network info)
 * - Stable test ids: statusbar, statusbar-queue, statusbar-net
 * - Listens to:
 *    - online/offline
 *    - navigator.connection (effectiveType, downlink, rtt)
 *    - Custom events: afm:state, afm:perf
 */
export default function StatusBar() {
  const [online, setOnline] = React.useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  )
  const [net, setNet] = React.useState<NetInfo>({})
  const [queue, setQueue] = React.useState<QueueInfo>({
    uploading: 0,
    queued: 0,
    errors: 0,
  })
  const [perf, setPerf] = React.useState<PerfInfo>({})

  // Online/offline handlers
  React.useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])

  // Network Information API
  React.useEffect(() => {
    const conn = navigator.connection
    const read = () => {
      setNet({
        effectiveType: conn?.effectiveType,
        downlink: conn?.downlink,
        rtt: conn?.rtt,
      })
    }
    read()
    if (conn?.addEventListener) {
      conn.addEventListener('change', read)
      return () => conn.removeEventListener?.('change', read)
    }
    if (conn) {
      const prev = conn.onchange
      conn.onchange = () => {
        prev?.()
        read()
      }
      return () => {
        // best-effort reset
        if (conn.onchange === null) return
        conn.onchange = null as unknown as () => void
      }
    }
  }, [])

  // Custom events: afm:state (queue), afm:perf (performance)
  React.useEffect(() => {
    const onState = (e: Event) => {
      const ev = e as CustomEvent<Partial<QueueInfo>>
      setQueue((q) => ({ ...q, ...ev.detail }))
    }
    const onPerf = (e: Event) => {
      const ev = e as CustomEvent<Partial<PerfInfo>>
      setPerf((p) => ({ ...p, ...ev.detail }))
    }
    window.addEventListener('afm:state', onState as EventListener)
    window.addEventListener('afm:perf', onPerf as EventListener)
    return () => {
      window.removeEventListener('afm:state', onState as EventListener)
      window.removeEventListener('afm:perf', onPerf as EventListener)
    }
  }, [])

  const onlineBadge = online ? (
    <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-[var(--accent)]/60 border border-[var(--border)] text-[var(--foreground)]">
      <span className="inline-block h-2 w-2 rounded-full bg-green-500" /> Online
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-[var(--accent)]/60 border border-[var(--border)] text-[var(--foreground)]">
      <span className="inline-block h-2 w-2 rounded-full bg-red-500" /> Offline
    </span>
  )

  return (
    <div
      className="sticky bottom-0 inset-x-0 border-t border-[var(--border)] bg-[var(--surface)]/95 backdrop-blur supports-[backdrop-filter]:bg-[var(--surface)]/80"
      data-testid="statusbar"
      role="status"
      aria-live="polite"
    >
      <div className="mx-auto max-w-full px-3 py-2 grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs text-[var(--muted-foreground)]">
        {/* Left: connectivity + perf snippets */}
        <div className="flex items-center gap-3 min-w-0">
          {onlineBadge}
          {typeof perf.lcp === 'number' ? (
            <span className="hidden sm:inline text-[var(--muted-foreground)]">
              LCP {perf.lcp.toFixed(2)}s
            </span>
          ) : null}
          {typeof perf.cls === 'number' ? (
            <span className="hidden sm:inline text-[var(--muted-foreground)]">
              CLS {perf.cls.toFixed(3)}
            </span>
          ) : null}
        </div>

        {/* Center: upload queue */}
        <div
          className="flex items-center justify-center sm:justify-center"
          data-testid="statusbar-queue"
          aria-label="Upload queue"
        >
          <div className="inline-flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1">
            <span className="text-[var(--muted-foreground)]">Queue</span>
            <span className="text-[var(--foreground)]">
              Uploading: {queue.uploading ?? 0}
            </span>
            <span className="text-[var(--foreground)]">
              Queued: {queue.queued ?? 0}
            </span>
            {queue.errors ? (
              <span className="text-red-500">Errors: {queue.errors}</span>
            ) : null}
          </div>
        </div>

        {/* Right: network info */}
        <div
          className="flex items-center justify-end gap-3"
          data-testid="statusbar-net"
          aria-label="Network information"
        >
          {net.effectiveType ? (
            <span className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-[var(--foreground)]">
              {net.effectiveType}
            </span>
          ) : (
            <span className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-[var(--muted-foreground)]">
              net
            </span>
          )}
          {typeof net.downlink === 'number' ? (
            <span className="hidden sm:inline text-[var(--muted-foreground)]">
              ↓ {net.downlink.toFixed(1)} Mbps
            </span>
          ) : null}
          {typeof net.rtt === 'number' ? (
            <span className="hidden sm:inline text-[var(--muted-foreground)]">
              rtt {Math.round(net.rtt)} ms
            </span>
          ) : null}
        </div>
      </div>
    </div>
  )
}
