import React from 'react'

// Minimal stub for tests to avoid Vite resolution failure
// Matches named import usage: { SettingsPanel } from '@/components/settings/SettingsPanel'
export type SettingsPanelProps = {
  open?: boolean
  onClose?: () => void
}

export const SettingsPanel: React.FC<SettingsPanelProps> = () => null

export default SettingsPanel
