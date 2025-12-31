import { MoodService, MoodVector } from './mood.service';
import { WatchedList, IWatchedItem } from '../models/watched-list.model';
import { Movie } from '../models/movie.model';
import { ArchetypeService } from './archetype.service';

/**
 * Taste Match result interface
 */
export interface TasteMatchResult {
    matchScore: number;           // 0-100
    verdict: string;              // Soulmates, Great Taste, Compatible, Opposites
    sharedFavorites: string[];    // Top rated shared movies
    theirArchetype: {
        name: string;
        displayName: string;
        emoji: string;
    };
    yourArchetype: {
        name: string;
        displayName: string;
        emoji: string;
    };
    breakdown: {
        moodSimilarity: number;     // 0-100
        ratingAgreement: number | null;    // 0-100 or null if insufficient data
        sharedMoviesCount: number;
    };
    radarData: {
        user: number[];
        target: number[];
    };
}

export class MatchService {
    private static readonly MOOD_WEIGHT = 0.6;
    private static readonly RATING_WEIGHT = 0.4;
    private static readonly MIN_SHARED_MOVIES = 5;

    /**
     * Calculate cosine similarity between two mood vectors
     * Returns value between -1 and 1
     */
    private static cosineSimilarity(a: MoodVector, b: MoodVector): number {
        const dimensions: (keyof MoodVector)[] = [
            'adrenaline', 'melancholy', 'joy', 'tension', 'intellect',
            'romance', 'wonder', 'nostalgia', 'darkness', 'inspiration'
        ];

        let dotProduct = 0;
        let magnitudeA = 0;
        let magnitudeB = 0;

        for (const dim of dimensions) {
            dotProduct += a[dim] * b[dim];
            magnitudeA += a[dim] * a[dim];
            magnitudeB += b[dim] * b[dim];
        }

        magnitudeA = Math.sqrt(magnitudeA);
        magnitudeB = Math.sqrt(magnitudeB);

        if (magnitudeA === 0 || magnitudeB === 0) {
            return 0;
        }

        return dotProduct / (magnitudeA * magnitudeB);
    }

    /**
     * Map cosine similarity (-1 to 1) to 0-100 score
     */
    private static mapToPercentage(similarity: number): number {
        // -1 -> 0%, 0 -> 50%, 1 -> 100%
        return Math.round(((similarity + 1) / 2) * 100);
    }

    /**
     * Get rating agreement score based on shared movies
     * Returns 0-100 or null if insufficient shared movies
     */
    private static async calculateRatingAgreement(
        viewerId: string,
        authorId: string
    ): Promise<{ score: number | null; sharedMovies: Array<{ title: string; rating: number }>; count: number }> {
        // Get watched lists for both users
        const [viewerList, authorList] = await Promise.all([
            WatchedList.findOne({ userId: viewerId }).lean(),
            WatchedList.findOne({ userId: authorId }).lean()
        ]);

        if (!viewerList || !authorList) {
            return { score: null, sharedMovies: [], count: 0 };
        }

        // Create maps for quick lookup (only rated movies)
        const viewerRatings = new Map<number, number>();
        const authorRatings = new Map<number, number>();

        for (const item of (viewerList.items || []) as IWatchedItem[]) {
            if (item.rating && item.rating > 0) {
                viewerRatings.set(item.tmdbId, item.rating);
            }
        }

        for (const item of (authorList.items || []) as IWatchedItem[]) {
            if (item.rating && item.rating > 0) {
                authorRatings.set(item.tmdbId, item.rating);
            }
        }

        // Find shared movies (both rated)
        const sharedTmdbIds: number[] = [];
        const ratingDeltas: number[] = [];

        for (const [tmdbId, viewerRating] of viewerRatings) {
            const authorRating = authorRatings.get(tmdbId);
            if (authorRating !== undefined) {
                sharedTmdbIds.push(tmdbId);
                ratingDeltas.push(Math.abs(viewerRating - authorRating));
            }
        }

        if (sharedTmdbIds.length < this.MIN_SHARED_MOVIES) {
            return { score: null, sharedMovies: [], count: sharedTmdbIds.length };
        }

        // Calculate average delta
        const avgDelta = ratingDeltas.reduce((a, b) => a + b, 0) / ratingDeltas.length;

        // Formula: AgreementScore = 100 - (AverageDelta * 10)
        // Clamp to 0-100
        const agreementScore = Math.max(0, Math.min(100, 100 - (avgDelta * 10)));

        // Get top shared favorites (both rated >= 8)
        const topShared: Array<{ tmdbId: number; avgRating: number }> = [];
        for (const tmdbId of sharedTmdbIds) {
            const viewerRating = viewerRatings.get(tmdbId)!;
            const authorRating = authorRatings.get(tmdbId)!;
            if (viewerRating >= 8 && authorRating >= 8) {
                topShared.push({ tmdbId, avgRating: (viewerRating + authorRating) / 2 });
            }
        }

        // Sort by average rating and get top 5
        topShared.sort((a, b) => b.avgRating - a.avgRating);
        const topTmdbIds = topShared.slice(0, 5).map(s => s.tmdbId);

        // Fetch movie titles
        const movies = await Movie.find({ tmdbId: { $in: topTmdbIds } }).select('tmdbId title').lean();
        const titleMap = new Map(movies.map(m => [m.tmdbId, m.title]));

        const sharedFavorites = topTmdbIds
            .map(id => titleMap.get(id))
            .filter((t): t is string => !!t);

        return {
            score: Math.round(agreementScore),
            sharedMovies: sharedFavorites.map(title => ({ title, rating: 0 })),
            count: sharedTmdbIds.length
        };
    }

    /**
     * Get verdict based on match score
     */
    private static getVerdict(score: number): string {
        if (score >= 90) return 'Cinematic Soulmates';
        if (score >= 70) return 'Great Taste';
        if (score >= 50) return 'Compatible';
        if (score >= 30) return 'Different Perspectives';
        return 'Polar Opposites';
    }

    /**
     * Calculate compatibility between two users
     * Main entry point for the Taste Match feature
     */
    static async calculateCompatibility(
        viewerId: string,
        authorId: string
    ): Promise<TasteMatchResult> {
        // 1. Fetch mood vectors
        const [viewerMood, authorMood] = await Promise.all([
            MoodService.getUserMood(viewerId),
            MoodService.getUserMood(authorId)
        ]);

        // 2. Step A: Mood Similarity (60% weight)
        const cosineSim = this.cosineSimilarity(viewerMood, authorMood);
        const moodSimilarityScore = this.mapToPercentage(cosineSim);

        // 3. Step B: Rating Agreement (40% weight)
        const ratingResult = await this.calculateRatingAgreement(viewerId, authorId);

        // 4. Calculate final score
        let finalScore: number;
        if (ratingResult.score === null) {
            // Not enough shared movies - use 100% mood similarity
            finalScore = moodSimilarityScore;
            console.log(`[TasteMatch] Insufficient shared movies (${ratingResult.count}), using mood only`);
        } else {
            // Weighted average
            finalScore = Math.round(
                (moodSimilarityScore * this.MOOD_WEIGHT) +
                (ratingResult.score * this.RATING_WEIGHT)
            );
        }

        // 5. Get archetypes
        const viewerArchetype = ArchetypeService.getArchetype(viewerMood);
        const authorArchetype = ArchetypeService.getArchetype(authorMood);

        // 6. Build result
        const result: TasteMatchResult = {
            matchScore: finalScore,
            verdict: this.getVerdict(finalScore),
            sharedFavorites: ratingResult.sharedMovies.map(m => m.title),
            theirArchetype: {
                name: authorArchetype.name,
                displayName: authorArchetype.displayName,
                emoji: authorArchetype.emoji
            },
            yourArchetype: {
                name: viewerArchetype.name,
                displayName: viewerArchetype.displayName,
                emoji: viewerArchetype.emoji
            },
            breakdown: {
                moodSimilarity: moodSimilarityScore,
                ratingAgreement: ratingResult.score,
                sharedMoviesCount: ratingResult.count
            },
            radarData: {
                user: [
                    viewerMood.adrenaline, viewerMood.joy, viewerMood.romance, viewerMood.wonder, viewerMood.inspiration,
                    viewerMood.intellect, viewerMood.nostalgia, viewerMood.melancholy, viewerMood.darkness, viewerMood.tension
                ],
                target: [
                    authorMood.adrenaline, authorMood.joy, authorMood.romance, authorMood.wonder, authorMood.inspiration,
                    authorMood.intellect, authorMood.nostalgia, authorMood.melancholy, authorMood.darkness, authorMood.tension
                ]
            }
        };

        console.log(`[TasteMatch] ${viewerId} vs ${authorId}: ${finalScore}% (${result.verdict})`);
        console.log(`   Mood: ${moodSimilarityScore}%, Ratings: ${ratingResult.score ?? 'N/A'}%, Shared: ${ratingResult.count}`);

        return result;
    }
}
