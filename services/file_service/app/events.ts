import { connect, JSONCodec, NatsConnection } from 'nats'
import { FileEvent } from './types'

const jc = JSONCodec()

export class EventBus {
  private nc: NatsConnection | null = null

  async connect() {
    this.nc = await connect({
      servers: process.env.NATS_URL || 'nats://localhost:4222',
      name: 'file-service',
    })
  }

  async publishEvent(subject: string, event: FileEvent): Promise<void> {
    if (!this.nc) {
      await this.connect()
    }
    await this.nc!.publish(subject, jc.encode(event))
  }

  async close() {
    if (this.nc) {
      await this.nc.close()
    }
  }
}
