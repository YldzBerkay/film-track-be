import { Response } from 'express';
import { RecommendationService } from '../services/recommendation.service';
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
}
