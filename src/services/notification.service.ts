import { Notification } from '../models/notification.model';
import { socketService } from './socket.service';
import mongoose from 'mongoose';

export class NotificationService {
    /**
     * Create notifications in bulk and emit via socket
     */
    static async createAndSendBulk(
        userIds: string[],
        type: string,
        message: string,
        data?: any
    ): Promise<void> {
        if (!userIds || userIds.length === 0) return;

        // 1. Prepare bulk notification documents
        const notifications = userIds.map(userId => ({
            userId: new mongoose.Types.ObjectId(userId),
            type,
            message,
            data,
            read: false,
            fromUser: {
                id: new mongoose.Types.ObjectId('000000000000000000000000'), // System user ID
                username: 'CineTrack',
                name: 'System Alert'
            }
        }));

        // 2. Save to database
        const savedNotifications = await Notification.insertMany(notifications);

        // 3. Emit real-time notifications via socket
        savedNotifications.forEach(notification => {
            socketService.emitToUser(notification.userId.toString(), 'notification', {
                id: notification._id.toString(),
                type: notification.type,
                message: notification.message,
                data: notification.data,
                createdAt: (notification as any).createdAt || new Date()
            });
        });
    }
}
