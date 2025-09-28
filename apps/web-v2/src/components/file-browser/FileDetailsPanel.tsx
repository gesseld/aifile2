'use client'

import React, { useEffect, useMemo, useState } from 'react'
import {
  FilesClient,
  type FileMeta,
  type FileAccessLog,
  type Collaborator,
} from '@/lib/file-manager-client'
import { useRouter } from 'next/navigation'
import {
  askAI,
  extractEntitiesFromText,
  extractTagsFromText,
  type AskAiEntity,
} from '@/lib/ai-adapter'

// Helper functions for file properties
const getStorageClass = (tags?: Record<string, string>): string => {
  const storageClassTag =
    tags?.['storage-class'] || tags?.['storage_class'] || tags?.['StorageClass']
  return storageClassTag || 'STANDARD'
}

const getEncryptionStatus = (tags?: Record<string, string>): string => {
  const encryptionTag =
    tags?.['encryption'] || tags?.['encrypted'] || tags?.['Encryption']
  return encryptionTag === 'enabled' || encryptionTag === 'true'
    ? 'Enabled'
    : 'Not Encrypted'
}

export type FileDetailsPanelProps = {
  file?: FileMeta | null
  onUpdated?: () => void
  onShare?: (url: string) => void
}

type TagRow = { k: string; v: string; id: string }

export default function FileDetailsPanel(props: FileDetailsPanelProps) {
  const { file, onUpdated, onShare } = props
  const router = useRouter()
  const [localName, setLocalName] = useState('')
  const [desc, setDesc] = useState('')
  const [tags, setTags] = useState<TagRow[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)

  // Activity Feed
  const [activity, setActivity] = useState<FileAccessLog[]>([])
  const [actLoading, setActLoading] = useState(false)
  const [actError, setActError] = useState<string | undefined>(undefined)
  const [actLimit, setActLimit] = useState(20)
  const [actOffset, setActOffset] = useState(0)

  // Collaboration overview (lightweight indicators)
  const [collabs, setCollabs] = useState<Collaborator[]>([])
  const [collabsLoading, setCollabsLoading] = useState(false)
  const [collabsError, setCollabsError] = useState<string | undefined>(
    undefined
  )

  // Versions
  const [versions, setVersions] = useState<FileMeta[]>([])
  const [vLoading, setVLoading] = useState(false)
  const [vError, setVError] = useState<string | undefined>(undefined)

  // Ask-AI state
  const [aiPrompt, setAiPrompt] = useState<string>('')
  const [aiLoading, setAiLoading] = useState<boolean>(false)
  const [aiError, setAiError] = useState<string | undefined>(undefined)
  const [aiSummary, setAiSummary] = useState<string | undefined>(undefined)
  const [aiText, setAiText] = useState<string | undefined>(undefined)
  const [aiTags, setAiTags] = useState<Record<string, any> | undefined>(
    undefined
  )
  const [aiEntities, setAiEntities] = useState<AskAiEntity[] | undefined>(
    undefined
  )

  const hasFile = !!file?.id

  useEffect(() => {
    setError(undefined)
    if (!file) {
      setLocalName('')
      setDesc('')
      setTags([])
      setVersions([])
      return
    }
    setLocalName(file.name || file.key || '')
    const tagEntries = Object.entries(
      (file.tags || {}) as Record<string, string>
    )
    const descRow = tagEntries.find(([k]) => k.toLowerCase() === 'description')
    setDesc((descRow?.[1] as string | undefined) || '')
    const rows: TagRow[] = tagEntries
      .filter(([k]) => k.toLowerCase() !== 'description')
      .map(([k, v]) => ({
        k,
        v: String(v),
        id: `${k}:${Math.random().toString(36).slice(2)}`,
      }))
    setTags(rows)
  }, [file?.id])

  // Fetch versions when file changes
  useEffect(() => {
    if (!file?.id) {
      setVersions([])
      return
    }
    let cancelled = false
    setVLoading(true)
    setVError(undefined)
    FilesClient.listVersions?.(file.id)
      .then((r) => {
        if (cancelled) return
        setVersions(r?.versions || [])
      })
      .catch((e: any) => {
        if (cancelled) return
        setVError(e?.message || 'Failed to load versions')
        setVersions([])
      })
      .finally(() => {
        if (cancelled) return
        setVLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [file?.id])

  // Fetch collaborators (best-effort; hide errors if not supported)
  useEffect(() => {
    let cancelled = false
    async function load(fid: string) {
      try {
        setCollabsError(undefined)
        setCollabsLoading(true)
        const res = await FilesClient.listCollaborators?.(fid)
        if (cancelled) return
        setCollabs(Array.isArray(res?.items) ? res!.items : [])
      } catch (e: any) {
        if (cancelled) return
        if (e?.status === 404) {
          setCollabs([])
        } else {
          setCollabsError(e?.message || 'Failed to load collaborators')
        }
      } finally {
        if (!cancelled) setCollabsLoading(false)
      }
    }
    if (file?.id) {
      void load(file.id)
    } else {
      setCollabs([])
    }
    return () => {
      cancelled = true
    }
  }, [file?.id])

  // Fetch activity feed when file or paging changes
  useEffect(() => {
    let cancelled = false
    setActError(undefined)
    setActivity([])
    setActOffset(0)
    const fileId = file?.id
    if (!fileId) return
    async function load(fid: string) {
      try {
        setActLoading(true)
        const res = await FilesClient.listActivity?.(fid, {
          limit: actLimit,
          offset: 0,
        })
        if (cancelled) return
        setActivity(res?.items || [])
        setActOffset(res?.items?.length || 0)
      } catch (e: any) {
        if (cancelled) return
        setActError(e?.message || 'Failed to load activity')
      } finally {
        if (!cancelled) setActLoading(false)
      }
    }
    void load(fileId)
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file?.id, actLimit])

  const loadMoreActivity = async () => {
    const fileId = file?.id
    if (!fileId) return
    try {
      setActLoading(true)
      const res = await FilesClient.listActivity?.(fileId, {
        limit: actLimit,
        offset: actOffset,
      })
      setActivity((prev) => prev.concat(res?.items || []))
      setActOffset((prev) => prev + (res?.items?.length || 0))
    } catch (e: any) {
      setActError(e?.message || 'Failed to load more activity')
    } finally {
      setActLoading(false)
    }
  }

  const sizeFormatted = useMemo(
    () => formatBytes(file?.size_bytes || 0),
    [file?.size_bytes]
  )

  // Derive lightweight sharing summary from tags when dedicated ACL API is unavailable
  const sharingInfo = useMemo(() => {
    const t = file?.tags || {}
    const owner = t['owner'] || t['created_by'] || t['user'] || ''
    const visibility =
      (t['visibility'] || t['public'] || '').toString().toLowerCase() === 'true'
        ? 'Public'
        : (t['visibility'] || '').toString().toLowerCase() === 'public'
          ? 'Public'
          : 'Private'
    const permission =
      (t['permission'] || t['permissions'] || '').toString().toLowerCase() || ''
    return {
      owner: owner || '-',
      visibility,
      permission: permission ? permission.toUpperCase() : '—',
    }
  }, [file?.tags])

  const onAddTag = () => {
    setTags((prev) =>
      prev.concat([{ k: '', v: '', id: Math.random().toString(36).slice(2) }])
    )
  }
  const onRemoveTag = (id: string) => {
    setTags((prev) => prev.filter((t) => t.id !== id))
  }

  const onSave = async () => {
    if (!file?.id) return
    setSaving(true)
    setError(undefined)
    try {
      const clean: Record<string, string> = {}
      // description as special tag
      if (desc.trim()) clean['description'] = desc.trim()
      for (const row of tags) {
        const k = row.k.trim()
        if (!k) continue
        clean[k] = row.v ?? ''
      }
      // Patch name and tags
      await (FilesClient.patch
        ? FilesClient.patch(file.id, {
            name: localName || file.name,
            tags: clean,
          })
        : Promise.resolve())
      onUpdated?.()
    } catch (e: any) {
      setError(e?.message || 'Failed to save changes')
    } finally {
      setSaving(false)
    }
  }

  const onRestore = async (versionId: string) => {
    if (!file?.id) return
    if (
      !confirm('Restore this version? This will create a new current version.')
    )
      return
    try {
      await (FilesClient.restoreVersion
        ? FilesClient.restoreVersion(file.id, versionId)
        : Promise.resolve())
      onUpdated?.()
    } catch (e: any) {
      alert(e?.message || 'Failed to restore version')
    }
  }

  const onShareRead = async () => {
    if (!file?.id) return
    try {
      const presign = await FilesClient.presign(file.id, {
        op: 'read',
        expireSeconds: 60 * 10,
      })
      onShare?.(presign.url)
      // Fallback: copy to clipboard and toast
      try {
        await navigator.clipboard.writeText(presign.url)
        alert('Read URL copied to clipboard (valid ~10m)')
      } catch {
        // ignore
      }
    } catch (e: any) {
      alert(e?.message || 'Failed to create share link')
    }
  }

  return (
    <div className="fdp-root" aria-busy={saving} data-testid="details-panel">
      <div className="fdp-head">Details</div>

      {!hasFile ? (
        <div className="fdp-empty">Select a file to see its details</div>
      ) : (
        <>
          <section className="fdp-section">
            <label className="row">
              <span className="label">Name</span>
              <input
                value={localName}
                onChange={(e) => setLocalName(e.target.value)}
                placeholder="File name"
                data-testid="details-name"
              />
            </label>

            <div className="row">
              <span className="label">Type</span>
              <span className="text">{file?.mime_type || '-'}</span>
            </div>
            <div className="row">
              <span className="label">Size</span>
              <span className="text">{sizeFormatted}</span>
            </div>
            <div className="row">
              <span className="label">Bucket</span>
              <span className="text">{file?.bucket || '-'}</span>
            </div>
            <div className="row">
              <span className="label">Key</span>
              <span className="text mono" title={file?.key || ''}>
                {file?.key || '-'}
              </span>
            </div>
            <div className="row">
              <span className="label">Checksum</span>
              <span className="text mono" title={file?.checksum || ''}>
                {file?.checksum || '-'}
              </span>
            </div>
            <div className="row">
              <span className="label">Updated</span>
              <span className="text">
                {file?.updated_at
                  ? new Date(file.updated_at).toLocaleString()
                  : '-'}
              </span>
            </div>
            <div className="row">
              <span className="label">Created</span>
              <span className="text">
                {file?.created_at
                  ? new Date(file.created_at).toLocaleString()
                  : '-'}
              </span>
            </div>
            <div className="row">
              <span className="label">Last Accessed</span>
              <span className="text">
                {file?.updated_at
                  ? new Date(file.updated_at).toLocaleString()
                  : '-'}
              </span>
            </div>
            <div className="row">
              <span className="label">Storage Class</span>
              <span className="text">{getStorageClass(file?.tags)}</span>
            </div>
            <div className="row">
              <span className="label">Encryption</span>
              <span className="text">{getEncryptionStatus(file?.tags)}</span>
            </div>
            <div className="row">
              <span className="label">ETag</span>
              <span className="text mono" title={file?.checksum || ''}>
                {file?.checksum ? file.checksum.slice(0, 16) + '...' : '-'}
              </span>
            </div>
          </section>

          <section className="fdp-section">
            <div className="row">
              <span className="label">Description</span>
              <textarea
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                rows={3}
                placeholder="Add a description (stored in tags as 'description')"
                data-testid="details-desc"
              />
            </div>
          </section>

          <section className="fdp-section">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <span className="label">Tags</span>
              <button
                className="btn small"
                onClick={onAddTag}
                data-testid="btn-add-tag"
              >
                Add
              </button>
            </div>
            <div className="tags">
              {tags.length === 0 ? (
                <div className="muted">No tags</div>
              ) : (
                tags.map((t) => (
                  <div className="tag-row" key={t.id}>
                    <input
                      className="tag-k"
                      placeholder="key"
                      value={t.k}
                      onChange={(e) => {
                        const v = e.target.value
                        setTags((prev) =>
                          prev.map((x) => (x.id === t.id ? { ...x, k: v } : x))
                        )
                      }}
                    />
                    <input
                      className="tag-v"
                      placeholder="value"
                      value={t.v}
                      onChange={(e) => {
                        const v = e.target.value
                        setTags((prev) =>
                          prev.map((x) => (x.id === t.id ? { ...x, v: v } : x))
                        )
                      }}
                    />
                    <button
                      className="btn small danger"
                      onClick={() => onRemoveTag(t.id)}
                    >
                      ×
                    </button>
                  </div>
                ))
              )}
            </div>
          </section>

          {/* AI Summary + Suggestions (if present) */}
          {aiSummary ||
          aiText ||
          aiTags ||
          (aiEntities && aiEntities.length) ? (
            <section className="fdp-section" aria-live="polite">
              {aiSummary ? (
                <div
                  className="row"
                  style={{ gridTemplateColumns: '120px 1fr' }}
                >
                  <span className="label">AI Summary</span>
                  <div className="text">{aiSummary}</div>
                </div>
              ) : null}
              {aiText && !aiSummary ? (
                <div className="row">
                  <span className="label">AI</span>
                  <div className="text">{aiText}</div>
                </div>
              ) : null}
              {aiTags ? (
                <div className="row" style={{ alignItems: 'center' }}>
                  <span className="label">Suggested Tags</span>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {Object.entries(aiTags).map(([k, v]) => (
                      <button
                        key={k}
                        className="btn small"
                        title="Click to add this tag"
                        onClick={() => {
                          const exists = tags.some((t) => t.k === k)
                          if (exists) return
                          setTags((prev) =>
                            prev.concat([
                              {
                                k,
                                v: String(v),
                                id: `${k}:${Math.random().toString(36).slice(2)}`,
                              },
                            ])
                          )
                        }}
                      >
                        {k}: {String(Array.isArray(v) ? v.join(',') : v)}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              {aiEntities && aiEntities.length ? (
                <div className="row" style={{ alignItems: 'start' }}>
                  <span className="label">Entities</span>
                  <div style={{ display: 'grid', gap: 4 }}>
                    {aiEntities.map((e, idx) => (
                      <div key={idx} className="text">
                        <b>{e.type}</b>: {e.value}{' '}
                        {typeof e.score === 'number' ? (
                          <span className="muted">
                            (score {e.score.toFixed(2)})
                          </span>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </section>
          ) : null}

          <div className="fdp-section">
            <div className="row">
              <span className="label">Owner</span>
              <span className="text">{sharingInfo.owner}</span>
            </div>
            <div className="row">
              <span className="label">Visibility</span>
              <span className="text">{sharingInfo.visibility}</span>
            </div>
            <div className="row">
              <span className="label">Permissions</span>
              <span className="text">{sharingInfo.permission}</span>
            </div>
          </div>

          {/* Collaboration Indicators */}
          <section className="fdp-section" aria-live="polite">
            <div
              className="row"
              style={{ justifyContent: 'space-between', alignItems: 'center' }}
            >
              <span className="label">Collaborators</span>
              {collabsLoading ? <span className="muted">Loading…</span> : null}
              {collabsError ? (
                <span className="error">{collabsError}</span>
              ) : null}
            </div>
            {(!collabs || collabs.length === 0) && !collabsLoading ? (
              <div className="muted">No collaborators</div>
            ) : (
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 6,
                  marginTop: 6,
                }}
              >
                {collabs.slice(0, 8).map((c) => (
                  <span
                    key={c.id}
                    title={`${c.user_id || c.email || c.id} — ${c.role}`}
                    style={{
                      padding: '2px 8px',
                      border: '1px solid #e5e7eb',
                      borderRadius: 999,
                      fontSize: 12,
                      background: '#f9fafb',
                      color: '#374151',
                    }}
                  >
                    {(c.user_id || c.email || c.id)?.toString().slice(0, 12)}
                    <span style={{ opacity: 0.6 }}> · {c.role}</span>
                  </span>
                ))}
                {collabs.length > 8 ? (
                  <span className="muted">+{collabs.length - 8} more</span>
                ) : null}
              </div>
            )}
          </section>

          {/* Actions */}
          <div className="fdp-actions">
            <button
              className="btn primary"
              disabled={saving}
              onClick={onSave}
              data-testid="btn-details-save"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              className="btn"
              onClick={onShareRead}
              title="Create a time-limited read URL and copy it"
              data-testid="btn-share-link"
            >
              Share link
            </button>
            <button
              className="btn"
              data-testid="btn-manage-sharing"
              onClick={() => {
                if (!file?.id) return
                try {
                  window.dispatchEvent(
                    new CustomEvent('afm:action', {
                      detail: { action: 'share' },
                    })
                  )
                } catch {
                  // fallback route if bridge unavailable
                  router.push(`/files/share/${encodeURIComponent(file.id)}`)
                }
              }}
              title="Open full sharing dialog"
            >
              Manage sharing
            </button>
            {error ? <span className="error">{error}</span> : null}
          </div>

          {/* Ask-AI input */}
          <section className="fdp-section" aria-live="polite">
            <div className="row" style={{ alignItems: 'center' }}>
              <span className="label">Ask AI</span>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input
                  type="text"
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  placeholder="e.g., Summarize this file and suggest tags"
                  data-testid="ask-ai-input"
                  style={{ flex: 1 }}
                />
                <button
                  className="btn"
                  data-testid="ask-ai-submit"
                  disabled={aiLoading || !file?.id || !aiPrompt.trim()}
                  onClick={async () => {
                    if (!file?.id) return
                    setAiLoading(true)
                    setAiError(undefined)
                    try {
                      const res = await askAI({
                        prompt: aiPrompt.trim(),
                        file: {
                          id: file.id,
                          name: file.name,
                          bucket: file.bucket,
                          key: file.key,
                          mime_type: file.mime_type,
                          size_bytes: file.size_bytes,
                          tags: file.tags as any,
                          updated_at: file.updated_at,
                          created_at: file.created_at,
                          version_id: (file as any).version_id || null,
                          checksum: (file as any).checksum || null,
                        },
                        mode: 'freeform',
                      })
                      // Normalize fallbacks if backend returns only text
                      const fallbackTags =
                        res.tags || extractTagsFromText(res.text)
                      const fallbackEnts =
                        res.entities || extractEntitiesFromText(res.text)
                      setAiSummary(res.summary)
                      setAiText(res.text)
                      setAiTags(fallbackTags)
                      setAiEntities(fallbackEnts)
                    } catch (e: any) {
                      const msg = e?.message
                        ? String(e.message)
                        : 'Unknown error'
                      // Include a stable title for tests plus the detailed message
                      setAiError(`Ask-AI failed: ${msg}`)
                    } finally {
                      setAiLoading(false)
                    }
                  }}
                  title={!file?.id ? 'Select a single file first' : 'Ask AI'}
                >
                  {aiLoading ? 'Asking…' : 'Ask'}
                </button>
              </div>
            </div>
            {aiError ? (
              <div className="row">
                <span className="label" />
                <span className="error">{aiError}</span>
              </div>
            ) : null}
          </section>

          <section className="fdp-section">
            <div className="row" style={{ marginBottom: 6 }}>
              <span className="label">Versions</span>
              {vLoading ? <span className="muted">Loading…</span> : null}
              {vError ? <span className="error">{vError}</span> : null}
            </div>
            <div className="versions">
              {versions.length === 0 ? (
                <div className="muted">No versions</div>
              ) : (
                <table className="ver-table">
                  <thead>
                    <tr>
                      <th>Version</th>
                      <th>Size</th>
                      <th>Updated</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {versions.map((v) => (
                      <tr key={v.version_id || v.id}>
                        <td className="mono">
                          {short(v.version_id) || short(v.id)}
                        </td>
                        <td>{formatBytes(v.size_bytes)}</td>
                        <td>
                          {v.updated_at
                            ? new Date(v.updated_at).toLocaleString()
                            : '-'}
                        </td>
                        <td>
                          <button
                            className="btn small"
                            onClick={() => onRestore(v.version_id || v.id)}
                          >
                            Restore
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>
        </>
      )}

      {/* Activity Feed */}
      {hasFile && (
        <section className="fdp-section" aria-busy={actLoading}>
          <div className="row" style={{ marginBottom: 6 }}>
            <span className="label">Activity Log</span>
            {actLoading ? <span className="muted">Loading…</span> : null}
            {actError ? <span className="error">{actError}</span> : null}
          </div>
          {activity.length === 0 && !actLoading ? (
            <div className="muted">No activity recorded yet</div>
          ) : (
            <div className="activity">
              <div className="activity-stats">
                <span className="stat">Total: {activity.length} events</span>
                <span className="stat">
                  Success: {activity.filter((a) => a.success !== false).length}
                </span>
                <span className="stat">
                  Failed: {activity.filter((a) => a.success === false).length}
                </span>
              </div>
              <table className="act-table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Action</th>
                    <th>User</th>
                    <th>Status</th>
                    <th>IP</th>
                    <th>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {activity.map((a, idx) => (
                    <tr key={(a.id || '') + idx}>
                      <td title={a.timestamp || ''}>
                        {a.timestamp
                          ? new Date(a.timestamp).toLocaleString()
                          : '—'}
                      </td>
                      <td className="mono">{formatAction(a.action)}</td>
                      <td className="mono">{a.user_id || '—'}</td>
                      <td className={a.success === false ? 'bad' : 'ok'}>
                        {a.success === false ? 'Failed' : 'OK'}
                      </td>
                      <td className="mono">{a.ip_address || '—'}</td>
                      <td className="details">
                        {a.error_message && (
                          <span
                            title={a.error_message}
                            className="error-tooltip"
                          >
                            ⚠️
                          </span>
                        )}
                        {a.user_agent && (
                          <span
                            title={a.user_agent}
                            className="user-agent-tooltip"
                          >
                            🌐
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div
                style={{
                  marginTop: 8,
                  display: 'flex',
                  gap: 8,
                  alignItems: 'center',
                }}
              >
                <span className="muted">Show:</span>
                <select
                  value={actLimit}
                  onChange={(e) => setActLimit(Number(e.target.value))}
                  className="limit-select"
                >
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
                <button
                  className="btn"
                  onClick={loadMoreActivity}
                  disabled={actLoading}
                >
                  Load more
                </button>
                <button
                  className="btn"
                  onClick={() => window.print()}
                  title="Print activity log"
                >
                  Print
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      <style jsx>{styles}</style>
    </div>
  )
}

function short(s?: string) {
  if (!s) return ''
  if (s.length <= 10) return s
  return `${s.slice(0, 6)}…${s.slice(-3)}`
}

function formatAction(action?: string): string {
  if (!action) return '—'
  const actions: Record<string, string> = {
    read: 'Read',
    write: 'Write',
    delete: 'Delete',
    update: 'Update',
    create: 'Create',
    download: 'Download',
    upload: 'Upload',
    restore: 'Restore',
    share: 'Share',
  }
  return actions[action.toLowerCase()] || action
}

function formatBytes(bytes?: number) {
  const n = typeof bytes === 'number' ? bytes : 0
  if (!n || n <= 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(n) / Math.log(k))
  return parseFloat((n / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

const styles = `
.fdp-root {
  display: grid;
  grid-template-rows: auto 1fr;
  min-height: 0;
}
.fdp-head {
  padding: 10px 12px;
  border-bottom: 1px solid #e5e7eb;
  font-weight: 600;
  color: #374151;
  background: #fff;
  position: sticky;
  top: 0;
  z-index: 1;
}
.fdp-empty {
  padding: 12px;
  color: #6b7280;
}
.fdp-section {
  padding: 10px 12px;
  border-bottom: 1px solid #f3f4f6;
}
.row {
  display: grid;
  grid-template-columns: 120px 1fr;
  gap: 8px;
  align-items: start;
  margin: 8px 0;
}
.label {
  color: #374151;
  font-weight: 600;
  font-size: 13px;
}
.text { color: #374151; }
.mono { font-family: ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono","Courier New",monospace; }
.muted { color: #9ca3af; font-size: 12px; }

input, textarea {
  width: 100%;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  padding: 6px 8px;
  font-size: 14px;
  outline: none;
}
input:focus, textarea:focus {
  border-color: #93c5fd;
  box-shadow: 0 0 0 3px rgba(59,130,246,.2);
}

.tags { display: grid; gap: 8px; }
.tag-row {
  display: grid;
  grid-template-columns: 1fr 1fr auto;
  gap: 6px;
}
.tag-k, .tag-v { width: 100%; }

.fdp-actions {
  padding: 8px 12px;
  display: flex;
  gap: 8px;
  align-items: center;
}
.btn {
  background: #eef2ff;
  color: #3730a3;
  border: 1px solid #c7d2fe;
  border-radius: 6px;
  padding: 6px 10px;
  font-size: 13px;
  cursor: pointer;
}
.btn.small { padding: 4px 8px; font-size: 12px; }
.btn.primary {
  background: #2563eb;
  border-color: #1d4ed8;
  color: #fff;
}
.btn.danger {
  background: #fee2e2;
  color: #991b1b;
  border-color: #fecaca;
}
.btn:disabled { opacity: .6; cursor: not-allowed; }

.error { color: #dc2626; font-size: 12px; margin-left: 6px; }

.ver-table { width: 100%; border-collapse: collapse; }
.ver-table th, .ver-table td {
  text-align: left;
  font-size: 13px;
  padding: 6px 4px;
  border-bottom: 1px solid #f3f4f6;
}

/* Activity feed */
.activity { overflow: auto; }
.activity-stats {
  display: flex;
  gap: 16px;
  margin-bottom: 12px;
  padding: 8px;
  background: #f9fafb;
  border-radius: 6px;
  font-size: 12px;
}
.stat {
  color: #6b7280;
  font-weight: 500;
}
.act-table { width: 100%; border-collapse: collapse; }
.act-table th, .act-table td {
  text-align: left;
  font-size: 13px;
  padding: 6px 4px;
  border-bottom: 1px solid #f3f4f6;
}
.act-table .mono { font-family: ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono","Courier New",monospace; }
.act-table td.ok { color: #065f46; }
.act-table td.bad { color: #b91c1c; }
.act-table td.details {
  display: flex;
  gap: 4px;
}
.error-tooltip, .user-agent-tooltip {
  cursor: help;
  font-size: 12px;
}
.limit-select {
  padding: 4px 8px;
  border: 1px solid #e5e7eb;
  border-radius: 4px;
  font-size: 12px;
}
`
