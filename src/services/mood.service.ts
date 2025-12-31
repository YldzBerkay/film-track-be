import { UserStats } from '../models/user-stats.model';
import { Activity } from '../models/activity.model';
import { WatchedList, IWatchedItem } from '../models/watched-list.model';
import { Movie } from '../models/movie.model';
import { MoodSnapshot } from '../models/mood-snapshot.model';
import { AIService } from './ai.service';
import { TMDBService } from './tmdb.service';

import { User } from '../models/user.model';

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
   * @returns Fatigue factor between 0.8 and 1.0 (1.0 = no fatigue, 0.8 = max fatigue)
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

    // If average similarity > 0.8, apply gentle fatigue
    if (avgSimilarity > 0.8) {
      // Linear fatigue: 0.8 similarity = 1.0 factor, 1.0 similarity = 0.8 factor (relaxed)
      const fatigueFactor = 1.0 - (avgSimilarity - 0.8) * 1.0;
      return Math.max(0.8, fatigueFactor);
    }

    return 1.0;
  }

  /**
   * Apply contrast stretching to push values away from the neutral center (50).
   * Amplifies distinctions in the mood profile.
   * @param mood The mood vector to stretch
   * @param strength Amplification factor (0.5 = 50% boost to deviations)
   */
  private static applyContrastStretching(mood: MoodVector, strength: number = 0.5): MoodVector {
    const centerPoint = 50;
    const stretched: MoodVector = { ...mood };

    for (const key of Object.keys(mood) as (keyof MoodVector)[]) {
      const value = mood[key];
      const deviation = value - centerPoint;

      // Amplify deviation from center
      const amplifiedDeviation = deviation * (1 + strength);

      // Apply with clamping to 0-100
      stretched[key] = Math.round(
        Math.max(0, Math.min(100, centerPoint + amplifiedDeviation))
      );
    }

    return stretched;
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
    // Dynamic baseline: decays as user provides more data
    const movieCount = mergedItems.length;
    const baselineWeight = Math.max(0.5, 5.0 / Math.sqrt(movieCount / 10 + 1));
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

    // 6. Apply Contrast Stretching to amplify distinct preferences
    const stretchedMood = this.applyContrastStretching(finalMood);

    return stretchedMood;
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
   * Vibe Check Templates - Predefined mood vectors for quick selection
   */
  static readonly VIBE_TEMPLATES: Record<string, MoodVector> = {
    'energetic': { adrenaline: 90, melancholy: 10, joy: 80, tension: 60, intellect: 40, romance: 30, wonder: 70, nostalgia: 20, darkness: 20, inspiration: 85 },
    'sad': { adrenaline: 10, melancholy: 95, joy: 10, tension: 30, intellect: 50, romance: 40, wonder: 20, nostalgia: 70, darkness: 60, inspiration: 20 },
    'romantic': { adrenaline: 20, melancholy: 40, joy: 70, tension: 20, intellect: 40, romance: 95, wonder: 60, nostalgia: 50, darkness: 10, inspiration: 60 },
    'thrilling': { adrenaline: 85, melancholy: 20, joy: 40, tension: 95, intellect: 50, romance: 20, wonder: 50, nostalgia: 20, darkness: 70, inspiration: 40 },
    'thoughtful': { adrenaline: 15, melancholy: 50, joy: 40, tension: 30, intellect: 95, romance: 30, wonder: 60, nostalgia: 40, darkness: 40, inspiration: 70 },
    'cozy': { adrenaline: 10, melancholy: 20, joy: 85, tension: 5, intellect: 30, romance: 50, wonder: 40, nostalgia: 80, darkness: 5, inspiration: 60 },
    'dark': { adrenaline: 50, melancholy: 60, joy: 10, tension: 70, intellect: 60, romance: 20, wonder: 30, nostalgia: 30, darkness: 95, inspiration: 20 },
    'inspiring': { adrenaline: 60, melancholy: 20, joy: 75, tension: 40, intellect: 50, romance: 30, wonder: 70, nostalgia: 40, darkness: 10, inspiration: 95 },
    'nostalgic': { adrenaline: 30, melancholy: 50, joy: 60, tension: 20, intellect: 40, romance: 50, wonder: 40, nostalgia: 95, darkness: 20, inspiration: 50 },
    'adventurous': { adrenaline: 85, melancholy: 10, joy: 70, tension: 50, intellect: 40, romance: 30, wonder: 90, nostalgia: 30, darkness: 30, inspiration: 80 }
  };

  /**
   * Set a temporary vibe override for the user (Vibe Check feature)
   * Valid for 4 hours by default
   * @param template - Predefined mood template name (e.g., "sad", "energetic")
   * @param strength - Blend factor 0-1 (default 0.4)
   * @param durationHours - How long the vibe lasts (default 4 hours)
   */
  static async setTemporaryVibe(
    userId: string,
    template: string,
    strength: number = 0.4,
    durationHours: number = 4
  ): Promise<{ success: boolean; expiresAt: Date; vector: MoodVector }> {
    const vibeVector = this.VIBE_TEMPLATES[template.toLowerCase()];

    if (!vibeVector) {
      throw new Error(`Unknown vibe template: ${template}. Available: ${Object.keys(this.VIBE_TEMPLATES).join(', ')}`);
    }

    const expiresAt = new Date(Date.now() + durationHours * 60 * 60 * 1000);

    await UserStats.findOneAndUpdate(
      { userId },
      {
        $set: {
          temporaryVibe: {
            vector: vibeVector,
            strength: Math.max(0, Math.min(1, strength)),
            expiresAt,
            template: template.toLowerCase()
          }
        }
      },
      { upsert: true }
    );

    console.log(`[Vibe Check] Set ${template} vibe for user ${userId}, expires at ${expiresAt.toISOString()}`);

    return { success: true, expiresAt, vector: vibeVector };
  }

  /**
   * Clear the temporary vibe for a user
   */
  static async clearTemporaryVibe(userId: string): Promise<void> {
    await UserStats.findOneAndUpdate(
      { userId },
      { $unset: { temporaryVibe: 1 } }
    );
    console.log(`[Vibe Check] Cleared vibe for user ${userId}`);
  }

  /**
   * Get the effective mood for recommendations
   * Blends historical mood with temporary vibe if active
   * Returns: { mood, hasActiveVibe, vibeTemplate }
   */
  static async getEffectiveMood(userId: string): Promise<{
    mood: MoodVector;
    hasActiveVibe: boolean;
    vibeTemplate?: string;
    vibeExpiresAt?: Date;
  }> {
    const userStats = await UserStats.findOne({ userId }).lean();

    // Get base historical mood
    const historicalMood = userStats?.currentMood || this.getDefaultMood();

    // Check for active temporary vibe
    if (userStats?.temporaryVibe && userStats.temporaryVibe.expiresAt > new Date()) {
      const vibe = userStats.temporaryVibe;
      const strength = vibe.strength;

      // Blend: TargetMood = (HistoricalMood * (1 - strength)) + (VibeVector * strength)
      const blendedMood: MoodVector = { ...historicalMood };

      for (const key of Object.keys(blendedMood) as (keyof MoodVector)[]) {
        blendedMood[key] = Math.round(
          (historicalMood[key] * (1 - strength)) + (vibe.vector[key] * strength)
        );
      }

      console.log(`[Vibe Check] Blending ${vibe.template} (${strength * 100}% strength) with historical mood`);

      return {
        mood: blendedMood,
        hasActiveVibe: true,
        vibeTemplate: vibe.template,
        vibeExpiresAt: vibe.expiresAt
      };
    }

    return {
      mood: historicalMood,
      hasActiveVibe: false
    };
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


  static async canViewMood(targetUserId: string, viewerUserId: string): Promise<boolean> {
    const targetUser = await User.findById(targetUserId);
    if (!targetUser) return false;

    const privacy = targetUser.privacySettings?.mood || 'public';

    if (privacy === 'public') return true;
    if (privacy === 'private') return false;

    if (privacy === 'friends') {
      const isFollowing = targetUser.followers.some(id => id.toString() === viewerUserId);
      const isFollowed = targetUser.following.some(id => id.toString() === viewerUserId);
      return isFollowing && isFollowed;
    }

    return false;
  }
}

