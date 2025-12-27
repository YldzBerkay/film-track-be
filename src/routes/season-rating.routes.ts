import { Router } from 'express';
import { SeasonRatingController } from '../controllers/season-rating.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();

// Rate a season (requires auth)
router.post('/rate', authMiddleware, SeasonRatingController.rateSeason);

// Get user's rating for a season (requires auth)
router.get('/rating/:tvId/:season', authMiddleware, SeasonRatingController.getUserRating);

// Get user's ratings for all seasons in a show (requires auth)
router.get('/ratings/:tvId', authMiddleware, SeasonRatingController.getUserRatingsForShow);

// Get public stats for a season (no auth required)
router.get('/stats/:tvId/:season', SeasonRatingController.getPublicStats);

// Get public stats for all seasons in a show (bulk, no auth required)
router.get('/show-stats/:tvId', SeasonRatingController.getShowPublicStats);

// Remove user's rating for a season (requires auth)
router.delete('/rating/:tvId/:season', authMiddleware, SeasonRatingController.removeRating);

export default router;
