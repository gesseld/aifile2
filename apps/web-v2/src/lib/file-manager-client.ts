/**
 * Minimal adapter stub to satisfy legacy imports until real client is wired.
 * This keeps runtime stable while we land visual refresh PRs.
 */

export type FileMeta = {
  id: string
  name: string
  size?: number
  type?: string
  modifiedAt?: string
  tags?: string[]
}

export type FileAccessLog = {
  id: string
  fileId: string
  action: 'view' | 'download' | 'share' | 'delete' | 'upload'
  at: string
  actor?: string
  meta?: Record<string, unknown>
}

export class FilesClient {
  constructor(private opts: { baseUrl?: string } = {}) {}

  async list(): Promise<FileMeta[]> {
    // Return a small predictable set for UI rendering while backend wiring is pending
    return [
      { id: '1', name: 'Document.pdf', size: 128_000, type: 'application/pdf', modifiedAt: new Date().toISOString(), tags: ['pdf', 'report'] },
      { id: '2', name: 'Image.png', size: 64_000, type: 'image/png', modifiedAt: new Date().toISOString(), tags: ['image'] },
      { id: '3', name: 'Notes.txt', size: 2_048, type: 'text/plain', modifiedAt: new Date().toISOString(), tags: ['text'] },
    ]
  }

  async get(id: string): Promise<FileMeta | null> {
    const all = await this.list()
    return all.find(f => f.id === id) ?? null
  }

  async logs(_id: string): Promise<FileAccessLog[]> {
    return [
      { id: 'l1', fileId: _id, action: 'view', at: new Date(Date.now() - 3600_000).toISOString(), actor: 'you' },
      { id: 'l2', fileId: _id, action: 'download', at: new Date(Date.now() - 1800_000).toISOString(), actor: 'you' },
    ]
  }

  // Placeholder upload to keep UI actions non-breaking; returns a fake meta
  async upload(_file: File): Promise<FileMeta> {
    return {
      id: String(Math.random()).slice(2),
      name: _file.name,
      size: _file.size,
      type: _file.type,
      modifiedAt: new Date().toISOString(),
      tags: [],
    }
  }
}

export default FilesClient