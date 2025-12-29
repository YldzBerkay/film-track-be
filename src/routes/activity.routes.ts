import { Router } from 'express';
import { ActivityController } from '../controllers/activity.controller';
import { authMiddleware as protect } from '../middleware/auth.middleware';

const router = Router();

router.post('/', protect, ActivityController.createActivity);
router.get('/feed', protect, ActivityController.getFeed);
router.get('/user', protect, ActivityController.getUserActivities);
router.get('/media/:mediaType/:tmdbId', protect, ActivityController.getMediaActivities);

// Bookmark routes (must be before /:id to avoid route shadowing)
router.get('/saved', protect, ActivityController.getSavedActivities);
router.post('/:id/bookmark', protect, ActivityController.bookmarkActivity);

// Single activity (must be after /saved to prevent matching "saved" as an id)
router.get('/:id', protect, ActivityController.getActivityById);

// Social routes
router.post('/:id/like', protect, ActivityController.likeActivity);
router.post('/:id/unlike', protect, ActivityController.unlikeActivity);
router.post('/:id/comments', protect, ActivityController.commentOnActivity);

// User likes route (must be before /:id for specific paths)
router.get('/user/:userId/likes', protect, ActivityController.getUserLikedActivities);

export default router;
