import mongoose, { Document, Schema } from 'mongoose';

export interface INotificationLog extends Document {
    tmdbId: number;
    seasonNumber: number;
    episodeNumber: number;
    targetType: 'tv';
    notifiedAt: Date;
}

const notificationLogSchema = new Schema<INotificationLog>(
    {
        tmdbId: {
            type: Number,
            required: true,
            index: true
        },
        seasonNumber: {
            type: Number,
            required: true
        },
        episodeNumber: {
            type: Number,
            required: true
        },
        targetType: {
            type: String,
            enum: ['tv'],
            default: 'tv'
        },
        notifiedAt: {
            type: Date,
            default: Date.now,
            index: true
        }
    },
    {
        timestamps: true
    }
);

// Unique index to prevent duplicate logs for the same episode
notificationLogSchema.index({ tmdbId: 1, seasonNumber: 1, episodeNumber: 1 }, { unique: true });

export const NotificationLog = mongoose.model<INotificationLog>('NotificationLog', notificationLogSchema);
