import { WatchedList, IWatchedList, IWatchedItem } from '../models/watched-list.model';
import mongoose from 'mongoose';

const DEFAULT_WATCHED_LIST_NAME = 'Watched';

interface AddItemData {
    tmdbId: number;
    mediaType: 'movie' | 'tv';
    title: string;
    posterPath?: string;
    runtime: number;
    rating?: number;
    watchedAt?: Date;
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
    static async addItem(userId: string, item: AddItemData): Promise<IWatchedList | null> {
        // First ensure the list exists
        await this.ensureDefaultWatchedList(userId);

        // Check if item already exists
        const existingItem = await WatchedList.findOne({
            userId: new mongoose.Types.ObjectId(userId),
            isDefault: true,
            'items.tmdbId': item.tmdbId,
            'items.mediaType': item.mediaType
        });

        if (existingItem) {
            // Item already exists, update it instead
            return WatchedList.findOneAndUpdate(
                {
                    userId: new mongoose.Types.ObjectId(userId),
                    isDefault: true,
                    'items.tmdbId': item.tmdbId,
                    'items.mediaType': item.mediaType
                },
                {
                    $set: {
                        'items.$.rating': item.rating,
                        'items.$.watchedAt': item.watchedAt || new Date()
                    }
                },
                { new: true }
            );
        }

        // Add new item and update total runtime
        return WatchedList.findOneAndUpdate(
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
                        rating: item.rating,
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
    }

    /**
     * Update item rating
     */
    static async updateItemRating(
        userId: string,
        tmdbId: number,
        mediaType: 'movie' | 'tv',
        rating: number
    ): Promise<IWatchedList | null> {
        // Validate rating
        if (rating < 1 || rating > 10 || !Number.isInteger(rating)) {
            throw new Error('Rating must be an integer between 1 and 10');
        }

        return WatchedList.findOneAndUpdate(
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
}
