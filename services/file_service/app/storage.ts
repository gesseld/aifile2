import { Client } from 'minio'
import { Readable } from 'stream'
import crypto from 'crypto'

export class MinioClient {
  private client: Client
  private bucketName = 'primary'

  constructor() {
    this.client = new Client({
      endPoint: process.env.MINIO_ENDPOINT || 'localhost',
      port: parseInt(process.env.MINIO_PORT || '9000'),
      useSSL: process.env.MINIO_USE_SSL === 'true',
      accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
      secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin',
    })
  }

  async ensureBucketExists() {
    const exists = await this.client.bucketExists(this.bucketName)
    if (!exists) {
      await this.client.makeBucket(this.bucketName)
    }
  }

  async uploadFile(
    fileName: string,
    stream: Readable,
    size: number
  ): Promise<string> {
    await this.ensureBucketExists()
    const objectName = `${crypto.randomUUID()}-${fileName}`
    await this.client.putObject(this.bucketName, objectName, stream, size)
    return objectName
  }

  async getFile(objectName: string): Promise<Readable> {
    return this.client.getObject(this.bucketName, objectName)
  }

  async deleteFile(objectName: string): Promise<void> {
    await this.client.removeObject(this.bucketName, objectName)
  }

  async getFileSize(objectName: string): Promise<number> {
    const stat = await this.client.statObject(this.bucketName, objectName)
    return stat.size
  }
}
