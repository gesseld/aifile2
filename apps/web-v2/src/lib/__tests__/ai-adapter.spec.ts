import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  askAI,
  extractEntitiesFromText,
  extractTagsFromText,
  type AskAiResponse,
} from '@/lib/ai-adapter'

describe('ai-adapter askAI()', () => {
  const baseReq = {
    prompt: 'Summarize and suggest tags',
    file: {
      id: 'f1',
      name: 'report.pdf',
      bucket: 'b',
      key: 'docs/report.pdf',
      mime_type: 'application/pdf',
      size_bytes: 1024,
      tags: { author: 'Alice' },
      updated_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      version_id: 'v1',
      checksum: 'abc',
    },
  }

  let fetchMock: any

  beforeEach(() => {
    fetchMock = vi.fn()
  })

  function okJson(body: any) {
    return {
      ok: true,
      headers: {
        get: (k: string) =>
          k.toLowerCase() === 'content-type' ? 'application/json' : null,
      },
      json: async () => body,
      text: async () => JSON.stringify(body),
    } as any
  }
  function okText(txt: string) {
    return {
      ok: true,
      headers: {
        get: (k: string) =>
          k.toLowerCase() === 'content-type' ? 'text/plain' : null,
      },
      json: async () => {
        throw new Error('no json')
      },
      text: async () => txt,
    } as any
  }
  function errJson(status = 500, msg = 'bad') {
    return {
      ok: false,
      status,
      headers: { get: () => 'application/json' },
      json: async () => ({ error: msg }),
      text: async () => msg,
    } as any
  }

  it('normalizes typical JSON { summary, tags, entities }', async () => {
    fetchMock
      .mockResolvedValueOnce(errJson(404, 'not found')) // /api/ai/ask fails
      .mockResolvedValueOnce(
        okJson({
          summary: 'Short summary',
          tags: { topic: 'finance', year: 2024 },
          entities: [{ type: 'ORG', value: 'Acme', score: 0.91 }],
        })
      )
    const res = await askAI(baseReq, fetchMock)
    expect(res.summary).toBe('Short summary')
    expect(res.tags).toEqual({ topic: 'finance', year: 2024 })
    expect(res.entities?.[0]?.type).toBe('ORG')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('supports text-only response and leaves normalization to fallbacks (consumer side)', async () => {
    fetchMock.mockResolvedValueOnce(
      okText(
        'AI summary line\nTags: project=apollo, owner=bob\nEntity(Person): Alice'
      )
    )
    const res = await askAI(baseReq, fetchMock)
    expect(res.text).toContain('AI summary line')
    // Adapter does not force extract; consumer uses helpers
    expect(res.tags).toBeUndefined()
    expect(res.entities).toBeUndefined()
  })

  it('tries multiple endpoints and throws a meaningful error when all fail', async () => {
    fetchMock
      .mockResolvedValueOnce(errJson(500, 'e1'))
      .mockResolvedValueOnce(errJson(500, 'e2'))
      .mockResolvedValueOnce(errJson(500, 'e3'))
    await expect(askAI(baseReq, fetchMock)).rejects.toThrow(/Ask-AI failed/)
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })
})

describe('ai-adapter text extraction helpers', () => {
  it('extractTagsFromText and extractEntitiesFromText', () => {
    const text = `This is a doc
Tags: category=science, priority=high, reviewers=alice
Entity(Person): Bob
Entity(Org): NASA
`
    const tags = extractTagsFromText(text)
    const ents = extractEntitiesFromText(text)
    expect(tags).toEqual({
      category: 'science',
      priority: 'high',
      reviewers: 'alice',
    })
    expect(ents?.map((e) => e.type)).toEqual(['Person', 'Org'])
    expect(ents?.map((e) => e.value)).toEqual(['Bob', 'NASA'])
  })
})
