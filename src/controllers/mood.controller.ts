import { Request, Response, NextFunction } from 'express';
import { MoodService } from '../services/mood.service';
import { AIService } from '../services/ai.service';
import { AuthRequest } from '../middleware/auth.middleware';
import { RecommendationService } from '../services/recommendation.service';

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

      // Check minimum movie threshold (25 rated movies required)
      const thresholdMeta = await RecommendationService.checkMovieThreshold(userId);
      if (thresholdMeta) {
        console.log(`[Mood] User ${userId} has ${thresholdMeta.currentCount}/${thresholdMeta.requiredCount} rated movies`);
        res.status(200).json({
          success: false,
          error: 'NOT_ENOUGH_DATA',
          meta: thresholdMeta
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

  static async getMoodTimeline(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
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

      const days = parseInt(req.query.days as string) || 30;
      const timeline = await MoodService.getMoodTimeline(userId, days);

      res.status(200).json({
        success: true,
        data: timeline
      });
    } catch (error) {
      next(error);
    }
  }

  static async getMoodComparison(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
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

      const targetUserId = req.params.userId;
      if (!targetUserId) {
        res.status(400).json({
          success: false,
          message: 'Target user ID is required',
          code: 400
        });
        return;
      }

      const comparison = await MoodService.getMoodComparison(userId, targetUserId);

      res.status(200).json({
        success: true,
        data: comparison
      });
    } catch (error) {
      next(error);
    }
  }
}

