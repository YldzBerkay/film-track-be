import { Request, Response, NextFunction } from 'express';
import { Notification } from '../models/notification.model';

interface AuthRequest extends Request {
    user?: { id: string };
}

export class NotificationController {
    /**
     * Get user's notifications
     */
    static async getNotifications(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
        try {
            const userId = req.user?.id;
            if (!userId) {
                res.status(401).json({ success: false, message: 'Unauthorized' });
                return;
            }

            const notifications = await Notification.find({ userId })
                .sort({ createdAt: -1 })
                .limit(50);

            const unreadCount = await Notification.countDocuments({ userId, read: false });

            res.status(200).json({
                success: true,
                data: {
                    notifications: notifications.map(n => ({
                        id: n._id.toString(),
                        type: n.type,
                        message: n.message,
                        fromUser: n.fromUser,
                        read: n.read,
                        createdAt: n.createdAt
                    })),
                    unreadCount
                }
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * Mark notifications as read
     */
    static async markAsRead(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
        try {
            const userId = req.user?.id;
            if (!userId) {
                res.status(401).json({ success: false, message: 'Unauthorized' });
                return;
            }

            await Notification.updateMany({ userId, read: false }, { read: true });

            res.status(200).json({ success: true, message: 'Marked as read' });
        } catch (error) {
            next(error);
        }
    }

    /**
     * Delete a notification
     */
    static async deleteNotification(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
        try {
            const userId = req.user?.id;
            const { notificationId } = req.params;

            if (!userId) {
                res.status(401).json({ success: false, message: 'Unauthorized' });
                return;
            }

            await Notification.deleteOne({ _id: notificationId, userId });

            res.status(200).json({ success: true, message: 'Notification deleted' });
        } catch (error) {
            next(error);
        }
    }

    /**
     * Delete all notifications for user
     */
    static async deleteAllNotifications(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
        try {
            const userId = req.user?.id;
            if (!userId) {
                res.status(401).json({ success: false, message: 'Unauthorized' });
                return;
            }

            await Notification.deleteMany({ userId });

            res.status(200).json({ success: true, message: 'All notifications deleted' });
        } catch (error) {
            next(error);
        }
    }
}
