import { Response } from 'express';
import { RecommendationService } from '../services/recommendation.service';
import { UserService } from '../services/user.service';
import { AuthRequest } from '../middleware/auth.middleware';
import { User } from '../models/user.model';

export class RecommendationController {
    static async getMealtimePick(req: AuthRequest, res: Response) {
        try {
            const userId = req.user?.id;
            if (!userId) {
                return res.status(401).json({ message: 'Unauthorized' });
            }

            const lang = req.query.lang as string | undefined;
            const recommendation = await RecommendationService.getMealtimeRandomPick(userId, lang);

            return res.status(200).json({
                success: true,
                data: recommendation
            });
        } catch (error) {
            console.error('Error fetching mealtime pick:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to find a suitable recommendation.'
            });
        }
    }

    static async getDailyPick(req: AuthRequest, res: Response) {
        try {
            const userId = req.user?.id;
            if (!userId) {
                return res.status(401).json({ message: 'Unauthorized' });
            }

            const lang = req.query.lang as string | undefined;
            const dailyPick = await RecommendationService.getDailyRandomMovie(userId, lang);

            // Fetch current streak
            const user = await User.findById(userId).select('streak');
            const dailyStreak = user?.streak?.current || 0;

            return res.status(200).json({
                success: true,
                data: {
                    ...dailyPick,
                    dailyStreak
                }
            });
        } catch (error) {
            console.error('Error fetching daily pick:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to generate daily pick.'
            });
        }
    }

    static async getFriends(req: AuthRequest, res: Response) {
        try {
            const userId = req.user?.id;
            if (!userId) {
                return res.status(401).json({ message: 'Unauthorized' });
            }

            const friends = await UserService.getFriends(userId);

            return res.status(200).json({
                success: true,
                data: friends
            });
        } catch (error) {
            console.error('Error fetching friends:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to fetch friends list.'
            });
        }
    }

    static async getFriendMealtimePick(req: AuthRequest, res: Response) {
        try {
            const userId = req.user?.id;
            if (!userId) {
                return res.status(401).json({ message: 'Unauthorized' });
            }

            const { friendIds } = req.body;
            if (!Array.isArray(friendIds) || friendIds.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Please select at least one friend.'
                });
            }

            const lang = req.query.lang as string | undefined;
            const recommendation = await RecommendationService.getFriendMealtimePick(userId, friendIds, lang);

            return res.status(200).json({
                success: true,
                data: recommendation
            });
        } catch (error) {
            console.error('Error fetching friend mealtime pick:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to generate friend recommendation.'
            });
        }
    }

    static async getMoodBasedRecommendations(req: AuthRequest, res: Response) {
        try {
            const userId = req.user?.id;
            if (!userId) {
                return res.status(401).json({ message: 'Unauthorized' });
            }

            const mode = (req.query.mode as 'match' | 'shift') || 'match';
            const limit = parseInt(req.query.limit as string) || 10;
            const includeWatched = req.query.includeWatched === 'true';
            const forceRefresh = req.query.forceRefresh === 'true';
            const lang = req.query.lang as string || 'en-US';

            console.log(`[Controller] getMoodBasedRecommendations - Lang request: ${lang} (ForceRefresh: ${forceRefresh})`);

            // Check minimum movie threshold for AI recommendations (only for 'match' mode which uses AI)
            if (mode === 'match') {
                const thresholdMeta = await RecommendationService.checkMovieThreshold(userId);
                if (thresholdMeta) {
                    console.log(`[Threshold] User ${userId} has ${thresholdMeta.currentCount}/${thresholdMeta.requiredCount} rated movies`);
                    return res.status(200).json({
                        success: false,
                        error: 'NOT_ENOUGH_DATA',
                        meta: thresholdMeta
                    });
                }
            }

            const recommendations = await RecommendationService.getMoodBasedRecommendations(userId, mode, limit, includeWatched, lang, forceRefresh);

            return res.status(200).json({
                success: true,
                data: recommendations
            });
        } catch (error) {
            console.error('Error fetching mood-based recommendations:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to generate mood-based recommendations.'
            });
        }
    }

    /**
     * GET /api/recommendations/ai-curated
     * Get AI-curated recommendations with dynamic database expansion
     */
    static async getAICurated(req: AuthRequest, res: Response) {
        try {
            const userId = req.user?.id;
            if (!userId) {
                return res.status(401).json({ message: 'Unauthorized' });
            }

            const limit = parseInt(req.query.limit as string) || 10;
            const lang = req.query.lang as string || 'en-US';
            const forceRefresh = req.query.forceRefresh === 'true';

            console.log(`[Controller] getAICurated - Lang request: ${lang} (ForceRefresh: ${forceRefresh})`);

            const recommendations = await RecommendationService.getAICuratedRecommendations(userId, limit, lang, forceRefresh);

            return res.status(200).json({
                success: true,
                data: recommendations
            });
        } catch (error) {
            console.error('Error fetching AI-curated recommendations:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to generate AI-curated recommendations.'
            });
        }
    }

    /**
     * POST /api/recommendations/feedback
     * Process like/dislike feedback on recommendations
     */
    static async submitFeedback(req: AuthRequest, res: Response) {
        try {
            const userId = req.user?.id;
            if (!userId) {
                return res.status(401).json({ message: 'Unauthorized' });
            }

            const { tmdbId, title, action } = req.body;

            if (!tmdbId || !title || !action || !['like', 'dislike'].includes(action)) {
                return res.status(400).json({
                    success: false,
                    message: 'tmdbId, title, and action (like/dislike) are required'
                });
            }

            const result = await RecommendationService.processRecommendationFeedback(
                userId,
                Number(tmdbId),
                title,
                action
            );

            return res.status(200).json({
                success: true,
                message: 'Geri dönüşünüz için teşekkürler! Zevkinizi öğrendik.'
            });
        } catch (error) {
            console.error('Error processing feedback:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to process feedback.'
            });
        }
    }

    /**
     * GET /api/recommendations/replace
     * Get a single replacement recommendation (uses quota)
     */
    static async replaceCard(req: AuthRequest, res: Response) {
        try {
            const userId = req.user?.id;
            if (!userId) {
                return res.status(401).json({ message: 'Unauthorized' });
            }

            const excludeIdsParam = req.query.excludeIds as string;
            const excludeIds = excludeIdsParam ? excludeIdsParam.split(',').map(Number).filter(n => !isNaN(n)) : [];
            const lang = req.query.lang as string | undefined;

            const result = await RecommendationService.getSingleReplacement(userId, excludeIds, lang);

            if (!result.success) {
                return res.status(200).json({
                    success: false,
                    error: result.error,
                    remaining: result.remaining
                });
            }

            return res.status(200).json({
                success: true,
                data: result.data,
                remaining: result.remaining
            });
        } catch (error) {
            console.error('Error replacing card:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to replace recommendation.'
            });
        }
    }

    /**
     * GET /api/recommendations/quota
     * Get user's current replacement quota
     */
    static async getQuota(req: AuthRequest, res: Response) {
        try {
            const userId = req.user?.id;
            if (!userId) {
                return res.status(401).json({ message: 'Unauthorized' });
            }

            const quota = await RecommendationService.getQuota(userId);

            return res.status(200).json({
                success: true,
                data: quota
            });
        } catch (error) {
            console.error('Error fetching quota:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to fetch quota.'
            });
        }
    }
}

