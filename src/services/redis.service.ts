import Redis, { Redis as RedisClient } from 'ioredis';
import { config } from '../config/env';

/**
 * Redis Client Singleton
 * Provides a centralized, reusable Redis connection for:
 * - Rate Limiting
 * - Caching (Feed, Recommendations)
 * - Background Queues (BullMQ)
 * - Socket.io Adapter (Scaling)
 */
class RedisService {
    private static instance: RedisService;
    private client: RedisClient | null = null;

    private constructor() { }

    static getInstance(): RedisService {
        if (!RedisService.instance) {
            RedisService.instance = new RedisService();
        }
        return RedisService.instance;
    }

    /**
     * Initialize Redis connection
     */
    connect(): RedisClient {
        if (this.client) {
            return this.client;
        }

        const redisHost = process.env.REDIS_HOST || 'localhost';
        const redisPort = parseInt(process.env.REDIS_PORT || '6379', 10);
        const redisPassword = process.env.REDIS_PASSWORD || '';

        this.client = new Redis({
            host: redisHost,
            port: redisPort,
            password: redisPassword || undefined,
            maxRetriesPerRequest: 3,
            retryStrategy: (times: number) => {
                if (times > 3) {
                    console.error('❌ Redis connection failed after 3 retries');
                    return null; // Stop retrying
                }
                const delay = Math.min(times * 200, 2000);
                console.log(`🔄 Redis retry attempt ${times}, waiting ${delay}ms...`);
                return delay;
            },
            enableReadyCheck: true,
            lazyConnect: false
        });

        this.client.on('connect', () => {
            console.log('🔴 Redis connecting...');
        });

        this.client.on('ready', () => {
            console.log('✅ Redis connected and ready');
        });

        this.client.on('error', (err: Error) => {
            console.error('❌ Redis error:', err.message);
        });

        this.client.on('close', () => {
            console.log('🔴 Redis connection closed');
        });

        return this.client;
    }

    /**
     * Get the Redis client instance
     */
    getClient(): RedisClient {
        if (!this.client) {
            return this.connect();
        }
        return this.client;
    }

    /**
     * Graceful shutdown
     */
    async disconnect(): Promise<void> {
        if (this.client) {
            await this.client.quit();
            this.client = null;
            console.log('🔴 Redis disconnected gracefully');
        }
    }

    // ==========================================
    // UTILITY METHODS
    // ==========================================

    /**
     * Set a value with optional TTL (seconds)
     */
    async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
        const client = this.getClient();
        if (ttlSeconds) {
            await client.set(key, value, 'EX', ttlSeconds);
        } else {
            await client.set(key, value);
        }
    }

    /**
     * Get a value
     */
    async get(key: string): Promise<string | null> {
        return this.getClient().get(key);
    }

    /**
     * Delete a key
     */
    async del(key: string): Promise<number> {
        return this.getClient().del(key);
    }

    /**
     * Check if key exists
     */
    async exists(key: string): Promise<boolean> {
        const result = await this.getClient().exists(key);
        return result === 1;
    }

    /**
     * Increment a counter (useful for rate limiting)
     */
    async incr(key: string): Promise<number> {
        return this.getClient().incr(key);
    }

    /**
     * Set TTL on existing key
     */
    async expire(key: string, ttlSeconds: number): Promise<boolean> {
        const result = await this.getClient().expire(key, ttlSeconds);
        return result === 1;
    }

    /**
     * Get remaining TTL of a key
     */
    async ttl(key: string): Promise<number> {
        return this.getClient().ttl(key);
    }
}

// Export singleton instance
export const redisService = RedisService.getInstance();
export const redisClient = redisService.getClient();
