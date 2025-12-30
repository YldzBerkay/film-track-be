import { Router } from 'express';
import { NotificationController } from '../controllers/notification.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { TvTrackerService } from '../services/tv-tracker.service';

const router = Router();

// Get user notifications
router.get('/', authMiddleware, NotificationController.getNotifications);

// Mark all as read
router.post('/read', authMiddleware, NotificationController.markAsRead);

// Manual trigger for TV Tracker (Dev only normally, but useful for verification)
router.post('/trigger-episode-check', async (req, res) => {
    try {
        await TvTrackerService.checkNewEpisodes();
        res.json({ message: 'TV Episode check triggered successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to trigger check' });
    }
});

// Delete all notifications (must be before /:notificationId)
router.delete('/all', authMiddleware, NotificationController.deleteAllNotifications);

// Delete a notification
router.delete('/:notificationId', authMiddleware, NotificationController.deleteNotification);

export default router;
