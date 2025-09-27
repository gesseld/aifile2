import React from 'react'

// Minimal ContextMenu stub for unit tests
export type MenuItem = {
  label: string
  onClick: () => void
  disabled?: boolean
  shortcutText?: string
}

export default function ContextMenu(props: {
  open: boolean
  x: number
  y: number
  items: MenuItem[]
  onClose: () => void
}) {
  // Do not render actual portal/menu in tests; just expose a marker when open
  if (!props.open) return null
  return <div data-testid="test-stub-contextmenu" style={{ display: 'none' }} />
}
