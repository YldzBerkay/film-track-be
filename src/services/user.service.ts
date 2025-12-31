import { User, IUser } from '../models/user.model';
import { Activity } from '../models/activity.model';
import { GamificationService } from './gamification.service';
import sharp from 'sharp';

// Shared types
interface UserStats {
  moviesWatched: number;
  episodesWatched: number;
  totalRuntime: number;
}

interface FavoriteMovie {
  tmdbId: number;
  title: string;
  posterPath: string;
  releaseDate: string;
}

interface FavoriteTvShow {
  tmdbId: number;
  name: string;
  posterPath: string;
  firstAirDate: string;
}

interface MasteryInfo {
  level: number;
  title: string;
  score: number;
  nextLevelScore: number;
  scoreToNextLevel: number;
  progressPercent: number;
}

interface MoodVector {
  adrenaline: number;
  melancholy: number;
  joy: number;
  tension: number;
  intellect: number;
  romance: number;
  wonder: number;
  nostalgia: number;
  darkness: number;
  inspiration: number;
}

// ========== PRIVATE PROFILE (for /me endpoint) ==========
interface PrivateProfileResponse {
  user: {
    id: string;
    username: string;
    name: string;
    email: string;
    stats: UserStats;
    followersCount: number;
    followingCount: number;
    favoriteMovies: FavoriteMovie[];
    favoriteTvShows: FavoriteTvShow[];
    avatar: string | null;
    banner: string | null;
    usernameLastChanged: Date | null;
    canChangeUsernameAt: Date | null;
    createdAt: Date;
  };
  reviewCount: number;
  mastery: MasteryInfo;
  recommendationQuota: {
    remaining: number;
    total: number;
    lastResetDate: Date;
  };
}

// ========== PUBLIC PROFILE (for /:username endpoint) ==========
interface PublicProfileResponse {
  user: {
    id: string;
    username: string;
    name: string;
    // NO email
    stats?: UserStats; // Optional because it might be hidden
    followersCount: number;
    followingCount: number;
    favoriteMovies: FavoriteMovie[];
    favoriteTvShows: FavoriteTvShow[];
    avatar: string | null;
    banner: string | null;
    // NO usernameLastChanged / canChangeUsernameAt
    createdAt: Date;
  };
  reviewCount: number;
  mastery: MasteryInfo;
  isFollowedByMe?: boolean;
  isFriend?: boolean;  // true if mutual followers
  privacySettings: {
    mood: 'public' | 'friends' | 'private';
    library: 'public' | 'friends' | 'private';
    activity: 'public' | 'friends' | 'private';
    stats: 'public' | 'friends' | 'private';
  };
  moodVector?: MoodVector;  // Only if privacy allows
  // NO recommendationQuota
}

export class UserService {
  // Helper to check visibility
  private static canView(privacy: string, isFriend: boolean, isSelf: boolean): boolean {
    if (isSelf) return true;
    if (privacy === 'public') return true;
    if (privacy === 'friends' && isFriend) return true;
    return false;
  }
  static async getUserProfile(username: string, currentUserId?: string, lang?: string): Promise<PublicProfileResponse> {
    const user = await User.findOne({ username }).select('-password');

    if (!user) {
      throw new Error('User not found');
    }

    // Get stats from WatchedListService
    try {
      const { WatchedListService } = await import('./watched-list.service');
      const stats = await WatchedListService.getStats(user._id.toString());

      user.stats.moviesWatched = stats.totalMovies;
      user.stats.episodesWatched = stats.totalTvShows;
      user.stats.totalRuntime = stats.totalRuntime;
      await user.save();
    } catch (error) {
      console.error('Failed to update user stats:', error);
    }

    // Count reviews
    const reviewCount = await Activity.countDocuments({
      userId: user._id,
      type: 'review'
    });

    // Check if current user is following this profile and if they're friends
    let isFollowedByMe: boolean | undefined;
    let isFriend = false;
    if (currentUserId && currentUserId !== user._id.toString()) {
      const currentUser = await User.findById(currentUserId).select('following followers');
      if (currentUser) {
        isFollowedByMe = currentUser.following.some(
          (id) => id.toString() === user._id.toString()
        );
        // Check if mutual followers (friends)
        const profileFollowsMe = user.following.some(
          (id) => id.toString() === currentUserId
        );
        isFriend = isFollowedByMe === true && profileFollowsMe;
      }
    }

    const isSelf = currentUserId === user._id.toString();
    const privacy = user.privacySettings || {
      mood: 'public',
      library: 'public',
      activity: 'public',
      stats: 'public'
    };

    // Determine visibility based on privacy settings
    const canViewMood = this.canView(privacy.mood, isFriend, isSelf);
    const canViewStats = this.canView(privacy.stats, isFriend, isSelf);

    // Note: Library and Activity visibility will be handled by their respective services 
    // or frontend logic using the privacySettings returned here.

    // Build moodVector only if privacy allows
    const moodVector = canViewMood && user.moodProfile ? {
      adrenaline: user.moodProfile.adrenaline || 0,
      melancholy: user.moodProfile.melancholy || 0,
      joy: user.moodProfile.joy || 0,
      tension: user.moodProfile.tension || 0,
      intellect: user.moodProfile.intellect || 0,
      romance: user.moodProfile.romance || 0,
      wonder: user.moodProfile.wonder || 0,
      nostalgia: user.moodProfile.nostalgia || 0,
      darkness: user.moodProfile.darkness || 0,
      inspiration: user.moodProfile.inspiration || 0
    } : undefined;

    // Build PUBLIC response (no email, no quota, no canChangeUsernameAt)
    const response: PublicProfileResponse = {
      user: {
        id: user._id.toString(),
        username: user.username,
        name: user.name,
        // NO email in public profile
        stats: canViewStats ? user.stats : undefined,
        followersCount: user.followersCount,
        followingCount: user.followingCount,
        favoriteMovies: user.favoriteMovies,
        favoriteTvShows: user.favoriteTvShows,
        avatar: user.avatar,
        banner: user.banner,
        // NO usernameLastChanged / canChangeUsernameAt in public profile
        createdAt: user.createdAt
      },
      reviewCount,
      isFollowedByMe,
      isFriend,
      mastery: GamificationService.getLevelInfo(user.mastery.score),
      privacySettings: privacy,
      moodVector
      // NO recommendationQuota in public profile
    };

    if (lang) {
      const { MovieService } = await import('./movie.service');
      const movieItems = user.favoriteMovies.map(m => ({
        tmdbId: m.tmdbId,
        mediaType: 'movie' as const,
        title: m.title,
        posterPath: m.posterPath,
        releaseDate: m.releaseDate
      }));
      const tvItems = user.favoriteTvShows.map(s => ({
        tmdbId: s.tmdbId,
        mediaType: 'tv' as const,
        title: s.name,
        posterPath: s.posterPath,
        firstAirDate: s.firstAirDate
      }));

      const hydratedMovies = await MovieService.hydrateItems(movieItems, lang);
      const hydratedTvShows = await MovieService.hydrateItems(tvItems, lang);

      return {
        ...response,
        user: {
          ...response.user,
          favoriteMovies: hydratedMovies.map(m => ({
            tmdbId: m.tmdbId,
            title: m.title,
            posterPath: m.posterPath,
            releaseDate: m.releaseDate
          })),
          favoriteTvShows: hydratedTvShows.map(s => ({
            tmdbId: s.tmdbId,
            name: s.title,
            posterPath: s.posterPath,
            firstAirDate: s.firstAirDate
          }))
        }
      };
    }

    return response;
  }

  static async updatePrivacySettings(
    userId: string,
    settings: {
      mood?: 'public' | 'friends' | 'private';
      library?: 'public' | 'friends' | 'private';
      activity?: 'public' | 'friends' | 'private';
      stats?: 'public' | 'friends' | 'private';
    }
  ): Promise<{ success: boolean; message: string; privacySettings?: any }> {
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Initialize if missing
    if (!user.privacySettings) {
      user.privacySettings = {
        mood: 'public',
        library: 'public',
        activity: 'public',
        stats: 'public'
      };
    }

    // Update fields
    if (settings.mood) user.privacySettings.mood = settings.mood;
    if (settings.library) user.privacySettings.library = settings.library;
    if (settings.activity) user.privacySettings.activity = settings.activity;
    if (settings.stats) user.privacySettings.stats = settings.stats;

    await user.save();

    return {
      success: true,
      message: 'Privacy settings updated',
      privacySettings: user.privacySettings
    };
  }

  static async getCurrentUserProfile(userId: string, lang?: string): Promise<PrivateProfileResponse> {
    const user = await User.findById(userId).select('-password');

    if (!user) {
      throw new Error('User not found');
    }

    // Get stats from WatchedListService
    try {
      const { WatchedListService } = await import('./watched-list.service');
      const stats = await WatchedListService.getStats(user._id.toString());

      user.stats.moviesWatched = stats.totalMovies;
      user.stats.episodesWatched = stats.totalTvShows;
      user.stats.totalRuntime = stats.totalRuntime;
      await user.save();
    } catch (error) {
      console.error('Failed to update user stats:', error);
    }

    const reviewCount = await Activity.countDocuments({
      userId: user._id,
      type: 'review'
    });

    // Build PRIVATE response (includes email, quota, canChangeUsernameAt)
    const response: PrivateProfileResponse = {
      user: {
        id: user._id.toString(),
        username: user.username,
        name: user.name,
        email: user.email,
        stats: user.stats,
        followersCount: user.followersCount,
        followingCount: user.followingCount,
        favoriteMovies: user.favoriteMovies,
        favoriteTvShows: user.favoriteTvShows,
        avatar: user.avatar,
        banner: user.banner,
        usernameLastChanged: user.usernameLastChanged,
        canChangeUsernameAt: user.usernameLastChanged
          ? new Date(user.usernameLastChanged.getTime() + 30 * 24 * 60 * 60 * 1000)
          : null,
        createdAt: user.createdAt
      },
      reviewCount,
      mastery: GamificationService.getLevelInfo(user.mastery.score),
      recommendationQuota: {
        remaining: user.recommendationQuota?.remaining ?? 3,
        total: 3,
        lastResetDate: user.recommendationQuota?.lastResetDate ?? new Date()
      }
    };

    if (lang) {
      const { MovieService } = await import('./movie.service');
      const movieItems = user.favoriteMovies.map(m => ({
        tmdbId: m.tmdbId,
        mediaType: 'movie' as const,
        title: m.title,
        posterPath: m.posterPath,
        releaseDate: m.releaseDate
      }));
      const tvItems = user.favoriteTvShows.map(s => ({
        tmdbId: s.tmdbId,
        mediaType: 'tv' as const,
        title: s.name,
        posterPath: s.posterPath,
        firstAirDate: s.firstAirDate
      }));

      const hydratedMovies = await MovieService.hydrateItems(movieItems, lang);
      const hydratedTvShows = await MovieService.hydrateItems(tvItems, lang);

      return {
        ...response,
        user: {
          ...response.user,
          favoriteMovies: hydratedMovies.map(m => ({
            tmdbId: m.tmdbId,
            title: m.title,
            posterPath: m.posterPath,
            releaseDate: m.releaseDate
          })),
          favoriteTvShows: hydratedTvShows.map(s => ({
            tmdbId: s.tmdbId,
            name: s.title,
            posterPath: s.posterPath,
            firstAirDate: s.firstAirDate
          }))
        }
      };
    }

    return response;
  }
  static async searchUsers(query: string, page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;

    const users = await User.find({
      $or: [
        { username: { $regex: query, $options: 'i' } },
        { name: { $regex: query, $options: 'i' } }
      ]
    })
      .select('username name _id avatar')
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await User.countDocuments({
      $or: [
        { username: { $regex: query, $options: 'i' } },
        { name: { $regex: query, $options: 'i' } }
      ]
    });

    return {
      users: users.map((user: any) => ({
        id: user._id.toString(),
        username: user.username,
        name: user.name,
        avatar: user.avatar
      })),
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    };
  }

  static async updateStreak(userId: string): Promise<void> {
    const user = await User.findById(userId);
    if (!user) return;

    // Logic: Day starts at 00:00 Local Time (GMT+3).
    // We adjust the current time by adding 3 hours.
    // Then we compare the YYYY-MM-DD parts.
    const now = new Date();
    const threeHours = 3 * 60 * 60 * 1000;

    const getStreakDateString = (date: Date) => {
      const adjustedDate = new Date(date.getTime() + threeHours);
      return adjustedDate.toISOString().split('T')[0];
    };

    const currentStreakDate = getStreakDateString(now);

    let lastLoginStreakDate = null;
    if (user.streak && user.streak.lastLoginDate) {
      lastLoginStreakDate = getStreakDateString(user.streak.lastLoginDate);
    }

    // If already logged in "today" (streak-wise), do nothing
    if (lastLoginStreakDate === currentStreakDate) {
      return;
    }

    // Check if yesterday
    const yesterday = new Date(new Date().getTime() + threeHours);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStreakDate = yesterday.toISOString().split('T')[0];

    if (lastLoginStreakDate === yesterdayStreakDate) {
      // Consecutive day
      user.streak.current = (user.streak.current || 0) + 1;
    } else {
      // Missed a day or first time
      user.streak.current = 1;
    }

    user.streak.lastLoginDate = now;
    await user.save();
  }

  /**
   * Get friends (mutual followers) for a user
   */
  static async getFriends(userId: string): Promise<Array<{
    id: string;
    username: string;
    name: string;
  }>> {
    const user = await User.findById(userId)
      .select('following followers')
      .populate('following', 'username name')
      .populate('followers', 'username name');

    if (!user) {
      throw new Error('User not found');
    }

    const followingIds = new Set(user.following.map((f: any) => f._id.toString()));
    const followerIds = new Set(user.followers.map((f: any) => f._id.toString()));

    // Friends are mutual: in both following and followers
    const friends = (user.following as any[]).filter(
      (f: any) => followerIds.has(f._id.toString())
    );

    return friends.map((f: any) => ({
      id: f._id.toString(),
      username: f.username,
      name: f.name
    }));
  }

  /**
   * Get user's followers list
   */
  static async getFollowers(userId: string): Promise<Array<{
    id: string;
    username: string;
    name: string;
  }>> {
    const user = await User.findById(userId)
      .select('followers')
      .populate('followers', 'username name');

    if (!user) {
      throw new Error('User not found');
    }

    return (user.followers as any[]).map((f: any) => ({
      id: f._id.toString(),
      username: f.username,
      name: f.name
    }));
  }

  /**
   * Get user's following list
   */
  static async getFollowing(userId: string): Promise<Array<{
    id: string;
    username: string;
    name: string;
  }>> {
    const user = await User.findById(userId)
      .select('following')
      .populate('following', 'username name');

    if (!user) {
      throw new Error('User not found');
    }

    return (user.following as any[]).map((f: any) => ({
      id: f._id.toString(),
      username: f.username,
      name: f.name
    }));
  }

  /**
   * Follow a user
   */
  static async followUser(currentUserId: string, targetUserId: string): Promise<{ success: boolean; message: string }> {
    if (currentUserId === targetUserId) {
      throw new Error('You cannot follow yourself');
    }

    const [currentUser, targetUser] = await Promise.all([
      User.findById(currentUserId),
      User.findById(targetUserId)
    ]);

    if (!currentUser || !targetUser) {
      throw new Error('User not found');
    }

    // Check if already following
    const isAlreadyFollowing = currentUser.following.some(
      (id) => id.toString() === targetUserId
    );

    if (isAlreadyFollowing) {
      throw new Error('Already following this user');
    }

    // Add to following/followers
    currentUser.following.push(targetUser._id);
    currentUser.followingCount = (currentUser.followingCount || 0) + 1;

    targetUser.followers.push(currentUser._id);
    targetUser.followersCount = (targetUser.followersCount || 0) + 1;

    await Promise.all([currentUser.save(), targetUser.save()]);

    // Create notification and emit via WebSocket
    try {
      const { Notification } = await import('../models/notification.model');
      const { socketService } = await import('./socket.service');

      const notification = await Notification.create({
        userId: targetUser._id,
        type: 'follow',
        message: `@${currentUser.username} started to follow you`,
        fromUser: {
          id: currentUser._id,
          username: currentUser.username,
          name: currentUser.name
        }
      });

      // Emit real-time notification
      socketService.emitToUser(targetUserId, 'notification', {
        id: notification._id.toString(),
        type: 'follow',
        message: notification.message,
        fromUser: notification.fromUser,
        createdAt: notification.createdAt
      });
    } catch (error) {
      console.error('Failed to send notification:', error);
      // Don't fail the follow action if notification fails
    }

    return { success: true, message: 'Successfully followed user' };
  }

  /**
   * Unfollow a user
   */
  static async unfollowUser(currentUserId: string, targetUserId: string): Promise<{ success: boolean; message: string }> {
    if (currentUserId === targetUserId) {
      throw new Error('You cannot unfollow yourself');
    }

    const [currentUser, targetUser] = await Promise.all([
      User.findById(currentUserId),
      User.findById(targetUserId)
    ]);

    if (!currentUser || !targetUser) {
      throw new Error('User not found');
    }

    // Check if following
    const followingIndex = currentUser.following.findIndex(
      (id) => id.toString() === targetUserId
    );

    if (followingIndex === -1) {
      throw new Error('Not following this user');
    }

    // Remove from following/followers
    currentUser.following.splice(followingIndex, 1);
    currentUser.followingCount = Math.max((currentUser.followingCount || 1) - 1, 0);

    const followerIndex = targetUser.followers.findIndex(
      (id) => id.toString() === currentUserId
    );
    if (followerIndex !== -1) {
      targetUser.followers.splice(followerIndex, 1);
      targetUser.followersCount = Math.max((targetUser.followersCount || 1) - 1, 0);
    }

    await Promise.all([currentUser.save(), targetUser.save()]);

    return { success: true, message: 'Successfully unfollowed user' };
  }

  /**
   * Check if current user is following target user
   */
  static async isFollowing(currentUserId: string, targetUserId: string): Promise<boolean> {
    const currentUser = await User.findById(currentUserId).select('following');
    if (!currentUser) return false;

    return currentUser.following.some((id) => id.toString() === targetUserId);
  }

  /**
   * Remove a follower (kick someone from following you)
   */
  static async removeFollower(currentUserId: string, followerUserId: string): Promise<{ success: boolean; message: string }> {
    if (currentUserId === followerUserId) {
      throw new Error('Invalid operation');
    }

    const [currentUser, followerUser] = await Promise.all([
      User.findById(currentUserId),
      User.findById(followerUserId)
    ]);

    if (!currentUser || !followerUser) {
      throw new Error('User not found');
    }

    // Remove from current user's followers
    const followerIndex = currentUser.followers.findIndex(
      (id) => id.toString() === followerUserId
    );

    if (followerIndex === -1) {
      throw new Error('User is not following you');
    }

    currentUser.followers.splice(followerIndex, 1);
    currentUser.followersCount = Math.max((currentUser.followersCount || 1) - 1, 0);

    // Remove from follower's following list
    const followingIndex = followerUser.following.findIndex(
      (id) => id.toString() === currentUserId
    );
    if (followingIndex !== -1) {
      followerUser.following.splice(followingIndex, 1);
      followerUser.followingCount = Math.max((followerUser.followingCount || 1) - 1, 0);
    }

    await Promise.all([currentUser.save(), followerUser.save()]);

    return { success: true, message: 'Successfully removed follower' };
  }

  /**
   * Update user profile
   */
  static async updateProfile(
    userId: string,
    data: { name?: string; avatar?: string; banner?: string; username?: string },
    files?: { [fieldname: string]: Express.Multer.File[] }
  ): Promise<{ success: boolean; message: string; canChangeUsernameAt?: Date }> {
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Handle username update with 30-day restriction
    if (data.username !== undefined && data.username !== user.username) {
      // Check if username is already taken
      const existingUser = await User.findOne({ username: data.username, _id: { $ne: userId } });
      if (existingUser) {
        throw new Error('Username is already taken');
      }

      // Check 30-day restriction
      if (user.usernameLastChanged) {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        if (user.usernameLastChanged > thirtyDaysAgo) {
          const canChangeAt = new Date(user.usernameLastChanged.getTime() + 30 * 24 * 60 * 60 * 1000);
          return {
            success: false,
            message: `You can change your username again on ${canChangeAt.toLocaleDateString()}`,
            canChangeUsernameAt: canChangeAt
          };
        }
      }

      user.username = data.username;
      user.usernameLastChanged = new Date();
    }

    // Handle name update
    if (data.name !== undefined) {
      user.name = data.name;
    }

    // Handle avatar update
    if (files && files['avatar'] && files['avatar'][0]) {
      const compressedBuffer = await sharp(files['avatar'][0].buffer)
        .resize(300, 300, { fit: 'cover' })
        .webp({ quality: 70 })
        .toBuffer();
      user.avatar = `data:image/webp;base64,${compressedBuffer.toString('base64')}`;
    }

    // Handle banner update
    if (files && files['banner'] && files['banner'][0]) {
      const compressedBuffer = await sharp(files['banner'][0].buffer)
        .resize(1200, 350, { fit: 'cover' })
        .webp({ quality: 80 })
        .toBuffer();
      user.banner = `data:image/webp;base64,${compressedBuffer.toString('base64')}`;
    }

    if (data.avatar !== undefined && !files) {
      user.avatar = data.avatar;
    }

    await user.save();

    return { success: true, message: 'Profile updated successfully' };
  }

  /**
   * Permanently delete user account and all associated data
   */
  static async deleteAccount(userId: string): Promise<{ success: boolean; message: string }> {
    const mongoose = await import('mongoose');
    const { Comment } = await import('../models/comment.model');
    const { Watchlist } = await import('../models/watchlist.model');
    const { WatchedList } = await import('../models/watched-list.model');
    const { UserStats } = await import('../models/user-stats.model');

    const session = await mongoose.default.startSession();
    session.startTransaction();

    try {
      // 1. Delete Primary Data
      await User.findByIdAndDelete(userId).session(session);
      await UserStats.findOneAndDelete({ userId }).session(session);

      // 2. Cascade Delete Content
      await Activity.deleteMany({ userId }).session(session);
      await Comment.deleteMany({ userId }).session(session);
      await Watchlist.deleteMany({ userId }).session(session);
      await WatchedList.findOneAndDelete({ userId }).session(session);

      // 3. Clean Up References
      // Remove from followers/following of other users
      await User.updateMany(
        {},
        { $pull: { followers: userId, following: userId } }
      ).session(session);

      // Remove from likes/dislikes on Activities
      await Activity.updateMany(
        {},
        { $pull: { likes: userId, dislikes: userId } }
      ).session(session);

      // Remove from likes/dislikes on Comments
      await Comment.updateMany(
        {},
        { $pull: { likes: userId, dislikes: userId } }
      ).session(session);

      await session.commitTransaction();
      return { success: true, message: 'Account permanently deleted' };
    } catch (error) {
      await session.abortTransaction();
      console.error('Account deletion failed:', error);
      throw error;
    } finally {
      session.endSession();
    }
  }
}

