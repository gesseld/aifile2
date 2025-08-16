import request from 'supertest'
import express from 'express'
import multer from 'multer'
import { FileController } from '../app/controllers'
import { MinioClient } from '../app/storage'
import { FileMetadataRepository } from '../app/repositories'
import { EventBus } from '../app/events'
import { Readable } from 'stream'
import { mockMinioClient, mockPool, mockNatsConnection } from './setup'

describe('FileController Integration Tests', () => {
  let app: express.Application
  let fileController: FileController
  let minioClient: MinioClient
  let metadataRepo: FileMetadataRepository
  let eventBus: EventBus

  beforeEach(() => {
    jest.clearAllMocks()

    // Initialize dependencies
    minioClient = new MinioClient()
    metadataRepo = new FileMetadataRepository()
    eventBus = new EventBus()
    fileController = new FileController(minioClient, metadataRepo, eventBus)

    // Setup Express app
    app = express()
    app.use(express.json())
    const upload = multer({ storage: multer.memoryStorage() })

    // Add mock user middleware for testing
    app.use((req: any, res, next) => {
      req.user = { id: 'test-user-123' }
      next()
    })

    // Routes
    app.post(
      '/files',
      upload.single('file'),
      fileController.uploadFile.bind(fileController)
    )
    app.get('/files/:id', fileController.downloadFile.bind(fileController))
    app.get('/files/:id/stream', fileController.streamFile.bind(fileController))
    app.delete('/files/:id', fileController.deleteFile.bind(fileController))
  })

  describe('POST /files - Upload File', () => {
    it('should upload a file successfully', async () => {
      // Mock dependencies
      mockMinioClient.bucketExists.mockResolvedValue(true)
      mockMinioClient.putObject.mockResolvedValue({
        etag: 'test-etag',
        versionId: null,
      })

      const mockMetadata = {
        id: 'file-uuid-123',
        object_name: 'test-object-123.txt',
        original_name: 'test.txt',
        size: 11,
        sha256:
          'a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3',
        owner_id: 'test-user-123',
        created_at: new Date('2023-01-01T00:00:00Z'),
        updated_at: new Date('2023-01-01T00:00:00Z'),
      }

      mockPool.query.mockResolvedValue({ rows: [mockMetadata] })
      mockNatsConnection.publish.mockResolvedValue(undefined)

      const response = await request(app)
        .post('/files')
        .attach('file', Buffer.from('hello world'), 'test.txt')
        .expect(201)

      expect(response.body).toHaveProperty('id')
      expect(response.body).toHaveProperty('object_name')
      expect(response.body).toHaveProperty('original_name', 'test.txt')
      expect(response.body).toHaveProperty('size', 11)
      expect(response.body).toHaveProperty('sha256')
      expect(response.body).toHaveProperty('download_url')
      expect(response.body).toHaveProperty('stream_url')

      // Verify MinIO upload was called
      expect(mockMinioClient.putObject).toHaveBeenCalled()

      // Verify metadata was stored
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO files'),
        expect.any(Array)
      )

      // Verify event was published
      expect(mockNatsConnection.publish).toHaveBeenCalledWith(
        'file.uploaded',
        expect.any(Uint8Array)
      )
    })

    it('should return 400 when no file is uploaded', async () => {
      const response = await request(app).post('/files').expect(400)

      expect(response.body).toEqual({ error: 'No file uploaded' })
    })

    it('should handle MinIO upload errors', async () => {
      mockMinioClient.bucketExists.mockResolvedValue(true)
      mockMinioClient.putObject.mockRejectedValue(new Error('MinIO error'))

      const response = await request(app)
        .post('/files')
        .attach('file', Buffer.from('hello world'), 'test.txt')
        .expect(500)

      expect(response.body).toEqual({ error: 'Failed to upload file' })
    })

    it('should handle database errors', async () => {
      mockMinioClient.bucketExists.mockResolvedValue(true)
      mockMinioClient.putObject.mockResolvedValue({
        etag: 'test-etag',
        versionId: null,
      })
      mockPool.query.mockRejectedValue(new Error('Database error'))

      const response = await request(app)
        .post('/files')
        .attach('file', Buffer.from('hello world'), 'test.txt')
        .expect(500)

      expect(response.body).toEqual({ error: 'Failed to upload file' })
    })
  })

  describe('GET /files/:id - Download File', () => {
    it('should download a file successfully', async () => {
      const mockMetadata = {
        id: 'file-uuid-123',
        object_name: 'test-object-123.txt',
        original_name: 'test.txt',
        size: 11,
        sha256: 'test-hash',
        owner_id: 'test-user-123',
        created_at: new Date('2023-01-01T00:00:00Z'),
        updated_at: new Date('2023-01-01T00:00:00Z'),
      }

      const mockStream = new Readable()
      mockStream.push('hello world')
      mockStream.push(null)

      mockPool.query.mockResolvedValue({ rows: [mockMetadata] })
      mockMinioClient.getObject.mockResolvedValue(mockStream)

      const response = await request(app)
        .get('/files/file-uuid-123')
        .expect(200)

      expect(response.headers['content-type']).toBe('application/octet-stream')
      expect(response.headers['content-disposition']).toBe(
        'attachment; filename="test.txt"'
      )
      expect(response.headers['content-length']).toBe('11')
      expect(response.text).toBe('hello world')
    })

    it('should return 404 when file metadata not found', async () => {
      mockPool.query.mockResolvedValue({ rows: [] })

      const response = await request(app)
        .get('/files/non-existent-id')
        .expect(404)

      expect(response.body).toEqual({ error: 'File not found' })
    })

    it('should handle MinIO download errors', async () => {
      const mockMetadata = {
        id: 'file-uuid-123',
        object_name: 'test-object-123.txt',
        original_name: 'test.txt',
        size: 11,
        sha256: 'test-hash',
        owner_id: 'test-user-123',
        created_at: new Date('2023-01-01T00:00:00Z'),
        updated_at: new Date('2023-01-01T00:00:00Z'),
      }

      mockPool.query.mockResolvedValue({ rows: [mockMetadata] })
      mockMinioClient.getObject.mockRejectedValue(new Error('MinIO error'))

      const response = await request(app)
        .get('/files/file-uuid-123')
        .expect(500)

      expect(response.body).toEqual({ error: 'Failed to download file' })
    })
  })

  describe('GET /files/:id/stream - Stream File', () => {
    it('should stream a file successfully', async () => {
      const mockMetadata = {
        id: 'file-uuid-123',
        object_name: 'test-object-123.txt',
        original_name: 'test.txt',
        size: 11,
        sha256: 'test-hash',
        owner_id: 'test-user-123',
        created_at: new Date('2023-01-01T00:00:00Z'),
        updated_at: new Date('2023-01-01T00:00:00Z'),
      }

      const mockStream = new Readable()
      mockStream.push('hello world')
      mockStream.push(null)

      mockPool.query.mockResolvedValue({ rows: [mockMetadata] })
      mockMinioClient.getObject.mockResolvedValue(mockStream)

      const response = await request(app)
        .get('/files/file-uuid-123/stream')
        .expect(200)

      expect(response.headers['content-type']).toBe('application/octet-stream')
      expect(response.headers['content-disposition']).toBe(
        'inline; filename="test.txt"'
      )
      expect(response.text).toBe('hello world')
    })

    it('should return 404 when file metadata not found', async () => {
      mockPool.query.mockResolvedValue({ rows: [] })

      const response = await request(app)
        .get('/files/non-existent-id/stream')
        .expect(404)

      expect(response.body).toEqual({ error: 'File not found' })
    })
  })

  describe('DELETE /files/:id - Delete File', () => {
    it('should delete a file successfully', async () => {
      const mockMetadata = {
        id: 'file-uuid-123',
        object_name: 'test-object-123.txt',
        original_name: 'test.txt',
        size: 11,
        sha256: 'test-hash',
        owner_id: 'test-user-123',
        created_at: new Date('2023-01-01T00:00:00Z'),
        updated_at: new Date('2023-01-01T00:00:00Z'),
      }

      mockPool.query
        .mockResolvedValueOnce({ rows: [mockMetadata] }) // getMetadata
        .mockResolvedValueOnce({}) // deleteMetadata

      mockMinioClient.removeObject.mockResolvedValue(undefined)
      mockNatsConnection.publish.mockResolvedValue(undefined)

      const response = await request(app)
        .delete('/files/file-uuid-123')
        .expect(204)

      expect(response.body).toEqual({})

      // Verify MinIO delete was called
      expect(mockMinioClient.removeObject).toHaveBeenCalledWith(
        'primary',
        'test-object-123.txt'
      )

      // Verify metadata was deleted
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM files WHERE id = $1'),
        ['file-uuid-123']
      )

      // Verify event was published
      expect(mockNatsConnection.publish).toHaveBeenCalledWith(
        'file.deleted',
        expect.any(Uint8Array)
      )
    })

    it('should return 404 when file metadata not found', async () => {
      mockPool.query.mockResolvedValue({ rows: [] })

      const response = await request(app)
        .delete('/files/non-existent-id')
        .expect(404)

      expect(response.body).toEqual({ error: 'File not found' })
    })

    it('should return 403 when user is not the owner', async () => {
      const mockMetadata = {
        id: 'file-uuid-123',
        object_name: 'test-object-123.txt',
        original_name: 'test.txt',
        size: 11,
        sha256: 'test-hash',
        owner_id: 'different-user-456', // Different owner
        created_at: new Date('2023-01-01T00:00:00Z'),
        updated_at: new Date('2023-01-01T00:00:00Z'),
      }

      mockPool.query.mockResolvedValue({ rows: [mockMetadata] })

      const response = await request(app)
        .delete('/files/file-uuid-123')
        .expect(403)

      expect(response.body).toEqual({ error: 'Unauthorized' })
    })

    it('should handle MinIO delete errors', async () => {
      const mockMetadata = {
        id: 'file-uuid-123',
        object_name: 'test-object-123.txt',
        original_name: 'test.txt',
        size: 11,
        sha256: 'test-hash',
        owner_id: 'test-user-123',
        created_at: new Date('2023-01-01T00:00:00Z'),
        updated_at: new Date('2023-01-01T00:00:00Z'),
      }

      mockPool.query.mockResolvedValue({ rows: [mockMetadata] })
      mockMinioClient.removeObject.mockRejectedValue(new Error('MinIO error'))

      const response = await request(app)
        .delete('/files/file-uuid-123')
        .expect(500)

      expect(response.body).toEqual({ error: 'Failed to delete file' })
    })
  })
})
