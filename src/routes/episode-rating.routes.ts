import { Router } from 'express';
import { EpisodeRatingController } from '../controllers/episode-rating.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();

// Rate an episode (requires auth)
router.post('/rate', authMiddleware, EpisodeRatingController.rateEpisode);

// Get user's rating for an episode (requires auth)
router.get('/rating/:tvId/:season/:episode', authMiddleware, EpisodeRatingController.getUserRating);

// Get user's ratings for all episodes in a season (requires auth)
router.get('/ratings/:tvId/:season', authMiddleware, EpisodeRatingController.getUserRatingsForSeason);

// Get public stats for an episode (no auth required)
router.get('/stats/:tvId/:season/:episode', EpisodeRatingController.getPublicStats);

// Get public stats for all episodes in a season (bulk, no auth required)
router.get('/season-stats/:tvId/:season', EpisodeRatingController.getSeasonPublicStats);

// Remove user's rating for an episode (requires auth)
router.delete('/rating/:tvId/:season/:episode', authMiddleware, EpisodeRatingController.removeRating);

export default router;
