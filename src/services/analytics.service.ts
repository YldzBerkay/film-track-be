import { MoodSnapshot } from '../models/mood-snapshot.model';
import { Activity } from '../models/activity.model';
import { MoodVector, MoodService } from './mood.service';

export interface MoodTrend {
    date: string;
    value: number;
}

export interface AverageMoods {
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

export class AnalyticsService {

    /**
     * Get mood evolution over 30 days
     */
    static async getMoodEvolution(userId: string, days: number = 30): Promise<Record<keyof MoodVector, MoodTrend[]>> {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        const snapshots = await MoodSnapshot.find({
            userId,
            timestamp: { $gte: startDate }
        }).sort({ timestamp: 1 }).lean();

        const trends: Record<string, MoodTrend[]> = {};
        const dimensions: (keyof MoodVector)[] = [
            'adrenaline', 'melancholy', 'joy', 'tension', 'intellect',
            'romance', 'wonder', 'nostalgia', 'darkness', 'inspiration'
        ];

        dimensions.forEach(dim => trends[dim] = []);

        snapshots.forEach(snap => {
            const date = snap.timestamp.toISOString().split('T')[0];
            dimensions.forEach(dim => {
                trends[dim].push({
                    date,
                    value: snap.mood[dim] || 0
                });
            });
        });

        // Fill missing days with linear interpolation or carry-forward, 
        // but for now, we leave as points (frontend can handle gaps or charts handle it)
        return trends as Record<keyof MoodVector, MoodTrend[]>;
    }

    /**
     * Get average mood by day of week (0=Sunday, 6=Saturday)
     */
    static async getDayOfWeekPatterns(userId: string): Promise<Record<string, number[]>> {
        // Aggregate last 6 months of data
        const startDate = new Date();
        startDate.setMonth(startDate.getMonth() - 6);

        const snapshots = await MoodSnapshot.find({
            userId,
            timestamp: { $gte: startDate }
        }).lean();

        // 7 days, for each dimension
        // structure: { 'joy': [avgSun, avgMon, ...], 'tension': [...] }
        const days = 7;
        const sums: Record<string, number[]> = {};
        const counts: Record<string, number[]> = {};
        const dimensions: (keyof MoodVector)[] = [
            'adrenaline', 'melancholy', 'joy', 'tension', 'intellect',
            'romance', 'wonder', 'nostalgia', 'darkness', 'inspiration'
        ];

        dimensions.forEach(dim => {
            sums[dim] = new Array(days).fill(0);
            counts[dim] = new Array(days).fill(0);
        });

        snapshots.forEach(snap => {
            const day = new Date(snap.timestamp).getDay();
            dimensions.forEach(dim => {
                const val = snap.mood[dim];
                if (val !== undefined) {
                    sums[dim][day] += val;
                    counts[dim][day]++;
                }
            });
        });

        const averages: Record<string, number[]> = {};
        dimensions.forEach(dim => {
            averages[dim] = sums[dim].map((sum, i) => counts[dim][i] > 0 ? Math.round(sum / counts[dim][i]) : 0);
        });

        return averages;
    }

    /**
     * Get genre correlation with moods
     * e.g., "Horror" -> High Tension, "Comedy" -> High Joy
     */
    static async getGenreMoodCorrelations(userId: string): Promise<Array<{ genre: string; dominantMoods: Partial<MoodVector> }>> {
        // Find activities (movies/shows) that have genres
        // We need to correlate the *item's* mood with its genres.
        // Or better: the user's mood *after* watching vs the genre?
        // Let's stick to: "When you watch [Genre], your [Mood] tends to increase"
        // This requires relating activities to mood updates. 
        // Since we store `triggerActivityId` in MoodSnapshot, we can link them!

        const snapshots = await MoodSnapshot.find({
            userId,
            triggerActivityId: { $exists: true }
        }).populate<{ triggerActivityId: any }>('triggerActivityId').lean();

        const genreMoodMap: Record<string, { sums: Record<string, number>, count: number }> = {};
        const dimensions: (keyof MoodVector)[] = [
            'adrenaline', 'melancholy', 'joy', 'tension', 'intellect',
            'romance', 'wonder', 'nostalgia', 'darkness', 'inspiration'
        ];

        snapshots.forEach(snap => {
            const activity = snap.triggerActivityId;
            if (activity && activity.genres && Array.isArray(activity.genres)) {
                activity.genres.forEach((genre: string) => {
                    if (!genreMoodMap[genre]) {
                        genreMoodMap[genre] = { sums: {}, count: 0 };
                        dimensions.forEach(d => genreMoodMap[genre].sums[d] = 0);
                    }

                    genreMoodMap[genre].count++;
                    dimensions.forEach(dim => {
                        genreMoodMap[genre].sums[dim] += (snap.mood[dim] || 0);
                    });
                });
            }
        });

        // Compute averages and find top 2 moods per genre
        const result = Object.keys(genreMoodMap).map(genre => {
            const count = genreMoodMap[genre].count;
            if (count < 2) return null; // Filter out insignificant genres

            const averages: any = {};
            dimensions.forEach(dim => {
                averages[dim] = Math.round(genreMoodMap[genre].sums[dim] / count);
            });

            return {
                genre,
                dominantMoods: averages,
                count
            };
        }).filter(item => item !== null);

        return result as Array<{ genre: string; dominantMoods: Partial<MoodVector> }>;
    }
}
