import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import LeftTree from '../LeftTree'

describe('LeftTree()', () => {
  function renderTree(
    partial?: Partial<React.ComponentProps<typeof LeftTree>>
  ) {
    const props: React.ComponentProps<typeof LeftTree> = {
      buckets: [{ name: 'alpha' }, { name: 'beta' }, { name: 'gamma' }],
      activeBucket: 'alpha',
      onChangeBucket: () => {},
      prefix: '',
      onChangePrefix: () => {},
      onDropToBucket: () => {},
      onDropToPrefix: () => {},
      onFilterCategory: () => {},
      canAdminBucket: true,
      ...partial,
    }
    return render(<LeftTree {...props} />)
  }

  it('renders listbox with options and toggles selection via mouse', () => {
    const onChangeBucket = vi.fn()
    renderTree({ onChangeBucket })
    const list = screen.getByRole('listbox', { name: /buckets/i })
    expect(list).toBeInTheDocument()

    const alpha = screen.getByTestId('sidebar-item-alpha')
    const beta = screen.getByTestId('sidebar-item-beta')

    // Active bucket aria-selected
    expect(alpha).toHaveAttribute('aria-selected', 'true')
    expect(beta).toHaveAttribute('aria-selected', 'false')

    // Click beta selects it
    fireEvent.click(beta)
    expect(onChangeBucket).toHaveBeenCalledWith('beta')
  })

  it('supports keyboard navigation (ArrowDown/ArrowUp/Home/End) and Enter activation', () => {
    const onChangeBucket = vi.fn()
    renderTree({ onChangeBucket })

    const list = screen.getByRole('listbox', { name: /buckets/i })
    list.focus()

    // ArrowDown focuses the first visible item (internal index increases)
    fireEvent.keyDown(list, { key: 'ArrowDown' })
    // aria-activedescendant should be set (id pattern bucket-option-*)
    const active1 = list.getAttribute('aria-activedescendant')
    expect(active1).toMatch(/^bucket-option-/)

    // Home sets focus to first
    fireEvent.keyDown(list, { key: 'Home' })
    const activeHome = list.getAttribute('aria-activedescendant')
    expect(activeHome).toBe('bucket-option-alpha')

    // End sets focus to last
    fireEvent.keyDown(list, { key: 'End' })
    const activeEnd = list.getAttribute('aria-activedescendant')
    expect(activeEnd).toBe('bucket-option-gamma')

    // Enter activates focused (gamma)
    fireEvent.keyDown(list, { key: 'Enter' })
    expect(onChangeBucket).toHaveBeenCalledWith('gamma')
  })

  it('dark mode toggle toggles data-theme="dark" on documentElement', () => {
    renderTree()
    const toggle = screen.getByTestId('sidebar-item-darkmode')
    // Ensure starts without dark
    document.documentElement.removeAttribute('data-theme')
    fireEvent.click(toggle)
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    fireEvent.click(toggle)
    expect(document.documentElement.getAttribute('data-theme')).toBeNull()
  })
})
