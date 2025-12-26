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
}

export class UserService {
  static async getUserProfile(username: string): Promise<UserProfileResponse> {
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
}

