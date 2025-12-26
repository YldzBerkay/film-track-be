import { Response } from 'express';
import { WatchlistService } from '../services/watchlist.service';
import { AuthRequest } from '../middleware/auth.middleware';

export class WatchlistController {
    /**
     * GET /api/watchlists
     * Get all watchlists for the authenticated user
     */
    static async getWatchlists(req: AuthRequest, res: Response): Promise<void> {
        try {
            const userId = req.user!.id;
            const watchlists = await WatchlistService.getUserWatchlists(userId);

            res.json({
                success: true,
                data: { watchlists }
            });
        } catch (error) {
            console.error('Get watchlists error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to get watchlists'
            });
        }
    }

    /**
     * GET /api/watchlists/:id
     * Get a specific watchlist
     */
    static async getWatchlist(req: AuthRequest, res: Response): Promise<void> {
        try {
            const userId = req.user!.id;
            const { id } = req.params;

            const watchlist = await WatchlistService.getWatchlist(id, userId);

            if (!watchlist) {
                res.status(404).json({
                    success: false,
                    message: 'Watchlist not found'
                });
                return;
            }

            res.json({
                success: true,
                data: { watchlist }
            });
        } catch (error) {
            console.error('Get watchlist error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to get watchlist'
            });
        }
    }

    /**
     * POST /api/watchlists/:id/items
     * Add an item to a watchlist
     */
    static async addItem(req: AuthRequest, res: Response): Promise<void> {
        try {
            const userId = req.user!.id;
            const { id } = req.params;
            const { tmdbId, mediaType, title, posterPath } = req.body;

            if (!tmdbId || !mediaType || !title) {
                res.status(400).json({
                    success: false,
                    message: 'tmdbId, mediaType, and title are required'
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

            const watchlist = await WatchlistService.addItem(id, userId, {
                tmdbId,
                mediaType,
                title,
                posterPath
            });

            if (!watchlist) {
                res.status(404).json({
                    success: false,
                    message: 'Watchlist not found'
                });
                return;
            }

            res.json({
                success: true,
                data: { watchlist }
            });
        } catch (error) {
            console.error('Add item error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to add item to watchlist'
            });
        }
    }

    /**
     * DELETE /api/watchlists/:id/items/:tmdbId
     * Remove an item from a watchlist
     */
    static async removeItem(req: AuthRequest, res: Response): Promise<void> {
        try {
            const userId = req.user!.id;
            const { id, tmdbId } = req.params;
            const { mediaType } = req.query;

            if (!mediaType || !['movie', 'tv'].includes(mediaType as string)) {
                res.status(400).json({
                    success: false,
                    message: 'mediaType query param is required and must be "movie" or "tv"'
                });
                return;
            }

            const watchlist = await WatchlistService.removeItem(
                id,
                userId,
                parseInt(tmdbId),
                mediaType as 'movie' | 'tv'
            );

            if (!watchlist) {
                res.status(404).json({
                    success: false,
                    message: 'Watchlist not found'
                });
                return;
            }

            res.json({
                success: true,
                data: { watchlist }
            });
        } catch (error) {
            console.error('Remove item error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to remove item from watchlist'
            });
        }
    }

    /**
     * GET /api/watchlists/check/:tmdbId
     * Check if an item is in any of the user's watchlists
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

            const result = await WatchlistService.isInWatchlist(
                userId,
                parseInt(tmdbId),
                mediaType as 'movie' | 'tv'
            );

            res.json({
                success: true,
                data: result
            });
        } catch (error) {
            console.error('Check item error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to check item'
            });
        }
    }

    /**
     * GET /api/watchlists/default
     * Get the user's default watchlist
     */
    static async getDefault(req: AuthRequest, res: Response): Promise<void> {
        try {
            const userId = req.user!.id;
            const watchlist = await WatchlistService.ensureDefaultWatchlist(userId);

            res.json({
                success: true,
                data: { watchlist }
            });
        } catch (error) {
            console.error('Get default watchlist error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to get default watchlist'
            });
        }
    }

    /**
     * POST /api/watchlists
     * Create a new custom watchlist
     */
    static async createList(req: AuthRequest, res: Response): Promise<void> {
        try {
            const userId = req.user!.id;
            const { name, icon } = req.body;

            if (!name || typeof name !== 'string' || name.trim().length === 0) {
                res.status(400).json({
                    success: false,
                    message: 'Name is required'
                });
                return;
            }

            const watchlist = await WatchlistService.createCustomList(userId, name, icon);

            res.status(201).json({
                success: true,
                data: { watchlist }
            });
        } catch (error) {
            console.error('Create watchlist error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to create watchlist'
            });
        }
    }

    /**
     * DELETE /api/watchlists/:id
     * Delete a non-default watchlist
     */
    static async deleteList(req: AuthRequest, res: Response): Promise<void> {
        try {
            const userId = req.user!.id;
            const { id } = req.params;

            const result = await WatchlistService.deleteList(id, userId);

            if (!result.deleted) {
                res.status(400).json({
                    success: false,
                    message: result.message
                });
                return;
            }

            res.json({
                success: true,
                message: 'Watchlist deleted'
            });
        } catch (error) {
            console.error('Delete watchlist error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to delete watchlist'
            });
        }
    }

    /**
     * PATCH /api/watchlists/:id/name
     * Rename a watchlist (only non-default lists can be renamed)
     */
    static async renameList(req: AuthRequest, res: Response): Promise<void> {
        try {
            const userId = req.user!.id;
            const { id } = req.params;
            const { name } = req.body;

            if (!name || typeof name !== 'string' || name.trim().length === 0) {
                res.status(400).json({
                    success: false,
                    message: 'Name is required'
                });
                return;
            }

            const result = await WatchlistService.renameList(id, userId, name);

            if (!result.success) {
                res.status(400).json({
                    success: false,
                    message: result.message
                });
                return;
            }

            res.json({
                success: true,
                data: { watchlist: result.watchlist }
            });
        } catch (error) {
            console.error('Rename watchlist error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to rename watchlist'
            });
        }
    }
}
