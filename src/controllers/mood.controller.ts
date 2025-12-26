import { Request, Response, NextFunction } from 'express';
import { MoodService } from '../services/mood.service';
import { AIService } from '../services/ai.service';
import { AuthRequest } from '../middleware/auth.middleware';

export class MoodController {
  static async getUserMood(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
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

      const { forceRecalculate } = req.query;
      const mood = await MoodService.getUserMood(
        userId,
        forceRecalculate === 'true'
      );

      res.status(200).json({
        success: true,
        data: mood
      });
    } catch (error) {
      next(error);
    }
  }

  static async analyzeMovie(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { tmdbId, title, overview } = req.body;

      if (!tmdbId || !title) {
        res.status(400).json({
          success: false,
          message: 'TMDB ID and title are required',
          code: 400
        });
        return;
      }

      const moodVector = await AIService.getOrAnalyzeMovie(tmdbId, title, overview);

      res.status(200).json({
        success: true,
        data: moodVector
      });
    } catch (error) {
      next(error);
    }
  }

  static async updateUserMood(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
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

      const mood = await MoodService.updateUserMood(userId);

      res.status(200).json({
        success: true,
        data: mood
      });
    } catch (error) {
      next(error);
    }
  }
}

