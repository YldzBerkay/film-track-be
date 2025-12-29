import { Request, Response } from 'express';
import { Activity } from '../models/activity.model';
import { Comment } from '../models/comment.model';
import { GamificationService } from '../services/gamification.service';
import { RateLimiterService } from '../services/rate-limiter.service';
import mongoose from 'mongoose';

export class InteractionController {

    static async toggleReaction(req: Request, res: Response) {
        try {
            const { targetId, targetType, action } = req.body;
            // targetType: 'activity' | 'comment'
            // action: 'like' | 'dislike' | 'none' (force state)

            const userId = (req as any).user.id;

            // Rate limit check: 3 actions per 3 minutes per user+content
            if (!RateLimiterService.checkLimit(userId, targetId)) {
                const remainingTime = RateLimiterService.getRemainingTime(userId, targetId);
                return res.status(429).json({
                    success: false,
                    message: `Too many attempts. Try again in ${remainingTime} seconds.`,
                    retryAfter: remainingTime
                });
            }

            const userObjectId = new mongoose.Types.ObjectId(userId);

            let Model;
            if (targetType === 'activity') Model = Activity;
            else if (targetType === 'comment') Model = Comment;
            else return res.status(400).json({ success: false, message: 'Invalid target type' });

            const item = await (Model as any).findById(targetId);
            if (!item) return res.status(404).json({ success: false, message: 'Item not found' });

            // Check current state
            const wasLiked = item.likes.includes(userObjectId);
            const wasDisliked = item.dislikes.includes(userObjectId);

            let xpDelta = 0;
            let notifyType: 'like' | null = null;
            let notificationMessage = '';

            if (action === 'like') {
                if (!wasLiked) {
                    item.likes.push(userObjectId);
                    xpDelta += 10;
                    notifyType = 'like';
                    notificationMessage = `@${(req as any).user.username} gönderinizi beğendi`;
                }
                if (wasDisliked) {
                    item.dislikes.pull(userObjectId);
                    xpDelta += 2; // Recover penalty
                }
            } else if (action === 'dislike') {
                if (!wasDisliked) {
                    item.dislikes.push(userObjectId);
                    xpDelta -= 2;
                }
                if (wasLiked) {
                    item.likes.pull(userObjectId);
                    xpDelta -= 10;
                }
            } else if (action === 'none') {
                // Remove both
                if (wasLiked) {
                    item.likes.pull(userObjectId);
                    xpDelta -= 10;
                }
                if (wasDisliked) {
                    item.dislikes.pull(userObjectId);
                    xpDelta += 2;
                }
            } else {
                // Fallback to legacy validation or error
                return res.status(400).json({ success: false, message: 'Invalid action' });
            }

            // Update Counts
            item.likesCount = item.likes.length;
            item.dislikesCount = item.dislikes.length;

            await item.save();

            // Resolve Author ID (Activity has userId, Comment has userId)
            // But Activity model has userId (ref User) and Comment model has userId (ref User).
            // Wait, Activity schema uses 'userId', Comment also 'userId'.
            // Ensure we are not voting on own content? Usually permitted or ignored. 
            // Request doesn't specify check. Assuming permitted but maybe no XP?
            // "When User A votes on User B's content". Implies A != B.

            if (item.userId.toString() !== userId) {
                await GamificationService.updateMastery(item.userId.toString(), xpDelta);

                // Send Notification only if:
                // 1. It is a new Like or Dislike (not an un-vote)
                // 2. It is not toggling off
                // We assume xpDelta != 0 means something happened.
                // But xpDelta could be +2 (Dislike -> Un-Dislike) which is removing reaction.
                // We want to notify only on ADDING reaction.

                let notifyType: 'like' | null = null;
                let message = '';

                // Determine if we should notify
                // We only notify if the user explicitly added a reaction
                // This corresponds to:
                // reactionType 'like' AND (!wasLiked) -> Added Like
                // reactionType 'dislike' AND (!wasDisliked) -> Added Dislike (Maybe notify?)
                // Usually apps notify for Likes, but maybe Dislikes too?
                // Let's notify for both but usually 'like' is the type.

                const isAddingLike = action === 'like' && !wasLiked;
                // const isAddingDislike = action === 'dislike' && !wasDisliked;

                if (isAddingLike) {
                    // Localized message with username prefix
                    message = `@${(req as any).user.username} gönderinizi beğendi`;
                    notifyType = 'like';
                }
                // Optionally handle dislike notification? Maybe silent.
                // Let's stick to Likes for now as negative notifications can be discouraging.

                if (notifyType) {
                    try {
                        const { Notification } = await import('../models/notification.model');
                        const { socketService } = await import('../services/socket.service'); // Dynamic import to avoid circular dep if any

                        // Check if already notified recently? (Optional debounce)
                        // For now simple create.
                        const notification = await Notification.create({
                            userId: item.userId,
                            type: notifyType,
                            message,
                            fromUser: {
                                id: userObjectId,
                                username: (req as any).user.username,
                                name: (req as any).user.name
                            },
                            data: {
                                targetId: item._id,
                                targetType
                            }
                        });

                        console.log(`[Notification] Emitting like to user ${item.userId}`);
                        socketService.emitToUser(item.userId.toString(), 'notification', notification);
                    } catch (notifError) {
                        console.error('Failed to send notification:', notifError);
                    }
                }
            }

            res.json({
                success: true,
                data: {
                    likesCount: item.likesCount,
                    dislikesCount: item.dislikesCount,
                    userVote: action === 'none' ? null : action
                }
            });

        } catch (error) {
            console.error('Interaction Error:', error);
            res.status(500).json({ success: false, message: 'Interaction failed' });
        }
    }
}
