import mongoose, { Document, Schema } from 'mongoose';

export interface IEpisodeRating extends Document {
    userId: mongoose.Types.ObjectId;
    tvId: number;
    seasonNumber: number;
    episodeNumber: number;
    rating: number;
    ratedAt: Date;
}

const episodeRatingSchema = new Schema<IEpisodeRating>(
    {
        userId: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true
        },
        tvId: {
            type: Number,
            required: true
        },
        seasonNumber: {
            type: Number,
            required: true
        },
        episodeNumber: {
            type: Number,
            required: true
        },
        rating: {
            type: Number,
            required: true,
            min: 1,
            max: 10,
            validate: {
                validator: function (v: number) {
                    return v >= 1 && v <= 10 && Number.isInteger(v);
                },
                message: 'Rating must be an integer between 1 and 10'
            }
        },
        ratedAt: {
            type: Date,
            default: Date.now
        }
    },
    {
        timestamps: true
    }
);

// Compound index for efficient queries
episodeRatingSchema.index({ userId: 1, tvId: 1, seasonNumber: 1, episodeNumber: 1 }, { unique: true });
episodeRatingSchema.index({ tvId: 1, seasonNumber: 1, episodeNumber: 1 });

export const EpisodeRating = mongoose.model<IEpisodeRating>('EpisodeRating', episodeRatingSchema);
