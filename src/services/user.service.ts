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
}

