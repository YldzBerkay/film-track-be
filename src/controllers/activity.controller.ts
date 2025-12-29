import { Request, Response, NextFunction } from 'express';
import { ActivityService } from '../services/activity.service';
import { AuthRequest } from '../middleware/auth.middleware';

export class ActivityController {
  static async createActivity(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
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

      const activity = await ActivityService.createActivity({
        userId,
        ...req.body
      });

      res.status(201).json({
        success: true,
        message: 'Activity created successfully',
        data: activity
      });
    } catch (error) {
      next(error);
    }
  }

  static async getFeed(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
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

      const { feedType = 'following', page = 1, limit = 20 } = req.query;

      const feed = await ActivityService.getFeed({
        userId,
        feedType: feedType as 'following' | 'friends' | 'global',
        page: Number(page),
        limit: Number(limit)
      });

      res.status(200).json({
        success: true,
        data: feed
      });
    } catch (error) {
      next(error);
    }
  }

  static async getUserActivities(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
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

      const { page = 1, limit = 20, filter = 'ALL' } = req.query;

      const activities = await ActivityService.getUserActivities(
        userId,
        filter as string,
        Number(page),
        Number(limit)
      );

      res.status(200).json({
        success: true,
        data: activities
      });
    } catch (error) {
      next(error);
    }
  }

  static async getProfileActivities(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { userId } = req.params;
      const { page = 1, limit = 20, filter = 'ALL' } = req.query;

      const activities = await ActivityService.getUserActivities(
        userId,
        filter as string,
        Number(page),
        Number(limit)
      );

      res.status(200).json({
        success: true,
        data: activities
      });
    } catch (error) {
      next(error);
    }
  }

  static async getActivityById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;

      const activity = await ActivityService.getActivityById(id);

      if (!activity) {
        res.status(404).json({ success: false, message: 'Activity not found' });
        return;
      }

      res.status(200).json({
        success: true,
        data: activity
      });
    } catch (error) {
      next(error);
    }
  }

  static async likeActivity(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.id;
      const { id } = req.params;

      if (!userId) {
        res.status(401).json({ success: false, message: 'Unauthorized' });
        return;
      }

      const activity = await ActivityService.likeActivity(id, userId);

      if (!activity) {
        res.status(404).json({ success: false, message: 'Activity not found' });
        return;
      }

      res.status(200).json({ success: true, data: activity });
    } catch (error) {
      next(error);
    }
  }

  static async unlikeActivity(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.id;
      const { id } = req.params;

      if (!userId) {
        res.status(401).json({ success: false, message: 'Unauthorized' });
        return;
      }

      const activity = await ActivityService.unlikeActivity(id, userId);

      if (!activity) {
        res.status(404).json({ success: false, message: 'Activity not found' });
        return;
      }

      res.status(200).json({ success: true, data: activity });
    } catch (error) {
      next(error);
    }
  }

  static async commentOnActivity(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.id;
      const { id } = req.params;
      const { text } = req.body;

      if (!userId) {
        res.status(401).json({ success: false, message: 'Unauthorized' });
        return;
      }

      if (!text || !text.trim()) {
        res.status(400).json({ success: false, message: 'Comment text is required' });
        return;
      }

      const activity = await ActivityService.addComment(id, userId, text);

      if (!activity) {
        res.status(404).json({ success: false, message: 'Activity not found' });
        return;
      }

      res.status(200).json({ success: true, data: activity });
    } catch (error) {
      next(error);
    }
  }

  static async getMediaActivities(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { mediaType, tmdbId } = req.params;
      const { page = 1, limit = 20 } = req.query;

      if (!mediaType || !['movie', 'tv'].includes(mediaType)) {
        res.status(400).json({ success: false, message: 'Invalid mediaType' });
        return;
      }

      const activities = await ActivityService.getMediaActivities(
        mediaType,
        Number(tmdbId),
        Number(page),
        Number(limit)
      );

      res.status(200).json({
        success: true,
        data: activities
      });
    } catch (error) {
      next(error);
    }
  }

  static async bookmarkActivity(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.id;
      const { id } = req.params;

      if (!userId) {
        res.status(401).json({ success: false, message: 'Unauthorized' });
        return;
      }

      const result = await ActivityService.toggleBookmark(id, userId);

      if (!result) {
        res.status(404).json({ success: false, message: 'Activity not found' });
        return;
      }

      res.status(200).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  static async getSavedActivities(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({ success: false, message: 'Unauthorized' });
        return;
      }

      const { page = 1, limit = 20 } = req.query;

      const result = await ActivityService.getSavedActivities(
        userId,
        Number(page),
        Number(limit)
      );

      res.status(200).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }
}

