import { Request, Response } from 'express'
import crypto from 'crypto'
import { Readable } from 'stream'
import { MinioClient } from './storage'
import { FileMetadataRepository } from './repositories'
import { EventBus } from './events'
import { FileMetadata, UploadFileResponse, FileEvent } from './types'

interface AuthenticatedRequest extends Request {
  user?: {
    id: string
  }
}

export class FileController {
  constructor(
    private storage: MinioClient,
    private metadataRepo: FileMetadataRepository,
    private eventBus: EventBus
  ) {}

  async uploadFile(req: AuthenticatedRequest, res: Response) {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' })
      }

      // Calculate file hash
      const hash = crypto.createHash('sha256')
      hash.update(req.file.buffer)
      const sha256 = hash.digest('hex')

      // Upload to MinIO
      const objectName = await this.storage.uploadFile(
        req.file.originalname,
        Readable.from(req.file.buffer),
        req.file.size
      )

      // Store metadata
      const metadata = await this.metadataRepo.createMetadata({
        object_name: objectName,
        original_name: req.file.originalname,
        size: req.file.size,
        sha256,
        owner_id: req.user?.id || 'anonymous',
      })

      // Publish event
      await this.eventBus.publishEvent('file.uploaded', {
        type: 'uploaded',
        file_id: metadata.id,
        object_name: objectName,
        owner_id: metadata.owner_id,
        timestamp: new Date(),
      })

      const response: UploadFileResponse = {
        id: metadata.id,
        object_name: objectName,
        original_name: metadata.original_name,
        size: metadata.size,
        sha256: metadata.sha256,
        download_url: `/files/${metadata.id}`,
        stream_url: `/files/${metadata.id}/stream`,
      }

      res.status(201).json(response)
    } catch (error) {
      console.error('Upload error:', error)
      res.status(500).json({ error: 'Failed to upload file' })
    }
  }

  async downloadFile(req: Request, res: Response) {
    try {
      const metadata = await this.metadataRepo.getMetadata(req.params.id)
      if (!metadata) {
        return res.status(404).json({ error: 'File not found' })
      }

      const stream = await this.storage.getFile(metadata.object_name)
      res.setHeader('Content-Type', 'application/octet-stream')
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${metadata.original_name}"`
      )
      res.setHeader('Content-Length', metadata.size.toString())
      stream.pipe(res)
    } catch (error) {
      console.error('Download error:', error)
      res.status(500).json({ error: 'Failed to download file' })
    }
  }

  async streamFile(req: Request, res: Response) {
    try {
      const metadata = await this.metadataRepo.getMetadata(req.params.id)
      if (!metadata) {
        return res.status(404).json({ error: 'File not found' })
      }

      const stream = await this.storage.getFile(metadata.object_name)
      res.setHeader('Content-Type', 'application/octet-stream')
      res.setHeader(
        'Content-Disposition',
        `inline; filename="${metadata.original_name}"`
      )
      stream.pipe(res)
    } catch (error) {
      console.error('Stream error:', error)
      res.status(500).json({ error: 'Failed to stream file' })
    }
  }

  async deleteFile(req: AuthenticatedRequest, res: Response) {
    try {
      const metadata = await this.metadataRepo.getMetadata(req.params.id)
      if (!metadata) {
        return res.status(404).json({ error: 'File not found' })
      }

      // Verify ownership
      if (req.user?.id !== metadata.owner_id) {
        return res.status(403).json({ error: 'Unauthorized' })
      }

      // Delete from storage
      await this.storage.deleteFile(metadata.object_name)

      // Delete metadata
      await this.metadataRepo.deleteMetadata(metadata.id)

      // Publish event
      await this.eventBus.publishEvent('file.deleted', {
        type: 'deleted',
        file_id: metadata.id,
        object_name: metadata.object_name,
        owner_id: metadata.owner_id,
        timestamp: new Date(),
      })

      res.status(204).end()
    } catch (error) {
      console.error('Delete error:', error)
      res.status(500).json({ error: 'Failed to delete file' })
    }
  }
}
