import mongoose, { Document, Schema } from 'mongoose';

export interface IMovie extends Document {
  tmdbId: number;
  mediaType: 'movie' | 'tv';
  title: string;
  overview?: string;
  releaseDate?: string;
  posterPath?: string;
  originalLanguage?: string;
  originCountry?: string[];
  moodVector?: {
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
  aiProcessedAt?: Date;
  genres?: string[];
  translations?: {
    iso_639_1: string;
    title: string;
    overview: string;
    posterPath: string;
    genres: string[];
  }[];
  createdAt: Date;
  updatedAt: Date;
}

const movieSchema = new Schema<IMovie>(
  {
    tmdbId: {
      type: Number,
      required: true,
      index: true
    },
    mediaType: {
      type: String,
      enum: ['movie', 'tv'],
      default: 'movie',
      required: true
    },
    title: {
      type: String,
      required: true
    },
    genres: [String],
    overview: String,
    releaseDate: String,
    posterPath: String,
    translations: [{
      iso_639_1: { type: String, required: true },
      title: String,
      overview: String,
      posterPath: String,
      genres: [String]
    }],
    originalLanguage: String,
    originCountry: [String],
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
      },
      romance: {
        type: Number,
        min: 0,
        max: 100
      },
      wonder: {
        type: Number,
        min: 0,
        max: 100
      },
      nostalgia: {
        type: Number,
        min: 0,
        max: 100
      },
      darkness: {
        type: Number,
        min: 0,
        max: 100
      },
      inspiration: {
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

// Compound index for uniqueness (ID + Type)
movieSchema.index({ tmdbId: 1, mediaType: 1 }, { unique: true });

export const Movie = mongoose.model<IMovie>('Movie', movieSchema);

