import { Router } from 'express';
import { RecommendationController } from '../controllers/recommendation.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();

router.get('/mealtime', authMiddleware, RecommendationController.getMealtimePick);
router.get('/daily', authMiddleware, RecommendationController.getDailyPick);
router.get('/mood-based', authMiddleware, RecommendationController.getMoodBasedRecommendations);
router.get('/ai-curated', authMiddleware, RecommendationController.getAICurated);
router.get('/friends', authMiddleware, RecommendationController.getFriends);
router.post('/mealtime/friends', authMiddleware, RecommendationController.getFriendMealtimePick);

// RL Feedback System
router.post('/feedback', authMiddleware, RecommendationController.submitFeedback);
router.post('/rl-feedback', authMiddleware, RecommendationController.submitRLFeedback);
router.get('/replace', authMiddleware, RecommendationController.replaceCard);
router.get('/quota', authMiddleware, RecommendationController.getQuota);

export default router;

