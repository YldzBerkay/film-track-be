import { Request, Response, NextFunction } from 'express';
import { FavoritesService } from '../services/favorites.service';
import { AuthRequest } from '../middleware/auth.middleware';

export class FavoritesController {
  static async saveFavorites(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: 'Unauthorized',
          code: 401
        });
        return;
      }

      const { favoriteMovies, favoriteTvShows } = req.body;

      await FavoritesService.saveFavorites({
        userId,
        favoriteMovies,
        favoriteTvShows
      });

      res.status(200).json({
        success: true,
        message: 'Favorites saved successfully'
      });
    } catch (error) {
      next(error);
    }
  }

  static async getFavorites(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: 'Unauthorized',
          code: 401
        });
        return;
      }

      const favorites = await FavoritesService.getUserFavorites(userId);

      res.status(200).json({
        success: true,
        data: favorites
      });
    } catch (error) {
      next(error);
    }
  }
}

