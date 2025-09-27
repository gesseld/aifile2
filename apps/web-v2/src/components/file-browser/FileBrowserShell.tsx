'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import AutoSizer from 'react-virtualized-auto-sizer'
// Use namespace import to avoid TS type export resolution issues with react-window
import * as ReactWindow from 'react-window'

import BucketAdminPanel from '@/components/file-browser/BucketAdminPanel'
import DestinationPicker from '@/components/file-browser/DestinationPicker'
import FolderOperations from '@/components/file-browser/FolderOperations'
import LeftTree from '@/components/file-browser/LeftTree'
import MetadataPanel from '@/components/file-browser/MetadataPanel'
import ObjectExplorer, {
  type ListParams as OEListParams,
  type ListResult as OEListResult,
} from '@/components/file-browser/ObjectExplorer'
import ShareLinkModal from '@/components/file-browser/ShareLinkModal'
import TaskDrawer from '@/components/file-browser/TaskDrawer'
import UploadManager from '@/components/file-browser/UploadManager'
import VersionsPanel from '@/components/file-browser/VersionsPanel'
import ViewerPane from '@/components/file-browser/ViewerPane'
import DevCanvasInfo from '@/components/DevCanvasInfo'
import { SettingsPanel } from '@/components/settings/SettingsPanel'
import ErrorBanner from '@/components/ui/ErrorBanner'
import Skeleton from '@/components/ui/Skeleton'
import { track } from '@/lib/analytics'
import {
  BucketsClient,
  type FileMeta,
  FilesClient,
  ObjectsClient,
} from '@/lib/file-manager-client'
import FolderService from '@/lib/folder-service'
const RW: any = ReactWindow as any
// Defensive extraction to avoid "Element type is invalid" when module interop differs
const isFn = (v: any) => typeof v === 'function'
const maybeList = RW && (RW.FixedSizeList || (RW as any).FixedSizeListComponent)
const maybeGrid = RW && (RW.FixedSizeGrid || (RW as any).FixedSizeGridComponent)
const FixedSizeList = isFn(maybeList)
  ? (maybeList as React.ComponentType<any>)
  : undefined
const FixedSizeGrid = isFn(maybeGrid)
  ? (maybeGrid as React.ComponentType<any>)
  : undefined

if (typeof window !== 'undefined') {
  if (!FixedSizeList)
    console.warn(
      '[FileBrowserShell] react-window FixedSizeList unavailable; falling back to non-virtualized list'
    )
  if (!FixedSizeGrid)
    console.warn(
      '[FileBrowserShell] react-window FixedSizeGrid unavailable; grid view will fall back'
    )
}
// Context menu system + registry
import AdvancedOpsPanel from '@/components/file-browser/AdvancedOpsPanel'
import BatchOperationsPanel from '@/components/file-browser/BatchOperationsPanel'
import CtxMenu from '@/components/file-browser/ContextMenu'
import DragDropZone from '@/components/file-browser/DragDropZone'
import FileDetailsPanel from '@/components/file-browser/FileDetailsPanel'
import PreviewPanel from '@/components/file-browser/PreviewPanel'
import StatusBar from '@/components/file-browser/StatusBar'
import UnifiedActionBar from '@/components/file-browser/UnifiedActionBar'
import PresenceBar from '@/components/file-browser/PresenceBar'
import FileTypeIcon from '@/components/file-browser/FileTypeIcon'
import UploadProgressPanel from '@/components/file-browser/UploadProgressPanel'
import type { SearchFilters } from '@/components/SearchBar'
import SearchBar from '@/components/SearchBar'
import FooterAdvancedSettings from '@/components/FooterAdvancedSettings'
import {
  getActionsForContext,
  getUserPermissions,
  getUserRole,
  type UserRole,
} from '@/lib/action-registry'
import {
  buildOperationsFromSelection,
  type OperationResult,
  runBatchOperations,
} from '@/lib/batch-engine'
import { FilesCache } from '@/lib/cache/files-cache'
import { useSearch, useSelection } from '@/lib/file-manager-store'
import operationHistory from '@/lib/operation-history'
import { UploadQueue } from '@/lib/upload-queue'
/**
 * Initial skeleton of a File Browser shell with:
 * - LeftTree (bucket list + prefix input)
 * - Toolbar (refresh, load more, delete)
 * - ObjectGrid (virtualizable later; basic grid now)
 *
 * Notes:
 * - Minimal state management kept local for skeleton. Will migrate to SWR/RTK Query.
 * - UploadManager, ContextMenu, DnD, hotkeys to be added in subsequent steps.
 * - Range streaming/preview and versions panel are not included in this skeleton.
 */

type BucketItem = { name: string }

// Shared view mode type for consistency across components
type ViewMode = 'grid' | 'list' | 'details' | 'timeline'

// Hierarchical browser entry: folders-first navigation
type BrowserEntry =
  | { kind: 'folder'; name: string; prefix: string }
  | { kind: 'file'; file: FileMeta }

export type FileBrowserShellProps = {
  defaultBucket?: string
  defaultPrefix?: string
  hideHeader?: boolean
}

export function FileBrowserShell(props: FileBrowserShellProps) {
  const router = useRouter()
  const [buckets, setBuckets] = useState<BucketItem[]>([])
  const [activeBucket, setActiveBucket] = useState<string | undefined>(
    props.defaultBucket
  )
  const [prefix, setPrefix] = useState(props.defaultPrefix ?? '')
  const [files, setFiles] = useState<FileMeta[]>([])
  const [cursor, setCursor] = useState<string | undefined>(undefined)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)
  const [reloadTick, setReloadTick] = useState(0)
  const [bucketsReloadTick, setBucketsReloadTick] = useState(0)
  // Infinite scroll control to avoid duplicate loads
  const [autoLoading, setAutoLoading] = useState<boolean>(false)
  // Accessibility: live announcements for SR users
  const [srMessage, setSrMessage] = useState<string>('')
  const liveRef = useRef<HTMLDivElement | null>(null)
  const centerRef = useRef<HTMLDivElement | null>(null)
  // StorageQuota: type/category filter clicked from LeftTree usage chips
  const [categoryFilter, setCategoryFilter] = useState<
    'document' | 'image' | 'video' | 'audio' | 'archive' | 'other' | undefined
  >(undefined)
  // Toolbar: view mode, sort, and local text filter
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    try {
      const v = localStorage.getItem('fbs_viewMode')
      if (v === 'grid' || v === 'list' || v === 'details' || v === 'timeline')
        return v as ViewMode
    } catch {}
    return 'grid'
  })
  const [sortBy, setSortBy] = useState<'name' | 'size' | 'updated'>(() => {
    try {
      const v = localStorage.getItem('fbs_sortBy')
      if (v === 'name' || v === 'size' || v === 'updated') return v
    } catch {}
    return 'name'
  })
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>(() => {
    try {
      const v = localStorage.getItem('fbs_sortOrder')
      if (v === 'asc' || v === 'desc') return v
    } catch {}
    return 'asc'
  })
  // Secondary sort (multi-criteria)
  const [sortBy2, setSortBy2] = useState<
    'name' | 'size' | 'updated' | undefined
  >(() => {
    try {
      const v = localStorage.getItem('fbs_sortBy2')
      if (v === 'name' || v === 'size' || v === 'updated') return v
    } catch {}
    return undefined
  })
  const [sortOrder2, setSortOrder2] = useState<'asc' | 'desc'>(() => {
    try {
      const v = localStorage.getItem('fbs_sortOrder2')
      if (v === 'asc' || v === 'desc') return v
    } catch {}
    return 'asc'
  })
  const [searchText, setSearchText] = useState<string>('')
  const { selection, replace } = useSelection()
  const {
    search,
    setQuery: setSearchQuery,
    setFilters: setSearchFilters,
    setMode: setSearchMode,
  } = useSearch()
  const selected: Set<string> = selection.ids as Set<string>
  const setSelected = useCallback(
    (next: Set<string>) => replace(Array.from(next)),
    [replace]
  )
  // Persistable selection key (bucket/prefix scoped)
  const selectionScopeKey = useMemo(() => {
    const b = activeBucket || ''
    const p = (prefix || '').replace(/^\/+|\/+$/g, '')
    return `fbs_sel:${b}/${p}`
  }, [activeBucket, prefix])
  // Bulk operation status (for StatusBar)
  const [bulkStatus, setBulkStatus] = useState<string | undefined>(undefined)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [adminPanelOpen, setAdminPanelOpen] = useState(false)
  const [tasksOpen, setTasksOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  // Folder operations modal
  const [folderOpsOpen, setFolderOpsOpen] = useState(false)
  // Keyboard help modal
  const [helpOpen, setHelpOpen] = useState(false)
  // Conflict resolution dialog state
  type ConflictChoice = 'skip' | 'overwrite' | 'keep-both' | 'rename'
  type ConflictItem = {
    id: string
    baseName: string
    destBucket: string
    destKey: string
    choice: ConflictChoice
    renameTo?: string
  }
  const [conflictOpen, setConflictOpen] = useState(false)
  const [conflictItems, setConflictItems] = useState<ConflictItem[]>([])
  const [conflictApplyAll, setConflictApplyAll] = useState<{
    choice: ConflictChoice
    renameTo?: string
  } | null>(null)
  const pendingOpsRef = useRef<ReturnType<
    typeof buildOperationsFromSelection
  > | null>(null)
  const pendingModeRef = useRef<'copy' | 'move'>('copy')
  // Create Bucket modal
  const [createBucketOpen, setCreateBucketOpen] = useState(false)
  const [newBucketName, setNewBucketName] = useState('')

  // Shortcut labels for discovery UI
  const shortcutLabels: Record<string, string> = {
    refresh: 'Refresh',
    openUploads: 'Open uploads',
    newFolder: 'New folder',
    copy: 'Copy',
    move: 'Move',
    rename: 'Rename',
    delete: 'Delete',
    share: 'Share/Copy link',
  }
  // Load custom shortcuts from localStorage for help modal (no dependency on SettingsProvider in tests)
  const customShortcuts = React.useMemo(() => {
    try {
      const raw =
        typeof window !== 'undefined'
          ? localStorage.getItem('afm.settings.shortcuts')
          : null
      const obj = raw ? JSON.parse(raw) : null
      return obj && typeof obj === 'object'
        ? (obj as Record<string, string>)
        : null
    } catch {
      return null
    }
  }, [helpOpen, reloadTick])

  // Guards for context-aware keyboard handling
  const isTypingTarget = () => {
    try {
      const active = (document.activeElement as HTMLElement) || null
      const tag = active?.tagName?.toLowerCase()
      if (tag === 'input' || tag === 'textarea') return true
      if ((active as any)?.isContentEditable) return true
    } catch {}
    return false
  }
  const isModalOpen = () => {
    try {
      return !!document.querySelector('[aria-modal="true"]')
    } catch {
      return false
    }
  }

  // Navigation intent and URL sync guards
  const navByUserRef = useRef(false) // true when change should push() history
  const suppressSyncRef = useRef(false) // true when applying URL->state (popstate) to avoid loops

  // Inline Rename & Quick Edit state
  const [editId, setEditId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState<string>('')
  const [editSaving, setEditSaving] = useState<boolean>(false)
  const [editError, setEditError] = useState<string | null>(null)
  // Hierarchy: show folders first (immediate children) vs flat listing
  const [groupFolders, setGroupFolders] = useState<boolean>(false)
  // Live Search + Filter Ribbon
  const [showFilters, setShowFilters] = useState<boolean>(false)
  const [liveFilters, setLiveFilters] = useState<SearchFilters | undefined>(
    undefined
  )
  // Track whether initial selection restoration has completed
  const [initialRestorationComplete, setInitialRestorationComplete] =
    useState(false)

  // Persist Folders On/Off preference
  useEffect(() => {
    try {
      const raw =
        typeof window !== 'undefined'
          ? localStorage.getItem('fm_groupFolders')
          : null
      if (raw != null) setGroupFolders(raw === '1')
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    try {
      if (typeof window !== 'undefined')
        localStorage.setItem('fm_groupFolders', groupFolders ? '1' : '0')
    } catch {}
  }, [groupFolders])

  // Persist view and sort preferences
  useEffect(() => {
    try {
      localStorage.setItem('fbs_viewMode', viewMode)
    } catch {}
  }, [viewMode])
  useEffect(() => {
    try {
      localStorage.setItem('fbs_sortBy', sortBy)
    } catch {}
  }, [sortBy])
  useEffect(() => {
    try {
      localStorage.setItem('fbs_sortOrder', sortOrder)
    } catch {}
  }, [sortOrder])
  useEffect(() => {
    try {
      if (sortBy2) localStorage.setItem('fbs_sortBy2', sortBy2)
      else localStorage.removeItem('fbs_sortBy2')
    } catch {}
  }, [sortBy2])
  useEffect(() => {
    try {
      localStorage.setItem('fbs_sortOrder2', sortOrder2)
    } catch {}
  }, [sortOrder2])

  // Currently selected file (single-selection) for the details/preview panel
  const selectedFile = useMemo(() => {
    if (selected.size !== 1) return null
    const id = Array.from(selected)[0]
    return files.find((f) => f.id === id) || null
  }, [selected, files])

  // Right panel tab: preview, details, bulk (auto when multi-select), or uploads
  const [rightTab, setRightTab] = useState<
    'preview' | 'details' | 'bulk' | 'uploads'
  >('details')
  const rightHeadingRef = useRef<HTMLSpanElement | null>(null)
  useEffect(() => {
    if (selected.size > 1) {
      setRightTab('bulk')
    } else if (selected.size === 1) {
      // Default to preview when a single item is selected
      setRightTab((t) => (t === 'bulk' ? 'preview' : t))
    } else if (rightTab !== 'uploads') {
      setRightTab('details')
    }
  }, [selected.size]) // keep uploads sticky across selection changes

  // NOTE: Preview navigation handlers moved below displayEntries definition to avoid TDZ issues.

  // Three-panel layout state (persisted)
  // Initialize with SSR-stable defaults; load persisted values after mount
  const [leftWidth, setLeftWidth] = useState<number>(240)
  // Initialize with SSR-stable defaults; load persisted values after mount
  const [rightWidth, setRightWidth] = useState<number>(360)
  const [leftCollapsed, setLeftCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('fbs_leftCollapsed') === '1'
    } catch {
      return false
    }
  })
  const [rightCollapsed, setRightCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('fbs_rightCollapsed') === '1'
    } catch {
      return false
    }
  })
  const dragRef = useRef<{
    type: 'left' | 'right'
    startX: number
    startLeft: number
    startRight: number
  } | null>(null)

  // Mounted guard to avoid hydration mismatches for widths
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    setMounted(true)
  }, [])

  // After mount, load persisted widths from localStorage
  useEffect(() => {
    if (!mounted) return
    try {
      const v = localStorage.getItem('fbs_leftWidth')
      if (v) setLeftWidth(Math.max(160, Math.min(560, parseInt(v))))
    } catch {}
    try {
      const v2 = localStorage.getItem('fbs_rightWidth')
      if (v2) setRightWidth(Math.max(220, Math.min(640, parseInt(v2))))
    } catch {}
  }, [mounted])

  // Responsive breakpoints
  const [isMobile, setIsMobile] = useState(false) // < 768px
  const [isTablet, setIsTablet] = useState(false) // 768px - 1024px
  useEffect(() => {
    if (typeof window === 'undefined') return
    let rafId: number | null = null
    const recomputeNow = () => {
      const w = window.innerWidth
      setIsMobile(w < 768)
      setIsTablet(w >= 768 && w < 1024)
    }
    const onResize = () => {
      if (rafId != null) cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(recomputeNow)
    }
    recomputeNow()
    window.addEventListener('resize', onResize, { passive: true })
    return () => {
      if (rafId != null) cancelAnimationFrame(rafId)
      window.removeEventListener('resize', onResize as any)
    }
  }, [])

  // Adaptive side panels based on device size (auto-collapse rules)
  useEffect(() => {
    // Mobile: default collapse both; open right on single selection (handled below)
    if (isMobile) {
      setLeftCollapsed(true)
      setRightCollapsed(true)
    } else if (isTablet) {
      // Tablet: collapse right panel by default, keep left visible
      setLeftCollapsed(false)
      setRightCollapsed(true)
    } else {
      // Desktop: restore from persisted or defaults
      try {
        const lc = localStorage.getItem('fbs_leftCollapsed') === '1'
        const rc = localStorage.getItem('fbs_rightCollapsed') === '1'
        setLeftCollapsed(lc)
        setRightCollapsed(rc)
      } catch {
        /* noop */
      }
    }
  }, [isMobile, isTablet])

  // Auto-open right panel when exactly one file is selected on mobile/tablet
  useEffect(() => {
    if ((isMobile || isTablet) && selected.size === 1) {
      setRightCollapsed(false)
    }
  }, [selected.size, isMobile, isTablet])

  // Persist layout state
  useEffect(() => {
    try {
      localStorage.setItem('fbs_leftWidth', String(Math.round(leftWidth)))
    } catch {}
  }, [leftWidth])
  useEffect(() => {
    try {
      localStorage.setItem('fbs_rightWidth', String(Math.round(rightWidth)))
    } catch {}
  }, [rightWidth])
  useEffect(() => {
    try {
      localStorage.setItem('fbs_leftCollapsed', leftCollapsed ? '1' : '0')
    } catch {}
  }, [leftCollapsed])
  useEffect(() => {
    try {
      localStorage.setItem('fbs_rightCollapsed', rightCollapsed ? '1' : '0')
    } catch {}
  }, [rightCollapsed])

  // Keyboard shortcuts for adaptive panels: Alt+1 toggle left, Alt+2 focus center, Alt+3 toggle right
  useEffect(() => {
    async function onKey(e: KeyboardEvent) {
      // Context-aware guard
      if (isTypingTarget() || isModalOpen()) return

      const alt = e.altKey === true

      // Open keyboard help
      if (e.key === '?' || ((e.ctrlKey || e.metaKey) && e.key === '/')) {
        e.preventDefault()
        setHelpOpen(true)
        return
      }

      if (alt && e.key === '1') {
        e.preventDefault()
        setLeftCollapsed((v) => !v)
        return
      }
      if (alt && e.key === '2') {
        e.preventDefault()
        try {
          const el = document.querySelector(
            '.panel.center'
          ) as HTMLElement | null
          el?.focus?.()
        } catch {}
        return
      }
      if (alt && e.key === '3') {
        e.preventDefault()
        setRightCollapsed((v) => !v)
        return
      }
      // Navigation shortcuts
      if (alt && (e.key === 'ArrowUp' || e.key === 'ArrowLeft')) {
        // Up one folder level
        e.preventDefault()
        const norm = (prefix || '').replace(/^\/+|\/+$/g, '')
        const parts = norm.split('/').filter(Boolean)
        parts.pop()
        const parent = parts.length ? parts.join('/') + '/' : ''
        navByUserRef.current = true
        setPrefix(parent)
        return
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'l') {
        // Focus path/prefix input (quick-jump)
        e.preventDefault()
        const input = document.querySelector(
          '.path-input, .lt-prefix-input'
        ) as HTMLInputElement | null
        input?.focus?.()
        input?.select?.()
        return
      }
      if (alt && (e.key === 'b' || e.key === 'B')) {
        // Quick open: Create Bucket modal
        e.preventDefault()
        try {
          setNewBucketName('')
          setCreateBucketOpen(true)
        } catch {}
        return
      }
      // Undo last reversible operation (move/rename)
      if (
        (e.ctrlKey || e.metaKey) &&
        !e.shiftKey &&
        e.key.toLowerCase() === 'z'
      ) {
        e.preventDefault()
        try {
          setBulkStatus('Undoing last operation…')
          const res = await operationHistory.undoLast()
          if (!res.ok) alert(res.error || 'Nothing to undo')
          else
            try {
              window.dispatchEvent(
                new CustomEvent('afm:action', { detail: { action: 'refresh' } })
              )
            } catch {}
        } finally {
          setTimeout(() => setBulkStatus(undefined), 1500)
        }
        return
      }
      // Redo last undone operation (Ctrl+Shift+Z / Cmd+Shift+Z)
      if (
        (e.ctrlKey || e.metaKey) &&
        e.shiftKey &&
        e.key.toLowerCase() === 'z'
      ) {
        e.preventDefault()
        try {
          setBulkStatus('Redoing last operation…')
          const res = await operationHistory.redoNext()
          if (!res.ok) alert(res.error || 'Nothing to redo')
          else
            try {
              window.dispatchEvent(
                new CustomEvent('afm:action', { detail: { action: 'refresh' } })
              )
            } catch {}
        } finally {
          setTimeout(() => setBulkStatus(undefined), 1500)
        }
        return
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [prefix])

  // Destination picker for copy/move
  const [destPickerOpen, setDestPickerOpen] = useState(false)
  const [destMode, setDestMode] = useState<'copy' | 'move'>('copy')

  // Blank-area (center content) context menu state
  const [blankCtxOpen, setBlankCtxOpen] = useState(false)
  const [blankCtxX, setBlankCtxX] = useState(0)
  const [blankCtxY, setBlankCtxY] = useState(0)

  // Items computed later once dependencies are declared to avoid TDZ issues
  const [blankMenuItems, setBlankMenuItems] = useState<any[]>([])

// One-step-ahead page prefetch cache (bucket:prefix:cursor -> page)
// Declarations placed here so all downstream effects/handlers can reference them.
type CachedListPage = {
  folders: { key: string; name: string }[]
  objects: { key: string; name: string; size: number; lastModified: string }[]
  nextContinuationToken?: string
  total?: number
}
const pageCacheRef = React.useRef<Map<string, CachedListPage>>(new Map())

// Performance & caching budgets/metrics
const PAGE_CACHE_LIMIT_DEFAULT = 80
const pageCacheLimitRef = React.useRef<number>(PAGE_CACHE_LIMIT_DEFAULT)
const perfMetricsRef = React.useRef({
  cacheHits: 0,
  cacheMisses: 0,
  prefetches: 0,
  aborts: 0,
  retries: 0,
})
function emitPerfMetrics() {
  const snapshot = {
    ...perfMetricsRef.current,
    pageCacheSize: pageCacheRef.current.size,
    pageCacheLimit: pageCacheLimitRef.current,
  }
  try {
    window.dispatchEvent(
      new CustomEvent('afm:perf', {
        detail: snapshot,
      })
    )
  } catch {}
  // Consent-gated analytics (no-op when consent not granted)
  try {
    track('perf.metrics', snapshot as any)
  } catch {}
}

const cacheKey = (
  bucket?: string,
  basePrefix?: string,
  cursor?: string | null | undefined
) => {
  const b = bucket || ''
  const p = (basePrefix || '').replace(/^\/+|\/+$/g, '')
  const c = cursor || ''
  return `${b}::${p}::${c}`
}

// Enforce a simple FIFO budget for the page cache to avoid unbounded growth
function ensureCacheBudget(limit = pageCacheLimitRef.current) {
  try {
    const m = pageCacheRef.current
    while (m.size > limit) {
      const first = m.keys().next()
      if (!first.done) m.delete(first.value)
      else break
    }
    emitPerfMetrics()
  } catch {}
}
  // One-step-ahead page prefetch cache (bucket:prefix:cursor -> page)
  // (deduped) declarations moved above

  // Abort controller for in-flight listing requests to avoid work on rapid scroll/jumps
  const listAbortRef = useRef<AbortController | null>(null)
  
  // Initialize cache budget from localStorage (browser-only)
  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        const raw = localStorage.getItem('afm.PAGE_CACHE_LIMIT')
        if (raw) {
          const n = parseInt(raw)
          if (Number.isFinite(n)) {
            pageCacheLimitRef.current = Math.max(20, Math.min(200, n))
          }
        }
      }
    } catch {}
    emitPerfMetrics()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // React to dynamic page cache limit changes from Settings (dev/perf tab)
  useEffect(() => {
    function onLimit(e: Event) {
      try {
        const limit = Number((e as CustomEvent)?.detail?.limit)
        if (Number.isFinite(limit)) {
          pageCacheLimitRef.current = Math.max(20, Math.min(200, limit))
          // Enforce immediately and emit metrics so StatusBar/DevPerfPanel reflect it
          ensureCacheBudget()
          emitPerfMetrics()
          try {
            track('perf.pageCacheLimit.changed', { limit: pageCacheLimitRef.current })
          } catch {}
        }
      } catch {}
    }
    window.addEventListener('afm:pageCacheLimit', onLimit as any)
    return () => window.removeEventListener('afm:pageCacheLimit', onLimit as any)
  }, [])

  // Exponential backoff for transient listing failures
  const backoffAttemptRef = useRef(0)
  const backoffTimerRef = useRef<number | null>(null)

  function isTransientError(e: any): boolean {
    try {
      const msg = String(e?.message || e || '').toLowerCase()
      // Treat network/offline/timeouts and 5xx-ish hints as transient
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return true
      if (msg.includes('network') || msg.includes('timeout') || msg.includes('timed out')) return true
      if (msg.includes('503') || msg.includes('502') || msg.includes('500') || msg.includes('bad gateway') || msg.includes('service unavailable')) return true
    } catch {}
    return false
  }

  function scheduleAutoRetry(reason?: string) {
    try {
      if (backoffTimerRef.current != null) {
        window.clearTimeout(backoffTimerRef.current)
        backoffTimerRef.current = null
      }
      const attempt = backoffAttemptRef.current
      if (attempt >= 4) return // cap retries
      const delay = Math.min(15000, 1000 * Math.pow(2, attempt)) // 1s,2s,4s,8s,15s
      setBulkStatus(`Recovering from error${reason ? `: ${reason}` : ''}. Retrying in ${Math.round(delay / 1000)}s…`)
      backoffTimerRef.current = window.setTimeout(() => {
        backoffTimerRef.current = null
        backoffAttemptRef.current = attempt + 1
        void loadFiles(true)
      }, delay)
    } catch {}
  }

  // Clear caches and abort in-flight when navigation context changes
  useEffect(() => {
    try {
      pageCacheRef.current.clear()
      listAbortRef.current?.abort()
      listAbortRef.current = null
      // Clear pending auto-retry on navigation context change
      if (backoffTimerRef.current != null) {
        window.clearTimeout(backoffTimerRef.current)
        backoffTimerRef.current = null
      }
      backoffAttemptRef.current = 0
    } catch {}
  }, [activeBucket, prefix])

  // One-step-ahead page prefetch cache for ObjectExplorer.listApi (keyed by bucket:prefix:cursor)
  // (deduped) declarations moved above

  // Clear cache when navigation context changes
  useEffect(() => {
    try {
      pageCacheRef.current.clear()
    } catch {}
  }, [activeBucket, prefix])

  // Share modal
  const [shareOpen, setShareOpen] = useState(false)
  const [shareFile, setShareFile] = useState<FileMeta | null>(null)

  // Viewer and versions
  const [viewerOpen, setViewerOpen] = useState(false)
  const [viewerFile, setViewerFile] = useState<FileMeta | null>(null)
  const [versionsOpen, setVersionsOpen] = useState(false)
  const [versionsFile, setVersionsFile] = useState<FileMeta | null>(null)

  // Metadata
  const [metadataOpen, setMetadataOpen] = useState(false)
  const [metadataFile, setMetadataFile] = useState<FileMeta | null>(null)

  // Buckets
  useEffect(() => {
    let mounted = true
    let attempts = 0
    const maxAttempts = 5
    const loadBuckets = async () => {
      try {
        const res = await BucketsClient.list()
        if (!mounted) return
        const raw = (res as any)?.buckets ?? []
        const items = (Array.isArray(raw) ? raw : []).map((n: any) =>
          typeof n === 'string' ? { name: n } : { name: n?.name ?? String(n) }
        )
        setBuckets(items)
        if (!activeBucket && items.length > 0) {
          setActiveBucket(items[0].name)
        }
        // If still empty, retry a few times to allow dev/fake backends to warm up
        if (mounted && items.length === 0 && attempts < maxAttempts) {
          attempts += 1
          setTimeout(loadBuckets, 750)
        }
      } catch (e: any) {
        console.error('Failed to list buckets', e)
        setError(e?.message || 'Failed to list buckets')
        // Retry on transient errors
        if (mounted && attempts < maxAttempts) {
          attempts += 1
          setTimeout(loadBuckets, 750)
        }
      }
    }
    void loadBuckets()
    return () => {
      mounted = false
    }
  }, [bucketsReloadTick]) // eslint-disable-line react-hooks/exhaustive-deps

  // Files load
  const loadFiles = useCallback(
    async (reset: boolean = true) => {
      if (!activeBucket) return
      // Cancel any pending auto-retry when a manual load is triggered
      if (backoffTimerRef.current != null) {
        window.clearTimeout(backoffTimerRef.current)
        backoffTimerRef.current = null
      }
      setLoading(true)
      setError(undefined)
  
      // Abort any in-flight list and start a fresh controller
      try {
        if (listAbortRef.current) {
          listAbortRef.current.abort()
          perfMetricsRef.current.aborts += 1
          emitPerfMetrics()
        }
      } catch {}
      const ac = new AbortController()
      listAbortRef.current = ac

      try {
        const page = await FilesClient.list({
          bucket: activeBucket,
          prefix: prefix || '',
          cursor: reset ? undefined : cursor,
          limit: 50,
          category: categoryFilter,
          signal: ac.signal as any,
        })
        // If we got here, request succeeded: reset backoff
        backoffAttemptRef.current = 0
        setCursor(page.next_cursor)
        setFiles((prev) => (reset ? page.items : prev.concat(page.items)))
        // SR announce number of items loaded
        try {
          setSrMessage(
            `Loaded ${page.items?.length ?? 0} item${(page.items?.length ?? 0) === 1 ? '' : 's'}`
          )
        } catch {}
      } catch (e: any) {
        if (e?.name === 'AbortError') {
          // Swallow aborts (navigating/refreshing) without surfacing error
          return
        }
        console.error('Failed to list files', e)
        const msg = e?.message || 'Failed to list files'
        setError(msg)
        if (isTransientError(e)) {
          perfMetricsRef.current.retries += 1
          scheduleAutoRetry(msg)
          emitPerfMetrics()
        } else {
          // Non-transient: clear any backoff and surface in status
          backoffAttemptRef.current = 0
          try {
            setBulkStatus(`Error loading files: ${msg}`)
            setTimeout(() => setBulkStatus(undefined), 3000)
          } catch {}
        }
      } finally {
        setLoading(false)
      }
    },
    [activeBucket, prefix, cursor, categoryFilter]
  )

  useEffect(() => {
    setFiles([])
    setCursor(undefined)
    // Reset restoration flag when bucket/prefix changes to allow restoration in new scope
    setInitialRestorationComplete(false)
    // Don't clear selection here - let the restoration logic handle it
    backoffAttemptRef.current = 0
    void loadFiles(true)
  }, [activeBucket, prefix, categoryFilter, reloadTick]) // eslint-disable-line react-hooks/exhaustive-deps

  // Selection persistence: save current selection under scope key
  useEffect(() => {
    try {
      if (!selectionScopeKey) return
      // Only save after initial restoration has completed to avoid race conditions
      if (!initialRestorationComplete) return
      const ids = Array.from(selected || [])
      localStorage.setItem(selectionScopeKey, JSON.stringify(ids))
    } catch {
      /* ignore storage errors */
    }
  }, [selectionScopeKey, selected, initialRestorationComplete])

  // Selection persistence: restore after files load if current selection is empty
  useEffect(() => {
    try {
      if (!selectionScopeKey) return
      if ((files?.length || 0) === 0) return

      // Skip if we've already completed initial restoration
      if (initialRestorationComplete) return

      const raw = localStorage.getItem(selectionScopeKey)
      if (!raw) {
        // No stored selection to restore, mark restoration as complete
        setInitialRestorationComplete(true)
        return
      }

      let ids: string[] = []
      try {
        ids = JSON.parse(raw)
      } catch {
        // Corrupt or non-JSON value; clear it defensively
        try {
          localStorage.removeItem(selectionScopeKey)
        } catch {}
        setInitialRestorationComplete(true)
        return
      }
      if (!Array.isArray(ids) || ids.length === 0) {
        setInitialRestorationComplete(true)
        return
      }

      const fileIds = new Set(files.map((f) => f.id))
      const restored = ids.filter((id) => fileIds.has(id))

      if (restored.length > 0) {
        setSelected(new Set(restored))
      }

      // Mark restoration as complete regardless of whether we restored anything
      setInitialRestorationComplete(true)
    } catch {
      // Mark as complete even on error to prevent getting stuck
      setInitialRestorationComplete(true)
    }
  }, [files, selectionScopeKey, setSelected, initialRestorationComplete])

  // Restore any in-flight multipart sessions for display (SSE/polling)
  useEffect(() => {
    try {
      UploadQueue.restoreSessionsDisplay()
    } catch {}
  }, [])

  // Helpers (shared)
  const parseHumanSizeGlobal = (input?: string): number | undefined => {
    if (!input) return undefined
    const s = input.trim()
    if (!s) return undefined
    if (/^\d+$/.test(s)) return Number(s)
    const m = /^(\d+(?:\.\d+)?)\s*(K|M|G|T|KB|MB|GB|TB|KiB|MiB|GiB|TiB)$/i.exec(
      s
    )
    if (!m) return undefined
    const n = parseFloat(m[1])
    const unit = m[2].toLowerCase()
    const map: Record<string, number> = {
      k: 1000,
      kb: 1000,
      kib: 1024,
      m: 1000 ** 2,
      mb: 1000 ** 2,
      mib: 1024 ** 2,
      g: 1000 ** 3,
      gb: 1000 ** 3,
      gib: 1024 ** 3,
      t: 1000 ** 4,
      tb: 1000 ** 4,
      tib: 1024 ** 4,
    }
    const mul = map[unit] || 1
    return Math.round(n * mul)
  }

  // Sorted/filtered view of files (client-side) with Live Search + Filter Ribbon
  const displayFiles = useMemo(() => {
    // Helpers
    const norm = (s?: string) => (s || '').toLowerCase()
    const parseHumanSize = (input?: string): number | undefined =>
      parseHumanSizeGlobal(input)

    // Active live filters (fall back to simple text box if ribbon not used)
    const f = liveFilters
    const txt = norm(f?.query ?? searchText)
    const useRegex = !!f?.regex && f?.query && f.query.length > 0
    let re: RegExp | null = null
    if (useRegex) {
      try {
        re = new RegExp(f!.query!, 'i')
      } catch {
        re = null
      }
    }

    const minBytes = parseHumanSize(f?.sizeGt)
    const maxBytes = parseHumanSize(f?.sizeLt)
    const afterTs = f?.createdAfter ? Date.parse(f.createdAfter) : undefined
    const beforeTs = f?.createdBefore ? Date.parse(f.createdBefore) : undefined
    const wantMime = norm(f?.mime_type)
    const wantType = f?.type && f.type !== 'any' ? f.type : undefined
    const wantMeta = f?.metadata || {}

    let arr = files

    // Name match (text or regex)
    if (txt && !useRegex) {
      arr = arr.filter((ff) => norm(ff.name || ff.key || '').includes(txt))
    } else if (re) {
      arr = arr.filter((ff) => re!.test(ff.name || ff.key || ''))
    }

    // MIME filter
    if (wantMime) {
      arr = arr.filter((ff) => norm(ff.mime_type).includes(wantMime))
    }

    // Type/category filter (align with LeftTree categories)
    if (wantType) {
      const head = (ff: FileMeta) => (ff.mime_type || '').split('/')[0]
      arr = arr.filter((ff) => {
        const h = head(ff)
        if (wantType === 'document') return ['application', 'text'].includes(h)
        if (wantType === 'image') return h === 'image'
        if (wantType === 'video') return h === 'video'
        if (wantType === 'audio') return h === 'audio'
        if (wantType === 'archive')
          return /zip|tar|gz|bz2|xz|7z|rar/i.test(ff.mime_type || '')
        if (wantType === 'other')
          return (
            !['image', 'video', 'audio'].includes(h) &&
            !/zip|tar|gz|bz2|xz|7z|rar/i.test(ff.mime_type || '')
          )
        return true
      })
    }

    // Size range
    if (typeof minBytes === 'number') {
      arr = arr.filter((ff) => (ff.size_bytes || 0) >= minBytes)
    }
    if (typeof maxBytes === 'number') {
      arr = arr.filter((ff) => (ff.size_bytes || 0) <= maxBytes)
    }

    // Date range (created/updated)
    if (typeof afterTs === 'number') {
      arr = arr.filter((ff) => {
        const t = ff.created_at
          ? Date.parse(ff.created_at)
          : ff.updated_at
            ? Date.parse(ff.updated_at)
            : 0
        return t >= afterTs
      })
    }
    if (typeof beforeTs === 'number') {
      arr = arr.filter((ff) => {
        const t = ff.created_at
          ? Date.parse(ff.created_at)
          : ff.updated_at
            ? Date.parse(ff.updated_at)
            : 0
        return t <= beforeTs
      })
    }

    // Metadata (tags) subset match
    const metaKeys = Object.keys(wantMeta)
    if (metaKeys.length > 0) {
      arr = arr.filter((ff) => {
        const tags = (ff.tags || {}) as Record<string, string>
        for (const k of metaKeys) {
          const v = String(wantMeta[k] ?? '')
          if (!k.trim()) continue
          if (String(tags[k] ?? '') !== v) return false
        }
        return true
      })
    }

    const getValBy = (ff: FileMeta, by: 'name' | 'size' | 'updated') => {
      if (by === 'name') return (ff.name || ff.key || '').toLowerCase()
      if (by === 'size') return ff.size_bytes || 0
      if (by === 'updated') return ff.updated_at ? Date.parse(ff.updated_at) : 0
      return (ff.name || ff.key || '').toLowerCase()
    }

    const sorted = [...arr].sort((a, b) => {
      // Primary
      const va1 = getValBy(a, sortBy) as any
      const vb1 = getValBy(b, sortBy) as any
      if (va1 < vb1) return sortOrder === 'asc' ? -1 : 1
      if (va1 > vb1) return sortOrder === 'asc' ? 1 : -1
      // Secondary
      if (sortBy2) {
        const va2 = getValBy(a, sortBy2) as any
        const vb2 = getValBy(b, sortBy2) as any
        if (va2 < vb2) return (sortOrder2 || 'asc') === 'asc' ? -1 : 1
        if (va2 > vb2) return (sortOrder2 || 'asc') === 'asc' ? 1 : -1
      }
      // Fallback: name asc
      const van = (a.name || a.key || '').toLowerCase()
      const vbn = (b.name || b.key || '').toLowerCase()
      if (van < vbn) return -1
      if (van > vbn) return 1
      return 0
    })
    return sorted
  }, [files, sortBy, sortOrder, sortBy2, sortOrder2, searchText, liveFilters])

  // Folders-first entries for current prefix when enabled
  const displayEntries: BrowserEntry[] = useMemo(() => {
    if (!groupFolders) {
      return displayFiles.map((f) => ({ kind: 'file' as const, file: f }))
    }
    // Normalize base prefix
    const basePrefix = (prefix || '').replace(/^\/+|\/+$/g, '')
    const base = basePrefix ? basePrefix + '/' : ''
    const folderSet = new Set<string>()
    const directFiles: FileMeta[] = []

    for (const f of files) {
      const raw = (f.key || f.name || '').replace(/^\/+/, '')
      if (base && !raw.startsWith(base)) continue
      const rel = base ? raw.slice(base.length) : raw
      if (!rel) continue
      if (rel.endsWith('/')) {
        const seg = rel.split('/').filter(Boolean)[0]
        if (seg) folderSet.add(seg)
        continue
      }
      const parts = rel.split('/')
      if (parts.length > 1) {
        folderSet.add(parts[0])
      } else {
        directFiles.push(f)
      }
    }

    // Sort folders by name according to sortOrder
    const folders: BrowserEntry[] = Array.from(folderSet)
      .sort((a, b) =>
        sortOrder === 'asc' ? a.localeCompare(b) : b.localeCompare(a)
      )
      .map((name) => ({ kind: 'folder', name, prefix: base + name + '/' }))

    // Sort only the direct files by active sort
    const getVal = (f: FileMeta, by: 'name' | 'size' | 'updated') => {
      if (by === 'name') return (f.name || f.key || '').toLowerCase()
      if (by === 'size') return f.size_bytes || 0
      if (by === 'updated') return f.updated_at ? Date.parse(f.updated_at) : 0
      return (f.name || f.key || '').toLowerCase()
    }
    const sortedFiles = [...directFiles].sort((a, b) => {
      const va1 = getVal(a, sortBy) as any
      const vb1 = getVal(b, sortBy) as any
      if (va1 < vb1) return sortOrder === 'asc' ? -1 : 1
      if (va1 > vb1) return sortOrder === 'asc' ? 1 : -1
      if (sortBy2) {
        const va2 = getVal(a, sortBy2) as any
        const vb2 = getVal(b, sortBy2) as any
        if (va2 < vb2) return (sortOrder2 || 'asc') === 'asc' ? -1 : 1
        if (va2 > vb2) return (sortOrder2 || 'asc') === 'asc' ? 1 : -1
      }
      return 0
    })

    return [
      ...folders,
      ...sortedFiles.map((f) => ({ kind: 'file' as const, file: f })),
    ]
  }, [files, prefix, groupFolders, sortBy, sortOrder, displayFiles])

  // Navigation order for preview: only files in current entries order (folders excluded)
  const previewOrderIds = useMemo(() => {
    return displayEntries
      .filter((e) => e.kind === 'file')
      .map((e: any) => e.file.id as string)
      .filter(Boolean)
  }, [displayEntries])

  // Preview navigation handlers: move selection to previous/next file
  const onPreviewPrev = useCallback(() => {
    if (!selectedFile) return
    const idx = previewOrderIds.indexOf(selectedFile.id)
    if (idx > 0) {
      setSelected(new Set([previewOrderIds[idx - 1]]))
      setRightTab('preview')
    }
  }, [selectedFile, previewOrderIds, setSelected])

  const onPreviewNext = useCallback(() => {
    if (!selectedFile) return
    const idx = previewOrderIds.indexOf(selectedFile.id)
    if (idx >= 0 && idx < previewOrderIds.length - 1) {
      setSelected(new Set([previewOrderIds[idx + 1]]))
      setRightTab('preview')
    }
  }, [selectedFile, previewOrderIds, setSelected])

  // Aggregate selected size (for StatusBar)
  const selectedSizeBytes = useMemo(() => {
    if (!selected.size) return 0
    let total = 0
    const byId = new Map(files.map((f) => [f.id, f]))
    for (const id of selected) {
      const f = byId.get(id)
      if (f?.size_bytes) total += Number(f.size_bytes) || 0
    }
    return total
  }, [selected, files])

  // SR announce selection changes
  useEffect(() => {
    const n = selected.size
    setSrMessage(
      n === 0 ? 'Selection cleared' : `${n} item${n === 1 ? '' : 's'} selected`
    )
  }, [selected.size])

  // Focus management when right panel tab changes (move focus to heading)
  useEffect(() => {
    // Defer to next tick so DOM exists
    const t = setTimeout(() => {
      rightHeadingRef.current?.focus?.()
    }, 0)
    return () => clearTimeout(t)
  }, [rightTab])

  // Handle deep-link query params for shell behaviors (e.g., ?queue=open, ?focus=search, ?mode=flat|folder)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const queue = params.get('queue')
    const focus = params.get('focus')
    const mode = params.get('mode')

    if (queue === 'open') {
      setRightTab('uploads')
      setUploadOpen(true)
    }

    if (focus === 'search') {
      setTimeout(() => {
        const el =
          (document.querySelector(
            'input[type="search"]'
          ) as HTMLInputElement | null) ||
          (document.querySelector(
            'input[data-role="files-search"]'
          ) as HTMLInputElement | null)
        el?.focus?.()
        el?.select?.()
      }, 0)
    }

    // View mode for folder grouping
    if (mode === 'flat') {
      setGroupFolders(false)
    } else if (mode === 'folder') {
      setGroupFolders(true)
    }

    // Additional deep-linking for view/sort/dir and selection
    const viewParam = params.get('view')
    if (
      viewParam === 'grid' ||
      viewParam === 'list' ||
      viewParam === 'details' ||
      viewParam === 'timeline'
    ) {
      setViewMode(viewParam as ViewMode)
    }
    const sortParam = params.get('sort')
    const dirParam = params.get('dir')
    if (
      sortParam === 'name' ||
      sortParam === 'size' ||
      sortParam === 'updated'
    ) {
      setSortBy(sortParam as any)
    }
    if (dirParam === 'asc' || dirParam === 'desc') {
      setSortOrder(dirParam as any)
    }
    // Secondary sort (optional)
    const sort2Param = params.get('sort2')
    const dir2Param = params.get('dir2')
    if (
      sort2Param === 'name' ||
      sort2Param === 'size' ||
      sort2Param === 'updated'
    ) {
      setSortBy2(sort2Param as any)
    }
    if (dir2Param === 'asc' || dir2Param === 'desc') {
      setSortOrder2(dir2Param as any)
    }
    const flatParam = params.get('flat')
    if (flatParam === '1') setGroupFolders(false)
    if (flatParam === '0') setGroupFolders(true)

    const selParam = params.get('sel')
    if (selParam) {
      const ids = selParam
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
      if (ids.length > 0) {
        setSelected(new Set(ids))
      }
    }
  }, [])

  // Mouse-driven resizing
  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!dragRef.current) return
      const dx = e.clientX - dragRef.current.startX
      if (dragRef.current.type === 'left') {
        const next = Math.max(
          160,
          Math.min(560, dragRef.current.startLeft + dx)
        )
        setLeftWidth(next)
      } else if (dragRef.current.type === 'right') {
        const next = Math.max(
          220,
          Math.min(640, dragRef.current.startRight - dx)
        )
        setRightWidth(next)
      }
    }
    function onUp() {
      dragRef.current = null
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [])

  // Edge-swipe gestures on mobile/tablet: open/close side panels
  useEffect(() => {
    if (typeof window === 'undefined') return
    let startX = 0
    let active = false
    function onTouchStart(e: TouchEvent) {
      if (!isMobile && !isTablet) return
      if (!e.touches || e.touches.length === 0) return
      const x = e.touches[0].clientX
      // Start if from edges (<=20px from left or right)
      if (x <= 20 || x >= window.innerWidth - 20) {
        startX = x
        active = true
      }
    }
    function onTouchMove(e: TouchEvent) {
      if (!active) return
      // prevent browser back swipe jank while handling
      e.preventDefault()
    }
    function onTouchEnd(e: TouchEvent) {
      if (!active) return
      const endX = (e.changedTouches && e.changedTouches[0]?.clientX) || startX
      const dx = endX - startX
      const fromLeft = startX <= 20
      const fromRight = startX >= window.innerWidth - 20
      // simple threshold
      if (fromLeft && dx > 40) setLeftCollapsed(false)
      if (fromLeft && dx < -40) setLeftCollapsed(true)
      if (fromRight && dx < -40) setRightCollapsed(false)
      if (fromRight && dx > 40) setRightCollapsed(true)
      active = false
    }
    window.addEventListener('touchstart', onTouchStart, { passive: false })
    window.addEventListener('touchmove', onTouchMove, { passive: false })
    window.addEventListener('touchend', onTouchEnd, { passive: false })
    return () => {
      window.removeEventListener('touchstart', onTouchStart as any)
      window.removeEventListener('touchmove', onTouchMove as any)
      window.removeEventListener('touchend', onTouchEnd as any)
    }
  }, [isMobile, isTablet])

  // Sync URL with current bucket/prefix for deep-linking: /files/[bucket]/[[...path]]
  // Build URL path + query for current navigation/ui state
  const buildUrlForState = useCallback(() => {
    const norm = (prefix || '').replace(/^\/+|\/+$/g, '')
    const parts = norm ? norm.split('/').filter(Boolean) : []
    const basePath = [
      '/files',
      encodeURIComponent(activeBucket || ''),
      ...parts.map(encodeURIComponent),
    ].join('/')
    const qs = new URLSearchParams()
    // Encode folder view mode using existing "mode" param for compatibility
    qs.set('mode', groupFolders ? 'folder' : 'flat')
    // Also encode explicit flat for external consumers
    qs.set('flat', groupFolders ? '0' : '1')
    // Encode list view prefs
    qs.set('view', viewMode)
    qs.set('sort', sortBy)
    qs.set('dir', sortOrder)
    if (sortBy2) {
      qs.set('sort2', sortBy2)
      qs.set('dir2', sortOrder2)
    }
    // Selection: include up to 10 ids to avoid long URLs
    const ids = Array.from(selected || [])
    if (ids.length > 0 && ids.length <= 10) {
      qs.set('sel', ids.join(','))
    } else {
      qs.delete('sel')
    }
    const q = qs.toString()
    return q ? `${basePath}?${q}` : basePath
  }, [
    activeBucket,
    prefix,
    groupFolders,
    viewMode,
    sortBy,
    sortOrder,
    sortBy2,
    sortOrder2,
    selected,
  ])

  // Sync URL with state; use push() when user-triggered, replace() otherwise
  useEffect(() => {
    if (!activeBucket) return
    if (typeof window === 'undefined') return
    if (suppressSyncRef.current) {
      // We are applying URL->state change; skip writing
      suppressSyncRef.current = false
      return
    }
    const nextUrl = buildUrlForState()
    const currentUrl = `${window.location.pathname}${window.location.search || ''}`
    if (currentUrl !== nextUrl) {
      if (navByUserRef.current) {
        router.push(nextUrl)
      } else {
        router.replace(nextUrl)
      }
    }
    navByUserRef.current = false
  }, [
    activeBucket,
    prefix,
    groupFolders,
    viewMode,
    sortBy,
    sortOrder,
    selected,
    buildUrlForState,
    router,
  ])

  // Back/forward browser navigation -> apply URL to state
  useEffect(() => {
    if (typeof window === 'undefined') return
    const handler = () => {
      try {
        const url = new URL(window.location.href)
        const pathParts = url.pathname
          .split('/')
          .map(decodeURIComponent)
          .filter(Boolean)
        // Expect: files / [bucket] / [...prefix]
        const idxFiles = pathParts.indexOf('files')
        let b: string | undefined
        let p = ''
        if (idxFiles >= 0 && pathParts.length > idxFiles + 1) {
          b = pathParts[idxFiles + 1]
          const rest = pathParts.slice(idxFiles + 2)
          p = rest.length ? rest.join('/') + '/' : ''
        }
        // Apply without re-writing URL
        suppressSyncRef.current = true
        if (b) setActiveBucket(b)
        setPrefix(p)

        const params = url.searchParams
        const mode = params.get('mode')
        if (mode === 'flat') setGroupFolders(false)
        if (mode === 'folder') setGroupFolders(true)
        const viewParam = params.get('view')
        if (
          viewParam === 'grid' ||
          viewParam === 'list' ||
          viewParam === 'details' ||
          viewParam === 'timeline'
        ) {
          setViewMode(viewParam as ViewMode)
        }
        const sortParam = params.get('sort')
        const dirParam = params.get('dir')
        if (
          sortParam === 'name' ||
          sortParam === 'size' ||
          sortParam === 'updated'
        )
          setSortBy(sortParam as any)
        if (dirParam === 'asc' || dirParam === 'desc')
          setSortOrder(dirParam as any)
        const sort2Param = params.get('sort2')
        const dir2Param = params.get('dir2')
        if (
          sort2Param === 'name' ||
          sort2Param === 'size' ||
          sort2Param === 'updated'
        )
          setSortBy2(sort2Param as any)
        if (dir2Param === 'asc' || dir2Param === 'desc')
          setSortOrder2(dir2Param as any)
        const selParam = params.get('sel')
        if (selParam) {
          const ids = selParam
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
          setSelected(new Set(ids))
        } else {
          // Do not clear selection if param missing; popstate may be from a route without sel
        }
      } catch {
        /* ignore */
      }
    }
    window.addEventListener('popstate', handler)
    return () => window.removeEventListener('popstate', handler)
  }, [])

  // Keyboard shortcuts: avoid referencing handlers before declaration by using refs
  const keyHandlersRef = useRef<{
    del?: () => void
    rename?: () => void
    share?: () => void
    pasteMove?: () => void
    open?: () => void
    selectAll?: () => void
    clear?: () => void
  }>({})
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Context-aware guard: avoid firing while typing or when a modal is open
      if (isTypingTarget() || isModalOpen()) return

      if (e.key === 'Delete') {
        e.preventDefault()
        keyHandlersRef.current.del?.()
        return
      }
      if (e.key === 'F2') {
        e.preventDefault()
        keyHandlersRef.current.rename?.()
        return
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
        e.preventDefault()
        keyHandlersRef.current.share?.()
        return
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
        e.preventDefault()
        keyHandlersRef.current.pasteMove?.()
        return
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
        // Select all visible files
        e.preventDefault()
        keyHandlersRef.current.selectAll?.()
        return
      }
      if (e.key === 'Escape') {
        // Clear selection
        e.preventDefault()
        keyHandlersRef.current.clear?.()
        return
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        keyHandlersRef.current.open?.()
        return
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Toolbar handlers
  const onRefresh = useCallback(() => void loadFiles(true), [loadFiles])
  const onLoadMore = useCallback(
    () => cursor && void loadFiles(false),
    [cursor, loadFiles]
  )

  // Infinite scroll: guarded auto "load more" when near end
  const handleAutoLoadMore = useCallback(() => {
    if (!cursor || loading || autoLoading) return
    setAutoLoading(true)

    void loadFiles(false).finally(() => setAutoLoading(false))
  }, [cursor, loading, autoLoading, loadFiles])

  // Reset guard on cursor change
  useEffect(() => {
    setAutoLoading(false)
  }, [cursor])

  const onDeleteSelected = useCallback(async () => {
    if (selected.size === 0) return
    if (!confirm(`Delete ${selected.size} item(s)?`)) return
    try {
      setBulkStatus(`Deleting ${selected.size} items…`)
      // Build engine operations to enable undo/redo and offline queue
      const ids = Array.from(selected as Set<string>) as string[]
      const pickedFiles = files.filter((f) => ids.includes(f.id))
      const ops = buildOperationsFromSelection({ type: 'delete' } as const, pickedFiles)

      const exec = await runBatchOperations(ops, {
        conflictPolicy: 'fail',
        rollbackOnFailure: false,
        queueWhenOffline: true,
        chunkSize: 200,
      })

      const queued = exec.results.filter((r) => r.error === 'queued_offline').length
      const failed = exec.failures.length - queued
      const ok = exec.successes.length

      if (queued > 0 && ok === 0 && failed === 0) {
        setBulkStatus(`Delete queued offline (${queued} ops). Will retry when online.`)
      } else if (failed > 0) {
        const sample = exec.failures.slice(0, 5).map((r) => r.error).filter(Boolean).join('; ')
        setBulkStatus(`Delete completed with errors (${ok} ok, ${failed} failed${queued ? `, ${queued} queued` : ''})`)
        alert(`Some deletions failed: ${sample}`)
      } else {
        setBulkStatus(`Deleted ${ok} item(s)${queued ? `, ${queued} queued offline` : ''}`)
      }

      setSelected(new Set())
      await loadFiles(true)
      try {
        track('files.delete', { count: ids.length, ok, failed, queued })
      } catch {}
    } catch (e: any) {
      setBulkStatus(`Delete failed: ${e?.message || 'Unknown error'}`)
      alert(e?.message || 'Delete failed')
      try { track('files.delete', { count: (selected?.size ?? 0), ok: 0, failed: 1 }) } catch {}
    } finally {
      setTimeout(() => setBulkStatus(undefined), 2500)
    }
  }, [selected, files, loadFiles])

  const onCopySelected = useCallback(() => {
    if (selected.size === 0) return
    setDestMode('copy')
    setDestPickerOpen(true)
  }, [selected])

  const onMoveSelected = useCallback(() => {
    if (selected.size === 0) return
    setDestMode('move')
    setDestPickerOpen(true)
  }, [selected])

  const onRenameSelected = useCallback(async () => {
    if (selected.size === 0) return
    if (selected.size > 1) {
      alert('Bulk rename not supported yet. Please rename files individually.')
      return
    }
    const fileId = Array.from(selected as Set<string>)[0] as string
    const file = files.find((f) => f.id === fileId)
    if (!file) return
    // Start inline edit
    setEditId(fileId)
    setEditValue(file.name || file.key || '')
    setEditError(null)
  }, [selected, files])

  const onShareSelected = useCallback(() => {
    if (selected.size !== 1) {
      alert('Select a single file to share')
      return
    }
    const id = Array.from(selected)[0]
    const f = files.find((x) => x.id === id) || null
    if (!f) return
    // Open in-app sharing dialog
    setShareFile(f)
    setShareOpen(true)
  }, [selected, files])

  // Open (preview) currently selected file
  const onOpenSelected = useCallback(() => {
    if (selected.size !== 1) return
    const id = Array.from(selected)[0]
    const f = files.find((x) => x.id === id)
    if (!f) return
    router.push(`/files/preview/${encodeURIComponent(f.id)}`)
  }, [selected, files, router])

  // Bind global hotkeys to concrete handlers (basic set; extended mapping is registered after helper declarations)
  useEffect(() => {
    keyHandlersRef.current = {
      del: onDeleteSelected,
      rename: onRenameSelected,
      share: onShareSelected,
      pasteMove: () => {
        if (selected.size > 0) {
          setDestMode('move')
          setDestPickerOpen(true)
        }
      },
      open: onOpenSelected,
    }
    return () => {
      keyHandlersRef.current = {}
    }
  }, [
    onDeleteSelected,
    onRenameSelected,
    onShareSelected,
    onOpenSelected,
    selected.size,
  ])

  // Create a folder at current prefix via FolderService (marker-based with safe fallback)
  const createFolderAtCurrent = useCallback(
    async (name: string) => {
      const clean = (name || '').replace(/^\/+|\/+$/g, '')
      if (!clean) return
      const base = prefix || ''
      if (!activeBucket) {
        // No bucket selected: navigate-only to new prefix
        const newPrefix = (base.endsWith('/') ? base : `${base}/`) + clean + '/'
        setPrefix(newPrefix)
        return
      }
      const newPrefix = await FolderService.createFolder(
        activeBucket,
        base,
        clean
      )
      setPrefix(newPrefix)
      await onRefresh()
    },
    [activeBucket, prefix, onRefresh]
  )

  // Folder templates: quick-create common structures under current prefix
  const folderTemplates: Record<string, string[]> = useMemo(
    () => ({
      'Project Basic': ['docs/', 'src/', 'tests/'],
      'Media Kit': ['images/', 'videos/', 'audio/'],
      Documentation: ['guides/', 'reference/', 'assets/'],
      'Web App': ['public/', 'src/components/', 'src/pages/', 'src/styles/'],
    }),
    []
  )

  // Create a set of nested folders using zero-byte ".keep" markers
  const applyFolderTemplate = useCallback(
    async (baseName: string, templateName: string) => {
      const cleanBase = (baseName || '').replace(/^\/+|\/+$/g, '')
      if (!cleanBase) return
      const parts = folderTemplates[templateName]
      if (!parts || parts.length === 0) {
        alert(`Unknown template: ${templateName}`)
        return
      }
      const base = prefix || ''
      const root =
        base.endsWith('/') || base === ''
          ? `${base}${cleanBase}/`
          : `${base}/${cleanBase}/`
      if (!activeBucket) {
        // Navigate-only fallback if no bucket
        setPrefix(root)
        return
      }
      try {
        // Ensure root and subfolders via service helpers
        await FolderService.ensureMarker(activeBucket, root)
        await FolderService.createNested(activeBucket, root, parts)
        setPrefix(root)
        await onRefresh()
      } catch (e: any) {
        console.error('Template creation failed', e)
        alert(e?.message || 'Failed to create template')
        setPrefix(root)
      }
    },
    [activeBucket, prefix, onRefresh, folderTemplates]
  )

  // Prompt user for a template and base folder name, then apply
  const promptAndCreateTemplate = useCallback(async () => {
    if (!activeBucket) return
    const names = Object.keys(folderTemplates)
    const pick = prompt(`Choose a template:\n- ${names.join('\n- ')}`)
    if (!pick) return
    if (!folderTemplates[pick]) {
      alert('Template not found')
      return
    }
    const base = prompt('New folder name (root for the template)')
    if (!base) return
    await applyFolderTemplate(base, pick)
  }, [activeBucket, applyFolderTemplate, folderTemplates])
  // Bridge: listen for global header actions (dispatched from Files layout Header)
  useEffect(() => {
    function onHeaderAction(e: Event) {
      const evt = e as CustomEvent
      const action = (evt?.detail && (evt.detail as any).action) as
        | string
        | undefined
      if (!action) return
      switch (action) {
        case 'refresh':
          void onRefresh()
          break
        case 'upload':
          setRightTab('uploads')
          setUploadOpen(true)
          break
        case 'newFolder': {
          const name =
            typeof window !== 'undefined' ? prompt('New folder name') : ''
          if (name) void createFolderAtCurrent(name)
          break
        }
        case 'copy':
          onCopySelected()
          break
        case 'move':
          onMoveSelected()
          break
        case 'rename':
          void onRenameSelected()
          break
        case 'delete':
          void onDeleteSelected()
          break
        case 'share':
          onShareSelected()
          break
        case 'newBucket': {
          const name =
            typeof window !== 'undefined' ? prompt('New bucket name') : ''
          if (name) {
            BucketsClient.create(name)
              .then(() => {
                setBuckets((prev) =>
                  prev.some((b) => b.name === name) ? prev : [{ name }, ...prev]
                )
                setActiveBucket(name)
                setPrefix('')
              })
              .catch((e: any) => alert(e?.message || 'Failed to create bucket'))
          }
          break
        }
        default:
          console.warn('[FileBrowserShell] Unhandled header action:', action)
      }
    }
    window.addEventListener('afm:action', onHeaderAction as any)
    return () => window.removeEventListener('afm:action', onHeaderAction as any)
  }, [
    onRefresh,
    setRightTab,
    setUploadOpen,
    createFolderAtCurrent,
    onCopySelected,
    onMoveSelected,
    onRenameSelected,
    onDeleteSelected,
    onShareSelected,
    setBuckets,
    setActiveBucket,
    setPrefix,
  ])

  // Bridge: broadcast selection/upload/view mode to Header (Files layout) for live badges
  useEffect(() => {
    // subscribe to upload stats
    const off = UploadQueue.on('stats', (ev: any) => {
      try {
        const running = ev.running ?? 0
        const queued = ev.queued ?? 0
        const uploadQueueCount = (running || 0) + (queued || 0)
        window.dispatchEvent(
          new CustomEvent('afm:state', {
            detail: {
              selectionCount: selected.size,
              selectionSizeBytes: selectedSizeBytes,
              uploadQueueCount,
              viewMode: groupFolders ? 'folder' : 'flat',
            },
          })
        )
      } catch {}
    })
    // emit once initially (in case there are no immediate stats)
    try {
      window.dispatchEvent(
        new CustomEvent('afm:state', {
          detail: {
            selectionCount: selected.size,
            selectionSizeBytes: selectedSizeBytes,
            uploadQueueCount: 0,
            viewMode: groupFolders ? 'folder' : 'flat',
          },
        })
      )
    } catch {}

    return () => {
      try {
        off?.()
      } catch {}
    }
  }, [selected.size, selectedSizeBytes, groupFolders])

  const onRename = useCallback(async (file: FileMeta) => {
    // Prefer inline rename: when triggered via context menu or button, start inline editor
    setEditId(file.id)
    setEditValue(file.name || file.key || 'file')
    setEditError(null)
  }, [])

  // Commit/cancel inline rename helpers
  const commitInlineRename = useCallback(async () => {
    if (!editId) return
    const target = files.find((f) => f.id === editId)
    if (!target) {
      setEditId(null)
      return
    }
    const next = (editValue || '').trim()
    const base = target.name || target.key || ''
    if (!next || next === base) {
      setEditId(null)
      setEditError(null)
      return
    }
    try {
      setEditSaving(true)
      setEditError(null)

      // Use batch-engine so we capture reverseOps and support offline queue
      const ops = [
        {
          type: 'rename',
          id: editId,
          newKey: next,
          src: { bucket: target.bucket, key: target.key },
        } as any,
      ]
      const exec = await runBatchOperations(ops, {
        conflictPolicy: 'fail',
        rollbackOnFailure: false,
        queueWhenOffline: true,
      })

      setEditSaving(false)
      setEditId(null)

      const anyOk = exec.successes.length > 0 || exec.results.some((r) => r.ok)
      const queued = exec.results.some((r) => r.error === 'queued_offline')

      if (!anyOk && !queued) {
        const msg = exec.failures[0]?.error || 'Rename failed'
        setEditError(msg)
        return
      }

      // Record undo from engine-provided reverseOps if present
      if (exec.reverseOps && exec.reverseOps.length) {
        operationHistory.push({
          label: 'Rename',
          createdAt: Date.now(),
          reverseOps: exec.reverseOps.slice(),
        })
      }

      // Optimistic local update to keep UI responsive, even if queued offline
      setFiles((prev) =>
        prev.map((f) =>
          f.id === target.id
            ? {
                ...f,
                name: next,
                key: f.key
                  ? f.key.split('/').slice(0, -1).concat(next).join('/')
                  : f.key,
              }
            : f
        )
      )
      if (queued) {
        setBulkStatus('Rename queued offline; will apply when online.')
        setTimeout(() => setBulkStatus(undefined), 2500)
      }
      try { track('files.rename', { ok: true }) } catch {}
      void loadFiles(true)
    } catch (e: any) {
      setEditSaving(false)
      setEditError(e?.message || 'Rename failed')
      try { track('files.rename', { ok: false }) } catch {}
    }
  }, [editId, editValue, files, loadFiles])

  const cancelInlineRename = useCallback(() => {
    setEditId(null)
    setEditValue('')
    setEditError(null)
    setEditSaving(false)
  }, [])

  // Confirm destination picker → perform batch copy/move with conflict handling + undo
  const onConfirmDestination = useCallback(
    async (dest: { bucket: string; prefix: string }) => {
      try {
        const ids = Array.from(selected as Set<string>) as string[]
        if (ids.length === 0) return

        // Build operations from current selection
        const pickedFiles = files.filter((f) => ids.includes(f.id))
        const intent = {
          type: destMode as 'copy' | 'move',
          destBucket: dest.bucket,
          destPrefix: dest.prefix || '',
        } as const
        const ops = buildOperationsFromSelection(intent, pickedFiles)
        pendingOpsRef.current = ops
        pendingModeRef.current = destMode

        setBulkStatus(
          `${destMode === 'copy' ? 'Copying' : 'Moving'} ${ids.length} items…`
        )
        // First pass: fail-on-conflict, but prepare rollback for moves
        const exec1 = await runBatchOperations(ops, {
          conflictPolicy: 'fail',
          rollbackOnFailure: destMode === 'move',
          queueWhenOffline: true,
          chunkSize: 200,
        })

        let results: OperationResult[] = exec1.results
        const failed = exec1.failures

        // Heuristic conflict detection
        const isExistenceConflict = (err?: string) => {
          if (!err) return false
          const s = String(err).toLowerCase()
          return (
            s.includes('exist') ||
            s.includes('already') ||
            s.includes('409') ||
            s.includes('conflict')
          )
        }
        const conflictFailures = failed.filter((f) =>
          isExistenceConflict(f.error)
        )

        if (conflictFailures.length > 0) {
          // Open per-item conflict dialog
          const failedIds = new Set(
            conflictFailures.map((r) => (r.op as any)?.id as string)
          )
          const conflictData: ConflictItem[] = pickedFiles
            .filter((f) => failedIds.has(f.id))
            .map((f) => {
              const base = (f.name || f.key || f.id).split('/').pop() || f.id
              const origOp = ops.find((o) => o.id === f.id) as any
              return {
                id: f.id,
                baseName: base,
                destBucket: origOp?.destBucket || dest.bucket,
                destKey:
                  origOp?.destKey ||
                  ((dest.prefix || '').endsWith('/')
                    ? `${dest.prefix}${base}`
                    : `${dest.prefix}/${base}`),
                choice: 'keep-both',
              }
            })
          setConflictItems(conflictData)
          setConflictApplyAll(null)
          setConflictOpen(true)
          setDestPickerOpen(false)

          // Keep the reverseOps from first execution (successful moves) for undo history
          if (exec1.reverseOps && exec1.reverseOps.length) {
            operationHistory.push({
              label: destMode === 'move' ? 'Move(partial)' : 'Copy(partial)',
              createdAt: Date.now(),
              reverseOps: exec1.reverseOps.slice(),
            })
          }
          setBulkStatus(
            `Conflicts detected for ${conflictData.length} item(s). Awaiting your decision…`
          )
          return
        }

        const finalFailed = results.filter((r) => !r.ok)
        const okCount = results.length - finalFailed.length
        if (finalFailed.length) {
          const errors = finalFailed
            .map((r) => r.error)
            .filter(Boolean)
            .slice(0, 5)
            .join('; ')
          setBulkStatus(
            `${destMode === 'copy' ? 'Copy' : 'Move'} completed with errors (${okCount} ok, ${finalFailed.length} failed)`
          )
          alert(
            `Some ${destMode === 'copy' ? 'copies' : 'moves'} failed: ${errors}`
          )
        } else {
          setBulkStatus(
            `${destMode === 'copy' ? 'Copied' : 'Moved'} ${results.length} item(s) successfully`
          )
          if (destMode === 'move') setSelected(new Set())
        }
        try { track(destMode === 'copy' ? 'files.copy' as any : 'files.move' as any, { count: results.length, ok: okCount, failed: finalFailed.length }) } catch {}

        // Push undo entry using reverseOps from first execution (covers successful moves/renames)
        if (exec1.reverseOps && exec1.reverseOps.length) {
          operationHistory.push({
            label: destMode === 'move' ? 'Move' : 'Copy',
            createdAt: Date.now(),
            reverseOps: exec1.reverseOps.slice(),
          })
        }

        setDestPickerOpen(false)
        await loadFiles(true)
      } catch (e: any) {
        setBulkStatus(
          `${destMode === 'copy' ? 'Copy' : 'Move'} failed: ${e?.message || 'Unknown error'}`
        )
        alert(e?.message || `${destMode === 'copy' ? 'Copy' : 'Move'} failed`)
      } finally {
        setTimeout(() => setBulkStatus(undefined), 2500)
      }
    },
    [selected, files, destMode, loadFiles]
  )

  // Selection helpers (multi-select support)
  const lastAnchorIndexRef = useRef<number | null>(null)

  const setSelection = useCallback((next: Set<string>) => {
    setSelected(new Set(next))
  }, [])
  // Multi-select helpers
  const selectAllEntries = useCallback(() => {
    const allIds = displayEntries
      .filter((e) => e.kind === 'file')
      .map((e) => (e as any).file.id as string)
      .filter(Boolean)
    setSelected(new Set(allIds))
  }, [displayEntries])
  const clearSelection = useCallback(() => {
    setSelected(new Set())
  }, [])
  const invertSelection = useCallback(() => {
    const allIds = new Set(
      displayEntries
        .filter((e) => e.kind === 'file')
        .map((e) => (e as any).file.id as string)
        .filter(Boolean)
    )
    const next = new Set<string>()
    for (const id of allIds) {
      if (!selected.has(id)) next.add(id)
    }
    setSelected(next)
  }, [displayEntries, selected])

  const toggleSelect = useCallback(
    (id: string) => {
      const next = new Set(selected)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      setSelected(next)
    },
    [selected, setSelected]
  )

  const isSelected = useCallback((id: string) => selected.has(id), [selected])

  // Extend hotkey bindings now that multi-select helpers are declared
  useEffect(() => {
    keyHandlersRef.current = {
      ...keyHandlersRef.current,
      selectAll: selectAllEntries,
      clear: clearSelection,
    }
    return () => {
      // Keep existing handlers; no-op on cleanup to avoid clearing earlier bindings
    }
  }, [selectAllEntries, clearSelection])

  // Retry handler for ErrorBanner and auto-recovery
  const onRetry = useCallback(() => {
    setError(undefined)
    setReloadTick((n) => n + 1)
    setBucketsReloadTick((n) => n + 1)
  }, [])

  // Auto-retry when connection is restored and surface recovery status
  useEffect(() => {
    function handleOnline() {
      try {
        setBulkStatus('Back online. Refreshing…')
        setTimeout(() => setBulkStatus(undefined), 1500)
      } catch {}
      onRetry()
    }
    function handleOffline() {
      try {
        setBulkStatus('You are offline. Actions will queue and refresh on reconnect.')
      } catch {}
    }
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [onRetry])

  // Cleanup pending timers on unmount
  useEffect(() => {
    return () => {
      try {
        if (backoffTimerRef.current != null) {
          window.clearTimeout(backoffTimerRef.current)
          backoffTimerRef.current = null
        }
        listAbortRef.current?.abort()
        listAbortRef.current = null
      } catch {}
    }
  }, [])

  return (
    <div className="flex flex-col h-screen bg-background text-foreground">
      {/* Visually hidden live region for screen readers */}
      <div
        ref={liveRef}
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {srMessage}
      </div>
      <DevCanvasInfo targetRef={centerRef} />
      {/* Visual design & animations styles */}
      <style>{styles}</style>
      <style>{layoutStyles}</style>
      <style>{premiumStyles}</style>

      {/* Optional top header bar; hidden when props.hideHeader is true */}
      {!props.hideHeader && (
        <div
          className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-primary-600 to-primary-700 text-white shadow-lg backdrop-blur-sm"
          role="banner"
        >
          <div className="flex items-center gap-4">
            <div
              className="flex items-center gap-3 font-bold text-xl"
              aria-label="Cloud Storage"
            >
              <span className="text-2xl" aria-hidden>
                ☁️
              </span>
              <span className="text-white font-semibold tracking-tight">
                CloudStorage
              </span>
            </div>
            <nav
              className="flex items-center gap-2 text-sm font-medium"
              aria-label="Breadcrumb"
            >
              <Link
                href="/files"
                className="text-white hover:text-primary-100 transition-colors duration-200"
              >
                Home
              </Link>
              <span className="text-primary-200" aria-hidden>
                →
              </span>
              <Link
                href="/files"
                className="text-white hover:text-primary-100 transition-colors duration-200"
              >
                Files
              </Link>
              <span className="text-primary-200" aria-hidden>
                →
              </span>
              <span className="text-primary-100 font-semibold">
                {activeBucket || '(no bucket)'}
              </span>
              {(() => {
                const norm = (prefix || '').replace(/^\/+|\/+$/g, '')
                const segs = norm ? norm.split('/').filter(Boolean) : []
                const acc: string[] = []
                return segs.map((seg, idx) => {
                  acc.push(seg)
                  const p = acc.join('/') + '/'
                  return (
                    <React.Fragment key={idx}>
                      <span className="opacity-80" aria-hidden>
                        →
                      </span>
                      <button
                        className="text-white hover:underline bg-transparent border-none p-0 text-sm cursor-pointer"
                        data-testid={`breadcrumb-seg-${seg}`}
                        onClick={() => {
                          navByUserRef.current = true
                          setPrefix(p)
                        }}
                        title={`Go to ${p}`}
                      >
                        {seg}
                      </button>
                    </React.Fragment>
                  )
                })
              })()}
            </nav>
          </div>

          <div className="flex items-center gap-3">
            <button
              className="px-4 py-2.5 rounded-xl bg-white/15 border border-white/30 text-white text-sm font-semibold cursor-pointer transition-all duration-200 backdrop-blur-sm hover:bg-white/25 hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={async () => {
                const name = prompt('New bucket name')
                if (!name) return
                try {
                  await BucketsClient.create(name)
                  setBuckets((prev) => {
                    const exists = prev.some((b) => b.name === name)
                    const next = exists ? prev : [{ name }, ...prev]
                    return next
                  })
                  setActiveBucket(name)
                  setPrefix('')
                } catch (e: any) {
                  alert(e?.message || 'Failed to create bucket')
                }
              }}
              title="Create new bucket"
            >
              ➕ New Bucket
            </button>
            <button
              className="px-4 py-2.5 rounded-xl bg-white/15 border border-white/30 text-white text-sm font-semibold cursor-pointer transition-all duration-200 backdrop-blur-sm hover:bg-white/25 hover:-translate-y-0.5 hover:shadow-lg"
              onClick={() => setAdvancedOpen(true)}
              title="Advanced operations"
            >
              ⚙️ Settings
            </button>
            <button
              className="px-4 py-2.5 rounded-xl bg-white/15 border border-white/30 text-white text-sm font-semibold cursor-pointer transition-all duration-200 backdrop-blur-sm hover:bg-white/25 hover:-translate-y-0.5 hover:shadow-lg"
              onClick={() => setTasksOpen(true)}
              title="Background tasks"
            >
              📋 Tasks
            </button>
            <button
              className="px-4 py-2.5 rounded-xl bg-white/15 border border-white/30 text-white text-sm font-semibold cursor-pointer transition-all duration-200 backdrop-blur-sm hover:bg-white/25 hover:-translate-y-0.5 hover:shadow-lg"
              onClick={() => setRightTab('uploads')}
              title="Upload queue"
            >
              ⬆️ Uploads
            </button>
            <button
              className="px-4 py-2.5 rounded-xl bg-white/25 border border-white/40 text-white text-sm font-semibold cursor-pointer transition-all duration-200 backdrop-blur-sm hover:bg-white/35 hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={() => {
                const name = prompt('New folder name')
                if (!name) return
                void createFolderAtCurrent(name)
              }}
              disabled={!activeBucket}
              title={
                activeBucket
                  ? 'Create folder in current path'
                  : 'Select a bucket first'
              }
            >
              📁 New Folder
            </button>
            {prefix && prefix.replace(/^\/+|\/+$/g, '').length > 0 && (
              <button
                className="px-4 py-2.5 rounded-xl bg-white/15 border border-white/30 text-white text-sm font-semibold cursor-pointer transition-all duration-200 backdrop-blur-sm hover:bg-white/25 hover:-translate-y-0.5 hover:shadow-lg"
                onClick={() => {
                  const norm = (prefix || '').replace(/^\/+|\/+$/g, '')
                  const parts = norm.split('/').filter(Boolean)
                  parts.pop()
                  const parent = parts.length ? parts.join('/') + '/' : ''
                  navByUserRef.current = true
                  setPrefix(parent)
                }}
                title="Up one level"
              >
                ⬆ Up
              </button>
            )}
            <button
              className="px-4 py-2.5 rounded-xl bg-white/25 border border-white/40 text-white text-sm font-semibold cursor-pointer transition-all duration-200 backdrop-blur-sm hover:bg-white/35 hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={() => setUploadOpen(true)}
              disabled={!activeBucket}
              title={activeBucket ? 'Upload files' : 'Select a bucket first'}
            >
              📤 Upload
            </button>
            <button
              className="px-4 py-2.5 rounded-xl bg-white/15 border border-white/30 text-white text-sm font-semibold cursor-pointer transition-all duration-200 backdrop-blur-sm hover:bg-white/25 hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={async () => {
                try {
                  const path = `${activeBucket || ''}/${prefix || ''}`.replace(
                    /\/+/g,
                    '/'
                  )
                  await navigator.clipboard.writeText(path)
                } catch {}
              }}
              disabled={!activeBucket}
              title="Copy current bucket/prefix to clipboard"
            >
              🔗 Copy Path
            </button>
            <button
              className="px-4 py-2.5 rounded-xl bg-white/15 border border-white/30 text-white text-sm font-semibold cursor-pointer transition-all duration-200 backdrop-blur-sm hover:bg-white/25 hover:-translate-y-0.5 hover:shadow-lg"
              onClick={() => setGroupFolders((v: boolean) => !v)}
              title="Toggle folder grouping"
              aria-pressed={groupFolders}
            >
              {groupFolders ? 'Folders On' : 'Folders Off'}
            </button>
            <button
              className="px-4 py-2.5 rounded-xl bg-white/15 border border-white/30 text-white text-sm font-semibold cursor-pointer transition-all duration-200 backdrop-blur-sm hover:bg-white/25 hover:-translate-y-0.5 hover:shadow-lg"
              onClick={() => setHelpOpen(true)}
              title="Keyboard shortcuts"
              aria-haspopup="dialog"
              aria-controls="kb-help"
            >
              ❔ Help
            </button>
            {/* Theme controls moved to bottom of right panel */}
            <button
              className="w-10 h-10 rounded-full bg-white/20 border border-white/35 text-white text-sm font-bold flex items-center justify-center hover:bg-white/30 transition-colors duration-200"
              aria-label="User menu"
              title="User"
            >
              SJ
            </button>
            {/* Mobile/tablet quick toggles */}
            <button
              className="px-4 py-2.5 rounded-xl bg-white/15 border border-white/30 text-white text-sm font-semibold cursor-pointer transition-all duration-200 backdrop-blur-sm hover:bg-white/25 hover:-translate-y-0.5 hover:shadow-lg"
              title="Toggle left panel (Alt+1)"
              aria-controls="left-panel"
              aria-expanded={!leftCollapsed}
              onClick={() => {
                setLeftCollapsed((c) => {
                  const next = !c
                  try {
                    setSrMessage(
                      next ? 'Left panel shown' : 'Left panel hidden'
                    )
                  } catch {}
                  return next
                })
              }}
            >
              {leftCollapsed ? '⟵ Show' : '⟶ Hide'}
            </button>
            <button
              className="px-4 py-2.5 rounded-xl bg-white/15 border border-white/30 text-white text-sm font-semibold cursor-pointer transition-all duration-200 backdrop-blur-sm hover:bg-white/25 hover:-translate-y-0.5 hover:shadow-lg"
              title="Toggle right panel (Alt+3)"
              aria-controls="right-panel"
              aria-expanded={!rightCollapsed}
              onClick={() => {
                setRightCollapsed((c) => {
                  const next = !c
                  try {
                    setSrMessage(
                      next ? 'Right panel shown' : 'Right panel hidden'
                    )
                  } catch {}
                  return next
                })
              }}
            >
              {rightCollapsed ? 'Show ⟶' : 'Hide ⟶'}
            </button>
          </div>
        </div>
      )}

      {!props.hideHeader && (
        <div
          className="sticky top-16 z-20 bg-white/80 backdrop-blur-md border-b border-gray-200 shadow-sm"
          role="toolbar"
          aria-label="File actions and filters"
        >
          <UnifiedActionBar
            // Context
            selected={selected}
            files={files}
            activeBucket={activeBucket}
            prefix={prefix}
            loading={loading}
            viewMode={viewMode}
            sortBy={sortBy}
            sortOrder={sortOrder}
            sortBy2={sortBy2}
            sortOrder2={sortOrder2}
            searchText={searchText}
            groupFolders={groupFolders}
            // Actions / handlers
            onRefresh={onRefresh}
            onLoadMore={onLoadMore}
            canLoadMore={!!cursor}
            onDeleteSelected={onDeleteSelected}
            onCopySelected={onCopySelected}
            onMoveSelected={onMoveSelected}
            onRenameSelected={onRenameSelected}
            onShareSelected={onShareSelected}
            onOpenUpload={() => setUploadOpen(true)}
            onOpenAdmin={() => setAdminPanelOpen(true)}
            onOpenTasks={() => setTasksOpen(true)}
            onCreateFolder={() => {
              const name = prompt('New folder name')
              if (!name) return
              void createFolderAtCurrent(name)
            }}
            onOpenFolderOps={() => setFolderOpsOpen(true)}
            onOpenTemplate={() => {
              void promptAndCreateTemplate()
            }}
            onCreateBucket={() => {
              setNewBucketName('')
              setCreateBucketOpen(true)
            }}
            onChangeViewMode={setViewMode}
            onChangeSortBy={setSortBy}
            onToggleSortOrder={() =>
              setSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'))
            }
            onChangeSortBy2={setSortBy2 as any}
            onToggleSortOrder2={() =>
              setSortOrder2((o) => (o === 'asc' ? 'desc' : 'asc'))
            }
            onChangeSearchText={setSearchText}
            onChangeBucket={setActiveBucket}
            onChangePrefix={setPrefix}
            onToggleGroupFolders={() => setGroupFolders((v) => !v)}
            // Data
            buckets={buckets}
            fileCount={files.length}
            error={error}
          />
        </div>
      )}

      {/* Inline network/API error with retry and auto-recovery messaging */}
      {error && (
        <div className="px-4 py-3">
          <ErrorBanner error={error} onRetry={onRetry} />
        </div>
      )}

      {/* Live Search + Filter Ribbon toggle */}
      <div
        className="px-4 py-2 bg-gray-50 border-b border-gray-200"
        role="region"
        aria-label="Filters"
      >
        <button
          className="px-3 py-1.5 rounded-lg bg-white border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors duration-200"
          onClick={() => setShowFilters((v) => !v)}
          aria-expanded={showFilters}
          title="Show/hide search filters"
        >
          {showFilters ? 'Hide Filters' : 'Show Filters'}
        </button>
      </div>

      {/* Filter Ribbon */}
      {showFilters && (
        <div
          className="px-4 py-3 bg-white border-b border-gray-200 shadow-sm"
          role="region"
          aria-label="Search and filters"
        >
          <SearchBar
            value={{
              query: liveFilters?.query ?? searchText,
              regex: liveFilters?.regex ?? false,
              bucket: activeBucket || undefined,
              prefix,
              type: liveFilters?.type ?? 'any',
              mime_type: liveFilters?.mime_type,
              sizeGt: liveFilters?.sizeGt,
              sizeLt: liveFilters?.sizeLt,
              createdAfter: liveFilters?.createdAfter,
              createdBefore: liveFilters?.createdBefore,
              metadata: liveFilters?.metadata,
            }}
            onChange={(f) => {
              setLiveFilters(f)
              // Keep lightweight local text filtering in sync with free-text query
              const q = (f.query || '').trim()
              setSearchText(q)
              // Wire to centralized debounced search in store
              setSearchQuery(q)
              setSearchMode(f.regex ? 'fulltext' : 'prefix')
              setSearchFilters({
                types: f.type && f.type !== 'any' ? [f.type as any] : undefined,
                size: {
                  min: parseHumanSizeGlobal(f.sizeGt as any),
                  max: parseHumanSizeGlobal(f.sizeLt as any),
                },
                date: {
                  from: f.createdAfter || undefined,
                  to: f.createdBefore || undefined,
                },
                metadata: f.metadata || undefined,
              })
            }}
            onSubmit={(f) => {
              // Normalize and navigate to /search with query params for the dedicated Search page
              const qs = new URLSearchParams()
              if (f.query) qs.set('query', f.query)
              if (f.regex) qs.set('regex', '1')
              if (f.bucket) qs.set('bucket', f.bucket)
              if (f.prefix) qs.set('prefix', f.prefix)
              if (f.mime_type) qs.set('mime_type', f.mime_type)
              if (f.type && f.type !== 'any') qs.set('type', f.type)
              // Size/date as backend expects
              if (f.sizeGt) qs.set('size_gt', f.sizeGt as any)
              if (f.sizeLt) qs.set('size_lt', f.sizeLt as any)
              if (f.createdAfter) qs.set('created_after', f.createdAfter)
              if (f.createdBefore) qs.set('created_before', f.createdBefore)
              if (f.metadata) {
                for (const [k, v] of Object.entries(f.metadata)) {
                  const key = k.trim()
                  if (key) qs.set(`meta.${key}`, String(v ?? ''))
                }
              }
              const url = `/search${qs.toString() ? `?${qs.toString()}` : ''}`
              if (typeof window !== 'undefined') window.location.assign(url)
            }}
            placeholder="Live filter current folder…"
          />
        </div>
      )}

      {/* Custom full-width headers - removed from top */}

      <div
        className="flex flex-1 min-h-0"
        role="region"
        aria-label="File manager panels"
      >
        {/* Left panel */}
        <aside
          id="left-panel"
          suppressHydrationWarning
          className={`flex flex-col transition-all duration-200 ease-in-out border-r border-gray-200 bg-white ${leftCollapsed ? 'w-0 min-w-0 overflow-hidden pointer-events-none' : ''}`}
          style={{ width: leftCollapsed ? 0 : (mounted ? leftWidth : 240) }}
          aria-label="Buckets and prefixes"
        >
          <LeftTree
            buckets={buckets}
            activeBucket={activeBucket}
            onChangeBucket={setActiveBucket}
            prefix={prefix}
            onChangePrefix={(p) => {
              navByUserRef.current = true
              setPrefix(p)
            }}
            onFilterCategory={(c) => {
              setCategoryFilter(c)
              // reset and reload is handled by effect
            }}
            onDropToBucket={(b: string, opts?: { op?: 'move' | 'copy' }) => {
              if (selected.size === 0) return
              const op = opts?.op || 'move'
              const verb = op === 'copy' ? 'Copy' : 'Move'
              if (
                !confirm(
                  `${verb} ${selected.size} item(s) to bucket "${b}" at root?`
                )
              )
                return
              setDestMode(op)
              setDestPickerOpen(false)
              ;(async () => {
                const ids = Array.from(selected as Set<string>) as string[]
                const ops = ids.map(
                  (id: string) =>
                    ({
                      op,
                      id,
                      destBucket: b,
                      destKey: id.split('/').pop() || id,
                    }) as const
                )
                try {
                  const results = await FilesClient.batch(ops as any, {
                    transactional: op === 'move',
                  })
                  const failed = results.results.filter((r) => !r.ok).length
                  if (failed > 0) {
                    alert(
                      `${verb} completed with errors (${results.results.length - failed} ok, ${failed} failed)`
                    )
                  }
                  if (op === 'move') setSelected(new Set())
                  await loadFiles(true)
                } catch (e: any) {
                  alert(e?.message || `${verb} failed`)
                }
              })()
            }}
            onDropToPrefix={(
              b: string,
              p: string,
              opts?: { op?: 'move' | 'copy' }
            ) => {
              if (selected.size === 0) return
              const op = opts?.op || 'move'
              const verb = op === 'copy' ? 'Copy' : 'Move'
              if (
                !confirm(`${verb} ${selected.size} item(s) to ${b}/${p || ''}?`)
              )
                return
              setDestMode(op)
              setDestPickerOpen(false)
              ;(async () => {
                const ids = Array.from(selected as Set<string>) as string[]
                const ops = ids.map((id: string) => {
                  const base = id.split('/').pop() || id
                  const key = !p
                    ? base
                    : p.endsWith('/')
                      ? `${p}${base}`
                      : `${p}/${base}`
                  return { op, id, destBucket: b, destKey: key } as const
                })
                try {
                  const results = await FilesClient.batch(ops as any, {
                    transactional: op === 'move',
                  })
                  const failed = results.results.filter((r) => !r.ok).length
                  if (failed > 0) {
                    alert(
                      `${verb} completed with errors (${results.results.length - failed} ok, ${failed} failed)`
                    )
                  }
                  if (op === 'move') setSelected(new Set())
                  await loadFiles(true)
                } catch (e: any) {
                  alert(e?.message || `${verb} failed`)
                }
              })()
            }}
            canAdminBucket={true}
          />

          {/* Empty state helper when no buckets are available */}
          {(buckets?.length ?? 0) === 0 && (
            <div className="m-3 p-3 rounded-lg border border-amber-200 bg-amber-50 text-amber-800 text-sm">
              <div className="font-semibold mb-2">No buckets found</div>
              <button
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-white/70 border border-amber-300 text-amber-900 hover:bg-white transition"
                onClick={() => {
                  setNewBucketName('')
                  setCreateBucketOpen(true)
                }}
                title="Create new bucket"
              >
                ➕ Create bucket
              </button>
            </div>
          )}

          {/* Settings + Theme controls moved from TopNav to bottom of left panel */}
        </aside>

        {/* Left resizer */}
        {!leftCollapsed && (
          <div
            role="separator"
            suppressHydrationWarning
            aria-orientation="vertical"
            aria-valuemin={160}
            aria-valuemax={560}
            aria-valuenow={mounted ? Math.max(160, Math.min(560, leftWidth)) : 240}
            tabIndex={0}
            className="resizer"
            onMouseDown={(e) => {
              dragRef.current = {
                type: 'left',
                startX: e.clientX,
                startLeft: leftWidth,
                startRight: rightWidth,
              }
              document.body.style.cursor = 'col-resize'
              document.body.style.userSelect = 'none'
            }}
            onKeyDown={(e) => {
              const step = e.ctrlKey || e.altKey ? 24 : 12
              if (e.key === 'ArrowLeft') {
                e.preventDefault()
                setLeftWidth((w) => {
                  const next = Math.max(160, Math.min(560, w - step))
                  try {
                    setSrMessage(`Left panel width ${Math.round(next)} pixels`)
                  } catch {}
                  return next
                })
              } else if (e.key === 'ArrowRight') {
                e.preventDefault()
                setLeftWidth((w) => {
                  const next = Math.max(160, Math.min(560, w + step))
                  try {
                    setSrMessage(`Left panel width ${Math.round(next)} pixels`)
                  } catch {}
                  return next
                })
              }
            }}
            title="Drag or use Arrow keys (Ctrl/Alt for larger step) to resize left panel"
          />
        )}

        {/* Center panel */}
        <section
          className="flex flex-col flex-1 min-w-0 min-h-0 overflow-auto bg-white"
          aria-label="Objects"
          role="region"
          tabIndex={0}
        >
          {/* Middle-panel header (same height as App Header) */}
          <div
            className="sticky top-0 z-10 h-14 bg-white border-b border-gray-200 shadow-sm"
            role="region"
            aria-label="Current folder header"
          >
            <div className="flex items-center justify-between h-full px-4 gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <div
                  className="flex items-center gap-1 text-sm text-gray-600"
                  aria-label="Breadcrumb"
                >
                  {(() => {
                    const norm = (prefix || '').replace(/^\/+|\/+$/g, '')
                    const segs = norm ? norm.split('/').filter(Boolean) : []
                    const acc: string[] = []
                    // Start with bucket (or Files) as root crumb
                    const rootLabel = activeBucket ? activeBucket : 'Files'
                    const rootPrefix = '' // clicking root sends to bucket root
                    const crumbs: React.ReactNode[] = []
                    crumbs.push(
                      <React.Fragment key="root">
                        <button
                          className="text-blue-600 hover:text-blue-800 bg-transparent border-none p-0 text-sm cursor-pointer transition-colors duration-200"
                          data-testid="breadcrumb-root"
                          onClick={() => {
                            navByUserRef.current = true
                            setPrefix(rootPrefix)
                          }}
                          title={rootLabel}
                        >
                          {rootLabel}
                        </button>
                      </React.Fragment>
                    )
                    for (let i = 0; i < segs.length; i++) {
                      const seg = segs[i]
                      acc.push(seg)
                      const p = acc.join('/') + '/'
                      crumbs.push(
                        <React.Fragment key={i}>
                          <span className="text-gray-400 mx-1">/</span>
                          <button
                            className="text-blue-600 hover:text-blue-800 bg-transparent border-none p-0 text-sm cursor-pointer transition-colors duration-200"
                            data-testid={`breadcrumb-seg-${seg}`}
                            onClick={() => {
                              navByUserRef.current = true
                              setPrefix(p)
                            }}
                            title={`Go to ${p}`}
                          >
                            {seg}
                          </button>
                        </React.Fragment>
                      )
                    }
                    if (segs.length === 0) {
                      // show trailing slash muted when at root
                      crumbs.push(
                        <span className="text-gray-400 mx-1" key="sep-root">
                          /
                        </span>
                      )
                    }
                    return crumbs
                  })()}
                </div>
              </div>
              <div className="flex items-center gap-3">
                {/* Live collaborators presence (bucket/prefix scoped) */}
                <PresenceBar bucket={activeBucket} prefix={prefix} compact />
                <button
                  className="px-3 py-1.5 rounded-lg bg-gray-100 border border-gray-300 text-xs font-medium text-gray-700 hover:bg-gray-200 transition-colors duration-200"
                  onClick={() => setGroupFolders((v) => !v)}
                  aria-pressed={groupFolders}
                  title={groupFolders ? 'Folder view' : 'Flat view'}
                >
                  {groupFolders ? 'Folder' : 'Flat'}
                </button>
              </div>
            </div>
          </div>
          {/* Quick actions at top of middle (center) column */}
          <div className="px-4 py-3 bg-white border-b border-gray-200">
            <div className="flex items-center gap-3 flex-wrap">
              <button
                className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 text-blue-700 text-xl hover:bg-blue-100 transition"
                title="New folder"
                aria-label="New folder"
                onClick={() => {
                  const name = prompt('New folder name')
                  if (!name) return
                  void createFolderAtCurrent(name)
                }}
                disabled={!activeBucket}
                aria-disabled={!activeBucket}
              >
                <span aria-hidden="true">📁</span>
              </button>

              <button
                className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-700 text-xl hover:bg-indigo-100 transition"
                title="Upload"
                aria-label="Open uploads panel"
                onClick={() => setRightTab('uploads')}
                disabled={!activeBucket}
                aria-disabled={!activeBucket}
              >
                <span aria-hidden="true">⬆️</span>
              </button>

              <button
                className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 text-xl hover:bg-amber-100 transition"
                title="Tasks"
                aria-label="Open tasks drawer"
                onClick={() => setTasksOpen(true)}
              >
                <span aria-hidden="true">🧰</span>
              </button>

              <button
                className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 text-xl hover:bg-slate-100 transition"
                title="Settings"
                aria-label="Open settings"
                onClick={() => setAdvancedOpen(true)}
              >
                <span aria-hidden="true">⚙️</span>
              </button>

              <button
                className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-teal-50 border border-teal-200 text-teal-700 text-xl hover:bg-teal-100 transition"
                title="Copy current path"
                aria-label="Copy current path"
                onClick={async () => {
                  try {
                    const path =
                      `${activeBucket || ''}/${prefix || ''}`.replace(
                        /\/+/g,
                        '/'
                      )
                    await navigator.clipboard.writeText(path)
                  } catch {}
                }}
              >
                <span aria-hidden="true">🔗</span>
              </button>
            </div>
          </div>

          {/* Scrollable center content under the header */}
          <div
            ref={centerRef}
            id="files-canvas"
            data-testid="files-canvas"
            role="region"
            aria-label="Files canvas"
            className="flex-1 min-h-0 min-w-0 overflow-auto"
            onMouseDown={(e) => {
              // Clear selection when clicking on empty space of center content (not on an item)
              if (e.currentTarget === e.target) {
                setSelected(new Set())
              }
            }}
            onContextMenu={(e) => {
              // Only open when right-clicking the empty space (not a child row/cell)
              if (e.currentTarget !== e.target) return
              e.preventDefault()
              setBlankCtxX(e.clientX)
              setBlankCtxY(e.clientY)
              setBlankCtxOpen(true)
            }}
          >
            <DragDropZone
              bucket={activeBucket}
              prefix={prefix}
              onQueued={(count: number, _bytes: number) => {
                if (count > 0) setRightTab('uploads')
              }}
            >
              {/* Integrated ObjectExplorer (or Timeline view) */}
              {activeBucket ? (
                viewMode === 'timeline' ? (
                  <TimelineView
                    files={displayFiles}
                    onOpen={(f: FileMeta) => {
                      setSelected(new Set([f.id]))
                      setRightTab('preview')
                    }}
                  />
                ) : (
                  <>
                    {/* Initial skeletons while first page loads */}
                    {loading && files.length === 0 ? (
                      <div style={{ padding: 12, display: 'grid', gap: 8 }}>
                        {Array.from({ length: 8 }).map((_, i) => (
                          <div key={i} style={{ display: 'grid', gridTemplateColumns: '96px 1fr auto', gap: 12, alignItems: 'center' }}>
                            <Skeleton className="h-24 w-24" />
                            <div style={{ display: 'grid', gap: 8 }}>
                              <Skeleton className="h-5 w-[220px]" />
                              <Skeleton className="h-4 w-[160px]" />
                            </div>
                            <Skeleton className="h-8 w-24" />
                          </div>
                        ))}
                      </div>
                    ) : null}

                    <ObjectExplorer
                    bucketName={activeBucket!}
                    listApi={async (p: OEListParams): Promise<OEListResult> => {
                      // Helpers
                      const normalize = (k: string | undefined | null) =>
                        (k || '').replace(/^\/+|\/+$/g, '')
                      const ensureFolderKey = (k: string) => {
                        const n = normalize(k)
                        return n ? `${n}/` : ''
                      }
                      const basename = (k: string) => {
                        const n = normalize(k)
                        if (!n) return '/'
                        const parts = n.split('/').filter(Boolean)
                        return parts[parts.length - 1] || '/'
                      }

                      const bucket = p.bucket || activeBucket
                      const basePrefix = ensureFolderKey(p.prefix ?? prefix ?? '')
                      const limit =
                        typeof p.maxKeys === 'number' && p.maxKeys > 0
                          ? Math.min(p.maxKeys, 1000)
                          : 1000

                      // Cache hit fast-path
                      const ck = cacheKey(bucket, basePrefix, p.continuationToken as any)
                      const cached = pageCacheRef.current.get(ck)
                      if (cached) {
                        try {
                          perfMetricsRef.current.cacheHits += 1
                          emitPerfMetrics()
                        } catch {}
                        return {
                          folders: cached.folders,
                          objects: cached.objects,
                          nextContinuationToken: cached.nextContinuationToken,
                          total: cached.total,
                        }
                      }

                      // Fetch page (advanced hints best-effort)
                      const page = await FilesClient.list({
                        bucket,
                        prefix: basePrefix || '',
                        cursor: p.continuationToken as any,
                        limit,
                        category: undefined,
                        delimiter: p.delimiter ?? '/',
                        orderBy: p.orderBy as any,
                        direction: p.direction as any,
                        signal: (p as any)?.signal as any,
                      })

                      const items = Array.isArray(page?.items) ? page.items : []

                      // Folders (only when hierarchical delimiter requested)
                      const foldersSet = new Set<string>()
                      if (p.delimiter === '/' || p.delimiter === undefined) {
                        for (const f of items) {
                          const raw = normalize(f.key || f.name || '')
                          if (raw.endsWith('/')) {
                            if (basePrefix) {
                              const baseNorm = normalize(basePrefix)
                              if (raw.startsWith(baseNorm + '/')) {
                                const rel = raw.slice(baseNorm.length + 1)
                                const first = rel.split('/').filter(Boolean)[0]
                                if (first) foldersSet.add(`${baseNorm}/${first}`)
                              }
                            } else {
                              const first = raw.split('/').filter(Boolean)[0]
                              if (first) foldersSet.add(first)
                            }
                            continue
                          }
                          const rel = basePrefix
                            ? raw.startsWith(normalize(basePrefix) + '/')
                              ? raw.slice(normalize(basePrefix).length + 1)
                              : raw
                            : raw
                          if (!rel) continue
                          const parts = rel.split('/').filter(Boolean)
                          if (parts.length > 1) {
                            const first = parts[0]
                            const fold = basePrefix
                              ? `${normalize(basePrefix)}/${first}`
                              : first
                            foldersSet.add(fold)
                          }
                        }
                      }

                      const objects = items.map((f) => {
                        const k = normalize(f.key || f.name || f.id)
                        return {
                          key: k,
                          name: basename(k),
                          size: Number((f as any).size_bytes || 0),
                          lastModified:
                            (f as any).updated_at ||
                            (f as any).created_at ||
                            new Date(0).toISOString(),
                        }
                      })

                      const folders = Array.from(foldersSet)
                        .map((k) => ensureFolderKey(k))
                        .sort((a, b) => basename(a).localeCompare(b))
                        .map((k) => ({
                          key: ensureFolderKey(k),
                          name: basename(k),
                        }))

                      const result = {
                        folders,
                        objects,
                        nextContinuationToken: (page as any)?.next_cursor,
                        total: (page as any)?.total,
                      }

                      // Cache miss accounted before storing/prefetching
                      try {
                        perfMetricsRef.current.cacheMisses += 1
                        emitPerfMetrics()
                      } catch {}

                      // Store in cache and prefetch next page one step ahead
                      try {
                        pageCacheRef.current.set(ck, result)
                        ensureCacheBudget()
                        const nextCursor = (page as any)?.next_cursor
                        if (nextCursor) {
                          const nextKey = cacheKey(bucket, basePrefix, nextCursor)
                          // Only prefetch if not already cached
                          if (!pageCacheRef.current.has(nextKey)) {
                            // Fire-and-forget; rely on FilesClient GET cache + our cache
                            void FilesClient.list({
                              bucket,
                              prefix: basePrefix || '',
                              cursor: nextCursor,
                              limit,
                              delimiter: p.delimiter ?? '/',
                              orderBy: p.orderBy as any,
                              direction: p.direction as any,
                            }).then((np) => {
                              const nitems = Array.isArray(np?.items) ? np.items : []
                              const nFoldersSet = new Set<string>()
                              if (p.delimiter === '/' || p.delimiter === undefined) {
                                for (const f of nitems) {
                                  const raw = normalize(f.key || f.name || '')
                                  if (raw.endsWith('/')) {
                                    if (basePrefix) {
                                      const baseNorm = normalize(basePrefix)
                                      if (raw.startsWith(baseNorm + '/')) {
                                        const rel = raw.slice(baseNorm.length + 1)
                                        const first = rel.split('/').filter(Boolean)[0]
                                        if (first) nFoldersSet.add(`${baseNorm}/${first}`)
                                      }
                                    } else {
                                      const first = raw.split('/').filter(Boolean)[0]
                                      if (first) nFoldersSet.add(first)
                                    }
                                    continue
                                  }
                                  const rel = basePrefix
                                    ? raw.startsWith(normalize(basePrefix) + '/')
                                      ? raw.slice(normalize(basePrefix).length + 1)
                                      : raw
                                    : raw
                                  if (!rel) continue
                                  const parts = rel.split('/').filter(Boolean)
                                  if (parts.length > 1) {
                                    const first = parts[0]
                                    const fold = basePrefix
                                      ? `${normalize(basePrefix)}/${first}`
                                      : first
                                    nFoldersSet.add(fold)
                                  }
                                }
                              }
                              const nobjects = nitems.map((f) => {
                                const k = normalize(f.key || f.name || f.id)
                                return {
                                  key: k,
                                  name: basename(k),
                                  size: Number((f as any).size_bytes || 0),
                                  lastModified:
                                    (f as any).updated_at ||
                                    (f as any).created_at ||
                                    new Date(0).toISOString(),
                                }
                              })
                              const nfolders = Array.from(nFoldersSet)
                                .map((k) => ensureFolderKey(k))
                                .sort((a, b) => basename(a).localeCompare(b))
                                .map((k) => ({
                                  key: ensureFolderKey(k),
                                  name: basename(k),
                                }))
                              pageCacheRef.current.set(nextKey, {
                                folders: nfolders,
                                objects: nobjects,
                                nextContinuationToken: (np as any)?.next_cursor,
                                total: (np as any)?.total,
                              })
                              ensureCacheBudget()
                              try {
                                perfMetricsRef.current.prefetches += 1
                                emitPerfMetrics()
                              } catch {}
                            }).catch(() => { /* ignore prefetch errors */ })
                          }
                        }
                      } catch { /* ignore cache errors */ }

                      return result
                    }}
                  />
                  </>
                )
              ) : (
                <div style={{ padding: 16, color: '#6b7280' }}>
                  <div style={{ fontWeight: 600, marginBottom: 8 }}>
                    Select or create a bucket to begin.
                  </div>
                  <button
                    className="navlink"
                    onClick={() => {
                      setNewBucketName('')
                      setCreateBucketOpen(true)
                    }}
                    title="Create bucket"
                  >
                    ➕ Create bucket
                  </button>
                  <div style={{ fontSize: 12, marginTop: 8, opacity: 0.85 }}>
                    Tip: Press Alt+B to open the Create Bucket dialog.
                  </div>
                </div>
              )}
            </DragDropZone>
          </div>
          {/* Blank-area context menu (center content) */}
          <CtxMenu
            open={blankCtxOpen}
            x={blankCtxX}
            y={blankCtxY}
            items={blankMenuItems as any}
            onClose={() => setBlankCtxOpen(false)}
          />
        </section>

        {/* Right resizer */}
        {!rightCollapsed && (
          <div
            role="separator"
            suppressHydrationWarning
            aria-orientation="vertical"
            aria-valuemin={220}
            aria-valuemax={640}
            aria-valuenow={mounted ? Math.max(220, Math.min(640, rightWidth)) : 360}
            tabIndex={0}
            className="resizer"
            onMouseDown={(e) => {
              dragRef.current = {
                type: 'right',
                startX: e.clientX,
                startLeft: leftWidth,
                startRight: rightWidth,
              }
              document.body.style.cursor = 'col-resize'
              document.body.style.userSelect = 'none'
            }}
            onKeyDown={(e) => {
              const step = e.ctrlKey || e.altKey ? 24 : 12
              if (e.key === 'ArrowLeft') {
                e.preventDefault()
                setRightWidth((w) => {
                  const next = Math.max(220, Math.min(640, w + step))
                  try {
                    setSrMessage(`Right panel width ${Math.round(next)} pixels`)
                  } catch {}
                  return next
                })
              } else if (e.key === 'ArrowRight') {
                e.preventDefault()
                setRightWidth((w) => {
                  const next = Math.max(220, Math.min(640, w - step))
                  try {
                    setSrMessage(`Right panel width ${Math.round(next)} pixels`)
                  } catch {}
                  return next
                })
              }
            }}
            title="Drag or use Arrow keys (Ctrl/Alt for larger step) to resize right panel"
          />
        )}

        {/* Right panel */}
        <aside
          id="right-panel"
          suppressHydrationWarning
          className={`panel right bg-white border-l border-gray-200 ${rightCollapsed ? 'collapsed' : ''}`}
          style={{
            width: rightCollapsed ? 0 : (mounted ? rightWidth : 360),
            transition: 'width var(--motion-duration-fast) var(--motion-ease-standard)',
          }}
          aria-label="Details"
          role="complementary"
          aria-hidden={rightCollapsed ? 'true' : 'false'}
        >
          <div
            className="right-pane-inner"
            aria-label="Details, preview, uploads and bulk operations"
          >
            <div
              className="rp-head"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <span
                ref={rightHeadingRef}
                tabIndex={-1}
                role="heading"
                aria-level={2}
                aria-live="polite"
              >
                {rightTab === 'bulk'
                  ? 'Bulk actions'
                  : rightTab === 'preview'
                    ? 'Preview'
                    : rightTab === 'uploads'
                      ? 'Uploads'
                      : 'Details'}
              </span>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  className="navlink"
                  data-testid="tab-preview"
                  onClick={() => setRightTab('preview')}
                  aria-pressed={rightTab === 'preview'}
                  disabled={selected.size !== 1}
                  title={
                    selected.size !== 1
                      ? 'Select a single file to preview'
                      : 'Preview'
                  }
                >
                  Preview
                </button>
                <button
                  className="navlink"
                  data-testid="tab-details"
                  onClick={() => setRightTab('details')}
                  aria-pressed={rightTab === 'details'}
                >
                  Details
                </button>
                <button
                  className="navlink"
                  data-testid="tab-uploads"
                  onClick={() => setRightTab('uploads')}
                  aria-pressed={rightTab === 'uploads'}
                >
                  Uploads
                </button>
              </div>

              {/* Mobile bottom action sheet */}
              {isMobile && (
                <MobileActionSheet
                  selectionCount={selected.size}
                  canCopy={selected.size > 0 && !loading}
                  canMove={selected.size > 0 && !loading}
                  canRename={selected.size === 1 && !loading}
                  canDelete={selected.size > 0 && !loading}
                  canShare={selected.size === 1 && !loading}
                  onCopy={onCopySelected}
                  onMove={onMoveSelected}
                  onRename={onRenameSelected}
                  onDelete={onDeleteSelected}
                  onShare={onShareSelected}
                />
              )}
            </div>
            <div className="rp-body">
              {rightTab === 'bulk' ? (
                <BatchOperationsPanel
                  files={files}
                  selected={selected}
                  currentBucket={activeBucket}
                  currentPrefix={prefix}
                  onCompleted={() => {
                    void onRefresh()
                  }}
                />
              ) : rightTab === 'preview' ? (
                <PreviewPanel
                  file={selectedFile || undefined}
                  onPrev={onPreviewPrev}
                  onNext={onPreviewNext}
                />
              ) : rightTab === 'uploads' ? (
                <UploadProgressPanel
                  onAnyCompleted={() => {
                    void onRefresh()
                  }}
                />
              ) : (
                <FileDetailsPanel
                  file={selectedFile}
                  onUpdated={() => {
                    void onRefresh()
                  }}
                  onShare={(url) => {
                    try {
                      alert(
                        'Share URL generated and copied to clipboard:\n' + url
                      )
                    } catch {}
                  }}
                />
              )}

            </div>
          </div>
        </aside>
      </div>

      {/* Conflict Resolution Dialog */}
      {conflictOpen && (
        <div
          className="admin-modal-overlay"
          role="dialog"
          aria-modal="true"
          onClick={() => setConflictOpen(false)}
        >
          <div
            className="admin-modal-content"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 720 }}
          >
            <div style={{ padding: 16, display: 'grid', gap: 10 }}>
              <h2 style={{ margin: 0 }}>Resolve name conflicts</h2>
              <p style={{ color: '#6b7280', margin: 0 }}>
                Choose how to handle each conflicting item. You can also apply
                one choice to all.
              </p>

              {/* Apply to all */}
              <div
                style={{
                  display: 'flex',
                  gap: 8,
                  alignItems: 'center',
                  marginTop: 4,
                }}
              >
                <span style={{ fontSize: 13, color: '#475569' }}>
                  Apply to all:
                </span>
                {(['skip', 'overwrite', 'keep-both', 'rename'] as const).map(
                  (c) => (
                    <label
                      key={c}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        fontSize: 13,
                      }}
                    >
                      <input
                        type="radio"
                        name="applyAllChoice"
                        checked={conflictApplyAll?.choice === c}
                        onChange={() =>
                          setConflictApplyAll({
                            choice: c,
                            renameTo: conflictApplyAll?.renameTo,
                          })
                        }
                      />
                      {c}
                    </label>
                  )
                )}
                {conflictApplyAll?.choice === 'rename' && (
                  <input
                    placeholder="rename to (applied to all)"
                    value={conflictApplyAll?.renameTo || ''}
                    onChange={(e) =>
                      setConflictApplyAll({
                        choice: 'rename',
                        renameTo: e.target.value,
                      })
                    }
                    style={{
                      border: '1px solid #e5e7eb',
                      borderRadius: 6,
                      padding: '6px 8px',
                      fontSize: 13,
                    }}
                  />
                )}
                <button
                  className="navlink"
                  onClick={() => {
                    if (!conflictApplyAll) return
                    setConflictItems((items) =>
                      items.map((it) => ({
                        ...it,
                        choice: conflictApplyAll.choice,
                        renameTo:
                          conflictApplyAll.choice === 'rename'
                            ? conflictApplyAll.renameTo || it.baseName
                            : undefined,
                      }))
                    )
                  }}
                >
                  Apply
                </button>
              </div>

              {/* Per-item table */}
              <div
                style={{
                  border: '1px solid #e5e7eb',
                  borderRadius: 8,
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr 1fr auto',
                    gap: 8,
                    padding: 8,
                    background: '#f8fafc',
                    borderBottom: '1px solid #eef2f7',
                    fontWeight: 600,
                    fontSize: 13,
                  }}
                >
                  <div>Item</div>
                  <div>Destination</div>
                  <div>Choice</div>
                  <div>Rename to</div>
                </div>
                <div style={{ maxHeight: '40vh', overflow: 'auto' }}>
                  {conflictItems.map((it, idx) => (
                    <div
                      key={it.id}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr 1fr auto',
                        gap: 8,
                        padding: 8,
                        borderBottom: '1px solid #f1f5f9',
                        alignItems: 'center',
                        fontSize: 13,
                      }}
                    >
                      <div title={it.baseName}>{it.baseName}</div>
                      <div
                        title={`${it.destBucket}/${it.destKey}`}
                        style={{ color: '#64748b' }}
                      >
                        {it.destBucket}/{it.destKey}
                      </div>
                      <div
                        style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}
                      >
                        {(
                          ['skip', 'overwrite', 'keep-both', 'rename'] as const
                        ).map((c) => (
                          <label
                            key={c}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                            }}
                          >
                            <input
                              type="radio"
                              name={`choice-${it.id}`}
                              checked={it.choice === c}
                              onChange={() => {
                                setConflictItems((items) =>
                                  items.map((x, i) =>
                                    i === idx ? { ...x, choice: c } : x
                                  )
                                )
                              }}
                            />
                            {c}
                          </label>
                        ))}
                      </div>
                      <div>
                        <input
                          disabled={it.choice !== 'rename'}
                          value={it.renameTo || ''}
                          onChange={(e) =>
                            setConflictItems((items) =>
                              items.map((x, i) =>
                                i === idx
                                  ? { ...x, renameTo: e.target.value }
                                  : x
                              )
                            )
                          }
                          placeholder={it.baseName}
                          style={{
                            border: '1px solid #e5e7eb',
                            borderRadius: 6,
                            padding: '6px 8px',
                            fontSize: 13,
                            width: '100%',
                          }}
                        />
                      </div>
                    </div>
                  ))}
                  {conflictItems.length === 0 && (
                    <div style={{ padding: 12, color: '#64748b' }}>
                      No conflicts
                    </div>
                  )}
                </div>
              </div>

              <div
                style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}
              >
                <button
                  className="navlink"
                  onClick={() => setConflictOpen(false)}
                >
                  Cancel
                </button>
                <button
                  className="navlink"
                  onClick={async () => {
                    try {
                      setBulkStatus('Resolving conflicts…')
                      setConflictOpen(false)
                      const ops = pendingOpsRef.current || []
                      // Map per-item choices to adjusted operations
                      const choiceById = new Map(
                        conflictItems.map((ci) => [ci.id, ci])
                      )
                      const adjusted = ops.flatMap((o) => {
                        const ci = choiceById.get(o.id)
                        if (!ci) return [o]
                        if (ci.choice === 'skip') return []
                        if (ci.choice === 'rename') {
                          const base =
                            (ci.renameTo && ci.renameTo.trim()) || ci.baseName
                          const baseDir = (o as any).destKey.includes('/')
                            ? (o as any).destKey
                                .split('/')
                                .slice(0, -1)
                                .join('/')
                            : ''
                          const dk = baseDir ? `${baseDir}/${base}` : base
                          return [{ ...o, destKey: dk }]
                        }
                        if (ci.choice === 'keep-both') {
                          // engine will suffix automatically under keep-both policy if conflict occurs again
                          return [o]
                        }
                        if (ci.choice === 'overwrite') {
                          // Keep same destKey; backend must support overwrite. If not, items may still fail.
                          return [o]
                        }
                        return [o]
                      })

                      const mode = pendingModeRef.current
                      const exec = await runBatchOperations(adjusted as any, {
                        conflictPolicy:
                          conflictApplyAll?.choice === 'keep-both'
                            ? 'keep-both'
                            : 'fail',
                        rollbackOnFailure: mode === 'move',
                        chunkSize: 200,
                      })

                      const failed = exec.failures
                      if (failed.length > 0) {
                        const errors = failed
                          .map((r) => r.error)
                          .filter(Boolean)
                          .slice(0, 6)
                          .join('; ')
                        alert(
                          `Completed with errors (${exec.results.length - failed.length} ok, ${failed.length} failed): ${errors}`
                        )
                      } else {
                        setBulkStatus('Conflicts resolved successfully')
                      }

                      if (exec.reverseOps && exec.reverseOps.length) {
                        operationHistory.push({
                          label: mode === 'move' ? 'Move' : 'Copy',
                          createdAt: Date.now(),
                          reverseOps: exec.reverseOps.slice(),
                        })
                      }

                      try {
                        window.dispatchEvent(
                          new CustomEvent('afm:action', {
                            detail: { action: 'refresh' },
                          })
                        )
                      } catch {}
                    } catch (e: any) {
                      alert(e?.message || 'Failed to resolve conflicts')
                    } finally {
                      setTimeout(() => setBulkStatus(undefined), 2000)
                    }
                  }}
                >
                  Continue
                </button>
              </div>
            </div>
            <button
              className="admin-modal-close"
              aria-label="Close Conflicts"
              onClick={() => setConflictOpen(false)}
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* Settings modal mount (moved from TopNav) */}
      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />

      <UploadManager
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        bucket={activeBucket}
        prefix={prefix}
        onAnyCompleted={() => {
          // Refresh listing after any completion
          void onRefresh()
        }}
      />

      <DestinationPicker
        open={destPickerOpen}
        title={destMode === 'copy' ? 'Copy to…' : 'Move to…'}
        initialBucket={activeBucket}
        initialPrefix={prefix}
        onCancel={() => setDestPickerOpen(false)}
        onConfirm={onConfirmDestination}
      />

      <ViewerPane
        open={viewerOpen}
        file={viewerFile}
        onClose={() => setViewerOpen(false)}
      />

      <VersionsPanel
        open={versionsOpen}
        file={versionsFile}
        onClose={() => setVersionsOpen(false)}
        onRestored={() => {
          setVersionsOpen(false)
          void onRefresh()
        }}
      />

      <ShareLinkModal
        file={shareFile}
        open={shareOpen}
        onClose={() => setShareOpen(false)}
      />

      <MetadataPanel
        open={metadataOpen}
        file={metadataFile}
        onClose={() => setMetadataOpen(false)}
        onMetadataUpdate={() => {
          setMetadataOpen(false)
          void onRefresh()
        }}
      />

      {/* Create Bucket Modal */}
      {createBucketOpen && (
        <div
          className="admin-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-bucket-title"
          onClick={() => setCreateBucketOpen(false)}
        >
          <div
            className="admin-modal-content"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 480 }}
          >
            <div style={{ padding: 16 }}>
              <h2 id="create-bucket-title" style={{ marginBottom: 8 }}>Create bucket</h2>
              <p style={{ color: '#6b7280', marginBottom: 12 }}>
                Enter a unique bucket name.
              </p>
              <form
                onSubmit={async (e) => {
                  e.preventDefault()
                  const name = (newBucketName || '').trim()
                  if (!name) return
                  try {
                    await BucketsClient.create(name)
                    setBuckets((prev) =>
                      prev.some((b) => b.name === name)
                        ? prev
                        : [{ name }, ...prev]
                    )
                    setActiveBucket(name)
                    setPrefix('')
                    setCreateBucketOpen(false)
                    setNewBucketName('')
                  } catch (err: any) {
                    alert(err?.message || 'Failed to create bucket')
                  }
                }}
              >
                <input
                  type="text"
                  value={newBucketName}
                  onChange={(e) => setNewBucketName(e.target.value)}
                  placeholder="e.g. demo-bucket"
                  autoFocus
                  style={{
                    width: '100%',
                    border: '1px solid #e5e7eb',
                    borderRadius: 8,
                    padding: '8px 10px',
                    marginBottom: 12,
                  }}
                />
                <div
                  style={{
                    display: 'flex',
                    gap: 8,
                    justifyContent: 'flex-end',
                  }}
                >
                  <button
                    type="button"
                    className="navlink"
                    onClick={() => setCreateBucketOpen(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="navlink"
                    title="Create bucket"
                  >
                    Create
                  </button>
                </div>
              </form>
            </div>
            <button
              className="admin-modal-close"
              aria-label="Close Create Bucket"
              onClick={() => setCreateBucketOpen(false)}
            >
              ×
            </button>
          </div>
        </div>
      )}

      {adminPanelOpen && (
        <div
          className="admin-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Bucket administration"
          onClick={() => setAdminPanelOpen(false)}
        >
          <div
            className="admin-modal-content"
            onClick={(e) => e.stopPropagation()}
          >
            <BucketAdminPanel
              bucketName={activeBucket || ''}
              onSettingsUpdate={() => {
                setAdminPanelOpen(false)
                void onRefresh()
              }}
            />
            <button
              className="admin-modal-close"
              onClick={() => setAdminPanelOpen(false)}
              aria-label="Close bucket administration"
            >
              ×
            </button>
          </div>
        </div>
      )}
      <TaskDrawer
        open={tasksOpen}
        onClose={() => setTasksOpen(false)}
        defaultBucket={activeBucket}
        defaultPrefix={prefix}
      />

      {advancedOpen && (
        <div
          className="admin-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Advanced operations"
          onClick={() => setAdvancedOpen(false)}
        >
          <div
            className="admin-modal-content"
            onClick={(e) => e.stopPropagation()}
          >
            <AdvancedOpsPanel
              currentBucket={activeBucket}
              currentPrefix={prefix}
              onTaskCreated={() => setTasksOpen(true)}
              onClose={() => setAdvancedOpen(false)}
            />
            <button
              className="admin-modal-close"
              onClick={() => setAdvancedOpen(false)}
              aria-label="Close Advanced"
            >
              ×
            </button>
          </div>
        </div>
      )}
      {folderOpsOpen && activeBucket && (
        <div
          className="admin-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Folder operations"
          onClick={() => setFolderOpsOpen(false)}
        >
          <div
            className="admin-modal-content"
            onClick={(e) => e.stopPropagation()}
          >
            <FolderOperations
              currentBucket={activeBucket}
              currentPrefix={prefix}
              onOperationComplete={() => {
                setFolderOpsOpen(false)
                void onRefresh()
              }}
            />
            <button
              className="admin-modal-close"
              aria-label="Close Folder Operations"
              onClick={() => setFolderOpsOpen(false)}
            >
              ×
            </button>
          </div>
        </div>
      )}
      {/* Footer with Advanced Settings (visible on Files page) */}
      <FooterAdvancedSettings />

      <StatusBar
        selectedCount={selected.size}
        selectedSizeBytes={selectedSizeBytes}
        totalItems={files.length}
        loading={loading}
        opStatus={bulkStatus || (error ? `Error: ${error}` : undefined)}
      />

      {/* Keyboard Shortcuts Help Modal */}
      {helpOpen && (
        <div
          className="admin-modal-overlay"
          role="dialog"
          aria-modal="true"
          id="kb-help"
          onClick={() => setHelpOpen(false)}
        >
          <div
            className="admin-modal-content"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 640 }}
          >
            <div style={{ padding: 16 }}>
              <h2 style={{ marginBottom: 8 }}>Keyboard shortcuts</h2>
              <p style={{ color: '#6b7280', marginBottom: 12 }}>
                Boost your productivity with quick actions
              </p>
              <ul style={{ lineHeight: 1.9 }}>
                <li>
                  <b>?</b> or <b>Ctrl/Cmd + /</b>: open this help
                </li>
                <li>
                  <b>Alt + 1</b>/<b>2</b>/<b>3</b>: toggle/focus panels
                  (left/center/right)
                </li>
                <li>
                  <b>Alt + ArrowUp/ArrowLeft</b>: go up one folder
                </li>
                <li>
                  <b>Ctrl/Cmd + L</b>: focus path input
                </li>
                <li>
                  <b>Enter</b> or <b>Space</b>: select/open focused item
                </li>
                <li>
                  <b>Delete</b>: delete selected item(s)
                </li>
                <li>
                  <b>F2</b>: rename selected item
                </li>
                <li>
                  <b>Ctrl/Cmd + C</b>: share/copy link for selected file
                </li>
                <li>
                  <b>Ctrl/Cmd + V</b>: paste as move into current folder
                </li>
                <li>
                  <b>Shift + Click</b>: range-select between items
                </li>
                <li>
                  <b>Ctrl/Cmd + Click</b>: multi-select add/remove items
                </li>
              </ul>
              {customShortcuts ? (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>
                    Custom shortcuts
                  </div>
                  <ul style={{ lineHeight: 1.8, color: '#475569' }}>
                    {Object.entries(customShortcuts).map(([k, v]) =>
                      v ? (
                        <li key={k}>
                          <b>{shortcutLabels[k] || (k as string)}</b>:{' '}
                          {v as string}
                        </li>
                      ) : null
                    )}
                  </ul>
                </div>
              ) : null}
            </div>
            <button
              className="admin-modal-close"
              aria-label="Close help"
              onClick={() => setHelpOpen(false)}
            >
              ×
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/* ========== LeftTree ========== */
/* Externalized to reusable component at @/components/file-browser/LeftTree */

/* ========== Toolbar ========== */

type ToolbarProps = {
  buckets: BucketItem[]
  activeBucket?: string
  onChangeBucket: (name?: string) => void
  prefix: string
  onChangePrefix: (p: string) => void
  onRefresh: () => void
  onLoadMore: () => void
  canLoadMore: boolean
  onDeleteSelected: () => void
  onCopySelected: () => void
  onMoveSelected: () => void
  onRenameSelected: () => void
  onShareSelected: () => void
  canDelete: boolean
  canCopy: boolean
  canMove: boolean
  canRename: boolean
  loading: boolean
  error?: string
  fileCount: number
  onOpenUpload: () => void
  onOpenAdmin: () => void
  onOpenTasks: () => void
  canAdmin: boolean
  // New props
  viewMode: ViewMode
  onChangeViewMode: (m: ViewMode) => void
  sortBy: 'name' | 'size' | 'updated'
  sortOrder: 'asc' | 'desc'
  onChangeSortBy: (s: 'name' | 'size' | 'updated') => void
  onToggleSortOrder: () => void
  searchText: string
  onChangeSearchText: (t: string) => void
  onCreateFolder: () => void
}

function Toolbar(props: ToolbarProps) {
  const {
    buckets,
    activeBucket,
    onChangeBucket,
    prefix,
    onChangePrefix,
    onRefresh,
    onLoadMore,
    canLoadMore,
    onDeleteSelected,
    onCopySelected,
    onMoveSelected,
    onRenameSelected,
    onShareSelected,
    canDelete,
    canCopy,
    canMove,
    canRename,
    loading,
    error,
    fileCount,
    onOpenUpload,
    onOpenAdmin,
    onOpenTasks,
    canAdmin,
    // New props (ensure these are present to satisfy TS where used below)
    viewMode,
    onChangeViewMode,
    sortBy,
    sortOrder,
    onChangeSortBy,
    onToggleSortOrder,
    searchText,
    onChangeSearchText,
    onCreateFolder,
  } = props

  // Local access to search store for top SearchBar wiring
  const {
    search,
    setQuery: setSearchQuery,
    setFilters: setSearchFilters,
    setMode: setSearchMode,
  } = useSearch()

  // Local helper (cannot access outer parseHumanSizeGlobal from here)
  const parseHumanSizeLocal = (input?: string): number | undefined => {
    if (!input) return undefined
    const s = input.trim()
    if (!s) return undefined
    if (/^\d+$/.test(s)) return Number(s)
    const m = /^(\d+(?:\.\d+)?)\s*(K|M|G|T|KB|MB|GB|TB|KiB|MiB|GiB|TiB)$/i.exec(
      s
    )
    if (!m) return undefined
    const n = parseFloat(m[1])
    const unit = m[2].toLowerCase()
    const map: Record<string, number> = {
      k: 1000,
      kb: 1000,
      kib: 1024,
      m: 1000 ** 2,
      mb: 1000 ** 2,
      mib: 1024 ** 2,
      g: 1000 ** 3,
      gb: 1000 ** 3,
      gib: 1024 ** 3,
      t: 1000 ** 4,
      tb: 1000 ** 4,
      tib: 1024 ** 4,
    }
    const mul = map[unit] || 1
    return Math.round(n * mul)
  }

  const bucketOptions = useMemo(
    () =>
      buckets.map((b) => (
        <option key={b.name} value={b.name}>
          {b.name}
        </option>
      )),
    [buckets]
  )

  return (
    <div className="toolbar">
      {/* Left: bucket + prefix */}
      <label className="bucket-select">
        Bucket:{' '}
        <select
          value={activeBucket || ''}
          onChange={(e) => onChangeBucket(e.target.value || undefined)}
        >
          {bucketOptions}
        </select>
      </label>

      <input
        className="prefix-input"
        placeholder="prefix (folder path)"
        value={prefix}
        onChange={(e) => onChangePrefix(e.target.value)}
      />

      {/* View mode */}
      <div className="group">
        <span className="label">View:</span>
        <button
          onClick={() => onChangeViewMode('grid')}
          className={`btn ${viewMode === 'grid' ? 'active' : ''}`}
          title="Grid view"
        >
          Grid
        </button>
        <button
          onClick={() => onChangeViewMode('list')}
          className={`btn ${viewMode === 'list' ? 'active' : ''}`}
          title="List view"
        >
          List
        </button>
        <button
          onClick={() => onChangeViewMode('details')}
          className={`btn ${viewMode === 'details' ? 'active' : ''}`}
          title="Details view"
        >
          Details
        </button>
      </div>

      {/* Sort */}
      <div className="group">
        <span className="label">Sort:</span>
        <select
          value={sortBy}
          onChange={(e) => onChangeSortBy(e.target.value as any)}
        >
          <option value="name">Name</option>
          <option value="size">Size</option>
          <option value="updated">Updated</option>
        </select>
        <button
          className="btn"
          onClick={onToggleSortOrder}
          title="Toggle sort order"
        >
          {sortOrder === 'asc' ? 'Asc' : 'Desc'}
        </button>
      </div>

      {/* Search System */}
      <div style={{ flex: 1, minWidth: 360 }}>
        <SearchBar
          value={{
            query: searchText,
            bucket: activeBucket || undefined,
            prefix,
          }}
          onChange={(f) => {
            const q = (f.query || '').trim()
            onChangeSearchText(q)
            // Wire to centralized debounced search in store
            setSearchQuery(q)
            setSearchMode(f.regex ? 'fulltext' : 'prefix')
            setSearchFilters({
              // top search bar only provides basics by default; preserve existing filters
              types:
                f.type && f.type !== 'any'
                  ? [f.type as any]
                  : search.filters.types,
              size: {
                min:
                  parseHumanSizeLocal(f.sizeGt as any) ??
                  search.filters.size?.min,
                max:
                  parseHumanSizeLocal(f.sizeLt as any) ??
                  search.filters.size?.max,
              },
              date: {
                from: f.createdAfter || search.filters.date?.from,
                to: f.createdBefore || search.filters.date?.to,
              },
              metadata: f.metadata || search.filters.metadata,
            })
          }}
          onSubmit={(f) => {
            // Normalize and navigate to /search with query params for the dedicated Search page
            const qs = new URLSearchParams()
            if (f.query) qs.set('query', f.query)
            if (f.regex) qs.set('regex', '1')
            if (f.bucket) qs.set('bucket', f.bucket)
            if (f.prefix) qs.set('prefix', f.prefix)
            if (f.mime_type) qs.set('mime_type', f.mime_type)
            if (f.type && f.type !== 'any') qs.set('type', f.type)
            // Size/date as backend expects
            // Accept human inputs in SearchBar; here we forward raw strings if provided
            if (f.sizeGt) qs.set('size_gt', f.sizeGt as any)
            if (f.sizeLt) qs.set('size_lt', f.sizeLt as any)
            if (f.createdAfter) qs.set('created_after', f.createdAfter)
            if (f.createdBefore) qs.set('created_before', f.createdBefore)
            if (f.metadata) {
              for (const [k, v] of Object.entries(f.metadata)) {
                const key = k.trim()
                if (key) qs.set(`meta.${key}`, String(v ?? ''))
              }
            }
            const url = `/search${qs.toString() ? `?${qs.toString()}` : ''}`
            if (typeof window !== 'undefined') window.location.assign(url)
          }}
          placeholder="Search files (regex, filters, saved)…"
        />
      </div>

      {/* Actions */}
      <button onClick={onRefresh} disabled={!activeBucket || loading}>
        Refresh
      </button>
      <button onClick={onLoadMore} disabled={!canLoadMore || loading}>
        Load more
      </button>
      <button onClick={onOpenUpload} disabled={!activeBucket}>
        Upload
      </button>
      <button onClick={onCreateFolder} disabled={!activeBucket}>
        New Folder
      </button>
      <button onClick={onCopySelected} disabled={!canCopy}>
        Copy
      </button>
      <button onClick={onMoveSelected} disabled={!canMove}>
        Move
      </button>
      <button onClick={onRenameSelected} disabled={!canRename}>
        Rename
      </button>
      <button onClick={onShareSelected} disabled={!canRename}>
        Share
      </button>
      <button onClick={onDeleteSelected} disabled={!canDelete}>
        Delete
      </button>
      <button onClick={onOpenAdmin} disabled={!canAdmin}>
        Admin
      </button>
      <button onClick={onOpenTasks}>Tasks</button>

      <span className="status">
        {loading
          ? 'Loading…'
          : error
            ? `Error: ${error}`
            : `${fileCount} items${canDelete ? ` (${canDelete ? 'selected' : ''})` : ''}`}
      </span>
    </div>
  )
}

/* ========== FileGrid (virtualized, multi-select, context menu, tuned) ========== */

type FileGridProps = {
  files: FileMeta[] // flat list
  entries: BrowserEntry[] // folders + direct files (folders-first)
  viewMode: ViewMode
  selected: Set<string>
  setSelection: (next: Set<string>) => void
  onRename: (file: FileMeta) => void
  onOpenViewer: (file: FileMeta) => void
  onOpenVersions: (file: FileMeta) => void
  onOpenMetadata: (file: FileMeta) => void
  lastAnchorIndexRef: React.MutableRefObject<number | null>
  onOpenCopyMove: (mode: 'copy' | 'move') => void
  onBatchDelete: () => void
  onOpenFolder: (prefix: string) => void
  onAutoLoadMore: () => void
}

function FileGrid(props: FileGridProps) {
  const {
    files,
    entries,
    viewMode,
    selected,
    setSelection,
    onRename,
    onOpenViewer,
    onOpenVersions,
    onOpenMetadata,
    lastAnchorIndexRef,
    onOpenCopyMove,
    onBatchDelete,
    onOpenFolder,
    onAutoLoadMore,
  } = props

  // Context menu
  const [ctxOpen, setCtxOpen] = useState(false)
  const [ctxX, setCtxX] = useState(0)
  const [ctxY, setCtxY] = useState(0)
  const [ctxFile, setCtxFile] = useState<FileMeta | null>(null)

  const isMac =
    typeof navigator !== 'undefined' &&
    navigator.platform.toLowerCase().includes('mac')
  const metaKeyName = isMac ? 'metaKey' : 'ctrlKey'

  const applySelectAtIndex = useCallback(
    (e: React.MouseEvent | React.KeyboardEvent, index: number) => {
      const file = files[index]
      if (!file) return
      const id = file.id
      const additive = (e as any)[metaKeyName] === true
      const range = (e as any).shiftKey === true

      const next = new Set<string>(selected)
      if (range) {
        const anchor = lastAnchorIndexRef.current ?? index
        const [lo, hi] = anchor < index ? [anchor, index] : [index, anchor]
        for (let i = lo; i <= hi; i++) {
          const fid = files[i]?.id
          if (fid) next.add(fid)
        }
      } else if (additive) {
        if (next.has(id)) next.delete(id)
        else next.add(id)
        lastAnchorIndexRef.current = index
      } else {
        next.clear()
        next.add(id)
        lastAnchorIndexRef.current = index
      }
      setSelection(next)
    },
    [files, metaKeyName, selected, setSelection, lastAnchorIndexRef]
  )

  const openContextFor = useCallback(
    (e: React.MouseEvent, file: FileMeta, index: number) => {
      e.preventDefault()
      setCtxFile(file)
      setCtxX(e.clientX)
      setCtxY(e.clientY)
      setCtxOpen(true)
      // Ensure row is in selection
      const next = new Set<string>(selected)
      if (!next.has(file.id)) {
        next.clear()
        next.add(file.id)
        lastAnchorIndexRef.current = index
        setSelection(next)
      }
    },
    [selected, setSelection, lastAnchorIndexRef]
  )

  const menuItems = useMemo(() => {
    if (!ctxFile) return []
    const role: UserRole = getUserRole()
    const permissions = getUserPermissions()

    // Helpers
    const isMac =
      typeof navigator !== 'undefined' &&
      navigator.platform.toLowerCase().includes('mac')
    const makeShortcut = (win: string, mac: string) => (isMac ? mac : win)
    const copyToClipboard = async (text: string) => {
      try {
        await navigator.clipboard.writeText(text)
      } catch {
        /* ignore */
      }
    }

    // Build action-registry context for permission gating
    const ctx = {
      role,
      permissions,
      selection: selected,
      files,
      operations: {
        rename: (file: FileMeta) => onRename(file),
        openViewer: (file: FileMeta) => onOpenViewer(file),
        openVersions: (file: FileMeta) => onOpenVersions(file),
        openMetadata: (file: FileMeta) => onOpenMetadata(file),
        share: (_file: FileMeta) => {
          // Use global header bridge to trigger in-app Share dialog
          try {
            window.dispatchEvent(
              new CustomEvent('afm:action', { detail: { action: 'share' } })
            )
          } catch {}
        },
        download: (file: FileMeta) => {
          const a = document.createElement('a')
          a.href = `/api/files/${encodeURIComponent(file.id)}`
          a.download = file.name || file.key || file.id
          document.body.appendChild(a)
          a.click()
          document.body.removeChild(a)
        },
      },
    }

    // Registry-backed items (permission filtered)
    const supported = new Set([
      'preview',
      'versions',
      'rename',
      'metadata',
      'share',
      'download',
    ])
    const regActions = getActionsForContext(ctx as any).filter((a) =>
      supported.has(a.id)
    )
    const mapped = regActions.map((a) => ({
      label: a.label,
      onClick: a.build(ctx as any),
      disabled: a.enabled ? !a.enabled(ctx as any) : false,
      shortcutText: a.shortcut
        ? isMac
          ? a.shortcut.mac
          : a.shortcut.win
        : undefined,
    }))

    // Selected context
    const count = selected.size
    const f = ctxFile as FileMeta
    const fileDisplay = f?.name || f?.key || f?.id
    const hasKey = !!f?.key
    const pathForCopy = hasKey ? String(f.key) : fileDisplay

    // Advanced local items
    const advanced: any[] = []

    // Open group
    advanced.push({
      label: 'Open',
      onClick: () => onOpenViewer(f),
      disabled: !f,
      shortcutText: makeShortcut('Enter', 'Enter'),
    })
    advanced.push({
      label: 'Open in new tab',
      onClick: () => {
        if (typeof window !== 'undefined') {
          window.open(
            `/files/preview/${encodeURIComponent(f.id)}`,
            '_blank',
            'noopener,noreferrer'
          )
        }
      },
      disabled: !f,
    })

    // Reveal in folder (navigate to parent prefix)
    advanced.push({
      label: 'Reveal in folder',
      onClick: () => {
        if (!f) return
        const raw = (f.key || '').replace(/^\/+/, '')
        if (!raw) return
        const parts = raw.split('/').filter(Boolean)
        parts.pop()
        const parent = parts.length ? parts.join('/') + '/' : ''
        onOpenFolder(parent)
      },
      disabled: !hasKey,
    })

    // Clipboard group
    advanced.push({ label: '—', disabled: true, onClick: () => {} })
    advanced.push({
      label: 'Copy path',
      onClick: () => copyToClipboard(pathForCopy),
      disabled: !pathForCopy,
      shortcutText: makeShortcut('Ctrl+C', 'Cmd+C'),
    })
    advanced.push({
      label: 'Copy share link (presigned)',
      onClick: async () => {
        try {
          // Best-effort presign; may fail for synthetic object ids lacking DB metadata
          const res = await FilesClient.presign(f.id, {
            op: 'read',
            expireSeconds: 3600,
          })
          await copyToClipboard(res.url)
          try {
            alert('Presigned link copied to clipboard')
          } catch {}
        } catch (e) {
          try {
            alert('Failed to generate presigned link')
          } catch {}
        }
      },
      disabled: !f?.id,
    })

    // Selection utilities
    advanced.push({ label: '—', disabled: true, onClick: () => {} })
    advanced.push({
      label: 'Select all',
      onClick: () => {
        // Use entries in this grid scope
        const allIds = entries
          .filter((e) => e.kind === 'file')
          .map((e: any) => e.file.id as string)
          .filter(Boolean)
        setSelection(new Set(allIds))
      },
      disabled: entries.filter((e) => e.kind === 'file').length === 0,
      shortcutText: makeShortcut('Ctrl+A', 'Cmd+A'),
    })
    advanced.push({
      label: 'Clear selection',
      onClick: () => setSelection(new Set()),
      disabled: count === 0,
      shortcutText: 'Esc',
    })
    advanced.push({
      label: 'Invert selection',
      onClick: () => {
        const allIds = new Set(
          entries
            .filter((e) => e.kind === 'file')
            .map((e: any) => e.file.id as string)
            .filter(Boolean)
        )
        const next = new Set<string>()
        for (const id of allIds) {
          if (!selected.has(id)) next.add(id)
        }
        setSelection(next)
      },
      disabled: entries.filter((e) => e.kind === 'file').length === 0,
    })

    // Bulk ops group
    advanced.push({ label: '—', disabled: true, onClick: () => {} })
    advanced.push({
      label: 'Copy to…',
      onClick: () => onOpenCopyMove('copy'),
      disabled: selected.size === 0,
    })
    advanced.push({
      label: 'Move to…',
      onClick: () => onOpenCopyMove('move'),
      disabled: selected.size === 0,
    })
    advanced.push({
      label: count > 1 ? `Delete ${count} items` : 'Delete',
      onClick: () => onBatchDelete(),
      disabled: selected.size === 0,
      shortcutText: 'Del',
    })

    // Compose final list: registry actions on top, then advanced
    return [
      ...mapped,
      { label: '—', onClick: () => {}, disabled: true } as any,
      ...advanced,
    ]
  }, [
    ctxFile,
    files,
    selected,
    entries,
    setSelection,
    onOpenViewer,
    onOpenVersions,
    onRename,
    onOpenMetadata,
    onOpenCopyMove,
    onBatchDelete,
    onOpenFolder,
  ])

  // Renderers
  const ListRow = useCallback(
    ({ index, style }: { index: number; style: React.CSSProperties }) => {
      const entry = entries[index]
      if (!entry) return null
      if (entry.kind === 'folder') {
        const name = entry.name
        return (
          <div
            style={{ ...style }}
            className="grid-row"
            onClick={() => onOpenFolder(entry.prefix)}
            onDoubleClick={() => onOpenFolder(entry.prefix)}
            title={name}
            role="listitem"
            tabIndex={0}
          >
            <div className="thumb">
              <div className="placeholder">folder</div>
            </div>
            <div className="meta">
              <div className="name" style={{ fontWeight: 700 }}>
                {name}
              </div>
              <div className="sub">Folder</div>
            </div>
            <div className="actions">
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onOpenFolder(entry.prefix)
                }}
              >
                Open
              </button>
            </div>
          </div>
        )
      }
      const f = entry.file
      const sel = selected.has(f.id)
      return (
        <div
          style={{ ...style }}
          className={`grid-row ${sel ? 'selected' : ''}`}
          onClick={(e) => applySelectAtIndex(e, index)}
          onDoubleClick={() => onOpenViewer(f)}
          onContextMenu={(e) => openContextFor(e, f, index)}
          title={f.key || f.name}
          role="listitem"
          aria-selected={sel}
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              applySelectAtIndex(e as any, index)
              return
            }
            // Open context menu via keyboard (ContextMenu key or Shift+F10)
            if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
              e.preventDefault()
              // Ensure this row is selected (single-select)
              const next = new Set<string>(selected)
              if (!next.has(f.id)) {
                next.clear()
                next.add(f.id)
                lastAnchorIndexRef.current = index
                setSelection(next)
              }
              // Position menu at the row center
              const rect = (
                e.currentTarget as HTMLElement
              ).getBoundingClientRect()
              const cx = Math.round(rect.left + rect.width / 2)
              const cy = Math.round(rect.top + rect.height / 2)
              setCtxFile(f)
              setCtxX(cx)
              setCtxY(cy)
              setCtxOpen(true)
            }
          }}
        >
          <div className="thumb" style={{ position: 'relative' }}>
            <input
              type="checkbox"
              className="fi-checkbox"
              data-testid={`file-checkbox-${f.id}`}
              checked={sel}
              onChange={(ev) => {
                ev.stopPropagation()
                applySelectAtIndex(ev as any, index)
              }}
              aria-label={`Select ${f.name || f.key}`}
              style={{
                position: 'absolute',
                top: 6,
                left: 6,
                width: 16,
                height: 16,
              }}
              onClick={(ev) => ev.stopPropagation()}
            />
            {f.has_thumbnail ? (
              <ProgressiveThumb
                fileId={f.id}
                alt={f.name || f.key || f.id}
                width={96}
                height={96}
              />
            ) : (
              <FileTypeIcon file={f} size={96} />
            )}
          </div>
          <div className="meta">
            <div className="name">{f.name || f.key}</div>
            <div className="sub">
              <span>{formatBytes(f.size_bytes)}</span> ·{' '}
              <span>{f.mime_type}</span>
            </div>
          </div>
          <div className="actions">
            <button
              onClick={(e) => {
                e.stopPropagation()
                onRename(f)
              }}
            >
              Rename
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation()
                onOpenViewer(f)
              }}
            >
              Preview
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation()
                onOpenVersions(f)
              }}
            >
              Versions
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation()
                onOpenMetadata(f)
              }}
            >
              Metadata
            </button>
          </div>
        </div>
      )
    },
    [
      entries,
      selected,
      applySelectAtIndex,
      onOpenViewer,
      openContextFor,
      onRename,
      onOpenVersions,
      onOpenMetadata,
      onOpenFolder,
    ]
  )

  const DetailsRow = useCallback(
    ({ index, style }: { index: number; style: React.CSSProperties }) => {
      const entry = entries[index]
      if (!entry) return null
      if (entry.kind === 'folder') {
        const name = entry.name
        return (
          <div
            style={{
              ...style,
              display: 'grid',
              gridTemplateColumns: '48px 1fr 160px 220px 160px auto',
              alignItems: 'center',
              gap: 12,
              padding: 8,
              borderBottom: '1px solid #f0f0f0',
            }}
            title={name}
            role="row"
            tabIndex={0}
            onDoubleClick={() => onOpenFolder(entry.prefix)}
            onClick={() => onOpenFolder(entry.prefix)}
          >
            <div className="thumb" style={{ width: 48, height: 48 }}>
              <div className="placeholder">folder</div>
            </div>
            <div
              style={{
                fontWeight: 700,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {name}
            </div>
            <div>-</div>
            <div style={{ color: '#6b7280' }}>Folder</div>
            <div />
            <div style={{ justifySelf: 'end', display: 'flex', gap: 8 }}>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onOpenFolder(entry.prefix)
                }}
              >
                Open
              </button>
            </div>
          </div>
        )
      }
      const f = entry.file
      const sel = selected.has(f.id)
      return (
        <div
          style={{
            ...style,
            display: 'grid',
            gridTemplateColumns: '48px 1fr 160px 220px 160px auto',
            alignItems: 'center',
            gap: 12,
            padding: 8,
            borderBottom: '1px solid #f0f0f0',
          }}
          className={sel ? 'selected' : ''}
          onClick={(e) => applySelectAtIndex(e, index)}
          onDoubleClick={() => onOpenViewer(f)}
          onContextMenu={(e) => openContextFor(e, f, index)}
          title={f.key || f.name}
          role="row"
          aria-selected={sel}
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              applySelectAtIndex(e as any, index)
              return
            }
            // Open context menu via keyboard (ContextMenu key or Shift+F10)
            if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
              e.preventDefault()
              const next = new Set<string>(selected)
              if (!next.has(f.id)) {
                next.clear()
                next.add(f.id)
                lastAnchorIndexRef.current = index
                setSelection(next)
              }
              const rect = (
                e.currentTarget as HTMLElement
              ).getBoundingClientRect()
              const cx = Math.round(rect.left + rect.width / 2)
              const cy = Math.round(rect.top + rect.height / 2)
              setCtxFile(f)
              setCtxX(cx)
              setCtxY(cy)
              setCtxOpen(true)
            }
          }}
        >
          <div
            className="thumb"
            style={{ width: 48, height: 48, position: 'relative' }}
          >
            <input
              type="checkbox"
              className="fi-checkbox"
              data-testid={`file-checkbox-${f.id}`}
              checked={sel}
              onChange={(ev) => {
                ev.stopPropagation()
                applySelectAtIndex(ev as any, index)
              }}
              aria-label={`Select ${f.name || f.key}`}
              style={{
                position: 'absolute',
                top: 4,
                left: 4,
                width: 14,
                height: 14,
              }}
              onClick={(ev) => ev.stopPropagation()}
            />
            {f.has_thumbnail ? (
              <ProgressiveThumb
                fileId={f.id}
                alt={f.name || f.key || f.id}
                width={48}
                height={48}
              />
            ) : (
              <FileTypeIcon file={f} size={48} />
            )}
          </div>
          <div
            style={{
              fontWeight: 600,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {f.name || f.key}
          </div>
          <div>{formatBytes(f.size_bytes)}</div>
          <div style={{ color: '#6b7280' }}>{f.mime_type}</div>
          <div style={{ color: '#6b7280' }}>
            {f.updated_at ? new Date(f.updated_at).toLocaleString() : ''}
          </div>
          <div style={{ justifySelf: 'end', display: 'flex', gap: 8 }}>
            <button
              onClick={(e) => {
                e.stopPropagation()
                onRename(f)
              }}
            >
              Rename
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation()
                onOpenViewer(f)
              }}
            >
              Preview
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation()
                onOpenVersions(f)
              }}
            >
              Versions
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation()
                onOpenMetadata(f)
              }}
            >
              Metadata
            </button>
          </div>
        </div>
      )
    },
    [
      entries,
      selected,
      applySelectAtIndex,
      onOpenViewer,
      openContextFor,
      onRename,
      onOpenVersions,
      onOpenMetadata,
      onOpenFolder,
    ]
  )

  const GridCell = useCallback(
    ({
      columnIndex,
      rowIndex,
      style,
      data,
    }: {
      columnIndex: number
      rowIndex: number
      style: React.CSSProperties
      data: { columnCount: number }
    }) => {
      const index = rowIndex * data.columnCount + columnIndex
      if (index >= entries.length) return null
      const entry = entries[index]
      if (!entry) return null
      if (entry.kind === 'folder') {
        return (
          <div
            style={{ ...style, padding: 8 }}
            role="gridcell"
            tabIndex={0}
            onDoubleClick={() => onOpenFolder(entry.prefix)}
            onClick={() => onOpenFolder(entry.prefix)}
            title={entry.name}
          >
            <div className="grid-row" style={{ height: '100%' }}>
              <div
                className="thumb"
                style={{ width: 96, height: 96, margin: '0 auto' }}
              >
                <div className="placeholder">folder</div>
              </div>
              <div
                className="meta"
                style={{ textAlign: 'center', marginTop: 6 }}
              >
                <div
                  className="name"
                  style={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    fontWeight: 700,
                  }}
                >
                  {entry.name}
                </div>
                <div className="sub" style={{ color: '#6b7280', fontSize: 12 }}>
                  Folder
                </div>
              </div>
            </div>
          </div>
        )
      }
      const f = entry.file
      const sel = selected.has(f.id)
      return (
        <div
          style={{ ...style, padding: 8 }}
          className={sel ? 'selected' : ''}
          onClick={(e) => applySelectAtIndex(e as any, index)}
          onDoubleClick={() => onOpenViewer(f)}
          onContextMenu={(e) => openContextFor(e as any, f, index)}
          title={f.key || f.name}
          role="gridcell"
          aria-selected={sel}
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              applySelectAtIndex(e as any, index)
              return
            }
            // Open context menu via keyboard (ContextMenu key or Shift+F10)
            if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
              e.preventDefault()
              const next = new Set<string>(selected)
              if (!next.has(f.id)) {
                next.clear()
                next.add(f.id)
                lastAnchorIndexRef.current = index
                setSelection(next)
              }
              const rect = (
                e.currentTarget as HTMLElement
              ).getBoundingClientRect()
              const cx = Math.round(rect.left + rect.width / 2)
              const cy = Math.round(rect.top + rect.height / 2)
              setCtxFile(f)
              setCtxX(cx)
              setCtxY(cy)
              setCtxOpen(true)
            }
          }}
        >
          <div
            className={`grid-row ${sel ? 'selected' : ''}`}
            style={{ height: '100%', position: 'relative' }}
          >
            <input
              type="checkbox"
              className="fi-checkbox"
              data-testid={`file-checkbox-${f.id}`}
              checked={sel}
              onChange={(ev) => {
                ev.stopPropagation()
                applySelectAtIndex(ev as any, index)
              }}
              aria-label={`Select ${f.name || f.key}`}
              style={{
                position: 'absolute',
                top: 8,
                left: 8,
                width: 16,
                height: 16,
                zIndex: 2,
              }}
              onClick={(ev) => ev.stopPropagation()}
            />
            <div
              className="thumb"
              style={{ width: 96, height: 96, margin: '0 auto' }}
            >
              {f.has_thumbnail ? (
                 <ProgressiveThumb
                   fileId={f.id}
                   alt={f.name || f.key || f.id}
                   width={96}
                   height={96}
                 />
               ) : (
                 <FileTypeIcon file={f} size={96} />
               )}
            </div>
            <div className="meta" style={{ textAlign: 'center', marginTop: 6 }}>
              <div
                className="name"
                style={{
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {f.name || f.key}
              </div>
              <div className="sub" style={{ color: '#6b7280', fontSize: 12 }}>
                <span>{formatBytes(f.size_bytes)}</span>
              </div>
            </div>
          </div>
        </div>
      )
    },
    [
      entries,
      selected,
      applySelectAtIndex,
      onOpenViewer,
      openContextFor,
      onOpenFolder,
    ]
  )

  // Warm thumbnail cache for first screenful whenever files/viewMode change
  React.useEffect(() => {
    const head = files.slice(0, 60).map((f) => f.id)
    const size =
      viewMode === 'grid'
        ? { width: 96, height: 96 }
        : viewMode === 'details'
          ? { width: 48, height: 48 }
          : { width: 96, height: 96 }

    void FilesCache.warm(head, { ...size, format: 'webp', quality: 75 })
  }, [files, viewMode])

  // If virtualization library failed to load, provide a safe non-virtualized fallback
  const hasVirtual = !!FixedSizeList && !!FixedSizeGrid

  if (!hasVirtual) {
    return (
      <div
        className="grid"
        style={{ height: '100%', width: '100%', overflow: 'auto', padding: 8 }}
        onScroll={(e) => {
          const el = e.currentTarget
          if (el.scrollTop + el.clientHeight >= el.scrollHeight - 200) {
            onAutoLoadMore()
          }
        }}
      >
        <div
          role={viewMode === 'details' ? 'table' : 'list'}
          aria-label="Files (fallback list)"
        >
          {entries.map((entry, index) => {
            if (entry.kind === 'folder') {
              const name = entry.name
              return (
                <div
                  key={`folder-${name}-${index}`}
                  className="grid-row"
                  onClick={() => onOpenFolder(entry.prefix)}
                  onDoubleClick={() => onOpenFolder(entry.prefix)}
                  title={name}
                  role="listitem"
                  tabIndex={0}
                  style={{ marginBottom: 6 }}
                >
                  <div className="thumb">
                    <div className="placeholder">folder</div>
                  </div>
                  <div className="meta">
                    <div className="name" style={{ fontWeight: 700 }}>
                      {name}
                    </div>
                    <div className="sub">Folder</div>
                  </div>
                  <div className="actions">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onOpenFolder(entry.prefix)
                      }}
                    >
                      Open
                    </button>
                  </div>
                </div>
              )
            }
            const f = entry.file
            const sel = selected.has(f.id)
            return (
              <div
                key={`file-${f.id}-${index}`}
                className={`grid-row ${sel ? 'selected' : ''}`}
                onClick={(e) => applySelectAtIndex(e as any, index)}
                onDoubleClick={() => onOpenViewer(f)}
                onContextMenu={(e) => openContextFor(e as any, f, index)}
                title={f.key || f.name}
                role="listitem"
                aria-selected={sel}
                tabIndex={0}
                style={{ marginBottom: 6 }}
              >
                <div className="thumb">
                  {f.has_thumbnail ? (
                    <ProgressiveThumb
                      fileId={f.id}
                      alt={f.name || f.key || f.id}
                      width={96}
                      height={96}
                    />
                  ) : (
                    <FileTypeIcon file={f} size={96} />
                  )}
                </div>
                <div className="meta">
                  <div className="name">{f.name || f.key}</div>
                  <div className="sub">
                    <span>{formatBytes(f.size_bytes)}</span> ·{' '}
                    <span>{f.mime_type}</span>
                  </div>
                </div>
                <div className="actions">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onRename(f)
                    }}
                  >
                    Rename
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onOpenViewer(f)
                    }}
                  >
                    Preview
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onOpenVersions(f)
                    }}
                  >
                    Versions
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onOpenMetadata(f)
                    }}
                  >
                    Metadata
                  </button>
                </div>
              </div>
            )
          })}
        </div>
        <CtxMenu
          open={ctxOpen}
          x={ctxX}
          y={ctxY}
          items={menuItems as any}
          onClose={() => setCtxOpen(false)}
        />
      </div>
    )
  }

  return (
    <div className="grid" style={{ height: '100%', width: '100%' }}>
      <AutoSizer>
        {({ height, width }: { height: number; width: number }) => {
          if (viewMode === 'grid') {
            const columnWidth = 220
            const rowHeight = 240
            const columnCount = Math.max(1, Math.floor(width / columnWidth))
            const rowCount = Math.ceil(entries.length / columnCount)
            return (
              <>
                {FixedSizeGrid ? (
                  <FixedSizeGrid
                    height={height}
                    width={width}
                    columnCount={columnCount}
                    columnWidth={columnWidth}
                    rowCount={rowCount}
                    rowHeight={rowHeight}
                    itemData={{ columnCount }}
                    overscanRowCount={2}
                    overscanColumnCount={1}
                    onItemsRendered={(info: any) => {
                      const visibleRowStopIndex =
                        (info && info.visibleRowStopIndex) ?? 0
                      const lastFlatIndex =
                        (visibleRowStopIndex + 1) * columnCount - 1
                      if (lastFlatIndex >= entries.length - columnCount * 2) {
                        onAutoLoadMore()
                      }
                    }}
                  >
                    {GridCell as any}
                  </FixedSizeGrid>
                ) : null}
                <CtxMenu
                  open={ctxOpen}
                  x={ctxX}
                  y={ctxY}
                  items={menuItems as any}
                  onClose={() => setCtxOpen(false)}
                />
              </>
            )
          }

          // list and details use list with different row renderers
          const rowHeight = (viewMode as ViewMode) === 'details' ? 64 : 112
          const RowComp: React.FC<{
            index: number
            style: React.CSSProperties
          }> = (
            (viewMode as ViewMode) === 'details' ? DetailsRow : ListRow
          ) as any
          return (
            <>
              {FixedSizeList ? (
                <FixedSizeList
                  height={height}
                  width={width}
                  itemCount={entries.length}
                  itemSize={rowHeight}
                  overscanCount={6}
                  onItemsRendered={(info: any) => {
                    const visibleStopIndex =
                      (info && info.visibleStopIndex) ?? 0
                    if (visibleStopIndex >= entries.length - 5) {
                      onAutoLoadMore()
                    }
                  }}
                >
                  {({
                    index,
                    style,
                  }: {
                    index: number
                    style: React.CSSProperties
                  }) => <RowComp index={index} style={style} />}
                </FixedSizeList>
              ) : null}
              <CtxMenu
                open={ctxOpen}
                x={ctxX}
                y={ctxY}
                items={menuItems as any}
                onClose={() => setCtxOpen(false)}
              />
            </>
          )
        }}
      </AutoSizer>
    </div>
  )
}

/* ========== Utils & styles ========== */

function formatBytes(bytes: number) {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

const styles = `
/* Inline edit states */
.grid .grid-row input[aria-label="Rename file"] {
 background: #fff;
}
.grid .grid-row.selected input[aria-label="Rename file"] {
 background: #ffffff;
}
/* Screen-reader only helper */
.sr-only {
  position: absolute !important;
  width: 1px; height: 1px;
  padding: 0; margin: -1px;
  overflow: hidden; clip: rect(0, 0, 1px, 1px);
  white-space: nowrap; border: 0;
}

/* Focus styles for keyboard users */
:focus-visible {
  outline: 2px solid #1d4ed8;
  outline-offset: 2px;
}

/* Reduced motion preference */
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}

/* High contrast preference */
@media (prefers-contrast: more) {
  .fbs-header, .fbs-toolbar, .grid .grid-row, .rp-head {
    border-color: #000 !important;
  }
  .navlink, .btn, button {
    border-color: #000 !important;
    color: #000 !important;
    background: #fff !important;
  }
  .fi-checkbox, .thumb {
    border: 1px solid #000 !important;
  }
}
.fbs-root {
  display: grid;
  grid-template-columns: 260px 1fr;
  grid-template-rows: auto 1fr;
  height: calc(100vh - 72px);
  gap: 0;
}
.fbs-toolbar {
  grid-column: 1 / span 2;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px;
  border-bottom: 1px solid #e5e7eb;
  background: #fafafa;
}
.fbs-left {
  border-right: 1px solid #e5e7eb;
  padding: 10px;
  overflow: auto;
}
.fbs-right {
  padding: 10px;
  overflow: auto;
}
.left-tree .bucket-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 10px;
}
.left-tree .bucket {
  padding: 6px 8px;
  border-radius: 4px;
  cursor: pointer;
}
.left-tree .bucket.active {
  background: #e6f2ff;
  font-weight: 600;
}
.left-tree .prefix {
  margin-top: 12px;
  display: flex;
  gap: 6px;
  flex-direction: column;
}
.toolbar .bucket-select {
  margin-right: 8px;
}
.prefix-input {
  min-width: 260px;
  margin-right: 8px;
}
.status {
  margin-left: 8px;
  color: #6b7280;
  font-size: 12px;
}
.grid .grid-row {
  display: grid;
  grid-template-columns: 96px 1fr auto;
  align-items: center;
  gap: 12px;
  padding: 8px;
  border-bottom: 1px solid #f0f0f0;
  cursor: pointer;
}
.grid .grid-row.selected {
  background: #eef6ff;
}
.thumb {
  width: 96px;
  height: 96px;
  background: #f3f4f6;
  display: flex;
  align-items: center;
  justify-content: center;
}
.thumb img {
  max-width: 96px;
  max-height: 96px;
  object-fit: cover;
  border-radius: 4px;
}
.placeholder {
  font-size: 12px;
  color: #6b7280;
  text-transform: uppercase;
}
.meta .name {
  font-weight: 600;
}
.meta .sub {
  color: #6b7280;
  font-size: 12px;
  margin-top: 4px;
}

/* Header */
.fbs-header {
  grid-column: 1 / span 2;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border-bottom: 1px solid #e5e7eb;
  background: #ffffff;
}
.fbs-header .title {
  font-weight: 600;
  color: #111827;
}
.fbs-header .sep {
  margin: 0 6px;
  color: #9ca3af;
}
.fbs-header .crumb {
  color: #374151;
}
.fbs-header .links {
  display: flex;
  gap: 10px;
}
.navlink {
  font-size: 13px;
  color: #2563eb;
  background: #eef2ff;
  border: 1px solid #c7d2fe;
  padding: 4px 8px;
  border-radius: 6px;
  text-decoration: none;
  cursor: pointer;
}
.navlink:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* Admin Panel Modal */
.admin-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.admin-modal-content {
  position: relative;
  background: white;
  border-radius: 8px;
  max-width: 800px;
  max-height: 90vh;
  overflow: auto;
  margin: 20px;
}

.admin-modal-close {
  position: absolute;
  top: 12px;
  right: 12px;
  background: #f3f4f6;
  border: none;
  border-radius: 50%;
  width: 32px;
  height: 32px;
  font-size: 18px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.admin-modal-close:hover {
  background: #e5e7eb;
}
`

// Progressive thumbnail with WEBP-first and warm-up support
function ProgressiveThumb(props: {
  fileId: string
  width: number
  height: number
  alt?: string
}) {
  const { fileId, width, height, alt } = props
  const [srcSmall, setSrcSmall] = React.useState<string | null>(null)
  const [srcFull, setSrcFull] = React.useState<string | null>(null)
  const mounted = React.useRef(true)

  React.useEffect(() => {
    mounted.current = true
    setSrcSmall(null)
    setSrcFull(null)
    ;(async () => {
      try {
        // tiny preview (1/2 target) to display quickly
        const tiny = await FilesCache.getThumbnailObjectUrl(fileId, {
          width: Math.max(32, Math.floor(width / 2)),
          height: Math.max(32, Math.floor(height / 2)),
          format: 'webp',
          quality: 70,
        })
        if (mounted.current) setSrcSmall(tiny)
      } catch {
        // ignore, fallback will try full next
      }
      try {
        const full = await FilesCache.getThumbnailObjectUrl(fileId, {
          width,
          height,
          format: 'webp',
          quality: 85,
        })
        if (mounted.current) setSrcFull(full)
      } catch {
        // Final fallback: try jpeg at target size
        try {
          const jpg = await FilesCache.getThumbnailObjectUrl(fileId, {
            width,
            height,
            format: 'jpeg',
            quality: 85,
          })
          if (mounted.current) setSrcFull(jpg)
        } catch {
          // leave as-is, caller shows type placeholder
        }
      }
    })()
    return () => {
      mounted.current = false
    }
  }, [fileId, width, height])

  const show = srcFull || srcSmall
  if (!show) return <div className="placeholder" style={{ width, height }} />

  return (
    <img
      src={show}
      alt={alt || 'thumbnail'}
      loading="lazy"
      style={{
        width: '100%',
        height: '100%',
        objectFit: 'cover',
        imageRendering: srcFull ? 'auto' : 'pixelated',
        filter: srcFull ? 'none' : 'blur(8px)',
        transition: 'filter var(--motion-duration-fast) var(--motion-ease-standard)',
      }}
    />
  )
}

// Additional layout styles layered over the base styles
// Mobile bottom action sheet component (real React component, not part of CSS)
function MobileActionSheet(props: {
  selectionCount: number
  canCopy: boolean
  canMove: boolean
  canRename: boolean
  canDelete: boolean
  canShare: boolean
  onCopy: () => void
  onMove: () => void
  onRename: () => void
  onDelete: () => void
  onShare: () => void
}) {
  const {
    selectionCount,
    canCopy,
    canMove,
    canRename,
    canDelete,
    canShare,
    onCopy,
    onMove,
    onRename,
    onDelete,
    onShare,
  } = props
  const [open, setOpen] = React.useState(false)

  React.useEffect(() => {
    setOpen(selectionCount > 0)
  }, [selectionCount])

  const sheetStyle: React.CSSProperties = {
    position: 'fixed',
    left: 0,
    right: 0,
    bottom: 0,
    display: 'grid',
    gridAutoFlow: 'column',
    gap: 8,
    padding: '12px 12px calc(env(safe-area-inset-bottom, 0px) + 12px)',
    background: 'rgba(255,255,255,0.92)',
    backdropFilter: 'saturate(1.2) blur(8px)',
    WebkitBackdropFilter: 'saturate(1.2) blur(8px)',
    borderTop: '1px solid #e5e7eb',
    zIndex: 50,
  }
  const darkSheetStyle: React.CSSProperties = {
    background: 'rgba(11,17,32,0.9)',
    borderTop: '1px solid rgba(148,163,184,0.15)',
  }
  const btnStyle: React.CSSProperties = {
    height: 40,
    borderRadius: 10,
    border: '1px solid #c7d2fe',
    background: '#eef2ff',
    color: '#1e3a8a',
    fontWeight: 600,
  }
  const fabStyle: React.CSSProperties = {
    position: 'fixed',
    right: 16,
    bottom: 16,
    width: 48,
    height: 48,
    borderRadius: 999,
    border: '1px solid #c7d2fe',
    background: '#eef2ff',
    color: '#1e3a8a',
    fontSize: 20,
    boxShadow: '0 6px 18px rgba(17,24,39,0.12)',
    zIndex: 40,
  }
  const isDark =
    typeof window !== 'undefined' &&
    window.matchMedia &&
    window.matchMedia('(prefers-color-scheme: dark)').matches

  return (
    <>
      {selectionCount === 0 && (
        <button
          aria-label="Actions"
          style={fabStyle}
          onClick={() => setOpen((o) => !o)}
        >
          ⋯
        </button>
      )}
      {open && (
        <div
          role="region"
          aria-label="Mobile actions"
          style={{
            ...(isDark ? { ...sheetStyle, ...darkSheetStyle } : sheetStyle),
          }}
        >
          <button
            className="mbtn"
            style={btnStyle}
            disabled={!canCopy}
            onClick={onCopy}
            aria-disabled={!canCopy}
          >
            Copy
          </button>
          <button
            className="mbtn"
            style={btnStyle}
            disabled={!canMove}
            onClick={onMove}
            aria-disabled={!canMove}
          >
            Move
          </button>
          <button
            className="mbtn"
            style={btnStyle}
            disabled={!canRename}
            onClick={onRename}
            aria-disabled={!canRename}
          >
            Rename
          </button>
          <button
            className="mbtn"
            style={btnStyle}
            disabled={!canShare}
            onClick={onShare}
            aria-disabled={!canShare}
          >
            Share
          </button>
          <button
            className="mbtn"
            style={btnStyle}
            disabled={!canDelete}
            onClick={onDelete}
            aria-disabled={!canDelete}
          >
            Delete
          </button>
        </div>
      )}
    </>
  )
}

const layoutStyles = `
@media (prefers-reduced-motion: reduce) {
  .resizer::after { transition: none !important; }
}
.fbs-root {
 display: grid;
 grid-template-rows: auto auto auto auto 1fr; /* header, toolbar, H1, H2, panels */
 grid-template-columns: 1fr;
 height: calc(100vh - 0px);
}

.fbs-header { grid-row: 1; }
.fbs-toolbar { grid-row: 2; }
.hbar.h1 { grid-row: 3; }
.hbar.h2 { grid-row: 4; }
.fbs-main {
 grid-row: 5;
 display: flex;
 min-height: 0;
 min-width: 0;
 overflow: hidden;
}

.panel {
 position: relative;
 min-height: 0;
 min-width: 0;
 overflow: auto;
 transition: width var(--motion-duration-fast) var(--motion-ease-standard);
}
 
/* Full-width decorative header bars */
.hbar {
 width: 100%;
}
.hbar.h1 { height: 50px; background: #e0f2fe; border-bottom: 1px solid #bae6fd; }
.hbar.h2 { height: 40px; background: #f1f5f9; border-bottom: 1px solid #e2e8f0; }
 
/* Center-panel header (same size as App Header ~56px) */
.center-header {
  position: sticky;
  top: 0;
  height: var(--space-14, 56px);
  background: var(--surface, #ffffff);
  border-bottom: 1px solid var(--border, #e5e7eb);
  z-index: 50; /* ensure above any drop overlay */
  box-shadow: 0 1px 0 rgba(17,24,39,0.04);
}
.center-header .ch-inner {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  gap: 12px;
}
.center-header .ch-left {
  display: flex;
  align-items: baseline;
  gap: 10px;
  min-width: 0;
}
.center-header .ch-title {
  font-size: 14px;
  font-weight: 700;
  color: var(--foreground, #0f172a);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.center-header .ch-breadcrumb {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: #64748b;
  font-size: 12px;
  min-width: 0;
}
.center-header .crumb-sep { opacity: 0.7; }
.center-header .crumb-link {
  background: transparent;
  border: none;
  color: #2563eb;
  cursor: pointer;
  padding: 0;
  font-size: 12px;
}
.center-header .crumb-link:hover { text-decoration: underline; }
.center-header .crumb-muted { color: #94a3b8; }
.center-header .ch-right {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.center-header .ch-toggle {
  height: 32px;
  padding: 0 12px;
  border-radius: 10px;
  border: 1px solid var(--border, #e5e7eb);
  background: var(--surface, #fff);
  color: var(--foreground, #0f172a);
  font-size: 12px;
  cursor: pointer;
  transition: background var(--motion-duration-fast) var(--motion-ease-standard), border-color var(--motion-duration-fast) var(--motion-ease-standard), box-shadow var(--motion-duration-fast) var(--motion-ease-standard);
}
.center-header .ch-toggle:hover {
  background: color-mix(in oklab, var(--surface) 85%, white);
  border-color: color-mix(in oklab, var(--border) 70%, #a5b4fc);
  box-shadow: var(--shadow-2, 0 1px 0 rgba(17,24,39,0.02), 0 4px 10px rgba(17,24,39,0.06));
}

/* Dark scheme for center header */
@media (prefers-color-scheme: dark) {
  .center-header {
    background: #0b1220;
    border-bottom-color: rgba(148,163,184,0.25);
  }
  .center-header .ch-title { color: #e2e8f0; }
  .center-header .ch-breadcrumb { color: #94a3b8; }
  .center-header .ch-toggle {
    background: #0b1220;
    border-color: #1e293b;
    color: #cbd5e1;
  }
  .center-header .ch-toggle:hover {
    background: #0f1a2b;
    border-color: rgba(148,163,184,0.35);
  }
}

/* Make center panel a column layout: header fixed, panel itself scrolls */
.panel.center {
  display: flex;
  flex-direction: column;
  /* Sticky works within the nearest scroll container.
     Let the center panel be the scroller so the header sticks. */
  overflow: auto;
  min-height: 0;
  min-width: 0;
}
.center-content {
  flex: 1 1 auto;
  min-height: 0;
  min-width: 0;
  /* content inherits scrolling from .panel.center */
  overflow: visible;
}

.panel.left {
 border-right: 1px solid #e5e7eb;
}

.panel.right {
 border-left: 1px solid #e5e7eb;
 background: #fafafa;
 max-width: 60vw;
}

.panel.right.collapsed,
.panel.left.collapsed {
 width: 0 !important;
 min-width: 0 !important;
 overflow: hidden;
 pointer-events: none;
}

.resizer {
 width: 6px;
 cursor: col-resize;
 background: transparent;
 position: relative;
}
.resizer::after {
 content: '';
 position: absolute;
 top: 0; bottom: 0; left: 2px;
 width: 2px;
 background: #e5e7eb;
}
.resizer:hover::after {
 background: #cbd5e1;
}


.right-pane-inner {
 display: grid;
 grid-template-rows: auto 1fr;
 min-height: 100%;
}
.rp-head {
 padding: 10px 12px;
 border-bottom: 1px solid #e5e7eb;
 font-weight: 600;
 color: #374151;
}
.rp-body {
 padding: 10px 12px;
 display: grid;
 gap: 6px;
 color: #374151;
}
.rp-row {
 font-size: 13px;
}
`

// Premium, in-place polish styles (non-breaking). Targets visual quality, coherence, and accessibility.
const premiumStyles = `
/* Header + Toolbar: sticky, translucent, refined spacing */
.fbs-header, .fbs-toolbar {
 position: sticky;
 top: 0;
 z-index: 30;
 backdrop-filter: saturate(1.2) blur(6px);
 -webkit-backdrop-filter: saturate(1.2) blur(6px);
 background: color-mix(in oklab, var(--background) 82%, white);
 border-bottom: 1px solid color-mix(in oklab, var(--foreground) 12%, transparent);
}
.fbs-toolbar {
 top: 48px; /* stack under header */
}

/* Header typography and spacing */
.fbs-header {
 padding: 12px 16px;
}
.fbs-header .title {
 font-size: 14px;
 letter-spacing: 0.2px;
}
.fbs-header .crumb {
 color: color-mix(in oklab, var(--foreground) 78%, #6b7280);
}

/* Buttons and links: consistent sizes and interaction states */
.navlink, .btn, .fbs-toolbar button, .fbs-header .navlink, button {
 --btn-bg: #eef2ff;
 --btn-border: #c7d2fe;
 --btn-fg: #1e3a8a;
 --btn-bg-hover: #e0e7ff;
 --btn-bg-active: #c7d2fe;
 --btn-disabled: 0.5;

 display: inline-flex;
 align-items: center;
 justify-content: center;
 gap: 6px;
 height: 34px;
 padding: 0 10px;
 border-radius: 8px;
 border: 1px solid var(--btn-border);
 background: var(--btn-bg);
 color: var(--btn-fg);
 text-decoration: none;
 cursor: pointer;
 transition: background-color var(--motion-duration-fast) var(--motion-ease-standard), border-color var(--motion-duration-fast) var(--motion-ease-standard), transform var(--motion-duration-fast) var(--motion-ease-standard), box-shadow var(--motion-duration-fast) var(--motion-ease-standard), color var(--motion-duration-fast) var(--motion-ease-standard);
 user-select: none;
 will-change: transform;
}
.navlink:hover, .btn:hover, .fbs-toolbar button:hover, button:hover {
 background: var(--btn-bg-hover);
 border-color: #a5b4fc;
 box-shadow: 0 1px 0px rgba(17,24,39,0.02), 0 4px 10px rgba(17,24,39,0.06);
}
.navlink:active, .btn:active, .fbs-toolbar button:active, button:active {
 background: var(--btn-bg-active);
 transform: translateY(0.5px);
}
.navlink:disabled, .btn:disabled, .fbs-toolbar button:disabled, button:disabled {
 opacity: var(--btn-disabled);
 cursor: not-allowed;
 box-shadow: none;
 transform: none;
}

/* Toolbar layout refinement */
.toolbar {
 padding: 10px 12px;
 gap: 10px;
 background: transparent; /* inherited translucent backdrop from sticky container */
}
.toolbar .group {
 display: inline-flex;
 align-items: center;
 gap: 8px;
 padding: 0 6px;
 border-radius: 10px;
 background: color-mix(in oklab, var(--background) 92%, white);
 border: 1px solid color-mix(in oklab, var(--foreground) 10%, transparent);
}
.toolbar .label {
 font-size: 12px;
 color: #475569;
}
.bucket-select select, .prefix-input, .toolbar select {
 height: 34px;
 border-radius: 8px;
 border: 1px solid #e5e7eb;
 background: #fff;
 padding: 0 8px;
 transition: border-color var(--motion-duration-fast) var(--motion-ease-standard), box-shadow var(--motion-duration-fast) var(--motion-ease-standard);
}
.bucket-select select:focus, .prefix-input:focus, .toolbar select:focus {
 border-color: #93c5fd;
 box-shadow: 0 0 0 3px rgba(147,197,253,0.35);
 outline: none;
}
.prefix-input {
 min-width: 280px;
}
.status {
 margin-left: 8px;
 color: #6b7280;
 font-size: 12px;
}

/* Grid/List items: elevation, rounding, hover */
.grid .grid-row {
 border: 1px solid #eef2f7;
 margin: 6px 8px;
 border-radius: 10px;
 background: #fff;
 transition: box-shadow var(--motion-duration-fast) var(--motion-ease-standard), background-color var(--motion-duration-fast) var(--motion-ease-standard), transform var(--motion-duration-fast) var(--motion-ease-standard), border-color var(--motion-duration-fast) var(--motion-ease-standard);
}
.grid .grid-row:hover {
 box-shadow: 0 1px 0 rgba(17,24,39,0.03), 0 6px 18px rgba(17,24,39,0.06);
 border-color: #e5e7eb;
}
.grid .grid-row.selected {
 background: #eef6ff;
 border-color: #c7e0ff;
 box-shadow: 0 1px 0 rgba(29,78,216,0.05), 0 8px 20px rgba(29,78,216,0.08);
}

/* Thumbnails: softer background + subtle border */
.thumb {
 background: #f8fafc;
 border: 1px solid #f1f5f9;
 border-radius: 8px;
}
.thumb img {
 border-radius: 8px;
}

/* Resizers: slimmer with better affordance */
.resizer::after {
 width: 3px;
 left: 1.5px;
 background: #e2e8f0;
 transition: background var(--motion-duration-fast) var(--motion-ease-standard);
}
.panel.left,
.panel.right {
 will-change: width;
}
.resizer:hover::after {
 background: #cbd5e1;
}

/* Right panel surface */
.panel.right {
 background: linear-gradient(180deg, #fafafa, #ffffff 38%);
}

/* Focus ring harmonized with globals */
:focus-visible {
 outline-color: #0ea5e9;
 outline-offset: 3px;
 border-radius: 8px;
}

/* Header refined structure */
.fbs-header {
 display: flex;
 align-items: center;
 justify-content: space-between;
 gap: 12px;
 background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
 color: #fff;
 border-bottom: none;
 box-shadow: 0 2px 10px rgba(0,0,0,0.08);
}
.fbs-header .header-left {
 display: flex;
 align-items: center;
 gap: 14px;
}
.fbs-header .logo {
 display: flex;
 align-items: center;
 gap: 8px;
 font-weight: 800;
 letter-spacing: 0.2px;
}
.fbs-header .logo-emoji { font-size: 18px; }
.fbs-header .logo-text { font-size: 14px; }
.fbs-header .breadcrumb {
 display: flex;
 align-items: center;
 gap: 8px;
 font-size: 13px;
 opacity: 0.95;
}
.fbs-header .crumb-link {
 color: rgba(255,255,255,0.95);
 text-decoration: none;
}
.fbs-header .crumb-link:hover {
 text-decoration: underline;
}
.fbs-header .crumb-sep { opacity: 0.8; }
.fbs-header .crumb-current { color: #f0f9ff; font-weight: 600; }
.fbs-header .header-right {
 display: flex;
 align-items: center;
 gap: 8px;
}
.header-btn {
 padding: 8px 12px;
 border-radius: 8px;
 background: rgba(255,255,255,0.1);
 border: 1px solid rgba(255,255,255,0.25);
 color: #fff;
 font-size: 12px;
 font-weight: 600;
 cursor: pointer;
 transition: all 0.2s ease;
 backdrop-filter: blur(8px);
}
.header-btn:hover {
 background: rgba(255,255,255,0.2);
 transform: translateY(-1px);
}
.header-btn.primary {
 background: rgba(255,255,255,0.22);
 border-color: rgba(255,255,255,0.35);
}
.avatar {
 width: 32px;
 height: 32px;
 border-radius: 999px;
 background: rgba(255,255,255,0.2);
 border: 1px solid rgba(255,255,255,0.35);
 color: #fff;
 font-size: 12px;
 font-weight: 700;
 display: inline-flex;
 align-items: center;
 justify-content: center;
}

/* Dark scheme tuning */
@media (prefers-color-scheme: dark) {
 .fbs-header {
   background: linear-gradient(135deg, #1f2a44 0%, #1b2540 100%);
   color: #cbd5e1;
 }
 .header-btn {
   background: rgba(17,24,39,0.55);
   border-color: rgba(148,163,184,0.25);
   color: #e2e8f0;
 }
 .header-btn.primary {
   background: rgba(17,24,39,0.7);
   border-color: rgba(148,163,184,0.35);
 }
 .avatar {
   background: rgba(17,24,39,0.7);
   border-color: rgba(148,163,184,0.35);
   color: #e2e8f0;
 }
}

/* Mobile-first responsive classes for action FAB and bottom sheet */
.mobile-fab {
 position: fixed;
 right: 16px;
 bottom: calc(env(safe-area-inset-bottom, 0px) + 16px);
 width: 48px;
 height: 48px;
 border-radius: 999px;
 border: 1px solid var(--border, #c7d2fe);
 background: color-mix(in oklab, var(--surface, #eef2ff) 92%, white);
 color: color-mix(in oklab, var(--brand-600, #1e3a8a) 90%, black);
 font-size: 20px;
 box-shadow: 0 6px 18px rgba(17,24,39,0.12);
 z-index: 60;
}
.mobile-fab:hover {
 filter: brightness(0.98);
}

.mobile-sheet {
 position: fixed;
 left: 0; right: 0;
 bottom: 0;
 display: grid;
 grid-auto-flow: column;
 gap: 8px;
 padding: 12px 12px calc(env(safe-area-inset-bottom, 0px) + 12px);
 background: color-mix(in oklab, var(--surface, #ffffff) 92%, transparent);
 -webkit-backdrop-filter: saturate(1.2) blur(10px);
 backdrop-filter: saturate(1.2) blur(10px);
 border-top: 1px solid var(--border, #e5e7eb);
 z-index: 55;
}
.mobile-sheet .mbtn {
 height: 40px;
 border-radius: 10px;
 border: 1px solid var(--border, #c7d2fe);
 background: color-mix(in oklab, var(--surface, #eef2ff) 96%, white);
 color: color-mix(in oklab, var(--brand-600, #1e3a8a) 80%, black);
 font-weight: 600;
}
.mobile-sheet .mbtn:disabled {
 opacity: 0.5;
 cursor: not-allowed;
}

@media (prefers-color-scheme: dark) {
 .mobile-sheet {
   background: color-mix(in oklab, var(--surface, #0b1220) 92%, transparent);
   border-top-color: rgba(148,163,184,0.18);
 }
 .mobile-sheet .mbtn {
   border-color: rgba(148,163,184,0.25);
   background: #0f172a;
   color: #cbd5e1;
 }
 .mobile-fab {
   border-color: rgba(148,163,184,0.25);
   background: #0f172a;
   color: #cbd5e1;
   box-shadow: 0 6px 18px rgba(0,0,0,0.35);
 }
}

/* Narrow viewport tuning */
@media (max-width: 768px) {
 .fbs-toolbar { display: none; } /* keep header compact; actions via bottom sheet */
 .resizer { width: 10px; } /* larger touch target */
 .panel.right { max-width: 100vw; }
}

/* Dark scheme tuning */
@media (prefers-color-scheme: dark) {
 .fbs-header, .fbs-toolbar {
   background: color-mix(in oklab, var(--background) 78%, #0b1220);
   border-bottom-color: color-mix(in oklab, var(--foreground) 18%, transparent);
 }
 .navlink, .btn, .fbs-toolbar button, button {
   --btn-bg: #0f172a;
   --btn-border: #1e293b;
   --btn-fg: #cbd5e1;
   --btn-bg-hover: #111827;
   --btn-bg-active: #0b1324;
 }
 .grid .grid-row {
   background: #0b1220;
   border-color: #0f1a2b;
 }
 .grid .grid-row:hover {
   border-color: #122033;
   box-shadow: 0 1px 0 rgba(0,0,0,0.2), 0 8px 22px rgba(0,0,0,0.35);
 }
 .grid .grid-row.selected {
   background: #0c1d33;
   border-color: #173a66;
 }
 .thumb {
   background: #0e1726;
   border-color: #122033;
 }
 .panel.right {
   background: linear-gradient(180deg, #0b1220, #0a0f1a 40%);
 }
}
`

/**
 * Lightweight timeline view grouped by Year-Month, using already filtered/sorted displayFiles.
 */
function TimelineView(props: {
  files: FileMeta[]
  onOpen: (f: FileMeta) => void
}) {
  const { files, onOpen } = props
  const groups = React.useMemo(() => {
    const map = new Map<string, FileMeta[]>()
    for (const f of files) {
      const ts = f.updated_at || f.created_at || new Date(0).toISOString()
      const d = new Date(ts)
      const label = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      if (!map.has(label)) map.set(label, [])
      map.get(label)!.push(f)
    }
    // Sort groups by label desc (most recent first)
    const entries = Array.from(map.entries()).sort((a, b) =>
      a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0
    )
    return entries
  }, [files])

  return (
    <div style={{ padding: 12 }}>
      {groups.map(([ym, items]) => (
        <div key={ym} style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 700, margin: '12px 0 6px 0' }}>{ym}</div>
          <div
            role="list"
            aria-label={`Files for ${ym}`}
            style={{ display: 'grid', gap: 6 }}
          >
            {items.map((f) => (
              <div
                key={f.id}
                role="listitem"
                onDoubleClick={() => onOpen(f)}
                onClick={() => onOpen(f)}
                title={f.name || f.key}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 120px 220px',
                  alignItems: 'center',
                  padding: 8,
                  border: '1px solid #eef2f7',
                  borderRadius: 8,
                  background: '#fff',
                  cursor: 'pointer',
                }}
              >
                <div
                  style={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    fontWeight: 600,
                  }}
                >
                  {f.name || f.key}
                </div>
                <div style={{ color: '#6b7280', fontSize: 12 }}>
                  {formatBytes(f.size_bytes || 0)}
                </div>
                <div style={{ color: '#6b7280', fontSize: 12 }}>
                  {(f.updated_at
                    ? new Date(f.updated_at)
                    : f.created_at
                      ? new Date(f.created_at)
                      : new Date()
                  ).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
      {groups.length === 0 ? (
        <div style={{ color: '#6b7280' }}>No files</div>
      ) : null}
    </div>
  )
}

export default FileBrowserShell
