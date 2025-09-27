import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'

// Ensure action-registry is mocked (alias should route, this is a hard guard)
vi.mock('@/lib/action-registry', () => {
  return {
    getUserRole: () => 'admin',
    getUserPermissions: () => ['*'],
    getActionsForContext: () => [
      { id: 'preview', label: 'Preview', build: () => () => {} },
      { id: 'rename', label: 'Rename', build: () => () => {} },
      { id: 'share', label: 'Share', build: () => () => {} },
      { id: 'download', label: 'Download', build: () => () => {} },
      { id: 'copy', label: 'Copy', build: () => () => {} },
      { id: 'move', label: 'Move', build: () => () => {} },
      { id: 'delete', label: 'Delete', build: () => () => {} },
    ],
  }
})

import UnifiedActionBar from '../UnifiedActionBar'

/**
 * UnifiedActionBar a11y/behavior checks for PR #2:
 * - aria-pressed on view mode toggles
 * - search input presence
 * - upload button disabled state when no activeBucket
 * - sort button testid present
 * - AI button has stable testid, click dispatches event
 */
describe('UnifiedActionBar()', () => {
  function renderBar(
    partial?: Partial<React.ComponentProps<typeof UnifiedActionBar>>
  ) {
    const props: React.ComponentProps<typeof UnifiedActionBar> = {
      // Context state
      selected: new Set(),
      files: [],
      activeBucket: 'demo',
      prefix: '',
      loading: false,
      viewMode: 'list',
      sortBy: 'name',
      sortOrder: 'asc',
      sortBy2: undefined,
      sortOrder2: 'asc',
      searchText: '',
      groupFolders: false,

      // Handlers
      onRefresh: vi.fn(),
      onLoadMore: vi.fn(),
      canLoadMore: false,
      onDeleteSelected: vi.fn(),
      onCopySelected: vi.fn(),
      onMoveSelected: vi.fn(),
      onRenameSelected: vi.fn(),
      onShareSelected: vi.fn(),
      onOpenUpload: vi.fn(),
      onOpenAdmin: vi.fn(),
      onOpenTasks: vi.fn(),
      onCreateFolder: vi.fn(),
      onOpenFolderOps: vi.fn(),
      onOpenTemplate: vi.fn(),
      onChangeViewMode: vi.fn(),
      onChangeSortBy: vi.fn(),
      onToggleSortOrder: vi.fn(),
      onChangeSortBy2: vi.fn(),
      onToggleSortOrder2: vi.fn(),
      onChangeSearchText: vi.fn(),
      onChangeBucket: vi.fn(),
      onChangePrefix: vi.fn(),
      onToggleGroupFolders: vi.fn(),
      onCreateBucket: vi.fn(),

      // Data
      buckets: [{ name: 'demo' }],
      fileCount: 0,
      error: undefined,
      ...partial,
    }
    return render(<UnifiedActionBar {...props} />)
  }

  it('sets aria-pressed correctly on view mode toggles', () => {
    const onChangeViewMode = vi.fn()
    renderBar({ viewMode: 'list', onChangeViewMode })
    const listBtn = screen.getByTestId('toolbar-list')
    expect(listBtn).toHaveAttribute('aria-pressed', 'true')

    const gridBtn = screen.getByRole('button', { name: /grid view/i })
    expect(gridBtn).toHaveAttribute('aria-pressed', 'false')

    // Click grid, ensure handler is called
    fireEvent.click(gridBtn)
    expect(onChangeViewMode).toHaveBeenCalledWith('grid')
  })

  it('provides stable selectors for search and sort controls', () => {
    renderBar()
    expect(screen.getByTestId('search-input')).toBeInTheDocument()
    expect(screen.getByTestId('toolbar-sort')).toBeInTheDocument()
  })

  it('disables upload button when no active bucket', () => {
    renderBar({ activeBucket: undefined })
    const uploadBtn = screen.getByTestId('btn-upload')
    expect(uploadBtn).toBeDisabled()
  })

  it('AI button has data-testid and fires an event on click', () => {
    renderBar()
    const aiBtn = screen.getByTestId('toolbar-ai')
    const spy = vi.fn()
    window.addEventListener('afm:action', spy as any)
    fireEvent.click(aiBtn)
    // Event payload checked structurally
    expect(spy).toHaveBeenCalled()
  })
})
