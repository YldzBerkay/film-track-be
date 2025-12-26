import { User, IUser } from '../models/user.model';
import { Activity } from '../models/activity.model';

interface UserProfileResponse {
  user: {
    id: string;
    username: string;
    nickname: string;
    email: string;
    stats: {
      moviesWatched: number;
      episodesWatched: number;
    };
    followersCount: number;
    followingCount: number;
    favoriteMovies: Array<{
      tmdbId: number;
      title: string;
      posterPath: string;
      releaseDate: string;
    }>;
    favoriteTvShows: Array<{
      tmdbId: number;
      name: string;
      posterPath: string;
      firstAirDate: string;
    }>;
    createdAt: Date;
  };
  recentActivities: any[];
  reviewCount: number;
  isFollowedByMe?: boolean;
}

export class UserService {
  static async getUserProfile(username: string, currentUserId?: string): Promise<UserProfileResponse> {
    const user = await User.findOne({ username }).select('-password');

    if (!user) {
      throw new Error('User not found');
    }

    // Get recent activities (last 10)
    const recentActivities = await Activity.find({ userId: user._id })
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    // Count reviews
    const reviewCount = await Activity.countDocuments({
      userId: user._id,
      type: 'review'
    });

    // Check if current user is following this profile
    let isFollowedByMe: boolean | undefined;
    if (currentUserId && currentUserId !== user._id.toString()) {
      const currentUser = await User.findById(currentUserId).select('following');
      if (currentUser) {
        isFollowedByMe = currentUser.following.some(
          (id) => id.toString() === user._id.toString()
        );
      }
    }

    return {
      user: {
        id: user._id.toString(),
        username: user.username,
        nickname: user.nickname,
        email: user.email,
        stats: user.stats,
        followersCount: user.followersCount,
        followingCount: user.followingCount,
        favoriteMovies: user.favoriteMovies,
        favoriteTvShows: user.favoriteTvShows,
        createdAt: user.createdAt
      },
      recentActivities,
      reviewCount,
      isFollowedByMe
    };
  }

  static async getCurrentUserProfile(userId: string): Promise<UserProfileResponse> {
    const user = await User.findById(userId).select('-password');

    if (!user) {
      throw new Error('User not found');
    }

    const recentActivities = await Activity.find({ userId: user._id })
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    const reviewCount = await Activity.countDocuments({
      userId: user._id,
      type: 'review'
    });

    return {
      user: {
        id: user._id.toString(),
        username: user.username,
        nickname: user.nickname,
        email: user.email,
        stats: user.stats,
        followersCount: user.followersCount,
        followingCount: user.followingCount,
        favoriteMovies: user.favoriteMovies,
        favoriteTvShows: user.favoriteTvShows,
        createdAt: user.createdAt
      },
      recentActivities,
      reviewCount
    };
  }
  static async searchUsers(query: string, page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;

    const users = await User.find({
      $or: [
        { username: { $regex: query, $options: 'i' } },
        { nickname: { $regex: query, $options: 'i' } }
      ]
    })
      .select('username nickname _id posterPath') // Basic info for search results
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await User.countDocuments({
      $or: [
        { username: { $regex: query, $options: 'i' } },
        { nickname: { $regex: query, $options: 'i' } }
      ]
    });

    return {
      users: users.map(user => ({
        id: user._id.toString(),
        username: user.username,
        nickname: user.nickname,
        avatar: null // Placeholder, add avatar field to User model if needed
      })),
    }
  };

  static async updateStreak(userId: string): Promise<void> {
    const user = await User.findById(userId);
    if (!user) return;

    // Logic: Day starts at 03:00 GMT.
    // We adjust the current time by subtracting 3 hours.
    // Then we compare the YYYY-MM-DD parts.
    const now = new Date();
    const threeHours = 3 * 60 * 60 * 1000;

    const getStreakDateString = (date: Date) => {
      const adjustedDate = new Date(date.getTime() - threeHours);
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
    const yesterday = new Date(new Date().getTime() - threeHours);
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
    nickname: string;
  }>> {
    const user = await User.findById(userId)
      .select('following followers')
      .populate('following', 'username nickname')
      .populate('followers', 'username nickname');

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
      nickname: f.nickname
    }));
  }

  /**
   * Get user's followers list
   */
  static async getFollowers(userId: string): Promise<Array<{
    id: string;
    username: string;
    nickname: string;
  }>> {
    const user = await User.findById(userId)
      .select('followers')
      .populate('followers', 'username nickname');

    if (!user) {
      throw new Error('User not found');
    }

    return (user.followers as any[]).map((f: any) => ({
      id: f._id.toString(),
      username: f.username,
      nickname: f.nickname
    }));
  }

  /**
   * Get user's following list
   */
  static async getFollowing(userId: string): Promise<Array<{
    id: string;
    username: string;
    nickname: string;
  }>> {
    const user = await User.findById(userId)
      .select('following')
      .populate('following', 'username nickname');

    if (!user) {
      throw new Error('User not found');
    }

    return (user.following as any[]).map((f: any) => ({
      id: f._id.toString(),
      username: f.username,
      nickname: f.nickname
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
        message: `@${currentUser.nickname || currentUser.username} started to follow you`,
        fromUser: {
          id: currentUser._id,
          username: currentUser.username,
          nickname: currentUser.nickname
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
}

