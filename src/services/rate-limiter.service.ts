/**
 * Rate Limiter Service
 * 
 * Implements in-memory rate limiting for interaction endpoints.
 * 
 * Reaction Limits: 3 actions per 3 minutes per user+content pair.
 * Comment Limits:
 *   - Global: 5 comments per minute (flood protection)
 *   - Thread: 3 comments per 2 minutes per activity (harassment protection)
 *   - Duplicate: Cannot post exact same text twice in a row
 * 
 * Frontend debouncing handles accidental clicks; this is the backend fallback.
 */

import { Comment } from '../models/comment.model';

interface RateLimitEntry {
    count: number;
    expiresAt: number;
}

interface RateLimitError extends Error {
    statusCode: number;
}

function createRateLimitError(message: string, statusCode: number = 429): RateLimitError {
    const error = new Error(message) as RateLimitError;
    error.statusCode = statusCode;
    return error;
}

class RateLimiterServiceClass {
    private store = new Map<string, RateLimitEntry>();

    // Configuration for reactions
    private readonly MAX_REACTION_ACTIONS = 3;
    private readonly REACTION_WINDOW_MS = 180000; // 3 minutes

    // Configuration for comments
    private readonly MAX_GLOBAL_COMMENTS = 5;
    private readonly GLOBAL_COMMENT_WINDOW_MS = 60000; // 1 minute
    private readonly MAX_THREAD_COMMENTS = 3;
    private readonly THREAD_COMMENT_WINDOW_MS = 120000; // 2 minutes

    // Cleanup interval (run every 5 minutes to clear expired entries)
    private cleanupInterval: NodeJS.Timeout | null = null;

    constructor() {
        // Start cleanup interval
        this.cleanupInterval = setInterval(() => this.cleanup(), 300000);
    }

    /**
     * Check if the user can perform a reaction (like/dislike) action.
     * Returns true if allowed, false if rate limited.
     */
    checkLimit(userId: string, contentId: string): boolean {
        return this.checkGenericLimit(
            `reaction:${userId}_${contentId}`,
            this.MAX_REACTION_ACTIONS,
            this.REACTION_WINDOW_MS
        );
    }

    /**
     * Get remaining time until reaction rate limit resets (in seconds)
     */
    getRemainingTime(userId: string, contentId: string): number {
        const key = `reaction:${userId}_${contentId}`;
        const entry = this.store.get(key);

        if (!entry) return 0;

        const remaining = Math.max(0, entry.expiresAt - Date.now());
        return Math.ceil(remaining / 1000);
    }

    /**
     * Check all comment limits (global, thread, duplicate)
     * Throws an error with statusCode if blocked
     */
    async checkCommentLimit(userId: string, activityId: string, content: string): Promise<void> {
        // Step 1: Global Flood Check - Max 5 comments per minute
        const globalKey = `comment:global:${userId}`;
        if (!this.checkGenericLimit(globalKey, this.MAX_GLOBAL_COMMENTS, this.GLOBAL_COMMENT_WINDOW_MS)) {
            const remaining = this.getGenericRemainingTime(globalKey);
            throw createRateLimitError(`You're commenting too fast. Please wait ${remaining} seconds.`, 429);
        }

        // Step 2: Thread Flood Check - Max 3 comments per 2 minutes per activity
        const threadKey = `comment:thread:${userId}:${activityId}`;
        if (!this.checkGenericLimit(threadKey, this.MAX_THREAD_COMMENTS, this.THREAD_COMMENT_WINDOW_MS)) {
            const remaining = this.getGenericRemainingTime(threadKey);
            throw createRateLimitError(`Take a break from this post. Try again in ${remaining} seconds.`, 429);
        }

        // Step 3: Duplicate Content Check
        const trimmedContent = content.trim().toLowerCase();
        const lastComment = await Comment.findOne({ userId })
            .sort({ createdAt: -1 })
            .select('text')
            .lean();

        if (lastComment && lastComment.text.trim().toLowerCase() === trimmedContent) {
            throw createRateLimitError(`You already said that. Try something different.`, 400);
        }
    }

    /**
     * Generic limit check (reusable for different limit types)
     */
    private checkGenericLimit(key: string, maxActions: number, windowMs: number): boolean {
        const now = Date.now();
        const entry = this.store.get(key);

        // If entry exists and expired, reset it
        if (entry && now > entry.expiresAt) {
            this.store.delete(key);
        }

        const currentEntry = this.store.get(key);

        if (currentEntry) {
            // Entry exists and not expired
            if (currentEntry.count >= maxActions) {
                // Rate limited - blocked
                return false;
            }

            // Increment count
            currentEntry.count++;
            return true;
        } else {
            // First action - create new entry
            this.store.set(key, {
                count: 1,
                expiresAt: now + windowMs
            });
            return true;
        }
    }

    /**
     * Get remaining time for a generic key
     */
    private getGenericRemainingTime(key: string): number {
        const entry = this.store.get(key);

        if (!entry) return 0;

        const remaining = Math.max(0, entry.expiresAt - Date.now());
        return Math.ceil(remaining / 1000);
    }

    /**
     * Cleanup expired entries to prevent memory leaks
     */
    private cleanup(): void {
        const now = Date.now();
        let cleaned = 0;

        for (const [key, entry] of this.store.entries()) {
            if (now > entry.expiresAt) {
                this.store.delete(key);
                cleaned++;
            }
        }

        if (cleaned > 0) {
            console.log(`[RateLimiter] Cleaned up ${cleaned} expired entries`);
        }
    }

    /**
     * Shutdown cleanup (for graceful shutdown)
     */
    shutdown(): void {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
        this.store.clear();
    }
}

// Export singleton instance
export const RateLimiterService = new RateLimiterServiceClass();
