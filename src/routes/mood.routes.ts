import { Router } from 'express';
import { MoodController } from '../controllers/mood.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();

router.get('/user', authMiddleware, MoodController.getUserMood);
router.get('/timeline', authMiddleware, MoodController.getMoodTimeline);
router.get('/compare/:userId', authMiddleware, MoodController.getMoodComparison);
router.post('/update', authMiddleware, MoodController.updateUserMood);
router.post('/analyze', authMiddleware, MoodController.analyzeMovie);

// Vibe Check (Real-Time Calibration)
router.post('/vibe-check', authMiddleware, MoodController.vibeCheck);
router.delete('/vibe-check', authMiddleware, MoodController.clearVibe);
router.get('/vibe-check', authMiddleware, MoodController.getVibe);

export default router;

