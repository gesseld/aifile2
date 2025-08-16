import { EventBus } from '../app/events'
import { FileEvent } from '../app/types'
import { mockNatsConnection } from './setup'

describe('EventBus', () => {
  let eventBus: EventBus

  beforeEach(() => {
    jest.clearAllMocks()
    eventBus = new EventBus()
  })

  describe('connect', () => {
    it('should connect to NATS server successfully', async () => {
      await eventBus.connect()

      expect(require('nats').connect).toHaveBeenCalledWith({
        servers: 'nats://localhost:4222',
        name: 'file-service',
      })
    })

    it('should use custom NATS_URL from environment', async () => {
      process.env.NATS_URL = 'nats://custom-server:4222'

      await eventBus.connect()

      expect(require('nats').connect).toHaveBeenCalledWith({
        servers: 'nats://custom-server:4222',
        name: 'file-service',
      })

      // Reset env var
      delete process.env.NATS_URL
    })

    it('should handle connection errors', async () => {
      ;(require('nats').connect as jest.Mock).mockRejectedValue(
        new Error('Connection failed')
      )

      await expect(eventBus.connect()).rejects.toThrow('Connection failed')
    })
  })

  describe('publishEvent', () => {
    it('should publish file.uploaded event', async () => {
      const event: FileEvent = {
        type: 'uploaded',
        file_id: 'file-123',
        object_name: 'test-object.txt',
        owner_id: 'user-123',
        timestamp: new Date('2023-01-01T00:00:00Z'),
      }

      await eventBus.publishEvent('file.uploaded', event)

      expect(mockNatsConnection.publish).toHaveBeenCalledWith(
        'file.uploaded',
        expect.any(Uint8Array) // JSONCodec encoded data
      )
    })

    it('should publish file.deleted event', async () => {
      const event: FileEvent = {
        type: 'deleted',
        file_id: 'file-123',
        object_name: 'test-object.txt',
        owner_id: 'user-123',
        timestamp: new Date('2023-01-01T00:00:00Z'),
      }

      await eventBus.publishEvent('file.deleted', event)

      expect(mockNatsConnection.publish).toHaveBeenCalledWith(
        'file.deleted',
        expect.any(Uint8Array) // JSONCodec encoded data
      )
    })

    it('should connect automatically if not connected', async () => {
      const event: FileEvent = {
        type: 'uploaded',
        file_id: 'file-123',
        object_name: 'test-object.txt',
        owner_id: 'user-123',
        timestamp: new Date('2023-01-01T00:00:00Z'),
      }

      // Simulate not connected state
      ;(eventBus as any).nc = null

      await eventBus.publishEvent('file.uploaded', event)

      expect(require('nats').connect).toHaveBeenCalled()
      expect(mockNatsConnection.publish).toHaveBeenCalledWith(
        'file.uploaded',
        expect.any(Uint8Array)
      )
    })

    it('should handle publish errors', async () => {
      const event: FileEvent = {
        type: 'uploaded',
        file_id: 'file-123',
        object_name: 'test-object.txt',
        owner_id: 'user-123',
        timestamp: new Date('2023-01-01T00:00:00Z'),
      }

      mockNatsConnection.publish.mockRejectedValue(new Error('Publish failed'))

      await expect(
        eventBus.publishEvent('file.uploaded', event)
      ).rejects.toThrow('Publish failed')
    })
  })

  describe('close', () => {
    it('should close NATS connection', async () => {
      await eventBus.connect()
      await eventBus.close()

      expect(mockNatsConnection.close).toHaveBeenCalled()
    })

    it('should handle close when not connected', async () => {
      // Should not throw error
      await expect(eventBus.close()).resolves.not.toThrow()
    })

    it('should handle close errors', async () => {
      await eventBus.connect()
      mockNatsConnection.close.mockRejectedValue(new Error('Close failed'))

      await expect(eventBus.close()).rejects.toThrow('Close failed')
    })
  })

  describe('event data validation', () => {
    it('should handle event with all required fields', async () => {
      const event: FileEvent = {
        type: 'uploaded',
        file_id: 'file-123',
        object_name: 'test-object.txt',
        owner_id: 'user-123',
        timestamp: new Date('2023-01-01T00:00:00Z'),
      }

      await expect(
        eventBus.publishEvent('file.uploaded', event)
      ).resolves.not.toThrow()
    })

    it('should handle different event types', async () => {
      const uploadEvent: FileEvent = {
        type: 'uploaded',
        file_id: 'file-123',
        object_name: 'test-object.txt',
        owner_id: 'user-123',
        timestamp: new Date('2023-01-01T00:00:00Z'),
      }

      const deleteEvent: FileEvent = {
        type: 'deleted',
        file_id: 'file-456',
        object_name: 'deleted-object.txt',
        owner_id: 'user-456',
        timestamp: new Date('2023-01-02T00:00:00Z'),
      }

      await expect(
        eventBus.publishEvent('file.uploaded', uploadEvent)
      ).resolves.not.toThrow()
      await expect(
        eventBus.publishEvent('file.deleted', deleteEvent)
      ).resolves.not.toThrow()

      expect(mockNatsConnection.publish).toHaveBeenCalledTimes(2)
    })
  })
})
