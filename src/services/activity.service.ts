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
      .populate('userId', 'username name mastery')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await Activity.countDocuments(filter);

    return {
      activities,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit))
      }
    };
  }

  static async getUserActivities(userId: string, filterStr: string = 'ALL', page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;
    let query: any = { userId };

    // Handle Filters
    if (filterStr === 'REVIEWS') {
      query.type = 'review';
    } else if (filterStr === 'RATINGS') {
      query.type = 'rating';
    } else if (filterStr === 'IMPORTS') {
      query.type = 'bulk_import';
    } else if (filterStr === 'COMMENTS') {
      // Special case: Find activities where the user has commented
      // We overwrite the userId filter because we want activities (possibly by others) 
      // where THIS user commented.
      delete query.userId; // Remove "activity owner" constraint
      query['comments.userId'] = userId;
    }

    const activities = await Activity.find(query)
      .populate('userId', 'username name mastery')
      .populate('comments.userId', 'username name') // Populate comment authors
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await Activity.countDocuments(query);

    // Transformation for 'COMMENTS' filter
    // If we are filtering comments, we probably want to return the COMMENT itself as the main item,
    // or return the activity but indicating it's because of a comment.
    // The requirement says "Return only type === 'COMMENT'".
    // We can map the result to a "virtual" activity type 'COMMENT' for the frontend.

    let processedActivities: any[] = activities;

    if (filterStr === 'COMMENTS') {
      processedActivities = activities.flatMap(activity => {
        // Find the comments by this user
        const userComments = activity.comments?.filter((c: any) => c.userId._id.toString() === userId || c.userId.toString() === userId) || [];

        // Create a virtual activity for each comment
        return userComments.map((comment: any) => ({
          ...activity,
          _id: comment._id || activity._id, // Use comment ID if available or fallback
          type: 'comment', // Virtual type
          originalActivityType: activity.type,
          commentText: comment.text,
          commentCreatedAt: comment.createdAt,
          createdAt: comment.createdAt // Use comment time for sorting in feed logic if needed
        }));
      });

      // Since we did client-side expansion (flatMap), we need to re-slice for pagination if we want precise control,
      // but simplistic approach: standard pagination on PARENTS is usually acceptable, 
      // or we accept that one page might result in >20 items if user commented multiple times on same post.
    }

    return {
      activities: processedActivities,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit))
      }
    };
  }

  /**
   * Create an activity for a rating or review
   * Handles deduplication by checking for recent similar activities
   */
  static async createActivityForRating(data: CreateActivityData): Promise<IActivity> {
    // Check if there's a recent activity (last 24h) for same media and user to avoid spam
    // If so, update it instead of creating new
    const oneDayAgo = new Date();
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);

    const existingActivity = await Activity.findOne({
      userId: data.userId,
      tmdbId: data.tmdbId,
      mediaType: data.mediaType,
      type: { $in: ['rating', 'review'] },
      createdAt: { $gte: oneDayAgo }
    });

    if (existingActivity) {
      // Update existing activity
      existingActivity.rating = data.rating;

      // If adding a review to existing rating, upgrade type to 'review'
      if (data.reviewText) {
        existingActivity.reviewText = data.reviewText;
        existingActivity.type = 'review';
      }

      // Bump timestamp to bring it to top of feed? maybe not, keep original time
      // existingActivity.createdAt = new Date(); 

      await existingActivity.save();

      // Update mood (async)
      MoodService.updateUserMood(data.userId).catch(console.error);

      return existingActivity;
    }

    // Create new activity
    // Determine type: 'review' if text present, else 'rating'
    const finalType = data.reviewText ? 'review' : 'rating';

    return this.createActivity({
      ...data,
      type: finalType as any
    });
  }

  /**
   * Get activities (reviews/ratings) for specific media
   */
  static async getMediaActivities(mediaType: string, tmdbId: number, page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;

    const filter = {
      mediaType,
      tmdbId,
      type: { $in: ['review', 'rating', 'movie_watched', 'tv_show_watched'] },
      // Only show items with reviews or high ratings? 
      // Requirement says "display reviews". So let's prioritize reviews.
    };

    const activities = await Activity.find(filter)
      .populate('userId', 'username name avatar mastery')
      .sort({ createdAt: -1 }) // Newest first
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
        pages: Math.ceil(total / limit)
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

