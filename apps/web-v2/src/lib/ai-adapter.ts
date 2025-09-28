/**
 * Minimal AI adapter for Ask-AI integration.
 * Tries multiple endpoints to maximize compatibility:
 * - NEXT_PUBLIC_AI_ENDPOINT (if provided)
 * - /api/ai/ask
 * - /api/ai
 * - /api/ask-ai
 *
 * Response is normalized into AskAiResponse shape.
 */

export type AskAiEntity = {
  type: string
  value: string
  score?: number
}

export type AskAiResponse = {
  text?: string
  summary?: string
  tags?: Record<
    string,
    string | number | boolean | Array<string | number | boolean>
  >
  entities?: AskAiEntity[]
  raw?: any
}

export type AskAiRequest = {
  prompt: string
  file?: {
    id?: string
    name?: string
    bucket?: string
    key?: string
    mime_type?: string
    size_bytes?: number
    tags?: Record<string, string>
    updated_at?: string
    created_at?: string
    version_id?: string | null
    checksum?: string | null
  }
  // Optional hints (future)
  mode?: 'tags' | 'entities' | 'summary' | 'freeform'
}

const DEFAULT_ENDPOINTS = ['/api/ai/ask', '/api/ai', '/api/ask-ai']

function pickTextLike(o: any): string | undefined {
  if (!o || typeof o !== 'object') return undefined
  if (typeof o.text === 'string') return o.text
  if (typeof o.answer === 'string') return o.answer
  if (typeof o.message === 'string') return o.message
  if (typeof o.summary === 'string') return o.summary
  return undefined
}
function pickSummary(o: any): string | undefined {
  if (!o || typeof o !== 'object') return undefined
  if (typeof o.summary === 'string') return o.summary
  if (o.data && typeof o.data.summary === 'string') return o.data.summary
  return undefined
}
function pickTags(o: any): Record<string, any> | undefined {
  const cands = [
    o?.tags,
    o?.suggested_tags,
    o?.data?.tags,
    o?.data?.suggested_tags,
  ]
  for (const c of cands) {
    if (c && typeof c === 'object' && !Array.isArray(c)) return c as any
  }
  return undefined
}
function pickEntities(o: any): AskAiEntity[] | undefined {
  const cands = [o?.entities, o?.detected_entities, o?.data?.entities]
  for (const c of cands) {
    if (Array.isArray(c)) {
      return c
        .map((e) => {
          if (!e) return null
          if (typeof e === 'string') return { type: 'entity', value: e }
          if (typeof e === 'object') {
            const type = String(e.type || e.label || e.kind || 'entity')
            const value = String(e.value || e.text || e.name || '')
            const score =
              typeof e.score === 'number'
                ? e.score
                : typeof e.confidence === 'number'
                  ? e.confidence
                  : undefined
            if (!value) return null
            return { type, value, score }
          }
          return null
        })
        .filter(Boolean) as AskAiEntity[]
    }
  }
  return undefined
}

type Fetcher = (url: string, init: RequestInit) => Promise<Response>

async function doPost(
  url: string,
  body: any,
  fetcher: Fetcher = fetch as any
): Promise<AskAiResponse> {
  const res = await fetcher(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  })
  const ct = res.headers.get('content-type') || ''
  const ok = res.ok
  let data: any = null
  try {
    if (ct.includes('application/json')) {
      data = await res.json()
    } else {
      const txt = await res.text()
      data = { text: txt }
    }
  } catch {
    data = null
  }
  if (!ok) {
    const msg =
      (data && (data.error || data.message)) ||
      `Ask-AI request failed (${res.status})`
    throw new Error(String(msg))
  }
  return {
    text: pickTextLike(data),
    summary: pickSummary(data),
    tags: pickTags(data),
    entities: pickEntities(data),
    raw: data,
  }
}

export async function askAI(
  req: AskAiRequest,
  fetcher?: Fetcher
): Promise<AskAiResponse> {
  const envUrl =
    (typeof process !== 'undefined' &&
      (process as any)?.env?.NEXT_PUBLIC_AI_ENDPOINT) ||
    (typeof window !== 'undefined' && (window as any)?.AI_ENDPOINT) ||
    ''
  const endpoints = [...(envUrl ? [envUrl] : []), ...DEFAULT_ENDPOINTS].filter(
    Boolean
  )

  // Build minimal payload
  const payload = {
    prompt: req.prompt,
    file: req.file
      ? {
          id: req.file.id,
          name: req.file.name,
          bucket: req.file.bucket,
          key: req.file.key,
          mime_type: req.file.mime_type,
          size_bytes: req.file.size_bytes,
          tags: req.file.tags,
          updated_at: req.file.updated_at,
          created_at: req.file.created_at,
          version_id: req.file.version_id,
          checksum: req.file.checksum,
        }
      : undefined,
    mode: req.mode || 'freeform',
  }

  let lastErr: any = null
  for (const url of endpoints) {
    try {
      return await doPost(url, payload, fetcher as any)
    } catch (e: any) {
      lastErr = e
      continue
    }
  }
  throw new Error(
    `Ask-AI failed across all endpoints: ${(lastErr && lastErr.message) || 'unknown'}`
  )
}

/**
 * Simple helpers to derive suggested tags or entities from free text, when backend returns only text.
 * These are optional fallbacks and should not override backend-provided values.
 */
export function extractTagsFromText(
  text?: string
): Record<string, string> | undefined {
  if (!text || typeof text !== 'string') return undefined
  // Heuristic: look for "tags: k1=v1, k2=v2" patterns
  const m = /tags?\s*:\s*([^\n]+)/i.exec(text)
  if (!m) return undefined
  const raw = m[1]
  const parts = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const out: Record<string, string> = {}
  for (const p of parts) {
    const kv = p.split('=')
    if (kv.length === 2) {
      const k = kv[0].trim()
      const v = kv[1].trim()
      if (k) out[k] = v
    }
  }
  return Object.keys(out).length ? out : undefined
}

export function extractEntitiesFromText(
  text?: string
): AskAiEntity[] | undefined {
  if (!text || typeof text !== 'string') return undefined
  // Heuristic: lines like "Entity(Type): Value"
  const lines = text.split(/\r?\n/)
  const out: AskAiEntity[] = []
  for (const line of lines) {
    const m =
      /^\s*([A-Z][A-Za-z0-9_-]{1,32})\s*\(\s*([A-Za-z0-9_-]{2,32})\s*\)\s*:\s*(.+)$/.exec(
        line
      )
    if (m) {
      out.push({ type: m[2], value: m[3] })
    }
  }
  return out.length ? out : undefined
}
