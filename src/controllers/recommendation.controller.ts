import { Response } from 'express';
import { RecommendationService } from '../services/recommendation.service';
import { UserService } from '../services/user.service';
import { AuthRequest } from '../middleware/auth.middleware';

export class RecommendationController {
    static async getMealtimePick(req: AuthRequest, res: Response) {
        try {
            const userId = req.user?.id;
            if (!userId) {
                return res.status(401).json({ message: 'Unauthorized' });
            }

            const recommendation = await RecommendationService.getMealtimeRandomPick(userId);

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

            const dailyPick = await RecommendationService.getDailyRandomMovie(userId);

            return res.status(200).json({
                success: true,
                data: dailyPick
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

            const recommendation = await RecommendationService.getFriendMealtimePick(userId, friendIds);

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

            const recommendations = await RecommendationService.getMoodBasedRecommendations(userId, mode, limit, includeWatched);

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
}
