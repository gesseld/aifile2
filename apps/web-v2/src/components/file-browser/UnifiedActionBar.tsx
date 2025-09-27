'use client'

import React, { useMemo } from 'react'
import type { FileMeta } from '@/lib/file-manager-client'
import {
  getActionsForContext,
  getUserRole,
  getUserPermissions,
  type UserRole,
  type ActionDescriptor,
} from '@/lib/action-registry'

interface UnifiedActionBarProps {
  // Context state
  selected: Set<string>
  files: FileMeta[]
  activeBucket?: string
  prefix: string
  loading: boolean
  viewMode: 'grid' | 'list' | 'details' | 'timeline'
  sortBy: 'name' | 'size' | 'updated'
  sortOrder: 'asc' | 'desc'
  // Optional secondary sort for multi-criteria
  sortBy2?: 'name' | 'size' | 'updated'
  sortOrder2?: 'asc' | 'desc'
  searchText: string
  groupFolders: boolean

  // Action handlers
  onRefresh: () => void
  onLoadMore: () => void
  canLoadMore: boolean
  onDeleteSelected: () => void
  onCopySelected: () => void
  onMoveSelected: () => void
  onRenameSelected: () => void
  onShareSelected: () => void
  onOpenUpload: () => void
  onOpenAdmin: () => void
  onOpenTasks: () => void
  onCreateFolder: () => void
  onOpenFolderOps: () => void
  onOpenTemplate: () => void
  onChangeViewMode: (mode: 'grid' | 'list' | 'details' | 'timeline') => void
  onChangeSortBy: (sortBy: 'name' | 'size' | 'updated') => void
  onToggleSortOrder: () => void
  // Secondary sort handlers (optional)
  onChangeSortBy2?: (sortBy?: 'name' | 'size' | 'updated') => void
  onToggleSortOrder2?: () => void
  onChangeSearchText: (text: string) => void
  onChangeBucket: (bucket?: string) => void
  onChangePrefix: (prefix: string) => void
  onToggleGroupFolders: () => void
  onCreateBucket?: () => void

  // Data
  buckets: Array<{ name: string }>
  fileCount: number
  error?: string
}

export default function UnifiedActionBar(props: UnifiedActionBarProps) {
  const {
    selected,
    files,
    activeBucket,
    prefix,
    loading,
    viewMode,
    sortBy,
    sortOrder,
    sortBy2,
    sortOrder2,
    searchText,
    groupFolders,

    onRefresh,
    onLoadMore,
    canLoadMore,
    onDeleteSelected,
    onCopySelected,
    onMoveSelected,
    onRenameSelected,
    onShareSelected,
    onOpenUpload,
    onOpenAdmin,
    onOpenTasks,
    onCreateFolder,
    onOpenFolderOps,
    onOpenTemplate,
    onChangeViewMode,
    onChangeSortBy,
    onToggleSortOrder,
    onChangeSortBy2,
    onToggleSortOrder2,
    onChangeSearchText,
    onChangeBucket,
    onChangePrefix,
    onToggleGroupFolders,
    onCreateBucket,

    buckets,
    fileCount,
    error,
  } = props

  // Tailwind utility mappings using globals.css tokens
  const ui = {
    root: 'rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)] shadow-soft p-3 md:p-4 space-y-3',
    section: 'flex flex-wrap items-center justify-between gap-2',
    group: 'flex items-center gap-2',
    contextBadge:
      'text-xs font-semibold rounded-md px-2 py-1 bg-[var(--accent)]/15 border border-[var(--border)] text-[var(--foreground)]',
    btn: 'inline-flex items-center gap-2 h-9 px-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)] hover:bg-[var(--accent)]/20 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] shadow-soft transition',
    iconBtn:
      'inline-flex items-center justify-center w-8 h-8 rounded-md border border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)] hover:bg-[var(--accent)]/20 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] shadow-soft transition',
    input:
      'h-9 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]',
    select:
      'h-9 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)] px-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]',
    status:
      'text-xs px-2 py-1 rounded-md bg-[var(--accent)]/10 text-[var(--muted-foreground)]',
    viewBtn: (active: boolean) =>
      `inline-flex items-center justify-center w-8 h-8 rounded-md border ${active ? 'bg-[var(--accent)]/25 border-[var(--border)]' : 'bg-[var(--surface)] border-[var(--border)]'} text-[var(--foreground)] hover:bg-[var(--accent)]/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] shadow-soft`,
  }

  // Selection-driven context summary
  const selectionContext = useMemo(() => {
    const selectedFiles = files.filter((f) => selected.has(f.id))
    const selectedCount = selected.size
    const hasSelection = selectedCount > 0
    const isSingleSelection = selectedCount === 1
    const isMultiSelection = selectedCount > 1
    const selectedFile = isSingleSelection ? selectedFiles[0] : null
    const isFolderSelected = !!(
      selectedFile &&
      ((selectedFile as any)?.mime_type === 'folder' ||
        (selectedFile.key || selectedFile.name || '').endsWith('/'))
    )

    return {
      selectedCount,
      hasSelection,
      isSingleSelection,
      isMultiSelection,
      selectedFile,
      isFolderSelected,
      canDelete: hasSelection && !loading,
      canCopy: hasSelection && !loading,
      canMove: hasSelection && !loading,
      canRename: isSingleSelection && !loading,
      canShare: isSingleSelection && !loading,
    }
  }, [selected, files, loading])

  // Build ActionRegistry-based actions with a proper ctx
  const regActions = useMemo<ActionDescriptor[]>(() => {
    const role: UserRole = getUserRole()
    const permissions = getUserPermissions()
    // Provide all required operation stubs so build()/enabled() never crash
    const ctx = {
      role,
      permissions,
      selection: selected,
      files,
      operations: {
        rename: (_f: FileMeta) => onRenameSelected(),
        openViewer: (_f: FileMeta) => {}, // handled elsewhere (preview pane / open action)
        openVersions: (_f: FileMeta) => {},
        openMetadata: (_f: FileMeta) => {},
        share: (_f: FileMeta) => onShareSelected(),
        batchDelete: () => onDeleteSelected(),
        openCopyMove: (mode: 'copy' | 'move') =>
          mode === 'copy' ? onCopySelected() : onMoveSelected(),
        download: (_f: FileMeta) => {}, // Download button wired via context menu/file rows
      },
    }
    return getActionsForContext(ctx as any) as ActionDescriptor[]
  }, [
    selected,
    files,
    onRenameSelected,
    onShareSelected,
    onDeleteSelected,
    onCopySelected,
    onMoveSelected,
  ])

  // Utility helpers
  const actionById = useMemo(() => {
    const map = new Map<string, ActionDescriptor>()
    for (const a of regActions) map.set(a.id, a)
    return map
  }, [regActions])

  function buildActionButton(a: ActionDescriptor) {
    // Rebuild a minimal ctx every render for enabled/build checks
    const role: UserRole = getUserRole()
    const permissions = getUserPermissions()
    const ctx = {
      role,
      permissions,
      selection: selected,
      files,
      operations: {
        rename: (_f: FileMeta) => onRenameSelected(),
        openViewer: (_f: FileMeta) => {},
        openVersions: (_f: FileMeta) => {},
        openMetadata: (_f: FileMeta) => {},
        share: (_f: FileMeta) => onShareSelected(),
        batchDelete: () => onDeleteSelected(),
        openCopyMove: (mode: 'copy' | 'move') =>
          mode === 'copy' ? onCopySelected() : onMoveSelected(),
        download: (_f: FileMeta) => {},
      },
    } as any

    const enabled = a.enabled ? !!a.enabled(ctx) : true
    const onClick = a.build(ctx)
    return (
      <button
        key={a.id}
        className={`${ui.btn} action-${a.id}`}
        onClick={onClick}
        disabled={!enabled}
        title={a.label}
        aria-label={a.label}
      >
        <span aria-hidden="true">{getDefaultIcon(a.id)}</span>
        <span>{a.label}</span>
      </button>
    )
  }

  // Decide which actions are "primary" vs "secondary" based on selection
  const primaryIds: string[] = useMemo(() => {
    if (selectionContext.isSingleSelection) {
      // Single: quick access to item-centric actions
      return ['preview', 'rename', 'share', 'download']
    }
    if (selectionContext.isMultiSelection) {
      // Multi: bulk ops
      return ['copy', 'move', 'delete']
    }
    // No selection: creation and intake are top-tier
    return [] // Primary bar will focus on view + utility; creation lives as dedicated buttons
  }, [selectionContext.isSingleSelection, selectionContext.isMultiSelection])

  const primaryActions = primaryIds
    .map((id) => actionById.get(id))
    .filter(Boolean) as ActionDescriptor[]

  const secondaryActions = regActions.filter(
    (a: ActionDescriptor) => !primaryIds.includes(a.id)
  )

  return (
    <div className={ui.root} role="toolbar" aria-label="File actions">
      {/* Top Section: selection context + primary actions + view toggles */}
      <div className={ui.section}>
        <div className={ui.group}>
          <div
            className={ui.contextBadge}
            data-context={selectionContext.hasSelection ? 'selected' : 'browse'}
          >
            {selectionContext.hasSelection ? (
              <span className="selection-count">
                {selectionContext.selectedCount} selected
              </span>
            ) : (
              <span className="browse-mode">Browse</span>
            )}
          </div>
        </div>

        <div className={ui.group}>
          {primaryActions.map(buildActionButton)}

          {!selectionContext.hasSelection && (
            <>
              <button
                className={ui.btn}
                onClick={onOpenUpload}
                disabled={!activeBucket || loading}
                title={activeBucket ? 'Upload files' : 'Select a bucket first'}
                aria-label="Upload"
                data-testid="btn-upload"
              >
                <span className="action-icon" aria-hidden="true">
                  📤
                </span>
                <span className="action-label">Upload</span>
              </button>
              <button
                className={ui.btn}
                onClick={onCreateFolder}
                disabled={!activeBucket || loading}
                title={
                  activeBucket
                    ? 'Create folder in current path'
                    : 'Select a bucket first'
                }
                aria-label="New Folder"
              >
                <span className="action-icon" aria-hidden="true">
                  📁
                </span>
                <span className="action-label">New Folder</span>
              </button>
              <button
                className={ui.btn}
                onClick={onOpenFolderOps}
                disabled={!activeBucket || loading}
                title={
                  activeBucket
                    ? 'Folder operations (copy/move/rename/delete/tag/zip)'
                    : 'Select a bucket first'
                }
                aria-label="Folder Tools"
              >
                <span className="action-icon" aria-hidden="true">
                  🗂
                </span>
                <span className="action-label">Folder Tools</span>
              </button>
              <button
                className={ui.btn}
                onClick={onOpenTemplate}
                disabled={!activeBucket || loading}
                title={
                  activeBucket
                    ? 'Create folder structure from template'
                    : 'Select a bucket first'
                }
                aria-label="Create from template"
              >
                <span className="action-icon" aria-hidden="true">
                  📦
                </span>
                <span className="action-label">Template</span>
              </button>
            </>
          )}
        </div>

        <div className={ui.group}>
          <button
            className={ui.viewBtn(viewMode === 'grid')}
            onClick={() => onChangeViewMode('grid')}
            title="Grid view"
            aria-pressed={viewMode === 'grid'}
          >
            <span className="btn-icon" aria-hidden="true">
              🟦
            </span>
            <span className="sr-only">Grid view</span>
          </button>
          <button
            className={ui.viewBtn(viewMode === 'list')}
            onClick={() => onChangeViewMode('list')}
            title="List view"
            aria-pressed={viewMode === 'list'}
            data-testid="toolbar-list"
          >
            <span className="btn-icon" aria-hidden="true">
              📋
            </span>
            <span className="sr-only">List view</span>
          </button>
          <button
            className={ui.viewBtn(viewMode === 'details')}
            onClick={() => onChangeViewMode('details')}
            title="Details view"
            aria-pressed={viewMode === 'details'}
          >
            <span className="btn-icon" aria-hidden="true">
              📊
            </span>
            <span className="sr-only">Details view</span>
          </button>
          <button
            className={ui.viewBtn(viewMode === 'timeline')}
            onClick={() => onChangeViewMode('timeline')}
            title="Timeline view"
            aria-pressed={viewMode === 'timeline'}
          >
            <span className="btn-icon" aria-hidden="true">
              🕓
            </span>
            <span className="sr-only">Timeline view</span>
          </button>
          <button
            className={ui.iconBtn}
            title="AI Relevance"
            aria-pressed={false}
            data-testid="toolbar-ai"
            onClick={() => {
              try {
                window.dispatchEvent(
                  new CustomEvent('afm:action', {
                    detail: { action: 'toggleAI' },
                  })
                )
              } catch {}
            }}
          >
            <span className="btn-icon" aria-hidden="true">
              ✨
            </span>
            <span className="sr-only">AI Relevance</span>
          </button>
        </div>
      </div>

      {/* Empty buckets helper */}
      {buckets.length === 0 ? (
        <div
          className={`${ui.section} text-[var(--muted-foreground)]`}
          role="alert"
          aria-live="polite"
        >
          <span style={{ fontWeight: 600 }}>No buckets found.</span>
          <button
            className={ui.btn}
            onClick={() => onCreateBucket?.()}
            aria-label="Create bucket"
          >
            <span className="action-icon" aria-hidden="true">
              ➕
            </span>
            <span className="action-label">Create bucket</span>
          </button>
        </div>
      ) : null}

      {/* Middle Section: navigation and search */}
      <div className={ui.section}>
        <div className={ui.group}>
          <label
            className="text-xs text-[var(--muted-foreground)]"
            data-testid="bucket-select-label"
          >
            <span className="sr-only">Bucket</span>
            <select
              value={activeBucket || ''}
              onChange={(e) => onChangeBucket(e.target.value || undefined)}
              className={ui.select}
              data-testid="bucket-select"
              disabled={loading}
            >
              <option value="">Select bucket</option>
              {buckets.map((bucket) => (
                <option key={bucket.name} value={bucket.name}>
                  {bucket.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className={ui.group}>
          <input
            type="text"
            value={prefix}
            onChange={(e) => onChangePrefix(e.target.value)}
            placeholder="Path prefix"
            className={ui.input}
            disabled={!activeBucket || loading}
          />
        </div>

        <div className={ui.group}>
          <input
            type="search"
            value={searchText}
            onChange={(e) => onChangeSearchText(e.target.value)}
            placeholder="Search files..."
            className={ui.input}
            disabled={loading}
            data-testid="search-input"
          />
        </div>

        <div className={ui.group}>
          <button
            className={`${ui.btn} ${groupFolders ? 'bg-[var(--accent)]/25' : ''}`}
            onClick={onToggleGroupFolders}
            title="Toggle folder grouping"
            aria-pressed={groupFolders}
          >
            <span className="btn-icon" aria-hidden="true">
              {groupFolders ? '📁 On' : '📁 Off'}
            </span>
            <span className="sr-only">
              Folder grouping {groupFolders ? 'on' : 'off'}
            </span>
          </button>

          <button
            className={ui.iconBtn}
            onClick={onRefresh}
            disabled={loading || !activeBucket}
            title="Refresh"
          >
            <span className="btn-icon" aria-hidden="true">
              🔄
            </span>
            <span className="sr-only">Refresh</span>
          </button>

          <button
            className={ui.iconBtn}
            onClick={onLoadMore}
            disabled={!canLoadMore || loading}
            title="Load more"
          >
            <span className="btn-icon" aria-hidden="true">
              ⏬
            </span>
            <span className="sr-only">Load more</span>
          </button>

          <button
            className={ui.iconBtn}
            onClick={onOpenAdmin}
            title="Admin"
            disabled={!activeBucket}
          >
            <span className="btn-icon" aria-hidden="true">
              🛠️
            </span>
            <span className="sr-only">Admin</span>
          </button>

          <button
            className={ui.iconBtn}
            onClick={onOpenTasks}
            title="Background tasks"
          >
            <span className="btn-icon" aria-hidden="true">
              📋
            </span>
            <span className="sr-only">Tasks</span>
          </button>
        </div>
      </div>

      {/* Bottom Section: sorting + registry-provided secondary actions */}
      <div className={ui.section}>
        <div className={ui.group}>
          {/* Primary sort */}
          <label className="text-xs text-[var(--muted-foreground)]">
            <span className="sr-only">Sort by</span>
            <select
              value={sortBy}
              onChange={(e) => onChangeSortBy(e.target.value as any)}
              className={ui.select}
              disabled={loading}
            >
              <option value="name">Name</option>
              <option value="size">Size</option>
              <option value="updated">Updated</option>
            </select>
          </label>

          <button
            className={ui.iconBtn}
            onClick={onToggleSortOrder}
            title={`Sort ${sortOrder === 'asc' ? 'descending' : 'ascending'}`}
            disabled={loading}
            data-testid="toolbar-sort"
          >
            <span className="btn-icon" aria-hidden="true">
              {sortOrder === 'asc' ? '↑' : '↓'}
            </span>
            <span className="sr-only">
              {sortOrder === 'asc' ? 'Ascending' : 'Descending'} order
            </span>
          </button>

          {/* Secondary sort (optional) */}
          {onChangeSortBy2 ? (
            <>
              <span className="sr-only">Then by</span>
              <label
                className="text-xs text-[var(--muted-foreground)]"
                style={{ marginLeft: 8 }}
              >
                <select
                  value={sortBy2 || ''}
                  onChange={(e) => {
                    const v = e.target.value as any
                    onChangeSortBy2(v === '' ? undefined : v)
                  }}
                  className={ui.select}
                  disabled={loading}
                >
                  <option value="">Then by… (none)</option>
                  <option value="name">Name</option>
                  <option value="size">Size</option>
                  <option value="updated">Updated</option>
                </select>
              </label>
              <button
                className={ui.iconBtn}
                onClick={() => onToggleSortOrder2?.()}
                title={`Secondary sort ${(sortOrder2 || 'asc') === 'asc' ? 'descending' : 'ascending'}`}
                disabled={loading || !sortBy2}
              >
                <span className="btn-icon" aria-hidden="true">
                  {(sortOrder2 || 'asc') === 'asc' ? '↑' : '↓'}
                </span>
                <span className="sr-only">
                  {(sortOrder2 || 'asc') === 'asc' ? 'Ascending' : 'Descending'}{' '}
                  order (secondary)
                </span>
              </button>
            </>
          ) : null}
        </div>

        <div className={ui.group}>
          {secondaryActions.map(buildActionButton)}
        </div>

        <div className={ui.group}>
          <div className={ui.status} aria-live="polite">
            {loading ? (
              <span className="loading">Loading...</span>
            ) : error ? (
              <span className="error" title={error}>
                Error: {error}
              </span>
            ) : (
              <span className="file-count">
                {fileCount} item{fileCount !== 1 ? 's' : ''}
                {selectionContext.hasSelection &&
                  ` (${selectionContext.selectedCount} selected)`}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// Helper icons per action id (fallback)
function getDefaultIcon(actionId: string): string {
  const iconMap: Record<string, string> = {
    refresh: '🔄',
    upload: '📤',
    download: '📥',
    create: '➕',
    delete: '🗑️',
    rename: '✏️',
    copy: '📋',
    move: '➡️',
    share: '🔗',
    preview: '👁️',
    properties: '⚙️',
    admin: '🛠️',
    tasks: '📋',
    versions: '🕓',
    metadata: '🏷️',
  }
  return iconMap[actionId] || '⚡'
}

// Tailwind-only refactor: removed local styles in favor of tokenized utilities
