import { UserStats } from '../models/user-stats.model';
import { Activity } from '../models/activity.model';
import { Movie } from '../models/movie.model';
import { MoodSnapshot } from '../models/mood-snapshot.model';
import { AIService } from './ai.service';

export interface MoodVector {
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
        intellect: 50,
        romance: 50,
        wonder: 50,
        nostalgia: 50,
        darkness: 50,
        inspiration: 50
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
        intellect: 50,
        romance: 50,
        wonder: 50,
        nostalgia: 50,
        darkness: 50,
        inspiration: 50
      };
    }

    const mood: MoodVector = {
      adrenaline: 0,
      melancholy: 0,
      joy: 0,
      tension: 0,
      intellect: 0,
      romance: 0,
      wonder: 0,
      nostalgia: 0,
      darkness: 0,
      inspiration: 0
    };

    for (const item of activitiesWithMood) {
      const weight = item.userRating * item.timeDecay;
      mood.adrenaline += (item.moodVector.adrenaline || 0) * weight;
      mood.melancholy += (item.moodVector.melancholy || 0) * weight;
      mood.joy += (item.moodVector.joy || 0) * weight;
      mood.tension += (item.moodVector.tension || 0) * weight;
      mood.intellect += (item.moodVector.intellect || 0) * weight;
      mood.romance += (item.moodVector.romance || 0) * weight;
      mood.wonder += (item.moodVector.wonder || 0) * weight;
      mood.nostalgia += (item.moodVector.nostalgia || 0) * weight;
      mood.darkness += (item.moodVector.darkness || 0) * weight;
      mood.inspiration += (item.moodVector.inspiration || 0) * weight;
    }

    return {
      adrenaline: Math.round(mood.adrenaline / totalWeights),
      melancholy: Math.round(mood.melancholy / totalWeights),
      joy: Math.round(mood.joy / totalWeights),
      tension: Math.round(mood.tension / totalWeights),
      intellect: Math.round(mood.intellect / totalWeights),
      romance: Math.round(mood.romance / totalWeights),
      wonder: Math.round(mood.wonder / totalWeights),
      nostalgia: Math.round(mood.nostalgia / totalWeights),
      darkness: Math.round(mood.darkness / totalWeights),
      inspiration: Math.round(mood.inspiration / totalWeights)
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

    // Save mood snapshot for timeline
    await this.saveMoodSnapshot(userId, mood);

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

  /**
   * Save a mood snapshot for timeline tracking
   */
  static async saveMoodSnapshot(
    userId: string,
    mood: MoodVector,
    triggerActivityId?: string,
    triggerMediaTitle?: string
  ): Promise<void> {
    // Only save one snapshot per day to avoid clutter
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const existingSnapshot = await MoodSnapshot.findOne({
      userId,
      timestamp: { $gte: today }
    });

    if (existingSnapshot) {
      // Update existing snapshot for today
      existingSnapshot.mood = mood;
      if (triggerActivityId) existingSnapshot.triggerActivityId = triggerActivityId as any;
      if (triggerMediaTitle) existingSnapshot.triggerMediaTitle = triggerMediaTitle;
      await existingSnapshot.save();
    } else {
      // Create new snapshot
      await MoodSnapshot.create({
        userId,
        mood,
        timestamp: new Date(),
        triggerActivityId,
        triggerMediaTitle
      });
    }
  }

  /**
   * Get mood timeline for a user
   */
  static async getMoodTimeline(
    userId: string,
    days: number = 30
  ): Promise<Array<{ date: string; mood: MoodVector; triggerMediaTitle?: string }>> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    const snapshots = await MoodSnapshot.find({
      userId,
      timestamp: { $gte: startDate }
    })
      .sort({ timestamp: 1 })
      .lean();

    return snapshots.map(snapshot => ({
      date: snapshot.timestamp.toISOString().split('T')[0],
      mood: snapshot.mood,
      triggerMediaTitle: snapshot.triggerMediaTitle
    }));
  }

  /**
   * Compare mood profiles between two users
   */
  static async getMoodComparison(
    userId1: string,
    userId2: string
  ): Promise<{
    user1Mood: MoodVector;
    user2Mood: MoodVector;
    similarity: number;
    dimensionComparison: Array<{
      dimension: string;
      user1Value: number;
      user2Value: number;
      difference: number;
    }>;
    commonStrengths: string[];
    uniqueStrengths: { user1: string[]; user2: string[] };
  }> {
    const user1Mood = await this.getUserMood(userId1);
    const user2Mood = await this.getUserMood(userId2);

    const dimensions: (keyof MoodVector)[] = [
      'adrenaline', 'melancholy', 'joy', 'tension', 'intellect',
      'romance', 'wonder', 'nostalgia', 'darkness', 'inspiration'
    ];

    // Calculate cosine similarity
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    const dimensionComparison: Array<{
      dimension: string;
      user1Value: number;
      user2Value: number;
      difference: number;
    }> = [];

    for (const dim of dimensions) {
      const v1 = user1Mood[dim] || 0;
      const v2 = user2Mood[dim] || 0;
      dotProduct += v1 * v2;
      normA += v1 * v1;
      normB += v2 * v2;
      dimensionComparison.push({
        dimension: dim,
        user1Value: v1,
        user2Value: v2,
        difference: Math.abs(v1 - v2)
      });
    }

    const similarity = normA === 0 || normB === 0
      ? 0
      : dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));

    // Find strengths (values > 65)
    const STRENGTH_THRESHOLD = 65;
    const user1Strengths = dimensions.filter(d => (user1Mood[d] || 0) >= STRENGTH_THRESHOLD);
    const user2Strengths = dimensions.filter(d => (user2Mood[d] || 0) >= STRENGTH_THRESHOLD);

    const commonStrengths = user1Strengths.filter(s => user2Strengths.includes(s));
    const uniqueStrengths = {
      user1: user1Strengths.filter(s => !user2Strengths.includes(s)),
      user2: user2Strengths.filter(s => !user1Strengths.includes(s))
    };

    return {
      user1Mood,
      user2Mood,
      similarity: Math.round(similarity * 100),
      dimensionComparison,
      commonStrengths,
      uniqueStrengths
    };
  }
}

