import { Watchlist, IWatchlist, IWatchlistItem } from '../models/watchlist.model';
import { WatchedList } from '../models/watched-list.model';
import mongoose from 'mongoose';

const DEFAULT_WATCHLIST_NAME = 'Watchlist';

interface AddItemData {
    tmdbId: number;
    mediaType: 'movie' | 'tv';
    title: string;
    posterPath?: string;
    numberOfEpisodes?: number;
    numberOfSeasons?: number;
}

// Plain object type for lean() results
type WatchlistLean = {
    _id: mongoose.Types.ObjectId;
    userId: mongoose.Types.ObjectId;
    name: string;
    icon?: string;
    isDefault: boolean;
    privacyStatus: number;
    items: IWatchlistItem[];
    createdAt: Date;
    updatedAt: Date;
};

export class WatchlistService {
    /**
     * Get dashboard summary (Watched List, Default Watchlist, First Custom List)
     */
    static async getDashboardSummary(userId: string) {
        const [watchedList, defaultWatchlist, customList] = await Promise.all([
            WatchedList.findOne({ userId: new mongoose.Types.ObjectId(userId), isDefault: true })
                .lean(),
            Watchlist.findOne({ userId: new mongoose.Types.ObjectId(userId), isDefault: true })
                .lean(),
            Watchlist.findOne({ userId: new mongoose.Types.ObjectId(userId), isDefault: false })
                .sort({ createdAt: 1 }) // First created custom list
                .lean()
        ]);

        const formatList = (list: any) => {
            if (!list) return null;
            const { items, ...rest } = list;
            return {
                ...rest,
                itemCount: items ? items.length : 0
            };
        };

        return {
            watchedList: formatList(watchedList),
            defaultWatchlist: formatList(defaultWatchlist),
            customList: formatList(customList)
        };
    }

    /**
     * Create the default watchlist for a new user
     */
    static async createDefaultWatchlist(userId: string): Promise<IWatchlist> {
        const watchlist = new Watchlist({
            userId: new mongoose.Types.ObjectId(userId),
            name: DEFAULT_WATCHLIST_NAME,
            isDefault: true,
            items: []
        });
        return watchlist.save();
    }

    /**
     * Get all watchlists for a user
     */
    static async getUserWatchlists(userId: string): Promise<WatchlistLean[]> {
        return Watchlist.find({ userId: new mongoose.Types.ObjectId(userId) })
            .sort({ isDefault: -1, createdAt: -1 })
            .lean<WatchlistLean[]>();
    }

    /**
     * Get a specific watchlist
     */
    static async getWatchlist(watchlistId: string, userId: string): Promise<WatchlistLean | null> {
        return Watchlist.findOne({
            _id: new mongoose.Types.ObjectId(watchlistId),
            userId: new mongoose.Types.ObjectId(userId)
        }).lean<WatchlistLean | null>();
    }

    /**
     * Get user's default watchlist
     */
    static async getDefaultWatchlist(userId: string): Promise<WatchlistLean | null> {
        return Watchlist.findOne({
            userId: new mongoose.Types.ObjectId(userId),
            isDefault: true
        }).lean<WatchlistLean | null>();
    }

    /**
     * Create a custom watchlist
     */
    static async createCustomList(userId: string, name: string, icon?: string): Promise<IWatchlist> {
        const watchlist = new Watchlist({
            userId: new mongoose.Types.ObjectId(userId),
            name: name.trim(),
            icon: icon || 'list',
            isDefault: false,
            items: []
        });
        return watchlist.save();
    }

    /**
     * Delete a non-default watchlist
     */
    static async deleteList(watchlistId: string, userId: string): Promise<{ deleted: boolean; message?: string }> {
        const watchlist = await Watchlist.findOne({
            _id: new mongoose.Types.ObjectId(watchlistId),
            userId: new mongoose.Types.ObjectId(userId)
        });

        if (!watchlist) {
            return { deleted: false, message: 'Watchlist not found' };
        }

        if (watchlist.isDefault) {
            return { deleted: false, message: 'Cannot delete default watchlist' };
        }

        await Watchlist.deleteOne({ _id: watchlist._id });
        return { deleted: true };
    }

    /**
     * Rename a watchlist (only non-default lists can be renamed)
     */
    static async renameList(watchlistId: string, userId: string, newName: string): Promise<{ success: boolean; watchlist?: IWatchlist; message?: string }> {
        const watchlist = await Watchlist.findOne({
            _id: new mongoose.Types.ObjectId(watchlistId),
            userId: new mongoose.Types.ObjectId(userId)
        });

        if (!watchlist) {
            return { success: false, message: 'Watchlist not found' };
        }

        if (watchlist.isDefault) {
            return { success: false, message: 'Cannot rename default watchlist' };
        }

        const updated = await Watchlist.findOneAndUpdate(
            { _id: watchlist._id },
            { name: newName.trim() },
            { new: true }
        );

        return { success: true, watchlist: updated || undefined };
    }

    /**
     * Add an item to a watchlist
     */
    static async addItem(
        watchlistId: string,
        userId: string,
        item: AddItemData
    ): Promise<IWatchlist | null> {
        // Check if item already exists
        const existingItem = await Watchlist.findOne({
            _id: new mongoose.Types.ObjectId(watchlistId),
            userId: new mongoose.Types.ObjectId(userId),
            'items.tmdbId': item.tmdbId,
            'items.mediaType': item.mediaType
        });

        if (existingItem) {
            // Item already exists, return as-is
            return existingItem;
        }

        return Watchlist.findOneAndUpdate(
            {
                _id: new mongoose.Types.ObjectId(watchlistId),
                userId: new mongoose.Types.ObjectId(userId)
            },
            {
                $push: {
                    items: {
                        tmdbId: item.tmdbId,
                        mediaType: item.mediaType,
                        title: item.title,
                        posterPath: item.posterPath,
                        numberOfEpisodes: item.numberOfEpisodes,
                        numberOfSeasons: item.numberOfSeasons,
                        addedAt: new Date()
                    }
                }
            },
            { new: true }
        );
    }

    /**
     * Remove an item from a watchlist
     */
    static async removeItem(
        watchlistId: string,
        userId: string,
        tmdbId: number,
        mediaType: 'movie' | 'tv'
    ): Promise<IWatchlist | null> {
        return Watchlist.findOneAndUpdate(
            {
                _id: new mongoose.Types.ObjectId(watchlistId),
                userId: new mongoose.Types.ObjectId(userId)
            },
            {
                $pull: {
                    items: { tmdbId, mediaType }
                }
            },
            { new: true }
        );
    }

    /**
     * Check if an item is in any of user's watchlists
     */
    static async isInWatchlist(
        userId: string,
        tmdbId: number,
        mediaType: 'movie' | 'tv'
    ): Promise<{ inWatchlist: boolean; watchlistId?: string }> {
        const watchlist = await Watchlist.findOne({
            userId: new mongoose.Types.ObjectId(userId),
            'items.tmdbId': tmdbId,
            'items.mediaType': mediaType
        }).select('_id');

        return {
            inWatchlist: !!watchlist,
            watchlistId: watchlist?._id?.toString()
        };
    }

    /**
     * Ensure user has a default watchlist (create if missing)
     */
    static async ensureDefaultWatchlist(userId: string): Promise<WatchlistLean | IWatchlist> {
        const existing = await this.getDefaultWatchlist(userId);
        if (existing) {
            return existing;
        }
        return this.createDefaultWatchlist(userId);
    }

    /**
     * Update privacy status of a watchlist
     */
    static async updatePrivacy(watchlistId: string, userId: string, privacyStatus: number): Promise<{ success: boolean; watchlist?: IWatchlist; message?: string }> {
        const watchlist = await Watchlist.findOne({
            _id: new mongoose.Types.ObjectId(watchlistId),
            userId: new mongoose.Types.ObjectId(userId)
        });

        if (!watchlist) {
            return { success: false, message: 'Watchlist not found' };
        }

        const updated = await Watchlist.findOneAndUpdate(
            { _id: watchlist._id },
            { privacyStatus },
            { new: true }
        );

        return { success: true, watchlist: updated || undefined };
    }

    /**
     * Reorder items in a watchlist
     */
    static async reorderItems(
        watchlistId: string,
        userId: string,
        orderedTmdbIds: number[],
        name?: string,
        icon?: string
    ): Promise<{ success: boolean; watchlist?: IWatchlist; message?: string }> {
        const watchlist = await Watchlist.findOne({
            _id: new mongoose.Types.ObjectId(watchlistId),
            userId: new mongoose.Types.ObjectId(userId)
        });

        if (!watchlist) {
            return { success: false, message: 'Watchlist not found' };
        }

        const updateData: any = {};

        // Handle reordering if orderedTmdbIds is provided
        if (orderedTmdbIds && Array.isArray(orderedTmdbIds)) {
            const itemMap = new Map(watchlist.items.map(item => [item.tmdbId, item]));
            const reorderedItems = orderedTmdbIds
                .filter(id => itemMap.has(id))
                .map(id => itemMap.get(id)!);

            const remainingItems = watchlist.items.filter(item => !orderedTmdbIds.includes(item.tmdbId));
            updateData.items = [...reorderedItems, ...remainingItems];
        }

        // Handle name and icon updates if not a default watchlist
        if (!watchlist.isDefault) {
            if (name && typeof name === 'string' && name.trim().length > 0) {
                updateData.name = name.trim();
            }
            if (icon && typeof icon === 'string' && icon.trim().length > 0) {
                updateData.icon = icon.trim();
            }
        }

        const updated = await Watchlist.findOneAndUpdate(
            { _id: watchlist._id },
            updateData,
            { new: true }
        );

        return { success: true, watchlist: updated || undefined };
    }
}
