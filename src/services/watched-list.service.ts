import { WatchedList, IWatchedList, IWatchedItem } from '../models/watched-list.model';
import mongoose from 'mongoose';
import { TMDBService } from './tmdb.service';
import { User } from '../models/user.model';
import { ActivityService } from './activity.service';

const DEFAULT_WATCHED_LIST_NAME = 'Watched';

interface AddItemData {
    tmdbId: number;
    mediaType: 'movie' | 'tv';
    title: string;
    posterPath?: string;
    runtime: number;
    numberOfEpisodes?: number;
    numberOfSeasons?: number;
    genres?: string[];
    rating?: number;    // Optional: only save if user explicitly provides 1-10
    reviewText?: string;
    feedback?: 'like' | 'dislike' | null;  // Raw sentiment (decoupled from rating)
    watchedAt?: Date;
    isMoodPick?: boolean;
}

// Plain object type for lean() results
type WatchedListLean = {
    _id: mongoose.Types.ObjectId;
    userId: mongoose.Types.ObjectId;
    name: string;
    isDefault: boolean;
    privacyStatus: number;
    items: IWatchedItem[];
    totalRuntime: number;
    createdAt: Date;
    updatedAt: Date;
};

export class WatchedListService {
    /**
     * Create the default watched list for a new user
     */
    static async createDefaultWatchedList(userId: string): Promise<IWatchedList> {
        const watchedList = new WatchedList({
            userId: new mongoose.Types.ObjectId(userId),
            name: DEFAULT_WATCHED_LIST_NAME,
            isDefault: true,
            items: [],
            totalRuntime: 0
        });
        return watchedList.save();
    }

    /**
     * Get user's default watched list
     */
    static async getUserWatchedList(userId: string): Promise<WatchedListLean | null> {
        return WatchedList.findOne({
            userId: new mongoose.Types.ObjectId(userId),
            isDefault: true
        }).lean<WatchedListLean | null>();
    }

    /**
     * Ensure user has a default watched list (create if missing)
     */
    static async ensureDefaultWatchedList(userId: string): Promise<WatchedListLean | IWatchedList> {
        const existing = await this.getUserWatchedList(userId);
        if (existing) {
            return existing;
        }
        return this.createDefaultWatchedList(userId);
    }

    /**
     * Add an item to the watched list
     */
    static async addItem(userId: string, item: AddItemData): Promise<{ watchedList: IWatchedList | null, newStreak?: number }> {
        // First ensure the list exists
        await this.ensureDefaultWatchedList(userId);

        // Check if item already exists
        const existingItem = await WatchedList.findOne({
            userId: new mongoose.Types.ObjectId(userId),
            isDefault: true,
            'items.tmdbId': item.tmdbId,
            'items.mediaType': item.mediaType
        });

        let resultWatchedList: IWatchedList | null = null;

        if (existingItem) {
            // Item already exists, update it instead
            resultWatchedList = await WatchedList.findOneAndUpdate(
                {
                    userId: new mongoose.Types.ObjectId(userId),
                    isDefault: true,
                    'items.tmdbId': item.tmdbId,
                    'items.mediaType': item.mediaType
                },
                {
                    $set: {
                        'items.$.rating': item.rating,
                        'items.$.feedback': item.feedback,
                        'items.$.numberOfEpisodes': item.numberOfEpisodes,
                        'items.$.numberOfSeasons': item.numberOfSeasons,
                        'items.$.genres': item.genres,
                        'items.$.watchedAt': item.watchedAt || new Date()
                    }
                },
                { new: true }
            );
        } else {
            // AUTO-FIX: Fetch missing genres if not provided
            if (!item.genres || item.genres.length === 0) {
                try {
                    if (item.mediaType === 'movie') {
                        const details = await TMDBService.getMovieDetails(item.tmdbId.toString());
                        item.genres = details.genres?.map(g => g.name) || [];
                    } else if (item.mediaType === 'tv') {
                        const details = await TMDBService.getShowDetails(item.tmdbId.toString());
                        item.genres = details.genres?.map(g => g.name) || [];
                    }
                } catch (error) {
                    console.warn(`Failed to auto-fetch genres for ${item.title}:`, error);
                }
            }

            // Add new item and update total runtime
            resultWatchedList = await WatchedList.findOneAndUpdate(
                {
                    userId: new mongoose.Types.ObjectId(userId),
                    isDefault: true
                },
                {
                    $push: {
                        items: {
                            tmdbId: item.tmdbId,
                            mediaType: item.mediaType,
                            title: item.title,
                            posterPath: item.posterPath,
                            runtime: item.runtime,
                            numberOfEpisodes: item.numberOfEpisodes,
                            numberOfSeasons: item.numberOfSeasons,
                            genres: item.genres,
                            rating: item.rating,
                            feedback: item.feedback,
                            watchedAt: item.watchedAt || new Date(),
                            addedAt: new Date()
                        }
                    },
                    $inc: {
                        totalRuntime: item.runtime
                    }
                },
                { new: true }
            );

            // Create activity if rating/review provided
            if (resultWatchedList && (item.rating || item.reviewText)) {
                await ActivityService.createActivityForRating({
                    userId,
                    type: 'rating',
                    mediaType: item.mediaType === 'tv' ? 'tv_show' : 'movie',
                    tmdbId: item.tmdbId,
                    mediaTitle: item.title,
                    mediaPosterPath: item.posterPath,
                    rating: item.rating,
                    reviewText: item.reviewText,
                    genres: item.genres,
                    isMoodPick: item.isMoodPick
                });
            }
        }

        // --- Daily Pick Streak Logic ---
        let newStreak: number | undefined;
        try {
            const user = await User.findById(userId);
            if (user && user.dailyPick && user.dailyPick.tmdbId === item.tmdbId) {
                // Check if we ALREADY incremented for today/this pick (Idempotency)
                if (!user.dailyPick.watched) {
                    // Update Daily Pick status
                    user.dailyPick.watched = true;

                    // Increment Streak
                    user.streak.current = (user.streak.current || 0) + 1;
                    user.streak.lastLoginDate = new Date(); // Update last activity for streak

                    await user.save();
                    newStreak = user.streak.current;
                    console.log(`[Streak] User ${userId} completed Daily Pick! Streak incremented to ${newStreak}.`);
                }
            }
        } catch (error) {
            console.error('Error in Daily Pick Streak check:', error);
            // Don't fail the whole request effectively, just log error
        }

        return { watchedList: resultWatchedList, newStreak };
    }

    /**
    * Update item rating
    */
    static async updateItemRating(
        userId: string,
        tmdbId: number,
        mediaType: 'movie' | 'tv',
        rating: number,
        reviewText?: string
    ): Promise<IWatchedList | null> {
        // Validate rating
        if (rating < 1 || rating > 10 || !Number.isInteger(rating)) {
            throw new Error('Rating must be an integer between 1 and 10');
        }

        const updatedList = await WatchedList.findOneAndUpdate(
            {
                userId: new mongoose.Types.ObjectId(userId),
                isDefault: true,
                'items.tmdbId': tmdbId,
                'items.mediaType': mediaType
            },
            {
                $set: {
                    'items.$.rating': rating
                }
            },
            { new: true }
        );

        if (updatedList) {
            const item = updatedList.items.find(i => i.tmdbId === tmdbId && i.mediaType === mediaType);
            if (item) {
                // Create or update activity
                await ActivityService.createActivityForRating({
                    userId,
                    type: 'rating', // Will be upgraded to 'review' inside if text exists
                    mediaType: mediaType === 'tv' ? 'tv_show' : 'movie',
                    tmdbId,
                    mediaTitle: item.title,
                    mediaPosterPath: item.posterPath,
                    rating,
                    reviewText
                });
            }
        }

        return updatedList;
    }

    /**
     * Remove an item from the watched list
     */
    static async removeItem(
        userId: string,
        tmdbId: number,
        mediaType: 'movie' | 'tv'
    ): Promise<IWatchedList | null> {
        // First get the item's runtime to subtract
        const watchedList = await WatchedList.findOne({
            userId: new mongoose.Types.ObjectId(userId),
            isDefault: true
        });

        if (!watchedList) return null;

        const item = watchedList.items.find(
            i => i.tmdbId === tmdbId && i.mediaType === mediaType
        );

        if (!item) return watchedList;

        return WatchedList.findOneAndUpdate(
            {
                userId: new mongoose.Types.ObjectId(userId),
                isDefault: true
            },
            {
                $pull: {
                    items: { tmdbId, mediaType }
                },
                $inc: {
                    totalRuntime: -item.runtime
                }
            },
            { new: true }
        );
    }

    /**
     * Check if an item is watched
     */
    static async isWatched(
        userId: string,
        tmdbId: number,
        mediaType: 'movie' | 'tv'
    ): Promise<{ isWatched: boolean; rating?: number }> {
        const watchedList = await WatchedList.findOne({
            userId: new mongoose.Types.ObjectId(userId),
            isDefault: true,
            'items.tmdbId': tmdbId,
            'items.mediaType': mediaType
        }).select('items.$');

        if (!watchedList || !watchedList.items.length) {
            return { isWatched: false };
        }

        return {
            isWatched: true,
            rating: watchedList.items[0].rating
        };
    }

    /**
     * Get watch statistics
     */
    static async getStats(userId: string): Promise<{
        totalRuntime: number;
        totalMovies: number;
        totalTvShows: number;
        averageRating: number | null;
    }> {
        const watchedList = await this.getUserWatchedList(userId);

        if (!watchedList || watchedList.items.length === 0) {
            return {
                totalRuntime: 0,
                totalMovies: 0,
                totalTvShows: 0,
                averageRating: null
            };
        }

        const movies = watchedList.items.filter(i => i.mediaType === 'movie');
        const tvShows = watchedList.items.filter(i => i.mediaType === 'tv');
        const ratings = watchedList.items
            .filter(i => i.rating !== undefined && i.rating !== null)
            .map(i => i.rating!);

        return {
            totalRuntime: watchedList.totalRuntime,
            totalMovies: movies.length,
            totalTvShows: tvShows.length,
            averageRating: ratings.length > 0
                ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10
                : null
        };
    }

    /**
     * Update privacy status of watched list
     */
    static async updatePrivacy(userId: string, privacyStatus: number): Promise<{ success: boolean; watchedList?: IWatchedList; message?: string }> {
        // Ensure list exists
        await this.ensureDefaultWatchedList(userId);

        const updated = await WatchedList.findOneAndUpdate(
            {
                userId: new mongoose.Types.ObjectId(userId),
                isDefault: true
            },
            { privacyStatus },
            { new: true }
        );

        if (!updated) {
            return { success: false, message: 'Watched list not found' };
        }

        return { success: true, watchedList: updated };
    }

    /**
     * Reorder items in the watched list
     */
    static async reorderItems(userId: string, orderedTmdbIds: number[]): Promise<{ success: boolean; watchedList?: IWatchedList; message?: string }> {
        const watchedList = await WatchedList.findOne({
            userId: new mongoose.Types.ObjectId(userId)
        });

        if (!watchedList) {
            return { success: false, message: 'Watched list not found' };
        }

        // Create a map of tmdbId to item
        const itemMap = new Map(watchedList.items.map((item: IWatchedItem) => [item.tmdbId, item]));

        // Reorder items based on the provided order
        const reorderedItems = orderedTmdbIds
            .filter(id => itemMap.has(id))
            .map(id => itemMap.get(id)!);

        // Update with ONLY the reordered items (effectively removing any missing ones)
        const updated = await WatchedList.findOneAndUpdate(
            { _id: watchedList._id },
            {
                items: reorderedItems,
                // Recalculate total runtime since items might have been removed
                totalRuntime: reorderedItems.reduce((sum, item) => sum + (item.runtime || 0), 0)
            },
            { new: true }
        );

        if (!updated) {
            return { success: false, message: 'Failed to reorder items' };
        }

        return { success: true, watchedList: updated };
    }
    /**
     * Get public aggregated stats for an item
     */
    static async getItemPublicStats(tmdbId: number, mediaType: 'movie' | 'tv'): Promise<{ count: number; averageRating: number }> {
        const result = await WatchedList.aggregate([
            // Match lists that have the item (perf optimization)
            {
                $match: {
                    'items.tmdbId': tmdbId,
                    'items.mediaType': mediaType
                }
            },
            // Unwind items to process individually
            { $unwind: '$items' },
            // Match the specific item
            {
                $match: {
                    'items.tmdbId': tmdbId,
                    'items.mediaType': mediaType,
                    'items.rating': { $exists: true, $ne: null }
                }
            },
            // Group and calculate stats
            {
                $group: {
                    _id: null,
                    count: { $sum: 1 },
                    averageRating: { $avg: '$items.rating' }
                }
            }
        ]);

        if (result.length === 0) {
            return { count: 0, averageRating: 0 };
        }

        // Round average rating to 1 decimal place
        const avg = Math.round(result[0].averageRating * 10) / 10;

        return {
            count: result[0].count,
            averageRating: avg
        };
    }

    /**
     * Get detailed watch statistics for reports
     */
    static async getDetailedStats(userId: string): Promise<{
        totalEpisodes: number;
        totalSeasons: number;
        totalTvSeries: number;
        totalFilms: number;
        totalTvSeriesRuntime: number;
        totalFilmsRuntime: number;
        totalRuntime: number;
        genreCounts: Record<string, number>;
        genreRatings: {
            all: Array<{ genre: string; averageRating: number; count: number; lastRatedAt: Date }>;
            top: Array<{ genre: string; averageRating: number; count: number; lastRatedAt: Date }>;
            bottom: Array<{ genre: string; averageRating: number; count: number; lastRatedAt: Date }>;
        };
        totalRatingCount: number;
        averageRating: number | null;
        ratings: Array<{ tmdbId: number; mediaType: 'movie' | 'tv'; title: string; rating: number; watchedAt: Date }>;
    }> {
        const watchedList = await this.getUserWatchedList(userId);

        if (!watchedList || watchedList.items.length === 0) {
            return {
                totalEpisodes: 0,
                totalSeasons: 0,
                totalTvSeries: 0,
                totalFilms: 0,
                totalTvSeriesRuntime: 0,
                totalFilmsRuntime: 0,
                totalRuntime: 0,
                genreCounts: {},
                genreRatings: { all: [], top: [], bottom: [] },
                totalRatingCount: 0,
                averageRating: null,
                ratings: []
            };
        }

        const movies = watchedList.items.filter(i => i.mediaType === 'movie');
        const tvShows = watchedList.items.filter(i => i.mediaType === 'tv');

        // Calculate episode and season totals from TV shows
        const totalEpisodes = tvShows.reduce((sum, show) => sum + (show.numberOfEpisodes || 0), 0);
        const totalSeasons = tvShows.reduce((sum, show) => sum + (show.numberOfSeasons || 0), 0);

        // Calculate runtimes
        const totalTvSeriesRuntime = tvShows.reduce((sum, show) => sum + (show.runtime || 0), 0);
        const totalFilmsRuntime = movies.reduce((sum, movie) => sum + (movie.runtime || 0), 0);

        // Calculate genre counts
        const genreCounts: Record<string, number> = {};
        watchedList.items.forEach(item => {
            if (item.genres && item.genres.length > 0) {
                item.genres.forEach(genre => {
                    genreCounts[genre] = (genreCounts[genre] || 0) + 1;
                });
            }
        });

        // Get ratings
        const ratedItems = watchedList.items.filter(i => i.rating !== undefined && i.rating !== null);
        const ratings = ratedItems.map(i => ({
            tmdbId: i.tmdbId,
            mediaType: i.mediaType,
            title: i.title,
            rating: i.rating!,
            watchedAt: i.watchedAt
        }));

        const avgRating = ratedItems.length > 0
            ? Math.round((ratedItems.reduce((sum, i) => sum + i.rating!, 0) / ratedItems.length) * 10) / 10
            : null;

        // Calculate genre ratings with time decay
        const TIME_DECAY_DAYS = 7;
        const MAX_DAYS = 90;
        const now = new Date();

        const calculateTimeDecay = (watchedAt: Date): number => {
            const daysDiff = Math.floor((now.getTime() - new Date(watchedAt).getTime()) / (1000 * 60 * 60 * 24));
            if (daysDiff <= TIME_DECAY_DAYS) {
                return 1.0;
            } else if (daysDiff <= MAX_DAYS) {
                const decayRange = MAX_DAYS - TIME_DECAY_DAYS;
                const decayProgress = (daysDiff - TIME_DECAY_DAYS) / decayRange;
                return 1.0 - decayProgress * 0.5;
            }
            return 0.5;
        };

        // Genre rating aggregation: { genre: { totalWeightedRating, totalWeight, count, lastRatedAt } }
        const genreRatingAgg: Record<string, { totalWeightedRating: number; totalWeight: number; count: number; lastRatedAt: Date }> = {};

        ratedItems.forEach(item => {
            if (item.genres && item.genres.length > 0 && item.rating) {
                const timeDecay = calculateTimeDecay(item.watchedAt);
                const ratingWeight = item.rating / 10; // 1-10 scale
                const combinedWeight = ratingWeight * timeDecay;

                item.genres.forEach(genre => {
                    if (!genreRatingAgg[genre]) {
                        genreRatingAgg[genre] = { totalWeightedRating: 0, totalWeight: 0, count: 0, lastRatedAt: item.watchedAt };
                    }
                    genreRatingAgg[genre].totalWeightedRating += item.rating! * combinedWeight;
                    genreRatingAgg[genre].totalWeight += combinedWeight;
                    genreRatingAgg[genre].count += 1;

                    // Update lastRatedAt if newer
                    if (item.watchedAt > genreRatingAgg[genre].lastRatedAt) {
                        genreRatingAgg[genre].lastRatedAt = item.watchedAt;
                    }
                });
            }
        });

        // Calculate weighted average rating for each genre
        const genreRatings = Object.entries(genreRatingAgg)
            .map(([genre, data]) => ({
                genre,
                averageRating: Math.round((data.totalWeightedRating / data.totalWeight) * 10) / 10,
                count: data.count,
                lastRatedAt: data.lastRatedAt
            }))
            .sort((a, b) => b.averageRating - a.averageRating);

        const topGenres = genreRatings.slice(0, 5);
        const bottomGenres = genreRatings.slice(-5).reverse();

        // Sort ratings by watchedAt (newest first) and limit to 10 for display
        const recentRatings = ratings
            .sort((a, b) => new Date(b.watchedAt).getTime() - new Date(a.watchedAt).getTime())
            .slice(0, 10);

        return {
            totalEpisodes,
            totalSeasons,
            totalTvSeries: tvShows.length,
            totalFilms: movies.length,
            totalTvSeriesRuntime,
            totalFilmsRuntime,
            totalRuntime: watchedList.totalRuntime,
            genreCounts,
            genreRatings: {
                all: genreRatings,
                top: topGenres,
                bottom: bottomGenres
            },
            totalRatingCount: ratedItems.length,
            averageRating: avgRating,
            ratings: recentRatings
        };
    }
}
