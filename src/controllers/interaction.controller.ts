import { Request, Response } from 'express';
import { Activity } from '../models/activity.model';
import { Comment } from '../models/comment.model';
import { GamificationService } from '../services/gamification.service';
import mongoose from 'mongoose';

export class InteractionController {

    static async toggleReaction(req: Request, res: Response) {
        try {
            const { targetId, targetType, reactionType } = req.body;
            // targetType: 'activity' | 'comment'
            // reactionType: 'like' | 'dislike'

            const userId = (req as any).user.id;
            const userObjectId = new mongoose.Types.ObjectId(userId);

            let Model;
            if (targetType === 'activity') Model = Activity;
            else if (targetType === 'comment') Model = Comment;
            else return res.status(400).json({ success: false, message: 'Invalid target type' });

            const item = await (Model as any).findById(targetId);
            if (!item) return res.status(404).json({ success: false, message: 'Item not found' });

            // Check current state
            const isLiked = item.likes.includes(userObjectId);
            const isDisliked = item.dislikes.includes(userObjectId);

            let xpDelta = 0;

            if (reactionType === 'like') {
                if (isLiked) {
                    // Remove Like
                    item.likes.pull(userObjectId);
                    xpDelta = -10;
                } else {
                    // Add Like
                    item.likes.push(userObjectId);
                    xpDelta = +10;
                    if (isDisliked) {
                        // Switch from Dislike to Like
                        item.dislikes.pull(userObjectId);
                        xpDelta += 2; // Recover the -2 penalty
                    }
                }
            } else if (reactionType === 'dislike') {
                if (isDisliked) {
                    // Remove Dislike
                    item.dislikes.pull(userObjectId);
                    xpDelta = +2; // Recover penalty
                } else {
                    // Add Dislike
                    item.dislikes.push(userObjectId);
                    xpDelta = -2;
                    if (isLiked) {
                        // Switch from Like to Dislike
                        item.likes.pull(userObjectId);
                        xpDelta -= 10; // Remove the +10 gain
                    }
                }
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

                const isAddingLike = reactionType === 'like' && !isLiked;
                // const isAddingDislike = reactionType === 'dislike' && !isDisliked;

                if (isAddingLike) {
                    message = `@${(req as any).user.username} liked your ${targetType}`;
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

                        socketService.emitToUser(item.userId.toString(), 'notification', {
                            id: notification._id,
                            type: notifyType,
                            message,
                            fromUser: notification.fromUser,
                            createdAt: notification.createdAt,
                            data: notification.data
                        });
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
                    userVote: reactionType === 'like' && !isLiked ? 'like' :
                        reactionType === 'dislike' && !isDisliked ? 'dislike' : null // If we toggled OFF, it's null
                    // Logic fix:
                    // If request 'like' and WAS liked -> result None.
                    // If request 'like' and WAS NOT liked -> result Like.
                }
            });

        } catch (error) {
            console.error('Interaction Error:', error);
            res.status(500).json({ success: false, message: 'Interaction failed' });
        }
    }
}
