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
            const {
                tmdbId, mediaType, title, posterPath, runtime,
                numberOfEpisodes, numberOfSeasons, genres, rating, watchedAt
            } = req.body;

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

            if (rating !== undefined && (rating < 1 || rating > 10 || !Number.isInteger(rating))) {
                res.status(400).json({
                    success: false,
                    message: 'Rating must be an integer between 1 and 10'
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
                numberOfEpisodes,
                numberOfSeasons,
                genres,
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

            if (rating === undefined || rating < 1 || rating > 10 || !Number.isInteger(rating)) {
                res.status(400).json({
                    success: false,
                    message: 'Rating must be an integer between 1 and 10'
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

    /**
     * PATCH /api/watched/privacy
     * Update privacy status of watched list
     */
    static async updatePrivacy(req: AuthRequest, res: Response): Promise<void> {
        try {
            const userId = req.user!.id;
            const { privacyStatus } = req.body;

            if (privacyStatus === undefined || ![0, 1, 2].includes(privacyStatus)) {
                res.status(400).json({
                    success: false,
                    message: 'privacyStatus must be 0 (everyone), 1 (friends), or 2 (nobody)'
                });
                return;
            }

            const result = await WatchedListService.updatePrivacy(userId, privacyStatus);

            if (!result.success) {
                res.status(400).json({
                    success: false,
                    message: result.message
                });
                return;
            }

            res.json({
                success: true,
                data: { watchedList: result.watchedList }
            });
        } catch (error) {
            console.error('Update privacy error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to update privacy settings'
            });
        }
    }

    /**
     * PATCH /api/watched/reorder
     * Reorder items in the watched list
     */
    static async reorderItems(req: AuthRequest, res: Response): Promise<void> {
        try {
            const userId = req.user!.id;
            const { orderedTmdbIds } = req.body;

            if (!orderedTmdbIds || !Array.isArray(orderedTmdbIds)) {
                res.status(400).json({
                    success: false,
                    message: 'orderedTmdbIds is required and must be an array'
                });
                return;
            }

            const result = await WatchedListService.reorderItems(userId, orderedTmdbIds);

            if (!result.success) {
                res.status(404).json({
                    success: false,
                    message: result.message
                });
                return;
            }

            res.json({
                success: true,
                data: { watchedList: result.watchedList }
            });
        } catch (error) {
            console.error('Reorder watched list items error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to reorder items'
            });
        }
    }
    /**
     * GET /api/watched/public/stats/:mediaType/:tmdbId
     * Get public aggregated rating stats
     */
    static async getItemPublicStats(req: AuthRequest, res: Response): Promise<void> {
        try {
            const { mediaType, tmdbId } = req.params;

            if (!mediaType || !['movie', 'tv'].includes(mediaType)) {
                res.status(400).json({
                    success: false,
                    message: 'mediaType must be "movie" or "tv"'
                });
                return;
            }

            const stats = await WatchedListService.getItemPublicStats(parseInt(tmdbId), mediaType as 'movie' | 'tv');

            res.json({
                success: true,
                data: stats
            });
        } catch (error) {
            console.error('Get item public stats error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to get item statistics'
            });
        }
    }

    /**
     * GET /api/watched/reports
     * Get detailed watch statistics for reports
     */
    static async getDetailedStats(req: AuthRequest, res: Response): Promise<void> {
        try {
            const userId = req.user!.id;
            const stats = await WatchedListService.getDetailedStats(userId);

            res.json({
                success: true,
                data: stats
            });
        } catch (error) {
            console.error('Get detailed stats error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to get detailed statistics'
            });
        }
    }
}
