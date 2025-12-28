import { UserStats } from '../models/user-stats.model';
import { Activity } from '../models/activity.model';
import { WatchedList, IWatchedItem } from '../models/watched-list.model';
import { Movie } from '../models/movie.model';
import { MoodSnapshot } from '../models/mood-snapshot.model';
import { AIService } from './ai.service';
import { TMDBService } from './tmdb.service';

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
  private static readonly TIME_DECAY_DAYS = 7;
  private static readonly MAX_DAYS = 90;

  /**
   * Calculate time decay factor
   * Recent (0-30 days): 1.0
   * Older (30-365 days): Linear decay from 1.0 to 0.5
   * Very old (>365 days): 0.5
   */
  private static calculateTimeDecay(daysDiff: number): number {
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
   * Convert user rating (1-10) to polarized weight factor
   * POLARIZED INFLUENCE MODEL:
   * - Negative Zone (1-4): Returns negative weight (-1.0 to -0.25)
   * - Neutral Zone (5-6): Returns 0 (Noise Filter - no influence)
   * - Positive Zone (7-10): Returns positive weight (0.25 to 1.0)
   * 
   * Formula: (Rating - 5.5) / 4.5 for ratings outside neutral zone
   */
  private static ratingToWeight(rating: number | undefined): number {
    if (!rating || rating < 1 || rating > 10) {
      return 0; // Unrated items have no influence (previously was 0.5)
    }

    // Neutral Zone: 5-6 ratings are "noise" - no influence
    if (rating === 5 || rating === 6) {
      return 0;
    }

    // Polarized calculation: Maps 1-4 to negative, 7-10 to positive
    // Using 5.5 as the neutral threshold
    const neutralThreshold = 5.5;
    const rawScore = rating - neutralThreshold;

    // Normalize to [-1, 1] range (max deviation from threshold is 4.5)
    const polarityCoefficient = rawScore / 4.5;

    return polarityCoefficient;
  }

  /**
   * Calculate saturation factor to prevent "Echo Chamber" effect.
   * If user watches too much similar content, reduce the influence.
   * @param recentVectors Last K mood vectors from watched content
   * @param newVector The mood vector of the new item being added
   * @returns Fatigue factor between 0.5 and 1.0 (1.0 = no fatigue, 0.5 = max fatigue)
   */
  private static calculateSaturationFactor(
    recentVectors: MoodVector[],
    newVector: MoodVector
  ): number {
    if (recentVectors.length < 3) {
      return 1.0; // Not enough data to determine saturation
    }

    // Calculate average cosine similarity with recent items
    const similarities = recentVectors.map(v => this.cosineSimilarity(v, newVector));
    const avgSimilarity = similarities.reduce((a, b) => a + b, 0) / similarities.length;

    // If average similarity > 0.8, apply fatigue
    if (avgSimilarity > 0.8) {
      // Linear fatigue: 0.8 similarity = 1.0 factor, 1.0 similarity = 0.5 factor
      const fatigueFactor = 1.0 - (avgSimilarity - 0.8) * 2.5;
      return Math.max(0.5, fatigueFactor);
    }

    return 1.0;
  }

  /**
   * Calculate cosine similarity between two mood vectors
   */
  private static cosineSimilarity(a: MoodVector, b: MoodVector): number {
    const keys: (keyof MoodVector)[] = [
      'adrenaline', 'melancholy', 'joy', 'tension', 'intellect',
      'romance', 'wonder', 'nostalgia', 'darkness', 'inspiration'
    ];

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (const key of keys) {
      dotProduct += (a[key] || 0) * (b[key] || 0);
      normA += (a[key] || 0) ** 2;
      normB += (b[key] || 0) ** 2;
    }

    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Calculate user mood - OPTIMIZED VERSION
   * Fixes: N+1 Query Problem & Dead Code Implementation
   */
  static async calculateUserMood(userId: string): Promise<MoodVector> {
    // 1. Fetch Data in Parallel
    const [activities, watchedList] = await Promise.all([
      Activity.find({
        userId,
        rating: { $exists: true, $gte: 1 }
      }).lean(),
      WatchedList.findOne({ userId, isDefault: true }).lean()
    ]);

    const watchedListItems = watchedList?.items.filter((i: any) => i.rating && i.rating >= 1) || [];

    // 2. Merge & Deduplicate Strategy
    const mergedMap = new Map<number, any>();

    // Process Activities
    activities.forEach((act: any) => {
      const mediaType = act.mediaType?.includes('tv') ? 'tv' : 'movie';
      mergedMap.set(Number(act.tmdbId), {
        tmdbId: Number(act.tmdbId),
        mediaType,
        rating: act.rating,
        createdAt: new Date(act.createdAt),
        title: act.mediaTitle || 'Unknown',
        reviewText: act.reviewText
      });
    });

    // Process WatchedList (Overwrite if newer)
    watchedListItems.forEach((item: any) => {
      const existing = mergedMap.get(item.tmdbId);
      const itemDate = new Date(item.watchedAt || item.addedAt);
      if (!existing || itemDate > existing.createdAt) {
        mergedMap.set(item.tmdbId, {
          tmdbId: item.tmdbId,
          mediaType: item.mediaType === 'tv' ? 'tv' : 'movie',
          rating: item.rating,
          createdAt: itemDate,
          title: item.title
        });
      }
    });

    const mergedItems = Array.from(mergedMap.values())
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    if (mergedItems.length === 0) return this.getDefaultMood();

    // 3. PERFORMANCE FIX: Bulk Fetch Movies (Single Query)
    const tmdbIds = mergedItems.map(i => i.tmdbId);
    const moviesInDb = await Movie.find({
      tmdbId: { $in: tmdbIds }
    }).lean();

    // Create a Map for O(1) Lookup: "tmdbId_mediaType" -> Movie Object
    const movieMap = new Map(moviesInDb.map(m => [`${m.tmdbId}_${m.mediaType}`, m]));

    // 4. Calculation Loop
    const baselineWeight = 5.0;
    const weightedSums = this.getWeightedSums(baselineWeight);
    let totalWeight = baselineWeight;

    // Sliding Window for Saturation Logic
    const recentVectors: MoodVector[] = [];
    const MAX_RECENT_HISTORY = 5;

    for (const activity of mergedItems) {
      const rating = activity.rating || 0;
      if (rating >= 5 && rating <= 6) continue; // Noise Filter

      let moodVector: MoodVector | null = null;
      const cacheKey = `${activity.tmdbId}_${activity.mediaType}`;

      if (movieMap.has(cacheKey)) {
        // Fast Cache Hit
        moodVector = (movieMap.get(cacheKey) as any).moodVector;
      } else {
        // If movie is missing from DB, we skip it in this optimized calculation 
        // to avoid stalling the loop with API calls. 
        // (In a background job, these should be populated).
        continue;
      }

      if (!moodVector) continue;

      // --- CORE LOGIC ---

      // A. Influence
      const influence = (rating - 5.5) / 4.5;

      // B. Time Decay
      const daysSince = (Date.now() - activity.createdAt.getTime()) / (1000 * 3600 * 24);
      const timeDecay = Math.max(0.2, this.calculateTimeDecay(daysSince));

      // C. Saturation Factor (Implemented!)
      const saturation = this.calculateSaturationFactor(recentVectors, moodVector);

      // Update Sliding Window
      recentVectors.push(moodVector);
      if (recentVectors.length > MAX_RECENT_HISTORY) recentVectors.shift();

      // D. Final Weight
      const weight = Math.abs(influence) * timeDecay * saturation;

      if (weight > 0) {
        totalWeight += weight;

        (Object.keys(weightedSums) as Array<keyof MoodVector>).forEach(key => {
          let targetValue = moodVector![key];

          // Anti-Vector Logic
          if (influence < 0) {
            targetValue = 100 - targetValue;
          }

          weightedSums[key] += targetValue * weight;
        });
      }
    }

    // 5. Normalize
    const finalMood = this.getDefaultMood();
    if (totalWeight > 0) {
      const clamp = (val: number) => Math.round(Math.max(0, Math.min(100, val)));
      (Object.keys(finalMood) as Array<keyof MoodVector>).forEach(key => {
        finalMood[key] = clamp(weightedSums[key] / totalWeight);
      });
    }

    return finalMood;
  }

  // Helpers
  private static getDefaultMood(): MoodVector {
    return { adrenaline: 50, melancholy: 50, joy: 50, tension: 50, intellect: 50, romance: 50, wonder: 50, nostalgia: 50, darkness: 50, inspiration: 50 };
  }

  private static getWeightedSums(base: number): MoodVector {
    const mood = this.getDefaultMood();
    (Object.keys(mood) as Array<keyof MoodVector>).forEach(k => mood[k] *= base);
    return mood;
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
   * Cache resets at midnight (user's local time, assumed GMT+3)
   */
  static async getUserMood(userId: string, forceRecalculate: boolean = false): Promise<MoodVector> {
    if (forceRecalculate) {
      return this.updateUserMood(userId);
    }

    const userStats = await UserStats.findOne({ userId }).lean();

    if (userStats && userStats.currentMood) {
      // Check if midnight has passed since last update (GMT+3)
      const GMT_OFFSET_MS = 3 * 60 * 60 * 1000; // 3 hours in milliseconds

      const now = new Date();
      const lastUpdated = new Date(userStats.lastUpdated);

      // Get the current day's midnight in user's local time (GMT+3)
      const nowLocal = new Date(now.getTime() + GMT_OFFSET_MS);
      const todayMidnightLocal = new Date(nowLocal);
      todayMidnightLocal.setHours(0, 0, 0, 0);
      const todayMidnightUTC = new Date(todayMidnightLocal.getTime() - GMT_OFFSET_MS);

      // If last update was before today's midnight, recalculate
      if (lastUpdated >= todayMidnightUTC) {
        return userStats.currentMood;
      }
    }

    // Recalculate if stale (midnight passed) or missing
    return this.updateUserMood(userId);
  }

  /**
   * Directly set a user's mood profile (used by RL feedback system)
   * This bypasses the normal calculation and directly updates the stored mood
   */
  static async setUserMood(userId: string, mood: MoodVector): Promise<void> {
    await UserStats.findOneAndUpdate(
      { userId },
      {
        $set: {
          currentMood: mood,
          lastUpdated: new Date()
        }
      },
      { upsert: true }
    );

    // Save mood snapshot for timeline
    await this.saveMoodSnapshot(userId, mood, undefined, 'AI Feedback Adjustment');
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

    const groupedData = new Map<string, { moodSum: MoodVector; count: number; titles: string[] }>();
    const moodKeys: (keyof MoodVector)[] = [
      'adrenaline', 'melancholy', 'joy', 'tension', 'intellect',
      'romance', 'wonder', 'nostalgia', 'darkness', 'inspiration'
    ];

    for (const snap of snapshots) {
      const dateStr = snap.timestamp.toISOString().split('T')[0];

      if (!groupedData.has(dateStr)) {
        groupedData.set(dateStr, {
          moodSum: { ...snap.mood },
          count: 1,
          titles: snap.triggerMediaTitle ? [snap.triggerMediaTitle] : []
        });
      } else {
        const entry = groupedData.get(dateStr)!;
        // Sum all mood dimensions
        for (const key of moodKeys) {
          entry.moodSum[key] = (entry.moodSum[key] || 0) + (snap.mood[key] || 0);
        }
        entry.count++;
        // maintain unique titles list
        if (snap.triggerMediaTitle && !entry.titles.includes(snap.triggerMediaTitle)) {
          entry.titles.push(snap.triggerMediaTitle);
        }
      }
    }

    return Array.from(groupedData.entries())
      .map(([date, data]) => {
        const averagedMood: any = {};
        for (const key of moodKeys) {
          averagedMood[key] = Math.round(data.moodSum[key] / data.count);
        }

        return {
          date,
          mood: averagedMood as MoodVector,
          triggerMediaTitle: data.titles.join(', ')
        };
      })
      .sort((a, b) => a.date.localeCompare(b.date));
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

