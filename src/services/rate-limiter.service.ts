import { redisService } from './redis.service';

/**
 * Rate Limiter Service using Redis
 * Implements sliding window rate limiting for API protection
 */
export class RateLimiterService {
    private readonly prefix = 'ratelimit:';

    /**
     * Check and consume a rate limit token
     * @param identifier - Unique identifier (IP, userId, API key)
     * @param limit - Maximum requests allowed
     * @param windowSeconds - Time window in seconds
     * @returns Object with allowed status and remaining count
     */
    async consume(
        identifier: string,
        limit: number = 100,
        windowSeconds: number = 60
    ): Promise<{ allowed: boolean; remaining: number; retryAfter?: number }> {
        const key = `${this.prefix}${identifier}`;

        // Increment counter
        const current = await redisService.incr(key);

        // Set expiry on first request
        if (current === 1) {
            await redisService.expire(key, windowSeconds);
        }

        const remaining = Math.max(0, limit - current);
        const allowed = current <= limit;

        if (!allowed) {
            const ttl = await redisService.ttl(key);
            return { allowed, remaining: 0, retryAfter: ttl };
        }

        return { allowed, remaining };
    }

    /**
     * Reset rate limit for an identifier
     */
    async reset(identifier: string): Promise<void> {
        const key = `${this.prefix}${identifier}`;
        await redisService.del(key);
    }

    /**
     * Get current rate limit status without consuming
     */
    async getStatus(
        identifier: string,
        limit: number = 100
    ): Promise<{ current: number; remaining: number; ttl: number }> {
        const key = `${this.prefix}${identifier}`;
        const currentStr = await redisService.get(key);
        const current = currentStr ? parseInt(currentStr, 10) : 0;
        const ttl = await redisService.ttl(key);

        return {
            current,
            remaining: Math.max(0, limit - current),
            ttl: Math.max(0, ttl)
        };
    }

    // ==========================================
    // LEGACY STATIC METHODS (For Existing Code)
    // ==========================================
    private static memoryStore = new Map<string, { count: number; firstAttempt: number }>();
    private static readonly WINDOW_MS = 180000; // 3 minutes
    private static readonly MAX_ATTEMPTS = 3;

    /**
     * Legacy: Check rate limit (in-memory fallback)
     */
    static checkLimit(userId: string, targetId: string): boolean {
        const key = `${userId}:${targetId}`;
        const now = Date.now();
        const record = this.memoryStore.get(key);

        if (!record) {
            this.memoryStore.set(key, { count: 1, firstAttempt: now });
            return true;
        }

        if (now - record.firstAttempt > this.WINDOW_MS) {
            this.memoryStore.set(key, { count: 1, firstAttempt: now });
            return true;
        }

        if (record.count < this.MAX_ATTEMPTS) {
            record.count++;
            return true;
        }

        return false;
    }

    /**
     * Legacy: Get remaining time in seconds
     */
    static getRemainingTime(userId: string, targetId: string): number {
        const key = `${userId}:${targetId}`;
        const record = this.memoryStore.get(key);

        if (!record) return 0;

        const elapsed = Date.now() - record.firstAttempt;
        const remaining = Math.ceil((this.WINDOW_MS - elapsed) / 1000);
        return Math.max(0, remaining);
    }

    /**
     * Legacy: Check comment rate limit with global, thread, and duplicate protection
     */
    static async checkCommentLimit(userId: string, activityId: string, text: string): Promise<void> {
        // Global: max 5 comments per minute
        const globalKey = `comment:global:${userId}`;
        let globalRecord = this.memoryStore.get(globalKey);
        const now = Date.now();

        if (globalRecord && now - globalRecord.firstAttempt < 60000) {
            if (globalRecord.count >= 5) {
                const remaining = Math.ceil((60000 - (now - globalRecord.firstAttempt)) / 1000);
                throw { statusCode: 429, message: `Too many comments. Wait ${remaining}s.` };
            }
            globalRecord.count++;
        } else {
            this.memoryStore.set(globalKey, { count: 1, firstAttempt: now });
        }

        // Thread: max 3 per activity per 2 minutes
        const threadKey = `comment:thread:${userId}:${activityId}`;
        let threadRecord = this.memoryStore.get(threadKey);

        if (threadRecord && now - threadRecord.firstAttempt < 120000) {
            if (threadRecord.count >= 3) {
                const remaining = Math.ceil((120000 - (now - threadRecord.firstAttempt)) / 1000);
                throw { statusCode: 429, message: `Too many comments on this post. Wait ${remaining}s.` };
            }
            threadRecord.count++;
        } else {
            this.memoryStore.set(threadKey, { count: 1, firstAttempt: now });
        }

        // Duplicate check: same text within 5 minutes
        const dupeKey = `comment:dupe:${userId}:${text.slice(0, 50)}`;
        if (this.memoryStore.has(dupeKey)) {
            throw { statusCode: 429, message: 'Duplicate comment detected.' };
        }
        this.memoryStore.set(dupeKey, { count: 1, firstAttempt: now });
        setTimeout(() => this.memoryStore.delete(dupeKey), 300000);
    }
}

// Export singleton
export const rateLimiterService = new RateLimiterService();
