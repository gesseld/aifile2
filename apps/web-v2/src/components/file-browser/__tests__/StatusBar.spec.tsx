import React from 'react'
import { render, screen, act } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import StatusBar from '../StatusBar'

// Mock SettingsPanel with both named and default exports to match import style
vi.mock('@/components/settings/SettingsPanel', () => ({
  SettingsPanel: () => null,
  default: () => null,
}))
/**
 * StatusBar basic rendering + data-testid coverage
 * - statusbar (root)
 * - statusbar-queue (only when upload queue count > 0 via afm:state)
 * - statusbar-net (Online/Offline indicator)
 *
 * jsdom environment is configured via vitest.setup.ts
 */

describe('StatusBar()', () => {
  function renderBar(
    partial?: Partial<React.ComponentProps<typeof StatusBar>>
  ) {
    const props: React.ComponentProps<typeof StatusBar> = {
      selectedCount: 0,
      selectedSizeBytes: 0,
      totalItems: 0,
      loading: false,
      opStatus: undefined,
      traceId: undefined,
      ...partial,
    }
    return render(<StatusBar {...props} />)
  }

  it('renders root statusbar testid', () => {
    renderBar()
    expect(screen.getByTestId('statusbar')).toBeInTheDocument()
  })

  it('renders net indicator with statusbar-net', () => {
    renderBar()
    // We always render the net container; text changes by events/online state
    expect(screen.getByTestId('statusbar-net')).toBeInTheDocument()
  })

  it('shows upload queue badge after afm:state event', () => {
    renderBar()
    // Initially no queue badge
    expect(screen.queryByTestId('statusbar-queue')).toBeNull()

    act(() => {
      window.dispatchEvent(
        new CustomEvent('afm:state', { detail: { uploadQueueCount: 3 } })
      )
    })

    expect(screen.getByTestId('statusbar-queue')).toBeInTheDocument()
    expect(screen.getByTestId('statusbar-queue')).toHaveTextContent('3')
  })

  it('updates perf metrics on afm:perf (does not assert values, only existence path)', () => {
    renderBar()
    // Sanity: dispatch a perf snapshot and ensure no errors thrown
    act(() => {
      window.dispatchEvent(
        new CustomEvent('afm:perf', {
          detail: {
            pageCacheSize: 10,
            pageCacheLimit: 80,
            cacheHits: 5,
            cacheMisses: 2,
            prefetches: 1,
            aborts: 0,
            retries: 0,
          },
        })
      )
    })
    // Root still present
    expect(screen.getByTestId('statusbar')).toBeInTheDocument()
  })
})
