import { Router } from 'express';
import { AnalyticsController } from '../controllers/analytics.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();

router.get('/evolution', authMiddleware, AnalyticsController.getMoodEvolution);
router.get('/patterns', authMiddleware, AnalyticsController.getDayOfWeekPatterns);
router.get('/genre-correlations', authMiddleware, AnalyticsController.getGenreCorrelations);

export default router;
