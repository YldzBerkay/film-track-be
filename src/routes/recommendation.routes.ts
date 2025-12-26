import { Router } from 'express';
import { RecommendationController } from '../controllers/recommendation.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();

router.get('/mealtime', authMiddleware, RecommendationController.getMealtimePick);

export default router;
