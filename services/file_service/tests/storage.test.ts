import { MinioClient } from '../app/storage'
import { Readable } from 'stream'
import { mockMinioClient } from './setup'

describe('MinioClient', () => {
  let storage: MinioClient

  beforeEach(() => {
    jest.clearAllMocks()
    storage = new MinioClient()
  })

  describe('ensureBucketExists', () => {
    it('should create bucket if it does not exist', async () => {
      mockMinioClient.bucketExists.mockResolvedValue(false)
      mockMinioClient.makeBucket.mockResolvedValue(undefined)

      await storage.ensureBucketExists()

      expect(mockMinioClient.bucketExists).toHaveBeenCalledWith('primary')
      expect(mockMinioClient.makeBucket).toHaveBeenCalledWith('primary')
    })

    it('should not create bucket if it already exists', async () => {
      mockMinioClient.bucketExists.mockResolvedValue(true)

      await storage.ensureBucketExists()

      expect(mockMinioClient.bucketExists).toHaveBeenCalledWith('primary')
      expect(mockMinioClient.makeBucket).not.toHaveBeenCalled()
    })
  })

  describe('uploadFile', () => {
    it('should upload file successfully', async () => {
      const fileName = 'test.txt'
      const fileContent = 'Hello World'
      const stream = Readable.from([fileContent])
      const size = fileContent.length

      mockMinioClient.bucketExists.mockResolvedValue(true)
      mockMinioClient.putObject.mockResolvedValue({
        etag: 'test-etag',
        versionId: null,
      })

      const result = await storage.uploadFile(fileName, stream, size)

      expect(result).toMatch(/^[a-f0-9-]+-test\.txt$/)
      expect(mockMinioClient.putObject).toHaveBeenCalledWith(
        'primary',
        expect.stringMatching(/^[a-f0-9-]+-test\.txt$/),
        stream,
        size
      )
    })

    it('should ensure bucket exists before upload', async () => {
      const fileName = 'test.txt'
      const stream = Readable.from(['content'])
      const size = 7

      mockMinioClient.bucketExists.mockResolvedValue(false)
      mockMinioClient.makeBucket.mockResolvedValue(undefined)
      mockMinioClient.putObject.mockResolvedValue({
        etag: 'test-etag',
        versionId: null,
      })

      await storage.uploadFile(fileName, stream, size)

      expect(mockMinioClient.bucketExists).toHaveBeenCalledWith('primary')
      expect(mockMinioClient.makeBucket).toHaveBeenCalledWith('primary')
    })
  })

  describe('getFile', () => {
    it('should retrieve file successfully', async () => {
      const objectName = 'test-object-name.txt'
      const mockStream = new Readable()

      mockMinioClient.getObject.mockResolvedValue(mockStream)

      const result = await storage.getFile(objectName)

      expect(result).toBe(mockStream)
      expect(mockMinioClient.getObject).toHaveBeenCalledWith(
        'primary',
        objectName
      )
    })
  })

  describe('deleteFile', () => {
    it('should delete file successfully', async () => {
      const objectName = 'test-object-name.txt'

      mockMinioClient.removeObject.mockResolvedValue(undefined)

      await storage.deleteFile(objectName)

      expect(mockMinioClient.removeObject).toHaveBeenCalledWith(
        'primary',
        objectName
      )
    })
  })

  describe('getFileSize', () => {
    it('should return file size', async () => {
      const objectName = 'test-object-name.txt'
      const expectedSize = 1024

      mockMinioClient.statObject.mockResolvedValue({ size: expectedSize })

      const result = await storage.getFileSize(objectName)

      expect(result).toBe(expectedSize)
      expect(mockMinioClient.statObject).toHaveBeenCalledWith(
        'primary',
        objectName
      )
    })
  })

  describe('error handling', () => {
    it('should handle bucket creation errors', async () => {
      mockMinioClient.bucketExists.mockRejectedValue(
        new Error('Connection failed')
      )

      await expect(storage.ensureBucketExists()).rejects.toThrow(
        'Connection failed'
      )
    })

    it('should handle upload errors', async () => {
      const fileName = 'test.txt'
      const stream = Readable.from(['content'])
      const size = 7

      mockMinioClient.bucketExists.mockResolvedValue(true)
      mockMinioClient.putObject.mockRejectedValue(new Error('Upload failed'))

      await expect(storage.uploadFile(fileName, stream, size)).rejects.toThrow(
        'Upload failed'
      )
    })

    it('should handle download errors', async () => {
      const objectName = 'test-object-name.txt'

      mockMinioClient.getObject.mockRejectedValue(new Error('File not found'))

      await expect(storage.getFile(objectName)).rejects.toThrow(
        'File not found'
      )
    })

    it('should handle delete errors', async () => {
      const objectName = 'test-object-name.txt'

      mockMinioClient.removeObject.mockRejectedValue(new Error('Delete failed'))

      await expect(storage.deleteFile(objectName)).rejects.toThrow(
        'Delete failed'
      )
    })
  })
})
