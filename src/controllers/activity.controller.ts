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

      const { page = 1, limit = 20 } = req.query;

      const activities = await ActivityService.getUserActivities(
        userId,
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
}

