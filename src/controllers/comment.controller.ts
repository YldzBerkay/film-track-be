import { Request, Response, NextFunction } from 'express';
import { Comment } from '../models/comment.model';
import { Activity } from '../models/activity.model';
import { AuthRequest } from '../middleware/auth.middleware';
import mongoose from 'mongoose';

export class CommentController {
    // Get top-level comments for an activity
    static async getComments(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
        try {
            const { activityId } = req.query;
            const page = Number(req.query.page) || 1;
            const limit = Number(req.query.limit) || 20; // limit top level comments
            const skip = (page - 1) * limit;

            if (!activityId) {
                res.status(400).json({ success: false, message: 'Activity ID is required' });
                return;
            }

            const comments = await Comment.find({
                activityId,
                rootId: null // Only top-level
            })
                .populate('userId', 'username name avatar')
                .populate('replyToUser', 'username name') // Just in case, though top level usually doesn't have it
                .sort({ createdAt: -1 }) // Newest first
                .skip(skip)
                .limit(limit)
                .lean();

            // Check if there are more
            const total = await Comment.countDocuments({ activityId, rootId: null });

            res.status(200).json({
                success: true,
                data: {
                    comments,
                    pagination: {
                        page,
                        limit,
                        total,
                        hasMore: skip + comments.length < total
                    }
                }
            });
        } catch (error) {
            next(error);
        }
    }

    // Get replies for a comment (Thread)
    static async getReplies(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
        try {
            const { id } = req.params; // The root comment ID
            const page = Number(req.query.page) || 1;
            const limit = Number(req.query.limit) || 10; // Batch load replies
            const skip = (page - 1) * limit;

            // We fetch all comments where rootId is this ID
            const replies = await Comment.find({ rootId: id })
                .populate('userId', 'username name avatar')
                .populate('replyToUser', 'username name')
                .sort({ createdAt: 1 }) // Oldest first (chronological conversation)
                .skip(skip)
                .limit(limit)
                .lean();

            const total = await Comment.countDocuments({ rootId: id });

            res.status(200).json({
                success: true,
                data: {
                    replies,
                    pagination: {
                        page,
                        limit,
                        total,
                        hasMore: skip + replies.length < total
                    }
                }
            });
        } catch (error) {
            next(error);
        }
    }

    static async createComment(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
        try {
            const userId = req.user?.id;
            const { activityId, text, parentId, replyToUser } = req.body;

            if (!userId) {
                res.status(401).json({ success: false, message: 'Unauthorized' });
                return;
            }

            if (!activityId || !text) {
                res.status(400).json({ success: false, message: 'Activity ID and text are required' });
                return;
            }

            let rootId = null;
            let effectiveReplyToUser = replyToUser;

            if (parentId) {
                // Verify parent exists
                const parent = await Comment.findById(parentId);
                if (!parent) {
                    res.status(404).json({ success: false, message: 'Parent comment not found' });
                    return;
                }

                // Determine rootId
                // If parent has a rootId, use it. If not, parent IS the root.
                rootId = parent.rootId || parent._id;

                // If replyToUser is not provided, default to parent's author
                if (!effectiveReplyToUser) {
                    effectiveReplyToUser = parent.userId;
                }

                // Increment replyCount on the parent (and maybe root?)
                // The requirement says "Cached count of direct children". 
                // Instagram shows "View 3 more replies" on the thread root. So we should increment the Root's replyCount.
                // Let's increment the Top Level Comment's replyCount if this is a reply.
                await Comment.findByIdAndUpdate(rootId, { $inc: { replyCount: 1 } });
            }

            const comment = new Comment({
                userId,
                activityId,
                text,
                parentId: parentId || null,
                rootId: rootId || null,
                replyToUser: effectiveReplyToUser || null
            });

            await comment.save();
            await comment.populate('userId', 'username name avatar');
            if (comment.replyToUser) {
                await comment.populate('replyToUser', 'username name');
            }

            // Increment Activity comment count
            await Activity.findByIdAndUpdate(activityId, { $inc: { commentCount: 1 } });

            res.status(201).json({
                success: true,
                data: comment
            });
        } catch (error) {
            next(error);
        }
    }

    static async deleteComment(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
        // Basic delete
        try {
            const userId = req.user?.id;
            const { id } = req.params;

            const comment = await Comment.findOneAndDelete({ _id: id, userId });
            if (!comment) {
                res.status(404).json({ success: false, message: 'Comment not found or unauthorized' });
                return;
            }

            // Decrement counts... logic needed
            res.status(200).json({ success: true, message: 'Deleted' });
        } catch (error) {
            next(error);
        }
    }
}
