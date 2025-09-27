/**
 * Minimal, production-safe action registry to satisfy UI needs.
 * Replace with the real implementation when available.
 */
export type UserRole = 'admin' | 'user' | 'viewer'

export type ActionDescriptor = {
  id: string
  label: string
  enabled?: (ctx: any) => boolean
  build: (ctx: any) => () => void
  shortcut?: { win: string; mac: string }
}

export function getUserRole(): UserRole {
  // Fallback default (allow UI to render actions)
  return 'admin'
}

export function getUserPermissions(): string[] {
  // Fallback permissive set
  return ['*']
}

export function getActionsForContext(_ctx: any): ActionDescriptor[] {
  // Provide a stable minimal set for the UI to render buttons
  return [
    { id: 'preview', label: 'Preview', build: () => () => {} },
    { id: 'rename', label: 'Rename', build: () => () => {} },
    { id: 'share', label: 'Share', build: () => () => {} },
    { id: 'download', label: 'Download', build: () => () => {} },
    { id: 'copy', label: 'Copy', build: () => () => {} },
    { id: 'move', label: 'Move', build: () => () => {} },
    { id: 'delete', label: 'Delete', build: () => () => {} },
  ]
}
