import { Router } from 'express';
import authRoutes from './auth.routes';
import favoritesRoutes from './favorites.routes';
import tmdbRoutes from './tmdb.routes';
import activityRoutes from './activity.routes';
import userRoutes from './user.routes';
import moodRoutes from './mood.routes';
import recommendationRoutes from './recommendation.routes';
import aiRoutes from './ai.routes';
import notificationRoutes from './notification.routes';
import badgeRoutes from './badge.routes';
import analyticsRoutes from './analytics.routes';
import watchlistRoutes from './watchlist.routes';
import watchedListRoutes from './watched-list.routes';
import episodeRatingRoutes from './episode-rating.routes';
import seasonRatingRoutes from './season-rating.routes';
import importRoutes from './import.routes';
import commentRoutes from './comment.routes';
import interactionRoutes from './interaction.routes';

const router = Router();

// Mount all routes
router.use('/auth', authRoutes);
router.use('/favorites', favoritesRoutes);
router.use('/tmdb', tmdbRoutes);
router.use('/activities', activityRoutes);
router.use('/comments', commentRoutes);
router.use('/interactions', interactionRoutes); // New route
router.use('/users', userRoutes);
router.use('/mood', moodRoutes);
router.use('/recommendations', recommendationRoutes);
router.use('/ai', aiRoutes);
router.use('/notifications', notificationRoutes);
router.use('/badges', badgeRoutes);
router.use('/analytics', analyticsRoutes);
router.use('/watchlists', watchlistRoutes);
router.use('/watched', watchedListRoutes);
router.use('/episodes', episodeRatingRoutes);
router.use('/seasons', seasonRatingRoutes);
router.use('/import', importRoutes);

export default router;
