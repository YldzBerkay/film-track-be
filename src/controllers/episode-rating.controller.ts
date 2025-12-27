import { Response } from 'express';
import mongoose from 'mongoose';
import { EpisodeRatingService } from '../services/episode-rating.service';
import { AuthRequest } from '../middleware/auth.middleware';

export class EpisodeRatingController {
    // POST /api/episodes/rate
    static async rateEpisode(req: AuthRequest, res: Response): Promise<void> {
        try {
            if (!req.user) {
                res.status(401).json({ success: false, message: 'Unauthorized' });
                return;
            }
            const userId = new mongoose.Types.ObjectId(req.user.id);

            const { tvId, seasonNumber, episodeNumber, rating } = req.body;

            if (!tvId || seasonNumber === undefined || episodeNumber === undefined || !rating) {
                res.status(400).json({
                    success: false,
                    message: 'tvId, seasonNumber, episodeNumber, and rating are required'
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

            const result = await EpisodeRatingService.rateEpisode(
                userId,
                Number(tvId),
                Number(seasonNumber),
                Number(episodeNumber),
                rating
            );

            res.status(200).json({
                success: true,
                data: {
                    tvId: result.tvId,
                    seasonNumber: result.seasonNumber,
                    episodeNumber: result.episodeNumber,
                    rating: result.rating
                }
            });
        } catch (error) {
            console.error('Rate episode error:', error);
            res.status(500).json({ success: false, message: 'Failed to rate episode' });
        }
    }

    // GET /api/episodes/rating/:tvId/:season/:episode
    static async getUserRating(req: AuthRequest, res: Response): Promise<void> {
        try {
            if (!req.user) {
                res.status(401).json({ success: false, message: 'Unauthorized' });
                return;
            }
            const userId = new mongoose.Types.ObjectId(req.user.id);

            const { tvId, season, episode } = req.params;

            const rating = await EpisodeRatingService.getUserRating(
                userId,
                Number(tvId),
                Number(season),
                Number(episode)
            );

            res.status(200).json({
                success: true,
                data: { rating }
            });
        } catch (error) {
            console.error('Get episode rating error:', error);
            res.status(500).json({ success: false, message: 'Failed to get episode rating' });
        }
    }

    // GET /api/episodes/ratings/:tvId/:season
    static async getUserRatingsForSeason(req: AuthRequest, res: Response): Promise<void> {
        try {
            if (!req.user) {
                res.status(401).json({ success: false, message: 'Unauthorized' });
                return;
            }
            const userId = new mongoose.Types.ObjectId(req.user.id);

            const { tvId, season } = req.params;

            const ratingsMap = await EpisodeRatingService.getUserRatingsForSeason(
                userId,
                Number(tvId),
                Number(season)
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
            console.error('Get season ratings error:', error);
            res.status(500).json({ success: false, message: 'Failed to get season ratings' });
        }
    }

    // GET /api/episodes/stats/:tvId/:season/:episode
    static async getPublicStats(req: AuthRequest, res: Response): Promise<void> {
        try {
            const { tvId, season, episode } = req.params;

            const stats = await EpisodeRatingService.getPublicStats(
                Number(tvId),
                Number(season),
                Number(episode)
            );

            res.status(200).json({
                success: true,
                data: stats
            });
        } catch (error) {
            console.error('Get episode stats error:', error);
            res.status(500).json({ success: false, message: 'Failed to get episode stats' });
        }
    }

    // DELETE /api/episodes/rating/:tvId/:season/:episode
    static async removeRating(req: AuthRequest, res: Response): Promise<void> {
        try {
            if (!req.user) {
                res.status(401).json({ success: false, message: 'Unauthorized' });
                return;
            }
            const userId = new mongoose.Types.ObjectId(req.user.id);

            const { tvId, season, episode } = req.params;

            const removed = await EpisodeRatingService.removeRating(
                userId,
                Number(tvId),
                Number(season),
                Number(episode)
            );

            res.status(200).json({
                success: true,
                data: { removed }
            });
        } catch (error) {
            console.error('Remove episode rating error:', error);
            res.status(500).json({ success: false, message: 'Failed to remove episode rating' });
        }
    }

    // GET /api/episodes/season-stats/:tvId/:season - Bulk fetch all episode stats for a season
    static async getSeasonPublicStats(req: AuthRequest, res: Response): Promise<void> {
        try {
            const { tvId, season } = req.params;

            const stats = await EpisodeRatingService.getSeasonPublicStats(
                Number(tvId),
                Number(season)
            );

            res.status(200).json({
                success: true,
                data: { stats }
            });
        } catch (error) {
            console.error('Get season episode stats error:', error);
            res.status(500).json({ success: false, message: 'Failed to get season episode stats' });
        }
    }
}
