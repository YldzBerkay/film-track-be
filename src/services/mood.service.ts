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
   * Calculate user mood from activities using POLARIZED INFLUENCE MODEL
   * - Positive ratings (7-10) ADD to the mood profile
   * - Negative ratings (1-4) SUBTRACT from the mood profile (Anti-Vector)
   * - Neutral ratings (5-6) are filtered out (Noise)
   */
  static async calculateUserMood(userId: string): Promise<MoodVector> {
    // 1. Get activities with ratings
    const activities = await Activity.find({
      userId,
      $or: [
        { type: 'movie_watched', rating: { $exists: true, $gte: 1 } },
        { type: 'tv_show_watched', rating: { $exists: true, $gte: 1 } }
      ]
    })
      .sort({ createdAt: -1 })
      .lean();

    // 2. Get WatchedList items with ratings (Source of Truth for direct adds)
    const watchedList = await WatchedList.findOne({ userId, isDefault: true }).lean();
    const watchedListItems = watchedList?.items.filter((i: IWatchedItem) => i.rating && i.rating >= 1) || [];

    // 3. Merge and Deduplicate (prioritizing most recent)
    // Map key: tmdbId -> Combined Activity-like object
    const mergedMap = new Map<number, any>();

    // Process activities first
    for (const act of activities) {
      const mediaType = act.mediaType === 'tv_show' || act.mediaType === 'tv_episode' ? 'tv' : 'movie';

      mergedMap.set(Number(act.tmdbId), {
        tmdbId: Number(act.tmdbId),
        mediaType, // Capture normalized mediaType
        rating: act.rating,
        createdAt: act.createdAt,
        title: act.mediaTitle,
        type: 'activity',
        mediaTitle: act.mediaTitle,
        reviewText: act.reviewText
      });
    }

    // Process watched list items (overwrite if newer or missing)
    for (const item of watchedListItems) {
      const existing = mergedMap.get(item.tmdbId);
      const itemDate = new Date(item.watchedAt || item.addedAt);

      if (!existing || itemDate > new Date(existing.createdAt)) {
        mergedMap.set(item.tmdbId, {
          tmdbId: item.tmdbId,
          mediaType: item.mediaType === 'tv' ? 'tv' : 'movie', // WatchedList uses 'tv' already
          rating: item.rating,
          createdAt: itemDate,
          title: item.title,
          type: 'watched_list',
          mediaTitle: item.title,
          reviewText: undefined
        });
      }
    }

    // Sort by date descending
    const mergedItems = Array.from(mergedMap.values())
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const defaultMood: MoodVector = {
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

    if (mergedItems.length === 0) {
      return defaultMood;
    }

    // 4. Calculate Weighted Average Mood
    // Baseline (Neutral 50) prevents wild swings with few items. 
    // Weight=5 means "it takes ~5 strong movies to pull the user significantly away from neutral".
    const baselineWeight = 5.0;

    // Accumulators
    const weightedSums: MoodVector = {
      adrenaline: 50 * baselineWeight,
      melancholy: 50 * baselineWeight,
      joy: 50 * baselineWeight,
      tension: 50 * baselineWeight,
      intellect: 50 * baselineWeight,
      romance: 50 * baselineWeight,
      wonder: 50 * baselineWeight,
      nostalgia: 50 * baselineWeight,
      darkness: 50 * baselineWeight,
      inspiration: 50 * baselineWeight
    };

    let totalWeight = baselineWeight;

    for (const activity of mergedItems) {
      try {
        let movie = await Movie.findOne({ tmdbId: activity.tmdbId, mediaType: activity.mediaType });
        let moodVector: MoodVector;

        if (movie && movie.moodVector) {
          moodVector = movie.moodVector;
        } else {
          // Fetch movie details from TMDB to get genres, posterPath, releaseDate
          let genres: string[] = [];
          let posterPath = '';
          let releaseDate = '';

          try {
            const mediaType = activity.mediaType || 'movie';
            if (mediaType === 'movie') {
              const details = await TMDBService.getMovieDetails(activity.tmdbId.toString());
              genres = details.genres?.map(g => g.name) || [];
              posterPath = details.poster_path || '';
              releaseDate = details.release_date || '';
            } else if (mediaType === 'tv') {
              const details = await TMDBService.getShowDetails(activity.tmdbId.toString());
              genres = details.genres?.map(g => g.name) || [];
              posterPath = details.poster_path || '';
              releaseDate = details.first_air_date || '';
            }
          } catch (err) {
            console.warn(`[MoodService] Failed to fetch TMDB details for ${activity.tmdbId}`);
          }

          moodVector = await AIService.getOrAnalyzeMovie(
            activity.tmdbId,
            activity.mediaType || 'movie',
            activity.mediaTitle || activity.title,
            activity.reviewText,
            genres,
            posterPath,
            releaseDate
          );
        }

        // Calculate Influence Score (Raw - 5.5) / 4.5
        const rating = activity.rating || 0;

        // Noise Filter: Neutral ratings (5-6) are ignored
        if (rating >= 5 && rating <= 6) continue;

        // Influence: 1-10 mapped to -1.0 to +1.0 roughly
        const influence = (rating - 5.5) / 4.5;

        const daysSince = (new Date().getTime() - new Date(activity.createdAt).getTime()) / (1000 * 3600 * 24);
        const timeDecay = Math.max(0.2, this.calculateTimeDecay(daysSince));

        const weight = Math.abs(influence) * timeDecay;

        if (weight > 0) {
          totalWeight += weight;

          // If influence is Negative, we target the ANTI-VECTOR (100 - Value)
          // If influence is Positive, we target the VECTOR (Value)
          (Object.keys(weightedSums) as Array<keyof MoodVector>).forEach(key => {
            let targetValue = moodVector[key];
            if (influence < 0) {
              targetValue = 100 - targetValue; // Invert for hate
            }
            // Add weighted contribution
            weightedSums[key] += targetValue * weight;
          });
        }

      } catch (error) {
        console.error(`Failed to process activity ${activity.tmdbId}:`, error);
      }
    }

    // Final Division & Clamping
    const clamp = (val: number) => Math.round(Math.max(0, Math.min(100, val)));

    const finalMood: MoodVector = { ...defaultMood };
    if (totalWeight > 0) {
      (Object.keys(finalMood) as Array<keyof MoodVector>).forEach(key => {
        finalMood[key] = clamp(weightedSums[key] / totalWeight);
      });
    }

    return finalMood;
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

