import mongoose, { Document, Schema } from 'mongoose';

export interface IWatchedItem {
    tmdbId: number;
    mediaType: 'movie' | 'tv';
    title: string;
    posterPath?: string;
    runtime: number;           // Minutes spent watching
    rating?: number;           // 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5
    watchedAt: Date;           // When they watched it
    addedAt: Date;             // When it was added to the list
}

export interface IWatchedList extends Document {
    userId: mongoose.Types.ObjectId;
    name: string;
    isDefault: boolean;
    privacyStatus: number;  // 0=everyone, 1=friends, 2=nobody
    items: IWatchedItem[];
    totalRuntime: number;      // Cached total runtime in minutes
    createdAt: Date;
    updatedAt: Date;
}

const watchedItemSchema = new Schema<IWatchedItem>(
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
        runtime: {
            type: Number,
            required: true,
            default: 0
        },
        rating: {
            type: Number,
            min: 0.5,
            max: 5,
            validate: {
                validator: function (v: number) {
                    // Allow 0.5 increments: 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5
                    return v === undefined || v === null || (v >= 0.5 && v <= 5 && v % 0.5 === 0);
                },
                message: 'Rating must be between 0.5 and 5 in 0.5 increments'
            }
        },
        watchedAt: {
            type: Date,
            default: Date.now
        },
        addedAt: {
            type: Date,
            default: Date.now
        }
    },
    { _id: false }
);

const watchedListSchema = new Schema<IWatchedList>(
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
            default: 'Watched'
        },
        isDefault: {
            type: Boolean,
            default: true
        },
        privacyStatus: {
            type: Number,
            enum: [0, 1, 2],  // 0=everyone, 1=friends, 2=nobody
            default: 0
        },
        items: [watchedItemSchema],
        totalRuntime: {
            type: Number,
            default: 0
        }
    },
    {
        timestamps: true
    }
);

// Compound index for efficient queries
watchedListSchema.index({ userId: 1, isDefault: 1 });

export const WatchedList = mongoose.model<IWatchedList>('WatchedList', watchedListSchema);
