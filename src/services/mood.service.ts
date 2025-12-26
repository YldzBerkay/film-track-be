import { UserStats } from '../models/user-stats.model';
import { Activity } from '../models/activity.model';
import { Movie } from '../models/movie.model';
import { AIService } from './ai.service';

export interface MoodVector {
  adrenaline: number;
  melancholy: number;
  joy: number;
  tension: number;
  intellect: number;
}

interface ActivityWithMood {
  activity: any;
  moodVector: MoodVector;
  userRating: number;
  timeDecay: number;
}

export class MoodService {
  private static readonly TIME_DECAY_DAYS = 30;
  private static readonly MAX_DAYS = 365;

  /**
   * Calculate time decay factor
   * Recent (0-30 days): 1.0
   * Older (30-365 days): Linear decay from 1.0 to 0.5
   * Very old (>365 days): 0.5
   */
  private static calculateTimeDecay(activityDate: Date): number {
    const now = new Date();
    const daysDiff = Math.floor((now.getTime() - activityDate.getTime()) / (1000 * 60 * 60 * 24));

    if (daysDiff <= this.TIME_DECAY_DAYS) {
      return 1.0;
    } else if (daysDiff <= this.MAX_DAYS) {
      // Linear decay from 1.0 to 0.5
      const decayRange = this.MAX_DAYS - this.TIME_DECAY_DAYS;
      const decayProgress = (daysDiff - this.TIME_DECAY_DAYS) / decayRange;
      return 1.0 - decayProgress * 0.5;
    } else {
      return 0.5;
    }
  }

  /**
   * Convert user rating (1-5) to weight factor
   * 5 stars = 1.0, 4 stars = 0.8, 3 stars = 0.6, 2 stars = 0.4, 1 star = 0.2
   */
  private static ratingToWeight(rating: number | undefined): number {
    if (!rating || rating < 1 || rating > 5) {
      return 0.5; // Default weight for unrated
    }
    return rating / 5;
  }

  /**
   * Calculate user mood from activities
   */
  static async calculateUserMood(userId: string): Promise<MoodVector> {
    // Get all movie and TV show activities with ratings
    const activities = await Activity.find({
      userId,
      $or: [
        { type: 'movie_watched', rating: { $exists: true, $gte: 1 } },
        { type: 'tv_show_watched', rating: { $exists: true, $gte: 1 } }
      ]
    })
      .sort({ createdAt: -1 })
      .lean();

    if (activities.length === 0) {
      // Return default mood (neutral)
      return {
        adrenaline: 50,
        melancholy: 50,
        joy: 50,
        tension: 50,
        intellect: 50
      };
    }

    const activitiesWithMood: ActivityWithMood[] = [];

    // Get mood vectors for all activities
    for (const activity of activities) {
      try {
        // Get movie from database or analyze with AI
        let movie = await Movie.findOne({ tmdbId: activity.tmdbId });

        let moodVector: MoodVector;

        if (movie && movie.moodVector) {
          moodVector = movie.moodVector;
        } else {
          // Analyze with AI and cache
          moodVector = await AIService.getOrAnalyzeMovie(
            activity.tmdbId,
            activity.mediaTitle,
            activity.reviewText
          );
        }

        const userRating = this.ratingToWeight(activity.rating);
        const timeDecay = this.calculateTimeDecay(new Date(activity.createdAt));

        activitiesWithMood.push({
          activity,
          moodVector,
          userRating,
          timeDecay
        });
      } catch (error) {
        console.error(`Error processing activity ${activity._id}:`, error);
        // Skip this activity
        continue;
      }
    }

    // Calculate weighted average
    const totalWeights = activitiesWithMood.reduce(
      (sum, item) => sum + item.userRating * item.timeDecay,
      0
    );

    if (totalWeights === 0) {
      return {
        adrenaline: 50,
        melancholy: 50,
        joy: 50,
        tension: 50,
        intellect: 50
      };
    }

    const mood: MoodVector = {
      adrenaline: 0,
      melancholy: 0,
      joy: 0,
        tension: 0,
      intellect: 0
    };

    for (const item of activitiesWithMood) {
      const weight = item.userRating * item.timeDecay;
      mood.adrenaline += item.moodVector.adrenaline * weight;
      mood.melancholy += item.moodVector.melancholy * weight;
      mood.joy += item.moodVector.joy * weight;
      mood.tension += item.moodVector.tension * weight;
      mood.intellect += item.moodVector.intellect * weight;
    }

    return {
      adrenaline: Math.round(mood.adrenaline / totalWeights),
      melancholy: Math.round(mood.melancholy / totalWeights),
      joy: Math.round(mood.joy / totalWeights),
      tension: Math.round(mood.tension / totalWeights),
      intellect: Math.round(mood.intellect / totalWeights)
    };
  }

  /**
   * Update or create user stats with current mood
   */
  static async updateUserMood(userId: string): Promise<MoodVector> {
    const mood = await this.calculateUserMood(userId);

    await UserStats.findOneAndUpdate(
      { userId },
      {
        userId,
        currentMood: mood,
        lastUpdated: new Date()
      },
      { upsert: true, new: true }
    );

    return mood;
  }

  /**
   * Get user mood (from cache or calculate)
   */
  static async getUserMood(userId: string, forceRecalculate: boolean = false): Promise<MoodVector> {
    if (forceRecalculate) {
      return this.updateUserMood(userId);
    }

    const userStats = await UserStats.findOne({ userId }).lean();

    if (userStats && userStats.currentMood) {
      // Check if data is stale (older than 1 day)
      const lastUpdated = new Date(userStats.lastUpdated);
      const now = new Date();
      const daysSinceUpdate = (now.getTime() - lastUpdated.getTime()) / (1000 * 60 * 60 * 24);

      if (daysSinceUpdate < 1) {
        return userStats.currentMood;
      }
    }

    // Recalculate if stale or missing
    return this.updateUserMood(userId);
  }
}

