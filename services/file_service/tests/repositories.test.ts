import { FileMetadataRepository } from '../app/repositories'
import { FileMetadata } from '../app/types'
import { mockPool } from './setup'

describe('FileMetadataRepository', () => {
  let repository: FileMetadataRepository

  beforeEach(() => {
    jest.clearAllMocks()
    repository = new FileMetadataRepository()
  })

  describe('init', () => {
    it('should create files table if not exists', async () => {
      mockPool.query.mockResolvedValue({})

      await repository.init()

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('CREATE TABLE IF NOT EXISTS files')
      )
    })

    it('should handle database connection errors', async () => {
      mockPool.query.mockRejectedValue(new Error('Connection failed'))

      await expect(repository.init()).rejects.toThrow('Connection failed')
    })
  })

  describe('createMetadata', () => {
    it('should insert file metadata and return created record', async () => {
      const mockMetadata = {
        object_name: 'test-object-123.txt',
        original_name: 'test.txt',
        size: 1024,
        sha256: 'abcd1234567890',
        owner_id: 'user123',
      }

      const mockResult: FileMetadata = {
        id: 'file-uuid-123',
        ...mockMetadata,
        created_at: new Date('2023-01-01T00:00:00Z'),
        updated_at: new Date('2023-01-01T00:00:00Z'),
      }

      mockPool.query.mockResolvedValue({ rows: [mockResult] })

      const result = await repository.createMetadata(mockMetadata)

      expect(result).toEqual(mockResult)
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO files'),
        [
          mockMetadata.object_name,
          mockMetadata.original_name,
          mockMetadata.size,
          mockMetadata.sha256,
          mockMetadata.owner_id,
        ]
      )
    })

    it('should handle insert errors', async () => {
      const mockMetadata = {
        object_name: 'test-object-123.txt',
        original_name: 'test.txt',
        size: 1024,
        sha256: 'abcd1234567890',
        owner_id: 'user123',
      }

      mockPool.query.mockRejectedValue(new Error('Insert failed'))

      await expect(repository.createMetadata(mockMetadata)).rejects.toThrow(
        'Insert failed'
      )
    })
  })

  describe('getMetadata', () => {
    it('should return file metadata by id', async () => {
      const fileId = 'file-uuid-123'
      const mockMetadata: FileMetadata = {
        id: fileId,
        object_name: 'test-object-123.txt',
        original_name: 'test.txt',
        size: 1024,
        sha256: 'abcd1234567890',
        owner_id: 'user123',
        created_at: new Date('2023-01-01T00:00:00Z'),
        updated_at: new Date('2023-01-01T00:00:00Z'),
      }

      mockPool.query.mockResolvedValue({ rows: [mockMetadata] })

      const result = await repository.getMetadata(fileId)

      expect(result).toEqual(mockMetadata)
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM files WHERE id = $1'),
        [fileId]
      )
    })

    it('should return null if file not found', async () => {
      const fileId = 'non-existent-id'

      mockPool.query.mockResolvedValue({ rows: [] })

      const result = await repository.getMetadata(fileId)

      expect(result).toBeNull()
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM files WHERE id = $1'),
        [fileId]
      )
    })

    it('should handle query errors', async () => {
      const fileId = 'file-uuid-123'

      mockPool.query.mockRejectedValue(new Error('Query failed'))

      await expect(repository.getMetadata(fileId)).rejects.toThrow(
        'Query failed'
      )
    })
  })

  describe('deleteMetadata', () => {
    it('should delete file metadata by id', async () => {
      const fileId = 'file-uuid-123'

      mockPool.query.mockResolvedValue({})

      await repository.deleteMetadata(fileId)

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM files WHERE id = $1'),
        [fileId]
      )
    })

    it('should handle delete errors', async () => {
      const fileId = 'file-uuid-123'

      mockPool.query.mockRejectedValue(new Error('Delete failed'))

      await expect(repository.deleteMetadata(fileId)).rejects.toThrow(
        'Delete failed'
      )
    })
  })

  describe('getMetadataByObjectName', () => {
    it('should return file metadata by object name', async () => {
      const objectName = 'test-object-123.txt'
      const mockMetadata: FileMetadata = {
        id: 'file-uuid-123',
        object_name: objectName,
        original_name: 'test.txt',
        size: 1024,
        sha256: 'abcd1234567890',
        owner_id: 'user123',
        created_at: new Date('2023-01-01T00:00:00Z'),
        updated_at: new Date('2023-01-01T00:00:00Z'),
      }

      mockPool.query.mockResolvedValue({ rows: [mockMetadata] })

      const result = await repository.getMetadataByObjectName(objectName)

      expect(result).toEqual(mockMetadata)
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM files WHERE object_name = $1'),
        [objectName]
      )
    })

    it('should return null if object not found', async () => {
      const objectName = 'non-existent-object.txt'

      mockPool.query.mockResolvedValue({ rows: [] })

      const result = await repository.getMetadataByObjectName(objectName)

      expect(result).toBeNull()
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM files WHERE object_name = $1'),
        [objectName]
      )
    })

    it('should handle query errors', async () => {
      const objectName = 'test-object-123.txt'

      mockPool.query.mockRejectedValue(new Error('Query failed'))

      await expect(
        repository.getMetadataByObjectName(objectName)
      ).rejects.toThrow('Query failed')
    })
  })
})
