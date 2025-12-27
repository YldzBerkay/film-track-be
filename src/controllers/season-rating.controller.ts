import { Response } from 'express';
import mongoose from 'mongoose';
import { SeasonRatingService } from '../services/season-rating.service';
import { AuthRequest } from '../middleware/auth.middleware';

export class SeasonRatingController {
    // POST /api/seasons/rate
    static async rateSeason(req: AuthRequest, res: Response): Promise<void> {
        try {
            if (!req.user) {
                res.status(401).json({ success: false, message: 'Unauthorized' });
                return;
            }
            const userId = new mongoose.Types.ObjectId(req.user.id);

            const { tvId, seasonNumber, rating } = req.body;

            if (!tvId || seasonNumber === undefined || !rating) {
                res.status(400).json({
                    success: false,
                    message: 'tvId, seasonNumber, and rating are required'
                });
                return;
            }

            if (!Number.isInteger(rating) || rating < 1 || rating > 10) {
                res.status(400).json({
                    success: false,
                    message: 'Rating must be an integer between 1 and 10'
                });
                return;
            }

            const result = await SeasonRatingService.rateSeason(
                userId,
                Number(tvId),
                Number(seasonNumber),
                rating
            );

            res.status(200).json({
                success: true,
                data: {
                    tvId: result.tvId,
                    seasonNumber: result.seasonNumber,
                    rating: result.rating
                }
            });
        } catch (error) {
            console.error('Rate season error:', error);
            res.status(500).json({ success: false, message: 'Failed to rate season' });
        }
    }

    // GET /api/seasons/rating/:tvId/:season
    static async getUserRating(req: AuthRequest, res: Response): Promise<void> {
        try {
            if (!req.user) {
                res.status(401).json({ success: false, message: 'Unauthorized' });
                return;
            }
            const userId = new mongoose.Types.ObjectId(req.user.id);

            const { tvId, season } = req.params;

            const rating = await SeasonRatingService.getUserRating(
                userId,
                Number(tvId),
                Number(season)
            );

            res.status(200).json({
                success: true,
                data: { rating }
            });
        } catch (error) {
            console.error('Get season rating error:', error);
            res.status(500).json({ success: false, message: 'Failed to get season rating' });
        }
    }

    // GET /api/seasons/ratings/:tvId
    static async getUserRatingsForShow(req: AuthRequest, res: Response): Promise<void> {
        try {
            if (!req.user) {
                res.status(401).json({ success: false, message: 'Unauthorized' });
                return;
            }
            const userId = new mongoose.Types.ObjectId(req.user.id);

            const { tvId } = req.params;

            const ratingsMap = await SeasonRatingService.getUserRatingsForShow(
                userId,
                Number(tvId)
            );

            // Convert Map to object for JSON
            const ratings: Record<number, number> = {};
            ratingsMap.forEach((value, key) => {
                ratings[key] = value;
            });

            res.status(200).json({
                success: true,
                data: { ratings }
            });
        } catch (error) {
            console.error('Get show season ratings error:', error);
            res.status(500).json({ success: false, message: 'Failed to get show season ratings' });
        }
    }

    // GET /api/seasons/stats/:tvId/:season
    static async getPublicStats(req: AuthRequest, res: Response): Promise<void> {
        try {
            const { tvId, season } = req.params;

            const stats = await SeasonRatingService.getPublicStats(
                Number(tvId),
                Number(season)
            );

            res.status(200).json({
                success: true,
                data: stats
            });
        } catch (error) {
            console.error('Get season stats error:', error);
            res.status(500).json({ success: false, message: 'Failed to get season stats' });
        }
    }

    // DELETE /api/seasons/rating/:tvId/:season
    static async removeRating(req: AuthRequest, res: Response): Promise<void> {
        try {
            if (!req.user) {
                res.status(401).json({ success: false, message: 'Unauthorized' });
                return;
            }
            const userId = new mongoose.Types.ObjectId(req.user.id);

            const { tvId, season } = req.params;

            const removed = await SeasonRatingService.removeRating(
                userId,
                Number(tvId),
                Number(season)
            );

            res.status(200).json({
                success: true,
                data: { removed }
            });
        } catch (error) {
            console.error('Remove season rating error:', error);
            res.status(500).json({ success: false, message: 'Failed to remove season rating' });
        }
    }

    // GET /api/seasons/show-stats/:tvId - Bulk fetch all season stats for a show
    static async getShowPublicStats(req: AuthRequest, res: Response): Promise<void> {
        try {
            const { tvId } = req.params;

            const stats = await SeasonRatingService.getShowPublicStats(
                Number(tvId)
            );

            res.status(200).json({
                success: true,
                data: { stats }
            });
        } catch (error) {
            console.error('Get show season stats error:', error);
            res.status(500).json({ success: false, message: 'Failed to get show season stats' });
        }
    }
}
