import { Pool } from 'pg'
import { FileMetadata } from './types'

export class FileMetadataRepository {
  private pool: Pool

  constructor() {
    this.pool = new Pool({
      host: process.env.PG_HOST || 'localhost',
      port: parseInt(process.env.PG_PORT || '5432'),
      user: process.env.PG_USER || 'postgres',
      password: process.env.PG_PASSWORD || 'postgres',
      database: process.env.PG_DATABASE || 'file_service',
    })
  }

  async init() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS files (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        object_name VARCHAR(255) NOT NULL,
        original_name VARCHAR(255) NOT NULL,
        size BIGINT NOT NULL,
        sha256 VARCHAR(64) NOT NULL,
        owner_id VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)
  }

  async createMetadata(
    metadata: Omit<FileMetadata, 'id' | 'created_at' | 'updated_at'>
  ): Promise<FileMetadata> {
    const result = await this.pool.query<FileMetadata>(
      `
      INSERT INTO files (object_name, original_name, size, sha256, owner_id)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `,
      [
        metadata.object_name,
        metadata.original_name,
        metadata.size,
        metadata.sha256,
        metadata.owner_id,
      ]
    )

    return result.rows[0]
  }

  async getMetadata(id: string): Promise<FileMetadata | null> {
    const result = await this.pool.query<FileMetadata>(
      `
      SELECT * FROM files WHERE id = $1
    `,
      [id]
    )

    return result.rows[0] || null
  }

  async deleteMetadata(id: string): Promise<void> {
    await this.pool.query(
      `
      DELETE FROM files WHERE id = $1
    `,
      [id]
    )
  }

  async getMetadataByObjectName(
    objectName: string
  ): Promise<FileMetadata | null> {
    const result = await this.pool.query<FileMetadata>(
      `
      SELECT * FROM files WHERE object_name = $1
    `,
      [objectName]
    )

    return result.rows[0] || null
  }
}
