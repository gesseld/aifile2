// Minimal ambient module shims to unblock TypeScript in web-v2 during UI refactor.
// These will be replaced by real SDKs/clients when wiring to backend in later PRs.

declare module '@/lib/file-manager-client' {
  export type FileMeta = {
    id: string
    key?: string
    name?: string
    mime_type?: string
    size_bytes?: number
    created_at?: string
    updated_at?: string
    has_thumbnail?: boolean
    bucket?: string
    checksum?: string
    version_id?: string
    tags?: Record<string, string>
    [k: string]: any
  }

  export type FileAccessLog = {
    id?: string
    timestamp?: string
    action?: string
    user_id?: string
    success?: boolean
    ip_address?: string
    user_agent?: string
    error_message?: string
    [k: string]: any
  }

  export type Collaborator = {
    id: string | number
    user_id?: string
    email?: string
    role?: string
    [k: string]: any
  }

  // Buckets
  export const BucketsClient: {
    list: () => Promise<{ buckets: Array<string | { name: string }> }>
    create: (name: string) => Promise<void>
    delete: (name: string, force?: boolean) => Promise<void>
    renameViaMirror: (from: string, to: string) => Promise<void>
    usage: (name: string) => Promise<any>
  }

  // Files
  export const FilesClient: {
    list: (args: {
      bucket?: string
      prefix?: string
      cursor?: string
      limit?: number
      category?: any
      delimiter?: string
      orderBy?: 'name' | 'size' | 'updated'
      direction?: 'asc' | 'desc'
      signal?: AbortSignal
    }) => Promise<{ items: FileMeta[]; next_cursor?: string; total?: number }>

    batch: (
      ops: any,
      opts?: any
    ) => Promise<{ results: Array<{ ok?: boolean; error?: string }> }>

    presign: (
      id: string,
      opts: { op: 'read' | 'write'; expireSeconds?: number }
    ) => Promise<{ url: string }>

    // Optional endpoints used by FileDetailsPanel; stubbed for UI-only compile
    listVersions?: (fileId: string) => Promise<{ versions: FileMeta[] }>
    listCollaborators?: (fileId: string) => Promise<{ items: Collaborator[] }>
    listActivity?: (
      fileId: string,
      opts?: { limit?: number; offset?: number }
    ) => Promise<{ items: FileAccessLog[] }>
    patch?: (
      fileId: string,
      body: { name?: string; tags?: Record<string, string> }
    ) => Promise<void>
    restoreVersion?: (fileId: string, versionId: string) => Promise<void>
  }

  // Objects placeholder (not currently used directly in UnifiedActionBar)
  export const ObjectsClient: any
}

declare module '@/lib/action-registry' {
  export type UserRole = 'admin' | 'editor' | 'viewer' | string

  export type ActionDescriptor = {
    id: string
    label: string
    shortcut?: { win: string; mac: string }
    enabled?: (ctx: any) => boolean
    build: (ctx: any) => (e?: any) => void
  }

  export function getUserRole(): UserRole
  export function getUserPermissions(): any
  export function getActionsForContext(ctx: any): ActionDescriptor[]
}

// --- Additional ambient shims to silence missing module/type errors during UI refactor ---

// Third-party libs used by virtualized lists
declare module 'react-virtualized-auto-sizer' {
  const AutoSizer: any
  export default AutoSizer
}
declare module 'react-window' {
  const ReactWindow: any
  export = ReactWindow
}

// Generic catch-alls for app-level aliases so TS can build while UI is refactored.
// Specific modules below provide stronger types where necessary.
declare module '@/components/*' {
  const Mod: any
  export default Mod
  export = Mod
}
declare module '@/lib/*' {
  const Mod: any
  export default Mod
  export = Mod
}

// Batch engine: provide minimal types to avoid implicit any in callbacks
declare module '@/lib/batch-engine' {
  export type OperationResult = {
    ok?: boolean
    error?: string
    op?: { id?: string; [k: string]: any }
  }
  export function buildOperationsFromSelection(intent: any, files: any[]): any[]
  export function runBatchOperations(
    ops: any[],
    opts?: {
      conflictPolicy?: 'fail' | 'keep-both'
      rollbackOnFailure?: boolean
      queueWhenOffline?: boolean
      chunkSize?: number
    }
  ): Promise<{
    results: OperationResult[]
    failures: OperationResult[]
    successes: OperationResult[]
    reverseOps?: any[]
  }>
}

// Files thumbnail/cache helpers used by ProgressiveThumb
declare module '@/lib/cache/files-cache' {
  export const FilesCache: {
    warm: (
      ids: string[],
      opts?: {
        width: number
        height: number
        format?: 'webp' | 'jpeg'
        quality?: number
      }
    ) => Promise<void>
    getThumbnailObjectUrl: (
      id: string,
      opts: {
        width: number
        height: number
        format?: 'webp' | 'jpeg'
        quality?: number
      }
    ) => Promise<string>
  }
}

// Lightweight store hooks used by the shell
declare module '@/lib/file-manager-store' {
  export function useSelection(): {
    selection: { ids: Set<string> }
    replace: (ids: string[]) => void
  }
  export type SearchFilters = {
    query?: string
    regex?: boolean
    bucket?: string
    prefix?: string
    type?: string
    mime_type?: string
    sizeGt?: string
    sizeLt?: string
    createdAfter?: string
    createdBefore?: string
    metadata?: Record<string, string>
  }
  export function useSearch(): {
    search: {
      filters: {
        types?: string[]
        size?: { min?: number; max?: number }
        date?: { from?: string; to?: string }
        metadata?: Record<string, string>
      }
    }
    setQuery: (q: string) => void
    setFilters: (
      f: Partial<{
        types?: string[]
        size?: { min?: number; max?: number }
        date?: { from?: string; to?: string }
        metadata?: Record<string, string>
      }>
    ) => void
    setMode: (m: 'fulltext' | 'prefix') => void
  }
}

// Undo/redo history used by shell
declare module '@/lib/operation-history' {
  const operationHistory: {
    push: (entry: {
      label: string
      createdAt: number
      reverseOps: any[]
    }) => void
    undoLast: () => Promise<{ ok: boolean; error?: string }>
    redoNext: () => Promise<{ ok: boolean; error?: string }>
  }
  export default operationHistory
}

// Upload queue stats/events used by Status broadcasting and panels
declare module '@/lib/upload-queue' {
  export const UploadQueue: {
    on: (ev: 'stats', fn: (e: any) => void) => () => void
    restoreSessionsDisplay: () => void
  }
}

// SearchBar component + types
declare module '@/components/SearchBar' {
  export type SearchFilters = import('@/lib/file-manager-store').SearchFilters
  const SearchBar: any
  export default SearchBar
}

// Footers/utility components default to any; wildcard above will catch others.

// Analytics tracker (consent-gated; no-op in dev)
declare module '@/lib/analytics' {
  export function track(event: string, payload?: any): void
}
// Specific component/module shims for named exports referenced by FileBrowserShell

declare module '@/components/file-browser/ObjectExplorer' {
  export type ListParams = any
  export type ListResult = {
    folders: Array<{ key: string; name: string }>
    objects: Array<{
      key: string
      name: string
      size: number
      lastModified: string
    }>
    nextContinuationToken?: string
    total?: number
  }
  const ObjectExplorer: any
  export default ObjectExplorer
}

declare module '@/components/settings/SettingsPanel' {
  export const SettingsPanel: any
}
// ContextMenu shim with named type export used by LeftTree
declare module '@/components/file-browser/ContextMenu' {
  export type MenuItem = {
    label: string
    onClick: (e?: any) => void
    disabled?: boolean
    shortcutText?: string
  }
  const ContextMenu: any
  export default ContextMenu
}
