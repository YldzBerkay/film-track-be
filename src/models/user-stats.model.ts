import mongoose, { Document, Schema } from 'mongoose';

export interface IUserStats extends Document {
  userId: mongoose.Types.ObjectId;
  currentMood: {
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
  lastUpdated: Date;
  createdAt: Date;
  updatedAt: Date;
}

const userStatsSchema = new Schema<IUserStats>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true
    },
    currentMood: {
      adrenaline: {
        type: Number,
        default: 0,
        min: 0,
        max: 100
      },
      melancholy: {
        type: Number,
        default: 0,
        min: 0,
        max: 100
      },
      joy: {
        type: Number,
        default: 0,
        min: 0,
        max: 100
      },
      tension: {
        type: Number,
        default: 0,
        min: 0,
        max: 100
      },
      intellect: {
        type: Number,
        default: 0,
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
    lastUpdated: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: true
  }
);

// Index for frequently queried fields
userStatsSchema.index({ userId: 1 });

export const UserStats = mongoose.model<IUserStats>('UserStats', userStatsSchema);

