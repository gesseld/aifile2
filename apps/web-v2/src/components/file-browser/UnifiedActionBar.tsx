'use client'

import React, { useMemo } from 'react'
import type { FileMeta } from '@/lib/file-manager-client'
import { getActionsForContext, getUserRole, getUserPermissions, type UserRole, type ActionDescriptor } from '@/lib/action-registry'

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

  // Selection-driven context summary
  const selectionContext = useMemo(() => {
    const selectedFiles = files.filter(f => selected.has(f.id))
    const selectedCount = selected.size
    const hasSelection = selectedCount > 0
    const isSingleSelection = selectedCount === 1
    const isMultiSelection = selectedCount > 1
    const selectedFile = isSingleSelection ? selectedFiles[0] : null
    const isFolderSelected = !!(selectedFile && ((selectedFile as any)?.mime_type === 'folder' || (selectedFile.key || selectedFile.name || '').endsWith('/')))

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
  const regActions = useMemo(() => {
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
        openViewer: (_f: FileMeta) => {},        // handled elsewhere (preview pane / open action)
        openVersions: (_f: FileMeta) => {},
        openMetadata: (_f: FileMeta) => {},
        share: (_f: FileMeta) => onShareSelected(),
        batchDelete: () => onDeleteSelected(),
        openCopyMove: (mode: 'copy' | 'move') => (mode === 'copy' ? onCopySelected() : onMoveSelected()),
        download: (_f: FileMeta) => {},           // Download button wired via context menu/file rows
      },
    }
    return getActionsForContext(ctx as any)
  }, [selected, files, onRenameSelected, onShareSelected, onDeleteSelected, onCopySelected, onMoveSelected])

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
        openCopyMove: (mode: 'copy' | 'move') => (mode === 'copy' ? onCopySelected() : onMoveSelected()),
        download: (_f: FileMeta) => {},
      },
    } as any

    const enabled = a.enabled ? !!a.enabled(ctx) : true
    const onClick = a.build(ctx)
    return (
      <button
        key={a.id}
        className={`action-btn ${a.id}`}
        onClick={onClick}
        disabled={!enabled}
        title={a.label}
        aria-label={a.label}
      >
        <span className="action-icon" aria-hidden="true">{getDefaultIcon(a.id)}</span>
        <span className="action-label">{a.label}</span>
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

  const secondaryActions = regActions.filter((a) => !primaryIds.includes(a.id))

  return (
    <div className="unified-action-bar" role="toolbar" aria-label="File actions">
      {/* Top Section: selection context + primary actions + view toggles */}
      <div className="action-section primary-actions">
        <div className="action-group context-indicator">
          <div className="context-badge" data-context={selectionContext.hasSelection ? 'selected' : 'browse'}>
            {selectionContext.hasSelection ? (
              <span className="selection-count">{selectionContext.selectedCount} selected</span>
            ) : (
              <span className="browse-mode">Browse</span>
            )}
          </div>
        </div>

        <div className="action-group main-actions">
          {primaryActions.map(buildActionButton)}

          {!selectionContext.hasSelection && (
            <>
              <button
                className="action-btn upload"
                onClick={onOpenUpload}
                disabled={!activeBucket || loading}
                title={activeBucket ? 'Upload files' : 'Select a bucket first'}
                aria-label="Upload"
                data-testid="btn-upload"
              >
                <span className="action-icon" aria-hidden="true">📤</span>
                <span className="action-label">Upload</span>
              </button>
              <button
                className="action-btn create-folder"
                onClick={onCreateFolder}
                disabled={!activeBucket || loading}
                title={activeBucket ? 'Create folder in current path' : 'Select a bucket first'}
                aria-label="New Folder"
              >
                <span className="action-icon" aria-hidden="true">📁</span>
                <span className="action-label">New Folder</span>
              </button>
              <button
                className="action-btn folder-tools"
                onClick={onOpenFolderOps}
                disabled={!activeBucket || loading}
                title={activeBucket ? 'Folder operations (copy/move/rename/delete/tag/zip)' : 'Select a bucket first'}
                aria-label="Folder Tools"
              >
                <span className="action-icon" aria-hidden="true">🗂</span>
                <span className="action-label">Folder Tools</span>
              </button>
              <button
                className="action-btn template-create"
                onClick={onOpenTemplate}
                disabled={!activeBucket || loading}
                title={activeBucket ? 'Create folder structure from template' : 'Select a bucket first'}
                aria-label="Create from template"
              >
                <span className="action-icon" aria-hidden="true">📦</span>
                <span className="action-label">Template</span>
              </button>
            </>
          )}
        </div>

        <div className="action-group view-controls">
          <button
            className={`view-btn ${viewMode === 'grid' ? 'active' : ''}`}
            onClick={() => onChangeViewMode('grid')}
            title="Grid view"
            aria-pressed={viewMode === 'grid'}
          >
            <span className="btn-icon" aria-hidden="true">🟦</span>
            <span className="sr-only">Grid view</span>
          </button>
          <button
            className={`view-btn ${viewMode === 'list' ? 'active' : ''}`}
            onClick={() => onChangeViewMode('list')}
            title="List view"
            aria-pressed={viewMode === 'list'}
            data-testid="toolbar-list"
          >
            <span className="btn-icon" aria-hidden="true">📋</span>
            <span className="sr-only">List view</span>
          </button>
          <button
            className={`view-btn ${viewMode === 'details' ? 'active' : ''}`}
            onClick={() => onChangeViewMode('details')}
            title="Details view"
            aria-pressed={viewMode === 'details'}
          >
            <span className="btn-icon" aria-hidden="true">📊</span>
            <span className="sr-only">Details view</span>
          </button>
          <button
            className={`view-btn ${viewMode === 'timeline' ? 'active' : ''}`}
            onClick={() => onChangeViewMode('timeline')}
            title="Timeline view"
            aria-pressed={viewMode === 'timeline'}
          >
            <span className="btn-icon" aria-hidden="true">🕓</span>
            <span className="sr-only">Timeline view</span>
          </button>
        </div>
      </div>

      {/* Empty buckets helper */}
      {buckets.length === 0 ? (
        <div className="action-section empty-buckets" role="alert" aria-live="polite">
          <span style={{ fontWeight: 600 }}>No buckets found.</span>
          <button
            className="action-btn create-bucket"
            onClick={() => onCreateBucket?.()}
            aria-label="Create bucket"
          >
            <span className="action-icon" aria-hidden="true">➕</span>
            <span className="action-label">Create bucket</span>
          </button>
        </div>
      ) : null}

      {/* Middle Section: navigation and search */}
      <div className="action-section navigation">
        <div className="action-group bucket-selector">
          <label className="selector-label" data-testid="bucket-select-label">
            <span className="sr-only">Bucket</span>
            <select
              value={activeBucket || ''}
              onChange={(e) => onChangeBucket(e.target.value || undefined)}
              className="bucket-select"
              data-testid="bucket-select"
              disabled={loading}
            >
              <option value="">Select bucket</option>
              {buckets.map((bucket) => (
                <option key={bucket.name} value={bucket.name}>{bucket.name}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="action-group path-navigation">
          <input
            type="text"
            value={prefix}
            onChange={(e) => onChangePrefix(e.target.value)}
            placeholder="Path prefix"
            className="path-input"
            disabled={!activeBucket || loading}
          />
        </div>

        <div className="action-group search-box">
          <input
            type="search"
            value={searchText}
            onChange={(e) => onChangeSearchText(e.target.value)}
            placeholder="Search files..."
            className="search-input"
            disabled={loading}
            data-testid="search-input"
          />
        </div>

        <div className="action-group utility-actions">
          <button
            className={`utility-btn ${groupFolders ? 'active' : ''}`}
            onClick={onToggleGroupFolders}
            title="Toggle folder grouping"
            aria-pressed={groupFolders}
          >
            <span className="btn-icon" aria-hidden="true">{groupFolders ? '📁 On' : '📁 Off'}</span>
            <span className="sr-only">Folder grouping {groupFolders ? 'on' : 'off'}</span>
          </button>

          <button
            className="utility-btn refresh"
            onClick={onRefresh}
            disabled={loading || !activeBucket}
            title="Refresh"
          >
            <span className="btn-icon" aria-hidden="true">🔄</span>
            <span className="sr-only">Refresh</span>
          </button>

          <button
            className="utility-btn load-more"
            onClick={onLoadMore}
            disabled={!canLoadMore || loading}
            title="Load more"
          >
            <span className="btn-icon" aria-hidden="true">⏬</span>
            <span className="sr-only">Load more</span>
          </button>

          <button className="utility-btn admin" onClick={onOpenAdmin} title="Admin" disabled={!activeBucket}>
            <span className="btn-icon" aria-hidden="true">🛠️</span>
            <span className="sr-only">Admin</span>
          </button>

          <button className="utility-btn tasks" onClick={onOpenTasks} title="Background tasks">
            <span className="btn-icon" aria-hidden="true">📋</span>
            <span className="sr-only">Tasks</span>
          </button>
        </div>
      </div>

      {/* Bottom Section: sorting + registry-provided secondary actions */}
      <div className="action-section contextual-actions">
        <div className="action-group sort-controls">
          {/* Primary sort */}
          <label className="sort-label">
            <span className="sr-only">Sort by</span>
            <select
              value={sortBy}
              onChange={(e) => onChangeSortBy(e.target.value as any)}
              className="sort-select"
              disabled={loading}
            >
              <option value="name">Name</option>
              <option value="size">Size</option>
              <option value="updated">Updated</option>
            </select>
          </label>

          <button
            className="sort-order-btn"
            onClick={onToggleSortOrder}
            title={`Sort ${sortOrder === 'asc' ? 'descending' : 'ascending'}`}
            disabled={loading}
            data-testid="toolbar-sort"
          >
            <span className="btn-icon" aria-hidden="true">{sortOrder === 'asc' ? '↑' : '↓'}</span>
            <span className="sr-only">{sortOrder === 'asc' ? 'Ascending' : 'Descending'} order</span>
          </button>

          {/* Secondary sort (optional) */}
          {onChangeSortBy2 ? (
            <>
              <span className="sr-only">Then by</span>
              <label className="sort-label" style={{ marginLeft: 8 }}>
                <select
                  value={sortBy2 || ''}
                  onChange={(e) => {
                    const v = e.target.value as any
                    onChangeSortBy2(v === '' ? undefined : v)
                  }}
                  className="sort-select"
                  disabled={loading}
                >
                  <option value="">Then by… (none)</option>
                  <option value="name">Name</option>
                  <option value="size">Size</option>
                  <option value="updated">Updated</option>
                </select>
              </label>
              <button
                className="sort-order-btn"
                onClick={() => onToggleSortOrder2?.()}
                title={`Secondary sort ${((sortOrder2 || 'asc') === 'asc') ? 'descending' : 'ascending'}`}
                disabled={loading || !sortBy2}
              >
                <span className="btn-icon" aria-hidden="true">{(sortOrder2 || 'asc') === 'asc' ? '↑' : '↓'}</span>
                <span className="sr-only">{(sortOrder2 || 'asc') === 'asc' ? 'Ascending' : 'Descending'} order (secondary)</span>
              </button>
            </>
          ) : null}
        </div>

        <div className="action-group secondary-buttons">
          {secondaryActions.map(buildActionButton)}
        </div>

        <div className="action-group status-display">
          <div className="status-info" aria-live="polite">
            {loading ? (
              <span className="loading">Loading...</span>
            ) : error ? (
              <span className="error" title={error}>Error: {error}</span>
            ) : (
              <span className="file-count">
                {fileCount} item{fileCount !== 1 ? 's' : ''}
                {selectionContext.hasSelection && ` (${selectionContext.selectedCount} selected)`}
              </span>
            )}
          </div>
        </div>
      </div>

      <style>{styles}</style>
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

// CSS styles for the unified action bar
const styles = `
.unified-action-bar {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 16px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border-radius: 12px;
  margin: 8px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
}

.action-section {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.action-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.context-indicator .context-badge {
  padding: 4px 8px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  background: rgba(255, 255, 255, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.3);
}

.context-badge[data-context="selected"] {
  background: rgba(79, 70, 229, 0.3);
  border-color: rgba(99, 102, 241, 0.5);
}

.action-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.3);
  background: rgba(255, 255, 255, 0.15);
  color: white;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  backdrop-filter: blur(8px);
}

.action-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.25);
  transform: translateY(-1px);
}

.action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.action-btn:active:not(:disabled) {
  transform: translateY(0);
}

.view-btn, .utility-btn, .secondary-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 6px 8px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: rgba(255, 255, 255, 0.1);
  color: white;
  cursor: pointer;
  transition: all 0.2s ease;
  min-width: 32px;
  height: 32px;
}

.view-btn.active, .utility-btn.active {
  background: rgba(255, 255, 255, 0.25);
  border-color: rgba(255, 255, 255, 0.4);
}

.view-btn:hover:not(:disabled),
.utility-btn:hover:not(:disabled),
.secondary-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.2);
}

.bucket-select, .path-input, .search-input, .sort-select {
  padding: 6px 8px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.3);
  background: rgba(255, 255, 255, 0.15);
  color: white;
  font-size: 13px;
  backdrop-filter: blur(8px);
}

.bucket-select:focus,
.path-input:focus,
.search-input:focus,
.sort-select:focus {
  outline: none;
  border-color: rgba(255, 255, 255, 0.5);
  box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.2);
}

.selector-label, .sort-label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.8);
}

.status-info {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.9);
  padding: 4px 8px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.1);
}

.status-info .error {
  color: #f87171;
}

.status-info .loading {
  color: #93c5fd;
}

/* Mobile responsive design */
@media (max-width: 768px) {
  .unified-action-bar {
    padding: 10px;
    border-radius: 10px;
  }
  .action-section {
    gap: 8px;
  }
  .path-input, .search-input {
    min-width: 160px;
    width: 100%;
  }
}
`