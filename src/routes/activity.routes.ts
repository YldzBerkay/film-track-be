import { Router } from 'express';
import { ActivityController } from '../controllers/activity.controller';
import { authMiddleware as protect } from '../middleware/auth.middleware';

const router = Router();

router.post('/', protect, ActivityController.createActivity);
router.get('/feed', protect, ActivityController.getFeed);
router.get('/user', protect, ActivityController.getUserActivities);
router.get('/media/:mediaType/:tmdbId', protect, ActivityController.getMediaActivities);

// Social routes
router.post('/:id/like', protect, ActivityController.likeActivity);
router.post('/:id/unlike', protect, ActivityController.unlikeActivity);
router.post('/:id/comments', protect, ActivityController.commentOnActivity);

export default router;

