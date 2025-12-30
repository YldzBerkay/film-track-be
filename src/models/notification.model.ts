import mongoose, { Document, Schema } from 'mongoose';

export interface INotification extends Document {
    userId: mongoose.Types.ObjectId;
    type: 'follow' | 'like' | 'comment' | 'mention' | 'new_episode';
    message: string;
    fromUser: {
        id: mongoose.Types.ObjectId;
        username: string;
        name: string;
    };
    read: boolean;
    data?: any;
    createdAt: Date;
}

const notificationSchema = new Schema<INotification>(
    {
        userId: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true
        },
        type: {
            type: String,
            enum: ['follow', 'like', 'comment', 'mention', 'new_episode'],
            required: true
        },
        message: {
            type: String,
            required: true
        },
        fromUser: {
            id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
            username: { type: String, required: true },
            name: { type: String }
        },
        read: {
            type: Boolean,
            default: false
        },
        data: {
            type: Schema.Types.Mixed
        }
    },
    {
        timestamps: true
    }
);

// Index for querying unread notifications
notificationSchema.index({ userId: 1, read: 1, createdAt: -1 });

export const Notification = mongoose.model<INotification>('Notification', notificationSchema);
