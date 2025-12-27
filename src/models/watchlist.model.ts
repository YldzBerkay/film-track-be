import mongoose, { Document, Schema } from 'mongoose';

export interface IWatchlistItem {
    tmdbId: number;
    mediaType: 'movie' | 'tv';
    title: string;
    posterPath?: string;
    addedAt: Date;
}

export interface IWatchlist extends Document {
    userId: mongoose.Types.ObjectId;
    name: string;
    icon?: string;  // Material icon name for custom lists
    isDefault: boolean;
    privacyStatus: number;  // 0=everyone, 1=friends, 2=nobody
    items: IWatchlistItem[];
    createdAt: Date;
    updatedAt: Date;
}

const watchlistItemSchema = new Schema<IWatchlistItem>(
    {
        tmdbId: {
            type: Number,
            required: true
        },
        mediaType: {
            type: String,
            enum: ['movie', 'tv'],
            required: true
        },
        title: {
            type: String,
            required: true
        },
        posterPath: String,
        addedAt: {
            type: Date,
            default: Date.now
        }
    },
    { _id: false }
);

const watchlistSchema = new Schema<IWatchlist>(
    {
        userId: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true
        },
        name: {
            type: String,
            required: true,
            trim: true,
            maxlength: 100
        },
        icon: {
            type: String,
            trim: true,
            default: 'list'  // Default icon for custom lists
        },
        isDefault: {
            type: Boolean,
            default: false
        },
        privacyStatus: {
            type: Number,
            enum: [0, 1, 2],  // 0=everyone, 1=friends, 2=nobody
            default: 0
        },
        items: [watchlistItemSchema]
    },
    {
        timestamps: true
    }
);

// Compound index for efficient queries
watchlistSchema.index({ userId: 1, name: 1 });

export const Watchlist = mongoose.model<IWatchlist>('Watchlist', watchlistSchema);
