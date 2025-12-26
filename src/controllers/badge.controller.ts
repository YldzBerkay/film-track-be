import { Response } from 'express';
import { BadgeService } from '../services/badge.service';
import { AuthRequest } from '../middleware/auth.middleware';

export class BadgeController {
    static async getBadges(req: AuthRequest, res: Response) {
        try {
            const userId = req.user?.id;
            if (!userId) {
                return res.status(401).json({ message: 'Unauthorized' });
            }

            const showAll = req.query.all === 'true';

            const badges = showAll
                ? await BadgeService.evaluateBadges(userId)
                : await BadgeService.getEarnedBadges(userId);

            return res.status(200).json({
                success: true,
                data: badges
            });
        } catch (error) {
            console.error('Error fetching badges:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to fetch badges.'
            });
        }
    }
}
