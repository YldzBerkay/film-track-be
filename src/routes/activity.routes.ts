import { Router } from 'express';
import { ActivityController } from '../controllers/activity.controller';
import { authMiddleware as protect } from '../middleware/auth.middleware';

const router = Router();

router.post('/', protect, ActivityController.createActivity);
router.get('/feed', protect, ActivityController.getFeed);
router.get('/user', protect, ActivityController.getUserActivities);

export default router;

