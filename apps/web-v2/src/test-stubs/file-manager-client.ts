export type FileMeta = {
  id: string
  name: string
  key?: string
  bucket?: string
  mime_type?: string
  size_bytes?: number
  updated_at?: string
  created_at?: string
  has_thumbnail?: boolean
}

export const FilesClient = {
  async list(_opts: any): Promise<{ items: FileMeta[]; next_cursor?: string }> {
    return { items: [], next_cursor: undefined }
  },
  async batch(
    _ops: any,
    _opts?: any
  ): Promise<{ results: Array<{ ok: boolean; error?: string }> }> {
    return { results: [] }
  },
  async presign(_id: string, _opts: any): Promise<{ url: string }> {
    return { url: 'https://example.com/presigned' }
  },
}

export const BucketsClient = {
  async list(): Promise<{ buckets: string[] }> {
    return { buckets: ['alpha', 'beta', 'gamma'] }
  },
  async create(_name: string): Promise<void> {
    return
  },
  async delete(_name: string, _force?: boolean): Promise<void> {
    return
  },
  async renameViaMirror(_from: string, _to: string): Promise<void> {
    return
  },
  async usage(_name: string): Promise<any> {
    return {
      bucket: _name,
      totalBytes: 1024,
      objectCount: 1,
      byType: {
        image: { bytes: 1024, count: 1 },
        video: { bytes: 0, count: 0 },
        audio: { bytes: 0, count: 0 },
        document: { bytes: 0, count: 0 },
        archive: { bytes: 0, count: 0 },
        other: { bytes: 0, count: 0 },
      },
      generatedAt: new Date().toISOString(),
    }
  },
}

export default {
  FilesClient,
  BucketsClient,
}
