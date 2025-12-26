import { Router } from 'express';
import { FavoritesController } from '../controllers/favorites.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();

router.post('/', authMiddleware, FavoritesController.saveFavorites);
router.get('/', authMiddleware, FavoritesController.getFavorites);

export default router;

