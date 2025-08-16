import { Pool } from 'pg'
import { Client as MinioClient } from 'minio'
import { connect } from 'nats'

// Mock environment variables for testing
process.env.PG_HOST = 'localhost'
process.env.PG_PORT = '5432'
process.env.PG_USER = 'test'
process.env.PG_PASSWORD = 'test'
process.env.PG_DATABASE = 'test_file_service'
process.env.MINIO_ENDPOINT = 'localhost'
process.env.MINIO_PORT = '9000'
process.env.MINIO_ACCESS_KEY = 'testkey'
process.env.MINIO_SECRET_KEY = 'testsecret'
process.env.NATS_URL = 'nats://localhost:4222'

// Global test setup
beforeAll(async () => {
  // Any global setup
})

afterAll(async () => {
  // Any global cleanup
})

// Mock external dependencies for unit tests
jest.mock('pg')
jest.mock('minio')
jest.mock('nats')

export const mockPool = {
  query: jest.fn().mockResolvedValue({ rows: [] }),
  connect: jest.fn(),
  end: jest.fn(),
}

export const mockMinioClient = {
  bucketExists: jest.fn().mockResolvedValue(true),
  makeBucket: jest.fn().mockResolvedValue(undefined),
  putObject: jest
    .fn()
    .mockResolvedValue({ etag: 'test-etag', versionId: null }),
  getObject: jest
    .fn()
    .mockResolvedValue(require('stream').Readable.from(['test'])),
  removeObject: jest.fn().mockResolvedValue(undefined),
  statObject: jest.fn().mockResolvedValue({ size: 1024 }),
}

export const mockNatsConnection = {
  publish: jest.fn().mockResolvedValue(undefined),
  close: jest.fn().mockResolvedValue(undefined),
}

// Mock implementations
;(Pool as jest.MockedClass<typeof Pool>).mockImplementation(
  () => mockPool as any
)
;(MinioClient as jest.MockedClass<typeof MinioClient>).mockImplementation(
  () => mockMinioClient as any
)
;(connect as jest.MockedFunction<typeof connect>).mockResolvedValue(
  mockNatsConnection as any
)
