'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'

type AttrName =
  | 'data-theme'
  | 'data-density'
  | 'data-high-contrast'
  | 'data-text-zoom'
  | 'data-reduce-motion'

type AttrState = {
  'data-theme'?: string | null
  'data-density'?: string | null
  'data-high-contrast'?: string | null
  'data-text-zoom'?: string | null
  'data-reduce-motion'?: string | null
}

const htmlEl = () => (typeof document !== 'undefined' ? document.documentElement : null)

function readAttrs(): AttrState {
  const el = htmlEl()
  if (!el) return {}
  return {
    'data-theme': el.getAttribute('data-theme'),
    'data-density': el.getAttribute('data-density'),
    'data-high-contrast': el.getAttribute('data-high-contrast'),
    'data-text-zoom': el.getAttribute('data-text-zoom'),
    'data-reduce-motion': el.getAttribute('data-reduce-motion'),
  }
}

function setAttr(name: AttrName, value: string | null) {
  const el = htmlEl()
  if (!el) return
  if (value === null) el.removeAttribute(name)
  else el.setAttribute(name, value)
}

function readToken(name: string) {
  const el = htmlEl()
  if (!el) return ''
  const cs = getComputedStyle(el)
  return cs.getPropertyValue(name)?.trim()
}

export default function ModeToggles() {
  const [attrs, setAttrs] = useState<AttrState>({})
  const [tokens, setTokens] = useState<Record<string, string>>({})

  const updateSnapshot = useCallback(() => {
    setAttrs(readAttrs())
    setTokens({
      '--background': readToken('--background'),
      '--foreground': readToken('--foreground'),
      '--surface': readToken('--surface'),
      '--border': readToken('--border'),
      '--muted-foreground': readToken('--muted-foreground'),
      '--ring': readToken('--ring'),
      '--accent': readToken('--accent'),
    })
  }, [])

  useEffect(() => {
    updateSnapshot()
  }, [updateSnapshot])

  const apply = useCallback((name: AttrName, value: string | null) => {
    setAttr(name, value)
    updateSnapshot()
  }, [updateSnapshot])

  const resetAll = useCallback(() => {
    ;(['data-theme','data-density','data-high-contrast','data-text-zoom','data-reduce-motion'] as AttrName[]).forEach(n => setAttr(n, null))
    updateSnapshot()
  }, [updateSnapshot])

  const combos = useMemo(() => ([
    {
      label: 'Dark + Compact',
      action: () => {
        apply('data-theme', 'dark')
        apply('data-density', 'compact')
      },
      testId: 'combo-dark-compact',
    },
    {
      label: 'High Contrast',
      action: () => apply('data-high-contrast', '1'),
      testId: 'combo-high-contrast',
    },
    {
      label: 'Text Zoom: lg',
      action: () => apply('data-text-zoom', 'lg'),
      testId: 'combo-text-zoom-lg',
    },
    {
      label: 'Reduced Motion',
      action: () => apply('data-reduce-motion', '1'),
      testId: 'combo-reduce-motion',
    },
  ]), [apply])

  return (
    <section className="p-4 space-y-4 text-[var(--foreground)] bg-[var(--surface)]">
      <h1 className="text-xl font-semibold">Advanced Mode Toggles</h1>
      <p className="text-sm text-[var(--muted-foreground)]">
        Use these controls to verify theme and accessibility modes backed by globals.css tokens.
        Buttons update attributes on &lt;html&gt; so you can inspect visual changes live. All controls have stable data-testid.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <div className="rounded-lg border border-[var(--border)] p-3 space-y-2">
          <div className="font-medium">Theme</div>
          <div className="flex flex-wrap gap-2">
            <button data-testid="toggle-theme-light" className="px-3 py-1.5 rounded-md border border-[var(--border)] hover:bg-[var(--accent)]"
              onClick={() => apply('data-theme', null)}>Light (reset)</button>
            <button data-testid="toggle-theme-dark" className="px-3 py-1.5 rounded-md border border-[var(--border)] hover:bg-[var(--accent)]"
              onClick={() => apply('data-theme', 'dark')}>Dark</button>
          </div>
        </div>

        <div className="rounded-lg border border-[var(--border)] p-3 space-y-2">
          <div className="font-medium">Density</div>
          <div className="flex flex-wrap gap-2">
            <button data-testid="toggle-density-default" className="px-3 py-1.5 rounded-md border border-[var(--border)] hover:bg-[var(--accent)]"
              onClick={() => apply('data-density', null)}>Default</button>
            <button data-testid="toggle-density-compact" className="px-3 py-1.5 rounded-md border border-[var(--border)] hover:bg-[var(--accent)]"
              onClick={() => apply('data-density', 'compact')}>Compact</button>
          </div>
        </div>

        <div className="rounded-lg border border-[var(--border)] p-3 space-y-2">
          <div className="font-medium">High Contrast</div>
          <div className="flex flex-wrap gap-2">
            <button data-testid="toggle-high-contrast-off" className="px-3 py-1.5 rounded-md border border-[var(--border)] hover:bg-[var(--accent)]"
              onClick={() => apply('data-high-contrast', null)}>Off</button>
            <button data-testid="toggle-high-contrast-on" className="px-3 py-1.5 rounded-md border border-[var(--border)] hover:bg-[var(--accent)]"
              onClick={() => apply('data-high-contrast', '1')}>On</button>
          </div>
        </div>

        <div className="rounded-lg border border-[var(--border)] p-3 space-y-2">
          <div className="font-medium">Text Zoom</div>
          <div className="flex flex-wrap gap-2">
            <button data-testid="toggle-text-zoom-default" className="px-3 py-1.5 rounded-md border border-[var(--border)] hover:bg-[var(--accent)]"
              onClick={() => apply('data-text-zoom', null)}>Default</button>
            <button data-testid="toggle-text-zoom-lg" className="px-3 py-1.5 rounded-md border border-[var(--border)] hover:bg-[var(--accent)]"
              onClick={() => apply('data-text-zoom', 'lg')}>lg</button>
            <button data-testid="toggle-text-zoom-xl" className="px-3 py-1.5 rounded-md border border-[var(--border)] hover:bg-[var(--accent)]"
              onClick={() => apply('data-text-zoom', 'xl')}>xl</button>
          </div>
        </div>

        <div className="rounded-lg border border-[var(--border)] p-3 space-y-2">
          <div className="font-medium">Reduced Motion</div>
          <div className="flex flex-wrap gap-2">
            <button data-testid="toggle-reduce-motion-off" className="px-3 py-1.5 rounded-md border border-[var(--border)] hover:bg-[var(--accent)]"
              onClick={() => apply('data-reduce-motion', null)}>Off</button>
            <button data-testid="toggle-reduce-motion-on" className="px-3 py-1.5 rounded-md border border-[var(--border)] hover:bg-[var(--accent)]"
              onClick={() => apply('data-reduce-motion', '1')}>On</button>
          </div>
        </div>

        <div className="rounded-lg border border-[var(--border)] p-3 space-y-2">
          <div className="font-medium">Combos</div>
          <div className="flex flex-wrap gap-2">
            {combos.map(c => (
              <button key={c.testId} data-testid={c.testId}
                className="px-3 py-1.5 rounded-md border border-[var(--border)] hover:bg-[var(--accent)]"
                onClick={c.action}>{c.label}</button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex gap-2">
        <button data-testid="toggle-reset-all"
          className="px-3 py-1.5 rounded-md border border-[var(--border)] hover:bg-[var(--accent)]"
          onClick={resetAll}>Reset All</button>
        <button data-testid="snapshot-refresh"
          className="px-3 py-1.5 rounded-md border border-[var(--border)] hover:bg-[var(--accent)]"
          onClick={updateSnapshot}>Refresh Snapshot</button>
      </div>

      <div className="rounded-lg border border-[var(--border)] p-3 space-y-2 bg-[var(--surface)]">
        <div className="font-medium">Current Attributes</div>
        <pre data-testid="attrs-snapshot" className="text-xs overflow-auto p-2 rounded-md bg-[var(--accent)]/20 border border-[var(--border)]">{JSON.stringify(attrs, null, 2)}</pre>
      </div>

      <div className="rounded-lg border border-[var(--border)] p-3 space-y-2 bg-[var(--surface)]">
        <div className="font-medium">Token Values (subset)</div>
        <pre data-testid="tokens-snapshot" className="text-xs overflow-auto p-2 rounded-md bg-[var(--accent)]/20 border border-[var(--border)]">{JSON.stringify(tokens, null, 2)}</pre>
      </div>

      <div className="rounded-lg border border-[var(--border)] p-3 space-y-2">
        <div className="font-medium">Keyboard Navigation</div>
        <p className="text-sm text-[var(--muted-foreground)]">
          Tab through the controls to verify focus-visible rings respect tokens across modes.
        </p>
      </div>
    </section>
  )
}