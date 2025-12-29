import mongoose, { Document, Schema } from 'mongoose';

export interface IActivity extends Document {
  userId: mongoose.Types.ObjectId;
  type: 'movie_watched' | 'tv_episode_watched' | 'tv_show_watched' | 'review' | 'rating' | 'bulk_import';
  mediaType: 'movie' | 'tv_show' | 'tv_episode';
  tmdbId: number;
  mediaTitle: string;
  mediaPosterPath: string | null;
  seasonNumber?: number;
  episodeNumber?: number;
  episodeTitle?: string;
  rating?: number;
  reviewText?: string;
  isSpoiler: boolean;
  genres?: string[];
  createdAt: Date;
  updatedAt: Date;
  likes: mongoose.Types.ObjectId[];
  dislikes: mongoose.Types.ObjectId[];
  likesCount: number;
  dislikesCount: number;
  commentCount: number;
}

const activitySchema = new Schema<IActivity>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    type: {
      type: String,
      enum: ['movie_watched', 'tv_episode_watched', 'tv_show_watched', 'review', 'rating', 'bulk_import'],
      required: true
    },
    mediaType: {
      type: String,
      enum: ['movie', 'tv_show', 'tv_episode'],
      required: true
    },
    tmdbId: {
      type: Number,
      required: true
    },
    mediaTitle: {
      type: String,
      required: true
    },
    mediaPosterPath: String,
    seasonNumber: Number,
    episodeNumber: Number,
    episodeTitle: String,
    rating: Number,
    reviewText: String,
    isSpoiler: {
      type: Boolean,
      default: false
    },
    genres: [String],
    likes: [{
      type: Schema.Types.ObjectId,
      ref: 'User'
    }],
    dislikes: [{
      type: Schema.Types.ObjectId,
      ref: 'User'
    }],
    likesCount: {
      type: Number,
      default: 0
    },
    dislikesCount: {
      type: Number,
      default: 0
    },
    commentCount: {
      type: Number,
      default: 0
    }
  },
  {
    timestamps: true
  }
);

// Indexes for frequently queried fields
activitySchema.index({ userId: 1, createdAt: -1 });
activitySchema.index({ type: 1, createdAt: -1 });

export const Activity = mongoose.model<IActivity>('Activity', activitySchema);

