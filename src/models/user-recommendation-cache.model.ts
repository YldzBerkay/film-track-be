import mongoose, { Document, Schema } from 'mongoose';
import { MoodVector } from '../services/mood.service';

export interface ICachedRecommendation {
    tmdbId: number;
    title: string;
    posterPath: string;
    backdropPath: string;
    overview: string;
    releaseDate: string;
    moodVector: MoodVector;
    moodSimilarity: number;
}

export interface IUserRecommendationCache extends Document {
    userId: mongoose.Types.ObjectId;
    recommendations: ICachedRecommendation[];
    moodMode: 'match' | 'shift';
    generatedAt: Date;
    expiresAt: Date;
    createdAt: Date;
    updatedAt: Date;
}

const cachedRecommendationSchema = new Schema({
    tmdbId: { type: Number, required: true },
    title: { type: String, required: true },
    posterPath: { type: String, default: '' },
    backdropPath: { type: String, default: '' },
    overview: { type: String, default: '' },
    releaseDate: { type: String, default: '' },
    moodVector: {
        adrenaline: { type: Number, min: 0, max: 100 },
        melancholy: { type: Number, min: 0, max: 100 },
        joy: { type: Number, min: 0, max: 100 },
        tension: { type: Number, min: 0, max: 100 },
        intellect: { type: Number, min: 0, max: 100 },
        romance: { type: Number, min: 0, max: 100 },
        wonder: { type: Number, min: 0, max: 100 },
        nostalgia: { type: Number, min: 0, max: 100 },
        darkness: { type: Number, min: 0, max: 100 },
        inspiration: { type: Number, min: 0, max: 100 }
    },
    moodSimilarity: { type: Number, default: 0 }
}, { _id: false });

const userRecommendationCacheSchema = new Schema<IUserRecommendationCache>(
    {
        userId: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true
        },
        recommendations: [cachedRecommendationSchema],
        moodMode: {
            type: String,
            enum: ['match', 'shift'],
            default: 'match'
        },
        generatedAt: {
            type: Date,
            required: true,
            default: Date.now
        },
        expiresAt: {
            type: Date,
            required: true,
            index: true
        }
    },
    {
        timestamps: true
    }
);

// Compound index for efficient lookups
userRecommendationCacheSchema.index({ userId: 1, moodMode: 1 });

// TTL index to automatically delete expired caches (optional, for cleanup)
userRecommendationCacheSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const UserRecommendationCache = mongoose.model<IUserRecommendationCache>(
    'UserRecommendationCache',
    userRecommendationCacheSchema
);
