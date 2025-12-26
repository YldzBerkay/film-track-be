import { Response } from 'express';
import { AnalyticsService } from '../services/analytics.service';
import { AuthRequest } from '../middleware/auth.middleware';

export class AnalyticsController {

    static async getMoodEvolution(req: AuthRequest, res: Response) {
        try {
            const userId = req.user?.id;
            if (!userId) return res.status(401).json({ message: 'Unauthorized' });

            const days = parseInt(req.query.days as string) || 30;
            const evolution = await AnalyticsService.getMoodEvolution(userId, days);

            res.status(200).json({
                success: true,
                data: evolution
            });
        } catch (error) {
            console.error('Analytics Error:', error);
            res.status(500).json({ success: false, message: 'Failed to fetch mood evolution' });
        }
    }

    static async getDayOfWeekPatterns(req: AuthRequest, res: Response) {
        try {
            const userId = req.user?.id;
            if (!userId) return res.status(401).json({ message: 'Unauthorized' });

            const patterns = await AnalyticsService.getDayOfWeekPatterns(userId);

            res.status(200).json({
                success: true,
                data: patterns
            });
        } catch (error) {
            console.error('Analytics Error:', error);
            res.status(500).json({ success: false, message: 'Failed to fetch daily patterns' });
        }
    }

    static async getGenreCorrelations(req: AuthRequest, res: Response) {
        try {
            const userId = req.user?.id;
            if (!userId) return res.status(401).json({ message: 'Unauthorized' });

            const correlations = await AnalyticsService.getGenreMoodCorrelations(userId);

            res.status(200).json({
                success: true,
                data: correlations
            });
        } catch (error) {
            console.error('Analytics Error:', error);
            res.status(500).json({ success: false, message: 'Failed to fetch genre correlations' });
        }
    }
}
