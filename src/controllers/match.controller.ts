import { Request, Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { MatchService } from '../services/match.service';
import { User } from '../models/user.model';
import { SubscriptionTier } from '../models/subscription.types';

export class MatchController {
    /**
     * GET /api/match/:targetUserId
     * Calculate taste match compatibility between current user and target
     * Premium Plus feature
     */
    static async getTasteMatch(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
        try {
            const viewerId = req.user?.id;
            const { targetUserId } = req.params;

            if (!viewerId) {
                res.status(401).json({ success: false, message: 'Unauthorized' });
                return;
            }

            // Validate target user exists
            const targetUser = await User.findById(targetUserId).select('username subscription').lean();
            if (!targetUser) {
                res.status(404).json({ success: false, message: 'User not found' });
                return;
            }

            // Check Premium Plus subscription (optional - can be removed for testing)
            const viewer = await User.findById(viewerId).select('subscription').lean();
            if (viewer?.subscription?.tier !== SubscriptionTier.PREMIUM_PLUS) {
                // For now, allow all users but log it
                console.log(`[TasteMatch] Non-Premium Plus user ${viewerId} accessing feature`);
                // Uncomment below to enforce restriction:
                // res.status(403).json({ success: false, message: 'Premium Plus required for Taste Match' });
                // return;
            }

            // Prevent self-match
            if (viewerId === targetUserId) {
                res.status(400).json({ success: false, message: 'Cannot match with yourself' });
                return;
            }

            // Calculate compatibility
            const result = await MatchService.calculateCompatibility(viewerId, targetUserId);

            res.status(200).json({
                success: true,
                data: result
            });
        } catch (error) {
            next(error);
        }
    }
}
