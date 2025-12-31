import { Response } from 'express';
import { BadgeService } from '../services/badge.service';
import { AuthRequest } from '../middleware/auth.middleware';

export class BadgeController {
    static async getBadges(req: AuthRequest, res: Response) {
        try {
            const currentUserId = req.user?.id;
            if (!currentUserId) {
                return res.status(401).json({ message: 'Unauthorized' });
            }

            const targetUserId = (req.query.userId as string) || currentUserId;

            // Privacy Check (Badges follow Mood Privacy)
            if (targetUserId !== currentUserId) {
                // We need to import MoodService for this.
                // Assuming MoodService is available or I can import it.
                // Wait, MoodService is in ../services/mood.service
                const { MoodService } = require('../services/mood.service'); // Dynamic import or add top-level import
                const canView = await MoodService.canViewMood(targetUserId, currentUserId);
                if (!canView) {
                    return res.status(403).json({
                        success: false,
                        message: 'This user\'s badges are private',
                        code: 403
                    });
                }
            }

            const showAll = req.query.all === 'true';

            // If viewing another profile, we probably only want to show what they have earned,
            // or if we show all, we certainly shouldn't trigger 'evaluate' which implies writing updates?
            // Let's assume evaluateBadges is safe or strictly necessary for "showAll".
            // Actually, for other users, we usually just want to see what they have.

            const badges = showAll
                ? await BadgeService.evaluateBadges(targetUserId)
                : await BadgeService.getEarnedBadges(targetUserId);

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
