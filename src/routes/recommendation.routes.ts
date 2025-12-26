import { Router } from 'express';
import { RecommendationController } from '../controllers/recommendation.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();

router.get('/mealtime', authMiddleware, RecommendationController.getMealtimePick);
router.get('/daily', authMiddleware, RecommendationController.getDailyPick);
router.get('/friends', authMiddleware, RecommendationController.getFriends);
router.post('/mealtime/friends', authMiddleware, RecommendationController.getFriendMealtimePick);

export default router;

