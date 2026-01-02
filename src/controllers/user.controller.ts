import { Request, Response, NextFunction } from 'express';
import { UserService } from '../services/user.service';
import { AuthRequest } from '../middleware/auth.middleware';

export class UserController {
  static async getProfile(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { username } = req.params;
      const currentUserId = req.user?.id; // May be undefined if not authenticated
      const lang = req.query.lang as string;

      const profile = await UserService.getUserProfile(username, currentUserId, lang);

      res.status(200).json({
        success: true,
        data: profile
      });
    } catch (error) {
      next(error);
    }
  }

  static async getCurrentProfile(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.id;
      const lang = req.query.lang as string;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: 'Unauthorized',
          code: 401
        });
        return;
      }

      const profile = await UserService.getCurrentUserProfile(userId, lang);

      res.status(200).json({
        success: true,
        data: profile
      });
    } catch (error) {
      next(error);
    }
  }

  static async searchUsers(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { query, page = 1 } = req.query;

      if (!query || typeof query !== 'string') {
        res.status(400).json({
          success: false,
          message: 'Query parameter is required',
          code: 400
        });
        return;
      }

      const results = await UserService.searchUsers(query, Number(page));

      res.status(200).json({
        success: true,
        data: results
      });
    } catch (error) {
      next(error);
    }
  }

  static async followUser(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const currentUserId = req.user?.id;
      const { userId: targetUserId } = req.params;

      if (!currentUserId) {
        res.status(401).json({
          success: false,
          message: 'Unauthorized',
          code: 401
        });
        return;
      }

      const result = await UserService.followUser(currentUserId, targetUserId);

      res.status(200).json({
        success: true,
        message: result.message
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to follow user'
      });
    }
  }

  static async unfollowUser(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const currentUserId = req.user?.id;
      const { userId: targetUserId } = req.params;

      if (!currentUserId) {
        res.status(401).json({
          success: false,
          message: 'Unauthorized',
          code: 401
        });
        return;
      }

      const result = await UserService.unfollowUser(currentUserId, targetUserId);

      res.status(200).json({
        success: true,
        message: result.message
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to unfollow user'
      });
    }
  }

  static async getFollowers(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { userId } = req.params;

      const followers = await UserService.getFollowers(userId);

      res.status(200).json({
        success: true,
        data: followers
      });
    } catch (error) {
      next(error);
    }
  }

  static async getFollowing(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { userId } = req.params;

      const following = await UserService.getFollowing(userId);

      res.status(200).json({
        success: true,
        data: following
      });
    } catch (error) {
      next(error);
    }
  }

  static async removeFollower(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const currentUserId = req.user?.id;
      const { userId: followerUserId } = req.params;

      if (!currentUserId) {
        res.status(401).json({
          success: false,
          message: 'Unauthorized',
          code: 401
        });
        return;
      }

      const result = await UserService.removeFollower(currentUserId, followerUserId);

      res.status(200).json({
        success: true,
        message: result.message
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to remove follower'
      });
    }
  }

  static async updatePrivacy(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ success: false, message: 'Unauthorized' });
        return;
      }

      const { mood, library, activity, stats } = req.body;

      // Basic validation
      const validTiers = ['public', 'friends', 'private'];
      const settings: any = {};
      if (mood && validTiers.includes(mood)) settings.mood = mood;
      if (library && validTiers.includes(library)) settings.library = library;
      if (activity && validTiers.includes(activity)) settings.activity = activity;
      if (stats && validTiers.includes(stats)) settings.stats = stats;

      const result = await UserService.updatePrivacySettings(userId, settings);

      res.status(200).json(result);
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to update privacy settings'
      });
    }
  }

  static async updateProfile(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ success: false, message: 'Unauthorized' });
        return;
      }

      const { name, avatar, username } = req.body;
      const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;

      const result = await UserService.updateProfile(userId, { name, avatar, username }, files);

      if (!result.success) {
        res.status(400).json(result);
        return;
      }

      res.status(200).json(result);
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to update profile'
      });
    }
  }

  static async deleteAccount(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ success: false, message: 'Unauthorized' });
        return;
      }

      await UserService.deleteAccount(userId);

      res.status(200).json({
        success: true,
        message: 'Account deleted successfully'
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to delete account'
      });
    }
  }

  /**
   * GET /api/users/:userId/lists
   * Get a user's lists respecting privacy settings
   */
  static async getUserPublicLists(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { userId: targetUserId } = req.params;
      const viewerId = req.user?.id; // May be undefined if not authenticated
      const lang = req.query.lang as string;

      const result = await UserService.getUserPublicLists(targetUserId, viewerId, lang);

      res.status(200).json({
        success: true,
        data: result
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to get user lists'
      });
    }
  }

  /**
   * GET /api/users/:userId/lists/:listType
   * Get a specific list for a user with privacy filtering
   */
  static async getUserListDetail(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { userId: targetUserId, listType } = req.params;
      const viewerId = req.user?.id;
      const lang = req.query.lang as string;

      const result = await UserService.getUserListDetail(targetUserId, listType, viewerId, lang);

      res.status(200).json({
        success: true,
        data: result
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to get user list'
      });
    }
  }
}

