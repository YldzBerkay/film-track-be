import { Router } from 'express';
import { NotificationController } from '../controllers/notification.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();

// Get user notifications
router.get('/', authMiddleware, NotificationController.getNotifications);

// Mark all as read
router.post('/read', authMiddleware, NotificationController.markAsRead);

// Delete a notification
router.delete('/:notificationId', authMiddleware, NotificationController.deleteNotification);

export default router;
