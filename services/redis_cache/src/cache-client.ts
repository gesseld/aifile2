import Redis from 'ioredis';

interface CacheOptions {
  ttl?: number; // Time to live in seconds
  tags?: string[]; // Cache tags for invalidation
}

export class CacheClient {
  private client: Redis;

  constructor(redisUrl: string) {
    this.client = new Redis(redisUrl);
  }

  async get<T>(key: string): Promise<T | null> {
    const data = await this.client.get(key);
    return data ? JSON.parse(data) : null;
  }

  async set<T>(key: string, value: T, options?: CacheOptions): Promise<void> {
    const serialized = JSON.stringify(value);
    const args: (string | number)[] = [key, serialized];

    if (options?.ttl) {
      args.push('EX', options.ttl);
    }

    await this.client.set(...args);

    if (options?.tags?.length) {
      await this.addTags(key, options.tags);
    }
  }

  async invalidate(tags: string[]): Promise<void> {
    const keys = await Promise.all(
      tags.map(tag => this.client.smembers(`tag:${tag}`))
    ).then(results => results.flat());

    if (keys.length) {
      await this.client.del(...keys);
      await Promise.all(tags.map(tag => this.client.del(`tag:${tag}`)));
    }
  }

  private async addTags(key: string, tags: string[]): Promise<void> {
    await Promise.all([
      this.client.sadd(`key:${key}:tags`, ...tags),
      ...tags.map(tag => this.client.sadd(`tag:${tag}`, key))
    ]);
  }

  async disconnect(): Promise<void> {
    await this.client.quit();
  }
}