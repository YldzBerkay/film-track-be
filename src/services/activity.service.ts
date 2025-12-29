import { Activity, IActivity } from '../models/activity.model';
import { User } from '../models/user.model';
import { MoodService } from './mood.service';

interface CreateActivityData {
  userId: string;
  type: 'movie_watched' | 'tv_episode_watched' | 'tv_show_watched' | 'review' | 'rating';
  mediaType: 'movie' | 'tv_show' | 'tv_episode';
  tmdbId: number;
  mediaTitle: string;
  mediaPosterPath?: string | null;
  seasonNumber?: number;
  episodeNumber?: number;
  episodeTitle?: string;
  rating?: number;
  reviewText?: string;
  isSpoiler?: boolean;
  genres?: string[];
}

interface FeedQuery {
  userId: string;
  feedType?: 'following' | 'friends' | 'global';
  page?: number;
  limit?: number;
}

export class ActivityService {
  static async createActivity(data: CreateActivityData): Promise<IActivity> {
    const activity = new Activity(data);
    await activity.save();

    // Update user stats
    if (data.type === 'movie_watched') {
      await User.findByIdAndUpdate(data.userId, {
        $inc: { 'stats.moviesWatched': 1 }
      });
    } else if (data.type === 'tv_episode_watched') {
      await User.findByIdAndUpdate(data.userId, {
        $inc: { 'stats.episodesWatched': 1 }
      });
    }

    // Update user mood asynchronously (don't wait for it)
    MoodService.updateUserMood(data.userId).catch((error) => {
      console.error('Failed to update user mood:', error);
    });

    return activity;
  }

  static async getFeed(query: FeedQuery) {
    const { userId, feedType = 'following', page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    let userIds: string[] = [];

    if (feedType === 'following') {
      // Get following list (will be implemented later)
      // For now, return user's own activities + following activities
      const user = await User.findById(userId).select('following');
      userIds = [userId, ...(user?.following?.map(f => f.toString()) || [])];
    } else if (feedType === 'friends') {
      // Get friends list (mutual follows)
      const user = await User.findById(userId).select('following followers');

      if (user && user.following && user.followers) {
        // Convert ObjectIds to strings for comparison
        const followingIds = user.following.map(id => id.toString());
        const followerIds = new Set(user.followers.map(id => id.toString()));

        // Find mutual follows
        const friendIds = followingIds.filter(id => followerIds.has(id));

        // Include user's own activities + friends
        userIds = [userId, ...friendIds];
      } else {
        userIds = [userId];
      }
    } else {
      // Global feed - all users
      userIds = [];
    }

    const filter: any = {};
    if (userIds.length > 0) {
      filter.userId = { $in: userIds };
    }

    const activities = await Activity.find(filter)
      .populate('userId', 'username name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await Activity.countDocuments(filter);

    return {
      activities,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  static async getUserActivities(userId: string, page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;

    const activities = await Activity.find({ userId })
      .populate('userId', 'username name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await Activity.countDocuments({ userId });

    return {
      activities,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  static async likeActivity(activityId: string, userId: string): Promise<IActivity | null> {
    return Activity.findByIdAndUpdate(
      activityId,
      { $addToSet: { likes: userId } },
      { new: true }
    ).populate('userId', 'username name');
  }

  static async unlikeActivity(activityId: string, userId: string): Promise<IActivity | null> {
    return Activity.findByIdAndUpdate(
      activityId,
      { $pull: { likes: userId } },
      { new: true }
    ).populate('userId', 'username name');
  }

  static async addComment(activityId: string, userId: string, text: string): Promise<IActivity | null> {
    return Activity.findByIdAndUpdate(
      activityId,
      {
        $push: {
          comments: {
            userId,
            text,
            createdAt: new Date()
          }
        }
      },
      { new: true }
    )
      .populate('userId', 'username name')
      .populate('comments.userId', 'username name');
  }
}

