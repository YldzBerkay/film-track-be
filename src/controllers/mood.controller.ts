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

      // Check minimum active days restriction (must have data for at least 3 days)
      if (timeline.length < 3) {
        res.status(200).json({ // Returning 200 with success: false is common in this API style
          success: false,
          error: 'NOT_ENOUGH_DATA',
          message: 'At least 3 days of mood data is required to view the timeline'
        });
        return;
      }

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

  /**
   * POST /api/mood/vibe-check
   * Set a temporary vibe override for mood-based recommendations
   */
  static async vibeCheck(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
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

      const { template, strength, durationHours } = req.body;

      if (!template) {
        res.status(400).json({
          success: false,
          message: 'Template is required. Available: ' + Object.keys(MoodService.VIBE_TEMPLATES).join(', '),
          code: 400
        });
        return;
      }

      const result = await MoodService.setTemporaryVibe(
        userId,
        template,
        strength ?? 0.4,
        durationHours ?? 4
      );

      res.status(200).json({
        success: true,
        message: `Vibe "${template}" activated! Expires at ${result.expiresAt.toISOString()}`,
        data: {
          template,
          expiresAt: result.expiresAt,
          vibeVector: result.vector
        }
      });
    } catch (error) {
      if ((error as Error).message.includes('Unknown vibe template')) {
        res.status(400).json({
          success: false,
          message: (error as Error).message,
          code: 400
        });
        return;
      }
      next(error);
    }
  }

  /**
   * DELETE /api/mood/vibe-check
   * Clear the current temporary vibe
   */
  static async clearVibe(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
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

      await MoodService.clearTemporaryVibe(userId);

      res.status(200).json({
        success: true,
        message: 'Vibe cleared. Recommendations will now use your historical mood.'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/mood/vibe-check
   * Get current vibe status and effective mood
   */
  static async getVibe(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
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

      const effectiveMoodData = await MoodService.getEffectiveMood(userId);

      res.status(200).json({
        success: true,
        data: {
          effectiveMood: effectiveMoodData.mood,
          hasActiveVibe: effectiveMoodData.hasActiveVibe,
          vibeTemplate: effectiveMoodData.vibeTemplate || null,
          vibeExpiresAt: effectiveMoodData.vibeExpiresAt || null,
          availableTemplates: Object.keys(MoodService.VIBE_TEMPLATES)
        }
      });
    } catch (error) {
      next(error);
    }
  }
}

