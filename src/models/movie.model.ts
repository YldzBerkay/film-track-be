import mongoose, { Document, Schema } from 'mongoose';

export interface IMovie extends Document {
  tmdbId: number;
  title: string;
  overview?: string;
  releaseDate?: string;
  posterPath?: string;
  moodVector?: {
    adrenaline: number;
    melancholy: number;
    joy: number;
    tension: number;
    intellect: number;
  };
  aiProcessedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const movieSchema = new Schema<IMovie>(
  {
    tmdbId: {
      type: Number,
      required: true,
      unique: true,
      index: true
    },
    title: {
      type: String,
      required: true
    },
    overview: String,
    releaseDate: String,
    posterPath: String,
    moodVector: {
      adrenaline: {
        type: Number,
        min: 0,
        max: 100
      },
      melancholy: {
        type: Number,
        min: 0,
        max: 100
      },
      joy: {
        type: Number,
        min: 0,
        max: 100
      },
      tension: {
        type: Number,
        min: 0,
        max: 100
      },
      intellect: {
        type: Number,
        min: 0,
        max: 100
      }
    },
    aiProcessedAt: Date
  },
  {
    timestamps: true
  }
);

// Note: tmdbId index is already created by unique:true

export const Movie = mongoose.model<IMovie>('Movie', movieSchema);

