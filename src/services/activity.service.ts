import mongoose from 'mongoose';
import { Activity, IActivity } from '../models/activity.model';
import { Comment } from '../models/comment.model';
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
  isMoodPick?: boolean;
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

  static async createSystemActivity(userId: string, title: string, text: string): Promise<IActivity> {
    const activity = new Activity({
      userId,
      type: 'system',
      mediaType: 'movie', // Placeholder
      tmdbId: 0, // Placeholder
      mediaTitle: title,
      reviewText: text,
      isSpoiler: false,
      isMoodPick: false,
      genres: []
    });

    await activity.save();
    return activity;
  }

  static async getFeed(query: FeedQuery) {
    const { userId, feedType = 'following', page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    // 1. Fetch Requesting User (for Friends/Following logic & Personalization)
    const user = await User.findById(userId).select('following followers moodProfile');
    if (!user) {
      throw new Error('User not found');
    }

    // 2. Determine Filter Criteria (Target Users)
    let matchStage: any = {};
    let isGlobal = false;

    if (feedType === 'following') {
      // Activities from User + Following
      const followingIds = (user.following || []).map(id => new mongoose.Types.ObjectId(id as any));
      matchStage = {
        userId: { $in: [new mongoose.Types.ObjectId(userId), ...followingIds] }
      };
    }
    else if (feedType === 'friends') {
      // Activities from Mutual Follows + User
      // "Friends" = Users I follow AND who follow me back
      const followingIdsStr = (user.following || []).map(id => id.toString());
      const followerIdsSet = new Set((user.followers || []).map(id => id.toString()));

      const mutualFriendIds = followingIdsStr
        .filter(id => followerIdsSet.has(id))
        .map(id => new mongoose.Types.ObjectId(id));

      matchStage = {
        userId: { $in: [new mongoose.Types.ObjectId(userId), ...mutualFriendIds] }
      };
    }
    else if (feedType === 'global') {
      isGlobal = true;
      // Discovery Mode: Exclude User & Following
      const followingIds = (user.following || []).map(id => new mongoose.Types.ObjectId(id as any));
      const excludedIds = [new mongoose.Types.ObjectId(userId), ...followingIds];

      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      matchStage = {
        userId: { $nin: excludedIds },
        createdAt: { $gte: sevenDaysAgo } // Velocity Check: Keep it fresh
      };
    }
    else if (feedType === 'community') {
      // Placeholder for future community features
      // matchStage = { communityId: ... }
      return { activities: [], pagination: { page, limit, total: 0, pages: 0 } };
    }

    // 3. Define Pipeline Variables
    // Base Scores: The "Signal" Weight
    const scoreMap = {
      review: 50,
      comment: 30,
      rating: 10,
      movie_watched: 5,
      tv_episode_watched: 5,
      tv_show_watched: 5,
      bulk_import: 1,
      system: 0
    };

    // Personalization: Get Top 3 Genres from User Mood Profile
    // (Assuming moodProfile maps somewhat to genres, or we use a placeholder logic if genres aren't direct)
    // For now, let's assume we map mood keys (e.g., 'adrenaline') to genres (e.g., 'Action').
    // Since strict genre mapping might be complex, we'll assume the user might have a `favoriteGenres` field or we skip strict genre matching 
    // and rely on the general "Hot" formula. 
    // *Correction*: The prompt asked to "Boost score if activity.genres matches user.moodProfile.topGenres".
    // I entered 'genres' in the `CreateActivityData` interface, so activities have it.
    // I will extract top 2 moods and map them to standard TMDB genres roughly for the boost.

    // Simple Mapping for demonstration (Expand as needed)
    const moodGenreMap: Record<string, string[]> = {
      adrenaline: ['Action', 'Adventure', 'Thriller'],
      melancholy: ['Drama', 'Tragedy'],
      joy: ['Comedy', 'Family', 'Animation'],
      tension: ['Horror', 'Mystery', 'Crime'],
      intellect: ['Documentary', 'History', 'Science Fiction'],
      romance: ['Romance'],
      wonder: ['Fantasy', 'Science Fiction'],
      nostalgia: ['Classic', 'History'],
      darkness: ['Horror', 'Crime'],
      inspiration: ['Biography', 'Documentary', 'Music']
    };

    // Identify user's top mood
    let userTopGenres: string[] = [];
    if (user.moodProfile) {
      const topMood = Object.entries(user.moodProfile)
        .sort(([, a], [, b]) => (b as number) - (a as number))[0]; // Get highest mood

      if (topMood) {
        userTopGenres = moodGenreMap[topMood[0]] || [];
      }
    }

    // 4. Build Aggregation Pipeline
    const pipeline: any[] = [
      // Stage 1: Filter Core Set
      { $match: matchStage },

      // Stage 2: Calculate Scores & Transformation
      {
        $addFields: {
          // 2.1 Calculate Hours Since Creation (Time Decay base)
          hoursSince: {
            $divide: [{ $subtract: [new Date(), "$createdAt"] }, 1000 * 60 * 60]
          },

          // 2.2 Assign Base Score
          baseScore: {
            $switch: {
              branches: [
                { case: { $eq: ["$type", "review"] }, then: 50 },
                { case: { $eq: ["$type", "comment"] }, then: 30 },
                { case: { $eq: ["$type", "rating"] }, then: 10 },
                { case: { $eq: ["$type", "movie_watched"] }, then: 5 },
                { case: { $eq: ["$type", "tv_episode_watched"] }, then: 5 },
                { case: { $eq: ["$type", "tv_show_watched"] }, then: 5 },
                { case: { $eq: ["$type", "bulk_import"] }, then: 1 }
              ],
              default: 0
            }
          },

          // 2.3 Calculate Engagement Score
          engagementScore: {
            $add: [
              { $multiply: [{ $ifNull: ["$likesCount", 0] }, 2] },
              { $multiply: [{ $ifNull: ["$commentCount", 0] }, 4] }
            ]
          },

          // 2.4 Personalization Boost (Global Feed Only)
          personalizationBoost: isGlobal ? {
            $cond: {
              if: { $gt: [{ $size: { $setIntersection: ["$genres", userTopGenres] } }, 0] },
              then: 20, // Bonus points for genre match
              else: 0
            }
          } : 0
        }
      },

      // Stage 3: Calculate Final Ranking Score
      // Formula: (Base + Engagement + Personalization) / (Hours + 2)^1.5
      {
        $addFields: {
          rankingScore: {
            $divide: [
              { $add: ["$baseScore", "$engagementScore", "$personalizationBoost"] },
              { $pow: [{ $add: ["$hoursSince", 2] }, 1.5] }
            ]
          }
        }
      },

      // Stage 4: Anti-Spam Grouping (Bulk Imports)
      // Group contiguous bulk imports by the same user within the same hour
      {
        $group: {
          _id: {
            // If it's a bulk import, group by User + Hour + Type. 
            // Otherwise, keep unique ID (no grouping).
            key: {
              $cond: {
                if: { $eq: ["$type", "bulk_import"] },
                then: {
                  u: "$userId",
                  h: { $hour: "$createdAt" },
                  d: { $dayOfYear: "$createdAt" }, // Include day to avoid hour collisions across days
                  y: { $year: "$createdAt" },
                  t: "bulk_import"
                },
                else: "$_id"
              }
            }
          },
          // Accumulate fields
          doc: { $first: "$$ROOT" }, // Keep the first document as the "Main" one
          count: { $sum: 1 },         // Count items in this group
          aggregatedMedia: {
            // Collect titles for the summary card
            $push: {
              title: "$mediaTitle",
              poster: "$mediaPosterPath",
              id: "$tmdbId"
            }
          }
        }
      },

      // Stage 5: Restore Document Structure & Finalize
      {
        $addFields: {
          // If grouped (count > 1), update the document to look like a summary
          // We override the 'doc' fields with summary info
          "doc.mediaTitle": {
            $cond: {
              if: { $gt: ["$count", 1] },
              then: { $concat: ["Imported ", { $toString: "$count" }, " titles"] },
              else: "$doc.mediaTitle"
            }
          },
          // We can attach the list of imported items to a new field if needed
          "doc.groupedActivities": {
            $cond: {
              if: { $gt: ["$count", 1] },
              then: "$aggregatedMedia",
              else: "$$REMOVE"
            }
          },
          // Fix ID: Grouping changes _id. Restore original _id for non-grouped, or generate new one.
          // For simplicity, we keep the doc._id which is the _id of the first item in the group.
          "_id": "$doc._id",
          "rankingScore": "$doc.rankingScore", // Keep the score of the representative item
          "createdAt": "$doc.createdAt"
        }
      },

      // Stage 6: Sort by Smart Ranking
      { $sort: { rankingScore: -1 } },

      // Stage 7: Pagination
      {
        $facet: {
          metadata: [{ $count: "total" }],
          data: [
            { $skip: skip },
            { $limit: limit },
            // Stage 8: Join User Details (Population replacement)
            {
              $lookup: {
                from: "users",
                localField: "doc.userId",
                foreignField: "_id",
                as: "user"
              }
            },
            { $unwind: "$user" }, // Flatten array

            // Join Comments Authors (Nested Lookup is tricky in Aggregation, simplified for now)
            // We will map the structure to match frontend expectations
            {
              $project: {
                _id: "$doc._id",
                type: "$doc.type",
                mediaType: "$doc.mediaType",
                tmdbId: "$doc.tmdbId",
                mediaTitle: "$doc.mediaTitle", // This might be "Imported X titles" now
                mediaPosterPath: "$doc.mediaPosterPath",
                seasonNumber: "$doc.seasonNumber",
                episodeNumber: "$doc.episodeNumber",
                episodeTitle: "$doc.episodeTitle",
                rating: "$doc.rating",
                reviewText: "$doc.reviewText",
                isSpoiler: "$doc.isSpoiler",
                isMoodPick: "$doc.isMoodPick",
                genres: "$doc.genres",
                createdAt: "$doc.createdAt",
                updatedAt: "$doc.updatedAt",
                likes: "$doc.likes",
                likesCount: "$doc.likesCount",
                dislikesCount: "$doc.dislikesCount",
                commentCount: "$doc.commentCount",
                groupedActivities: "$doc.groupedActivities", // Pass the grouped list
                userId: {
                  _id: "$user._id",
                  username: "$user.username",
                  name: "$user.name",
                  avatar: "$user.avatar",
                  mastery: "$user.mastery"
                },
                rankingScore: 1, // Debug info
                // Map legacy fields if necessary
              }
            }
          ]
        }
      }
    ];

    const result = await Activity.aggregate(pipeline);

    // Format Result
    const data = result[0].data;
    const total = result[0].metadata[0] ? result[0].metadata[0].total : 0;

    return {
      activities: data,
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

    // COMMENTS filter: Query Comment collection directly
    if (filterStr === 'COMMENTS') {
      const comments = await Comment.find({ userId })
        .populate('userId', 'username name mastery avatar')
        .populate({
          path: 'activityId',
          select: 'mediaTitle mediaPosterPath tmdbId mediaType type'
        })
        .populate('parentId', 'text userId')
        .populate('replyToUser', 'username name avatar')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean();

      const total = await Comment.countDocuments({ userId });

      // Transform comments into virtual activity objects
      const virtualActivities = comments.map((comment: any) => ({
        _id: comment._id,
        type: 'comment',
        userId: comment.userId,
        mediaTitle: comment.activityId?.mediaTitle || 'Unknown',
        mediaPosterPath: comment.activityId?.mediaPosterPath || null,
        tmdbId: comment.activityId?.tmdbId,
        mediaType: comment.activityId?.mediaType,
        originalActivityType: comment.activityId?.type,
        activityId: comment.activityId,
        commentText: comment.text,
        parentId: comment.parentId?._id || null,
        parentCommentText: comment.parentId?.text || null,
        replyToUser: comment.replyToUser || null,
        createdAt: comment.createdAt,
        likesCount: comment.likesCount || 0,
        dislikesCount: comment.dislikesCount || 0
      }));

      return {
        activities: virtualActivities,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / Number(limit))
        }
      };
    }

    // ALL filter: Merge activities and comments
    if (filterStr === 'ALL') {
      // Get activities (reviews, ratings, imports)
      const activitiesPromise = Activity.find({
        userId,
        type: { $in: ['review', 'rating', 'bulk_import'] }
      })
        .populate('userId', 'username name mastery avatar')
        .sort({ createdAt: -1 })
        .lean();

      // Get comments
      const commentsPromise = Comment.find({ userId })
        .populate('userId', 'username name mastery avatar')
        .populate({
          path: 'activityId',
          select: 'mediaTitle mediaPosterPath tmdbId mediaType type'
        })
        .populate('parentId', 'text userId')
        .populate('replyToUser', 'username name avatar')
        .sort({ createdAt: -1 })
        .lean();

      const [activities, comments] = await Promise.all([activitiesPromise, commentsPromise]);

      // Transform comments into virtual activities
      const virtualComments = comments.map((comment: any) => ({
        _id: comment._id,
        type: 'comment',
        userId: comment.userId,
        mediaTitle: comment.activityId?.mediaTitle || 'Unknown',
        mediaPosterPath: comment.activityId?.mediaPosterPath || null,
        tmdbId: comment.activityId?.tmdbId,
        mediaType: comment.activityId?.mediaType,
        originalActivityType: comment.activityId?.type,
        activityId: comment.activityId, // Added activityId
        commentText: comment.text,
        parentId: comment.parentId?._id || null,
        parentCommentText: comment.parentId?.text || null,
        replyToUser: comment.replyToUser || null,
        createdAt: comment.createdAt,
        likesCount: comment.likesCount || 0,
        dislikesCount: comment.dislikesCount || 0
      }));

      // Merge and sort by createdAt
      const merged = [...activities, ...virtualComments].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

      // Paginate the merged result
      const paginatedResult = merged.slice(skip, skip + limit);
      const total = merged.length;

      return {
        activities: paginatedResult,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / Number(limit))
        }
      };
    }

    // Other filters (REVIEWS, RATINGS, IMPORTS)
    let query: any = { userId };
    if (filterStr === 'REVIEWS') {
      query.type = 'review';
    } else if (filterStr === 'RATINGS') {
      query.type = 'rating';
    } else if (filterStr === 'IMPORTS') {
      query.type = 'bulk_import';
    }

    const activities = await Activity.find(query)
      .populate('userId', 'username name mastery avatar')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await Activity.countDocuments(query);

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

      // If it is a mood pick, ensure that is set
      if (data.isMoodPick) {
        existingActivity.isMoodPick = true;
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
    // 1. Create Comment document (for Profile and Notifications)
    const { Comment } = await import('../models/comment.model'); // Dynamic import

    const comment = await Comment.create({
      text,
      userId,
      activityId,
      createdAt: new Date()
    });

    // 2. Update Activity (embedded comments for Feed performance)
    return Activity.findByIdAndUpdate(
      activityId,
      {
        $push: {
          comments: {
            _id: comment._id, // Sync ID
            userId,
            text,
            createdAt: comment.createdAt
          }
        },
        $inc: { commentCount: 1 } // Increment count - Use $inc for atomicity
      },
      { new: true }
    )
      .populate('userId', 'username name')
      .populate('comments.userId', 'username name');
  }

  static async getActivityById(activityId: string) {
    return Activity.findById(activityId)
      .populate('userId', 'username name mastery avatar')
      .lean();
  }

  /**
   * Toggle bookmark (save/unsave) an activity for a user
   */
  static async toggleBookmark(activityId: string, userId: string): Promise<{ bookmarked: boolean } | null> {
    // Check if activity exists
    const activity = await Activity.findById(activityId);
    if (!activity) {
      return null;
    }

    const user = await User.findById(userId);
    if (!user) {
      return null;
    }

    const savedActivities = user.savedActivities || [];
    const isCurrentlySaved = savedActivities.some(id => id.toString() === activityId);

    if (isCurrentlySaved) {
      // Remove from saved
      await User.findByIdAndUpdate(userId, {
        $pull: { savedActivities: activityId }
      });
      return { bookmarked: false };
    } else {
      // Add to saved
      await User.findByIdAndUpdate(userId, {
        $addToSet: { savedActivities: activityId }
      });
      return { bookmarked: true };
    }
  }

  /**
   * Get all saved/bookmarked activities for a user
   */
  static async getSavedActivities(userId: string, page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;

    const user = await User.findById(userId)
      .select('savedActivities')
      .lean();

    if (!user || !user.savedActivities || user.savedActivities.length === 0) {
      return {
        activities: [],
        pagination: {
          page,
          limit,
          total: 0,
          pages: 0
        }
      };
    }

    const total = user.savedActivities.length;

    // Get the saved activities with pagination
    const activityIds = user.savedActivities.slice(skip, skip + limit);

    const activities = await Activity.find({ _id: { $in: activityIds } })
      .populate('userId', 'username name mastery avatar')
      .sort({ createdAt: -1 })
      .lean();

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

  /**
   * Get all activities liked by a specific user
   */
  static async getUserLikedActivities(userId: string, page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;

    // Find activities where the user's ID is in the likes array
    const activities = await Activity.find({ likes: userId })
      .populate('userId', 'username name mastery avatar')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await Activity.countDocuments({ likes: userId });

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
}

