import { Response } from 'express';
import { WatchedListService } from '../services/watched-list.service';
import { AuthRequest } from '../middleware/auth.middleware';

export class WatchedListController {
    /**
     * GET /api/watched
     * Get user's watched list
     */
    static async getWatchedList(req: AuthRequest, res: Response): Promise<void> {
        try {
            const userId = req.user!.id;
            const watchedList = await WatchedListService.ensureDefaultWatchedList(userId);

            res.json({
                success: true,
                data: { watchedList }
            });
        } catch (error) {
            console.error('Get watched list error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to get watched list'
            });
        }
    }

    /**
     * POST /api/watched/items
     * Add an item to the watched list
     */
    static async addItem(req: AuthRequest, res: Response): Promise<void> {
        try {
            const userId = req.user!.id;
            const { tmdbId, mediaType, title, posterPath, runtime, rating, watchedAt } = req.body;

            if (!tmdbId || !mediaType || !title || runtime === undefined) {
                res.status(400).json({
                    success: false,
                    message: 'tmdbId, mediaType, title, and runtime are required'
                });
                return;
            }

            if (!['movie', 'tv'].includes(mediaType)) {
                res.status(400).json({
                    success: false,
                    message: 'mediaType must be "movie" or "tv"'
                });
                return;
            }

            if (rating !== undefined && (rating < 0.5 || rating > 5 || rating % 0.5 !== 0)) {
                res.status(400).json({
                    success: false,
                    message: 'Rating must be between 0.5 and 5 in 0.5 increments'
                });
                return;
            }

            const watchedList = await WatchedListService.addItem(userId, {
                tmdbId,
                mediaType,
                title,
                posterPath,
                runtime,
                rating,
                watchedAt: watchedAt ? new Date(watchedAt) : undefined
            });

            res.json({
                success: true,
                data: { watchedList }
            });
        } catch (error) {
            console.error('Add watched item error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to add item to watched list'
            });
        }
    }

    /**
     * PATCH /api/watched/items/:tmdbId/rating
     * Update item rating
     */
    static async updateRating(req: AuthRequest, res: Response): Promise<void> {
        try {
            const userId = req.user!.id;
            const { tmdbId } = req.params;
            const { mediaType, rating } = req.body;

            if (!mediaType || !['movie', 'tv'].includes(mediaType)) {
                res.status(400).json({
                    success: false,
                    message: 'mediaType is required and must be "movie" or "tv"'
                });
                return;
            }

            if (rating === undefined || rating < 0.5 || rating > 5 || rating % 0.5 !== 0) {
                res.status(400).json({
                    success: false,
                    message: 'Rating must be between 0.5 and 5 in 0.5 increments'
                });
                return;
            }

            const watchedList = await WatchedListService.updateItemRating(
                userId,
                parseInt(tmdbId),
                mediaType,
                rating
            );

            if (!watchedList) {
                res.status(404).json({
                    success: false,
                    message: 'Item not found in watched list'
                });
                return;
            }

            res.json({
                success: true,
                data: { watchedList }
            });
        } catch (error) {
            console.error('Update rating error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to update rating'
            });
        }
    }

    /**
     * DELETE /api/watched/items/:tmdbId
     * Remove an item from the watched list
     */
    static async removeItem(req: AuthRequest, res: Response): Promise<void> {
        try {
            const userId = req.user!.id;
            const { tmdbId } = req.params;
            const { mediaType } = req.query;

            if (!mediaType || !['movie', 'tv'].includes(mediaType as string)) {
                res.status(400).json({
                    success: false,
                    message: 'mediaType query param is required and must be "movie" or "tv"'
                });
                return;
            }

            const watchedList = await WatchedListService.removeItem(
                userId,
                parseInt(tmdbId),
                mediaType as 'movie' | 'tv'
            );

            res.json({
                success: true,
                data: { watchedList }
            });
        } catch (error) {
            console.error('Remove watched item error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to remove item from watched list'
            });
        }
    }

    /**
     * GET /api/watched/check/:tmdbId
     * Check if an item is watched
     */
    static async checkItem(req: AuthRequest, res: Response): Promise<void> {
        try {
            const userId = req.user!.id;
            const { tmdbId } = req.params;
            const { mediaType } = req.query;

            if (!mediaType || !['movie', 'tv'].includes(mediaType as string)) {
                res.status(400).json({
                    success: false,
                    message: 'mediaType query param is required and must be "movie" or "tv"'
                });
                return;
            }

            const result = await WatchedListService.isWatched(
                userId,
                parseInt(tmdbId),
                mediaType as 'movie' | 'tv'
            );

            res.json({
                success: true,
                data: result
            });
        } catch (error) {
            console.error('Check watched item error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to check item'
            });
        }
    }

    /**
     * GET /api/watched/stats
     * Get watch statistics
     */
    static async getStats(req: AuthRequest, res: Response): Promise<void> {
        try {
            const userId = req.user!.id;
            const stats = await WatchedListService.getStats(userId);

            res.json({
                success: true,
                data: { stats }
            });
        } catch (error) {
            console.error('Get watched stats error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to get watch statistics'
            });
        }
    }
}
