import { Router } from 'express';
import { MoodController } from '../controllers/mood.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();

router.get('/user', authMiddleware, MoodController.getUserMood);
router.get('/timeline', authMiddleware, MoodController.getMoodTimeline);
router.get('/compare/:userId', authMiddleware, MoodController.getMoodComparison);
router.post('/update', authMiddleware, MoodController.updateUserMood);
router.post('/analyze', authMiddleware, MoodController.analyzeMovie);

export default router;

