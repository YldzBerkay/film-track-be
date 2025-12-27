import { Router } from 'express';
import { WatchedListController } from '../controllers/watched-list.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

// Get watch statistics
router.get('/stats', WatchedListController.getStats);

// Check if item is watched
router.get('/check/:tmdbId', WatchedListController.checkItem);

// Get watched list
router.get('/', WatchedListController.getWatchedList);

// Add item to watched list
router.post('/items', WatchedListController.addItem);

// Update item rating
router.patch('/items/:tmdbId/rating', WatchedListController.updateRating);

// Update privacy settings
router.patch('/privacy', WatchedListController.updatePrivacy);

// Reorder items
router.patch('/reorder', WatchedListController.reorderItems);

// Remove item from watched list
router.delete('/items/:tmdbId', WatchedListController.removeItem);

export default router;
