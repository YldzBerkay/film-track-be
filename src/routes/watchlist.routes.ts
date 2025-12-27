import { Router } from 'express';
import { WatchlistController } from '../controllers/watchlist.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

// Get user's default watchlist
router.get('/default', WatchlistController.getDefault);

// Check if item is in watchlist
router.get('/check/:tmdbId', WatchlistController.checkItem);

// Get all watchlists
router.get('/', WatchlistController.getWatchlists);

// Create a new custom watchlist
router.post('/', WatchlistController.createList);

// Get specific watchlist
router.get('/:id', WatchlistController.getWatchlist);

// Rename a watchlist
router.patch('/:id/name', WatchlistController.renameList);

// Update privacy settings
router.patch('/:id/privacy', WatchlistController.updatePrivacy);

// Reorder items
router.patch('/:id/reorder', WatchlistController.reorderItems);

// Delete a watchlist (only non-default)
router.delete('/:id', WatchlistController.deleteList);

// Add item to watchlist
router.post('/:id/items', WatchlistController.addItem);

// Remove item from watchlist
router.delete('/:id/items/:tmdbId', WatchlistController.removeItem);

export default router;
