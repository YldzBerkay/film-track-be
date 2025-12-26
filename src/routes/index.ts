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

const router = Router();

// Mount all routes
router.use('/auth', authRoutes);
router.use('/favorites', favoritesRoutes);
router.use('/tmdb', tmdbRoutes);
router.use('/activities', activityRoutes);
router.use('/users', userRoutes);
router.use('/mood', moodRoutes);
router.use('/recommendations', recommendationRoutes);
router.use('/ai', aiRoutes);
router.use('/notifications', notificationRoutes);

export default router;
