import mongoose, { Document, Schema } from 'mongoose';

export interface IMoodSnapshot extends Document {
    userId: mongoose.Types.ObjectId;
    mood: {
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
    };
    timestamp: Date;
    triggerActivityId?: mongoose.Types.ObjectId;
    triggerMediaTitle?: string;
    createdAt: Date;
    updatedAt: Date;
}

const moodSnapshotSchema = new Schema<IMoodSnapshot>(
    {
        userId: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true
        },
        mood: {
            adrenaline: {
                type: Number,
                required: true,
                min: 0,
                max: 100
            },
            melancholy: {
                type: Number,
                required: true,
                min: 0,
                max: 100
            },
            joy: {
                type: Number,
                required: true,
                min: 0,
                max: 100
            },
            tension: {
                type: Number,
                required: true,
                min: 0,
                max: 100
            },
            intellect: {
                type: Number,
                required: true,
                min: 0,
                max: 100
            },
            romance: {
                type: Number,
                default: 0,
                min: 0,
                max: 100
            },
            wonder: {
                type: Number,
                default: 0,
                min: 0,
                max: 100
            },
            nostalgia: {
                type: Number,
                default: 0,
                min: 0,
                max: 100
            },
            darkness: {
                type: Number,
                default: 0,
                min: 0,
                max: 100
            },
            inspiration: {
                type: Number,
                default: 0,
                min: 0,
                max: 100
            }
        },
        timestamp: {
            type: Date,
            required: true,
            default: Date.now
        },
        triggerActivityId: {
            type: Schema.Types.ObjectId,
            ref: 'Activity'
        },
        triggerMediaTitle: String
    },
    {
        timestamps: true
    }
);

// Index for efficient timeline queries
moodSnapshotSchema.index({ userId: 1, timestamp: -1 });

export const MoodSnapshot = mongoose.model<IMoodSnapshot>('MoodSnapshot', moodSnapshotSchema);
