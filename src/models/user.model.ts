import mongoose, { Document, Schema } from 'mongoose';
import bcrypt from 'bcrypt';

export interface IUser extends Document {
  username: string;
  usernameLastChanged: Date | null;
  name: string;
  avatar: string | null;
  banner: string | null;
  email: string;
  password: string;
  profileSettings: {
    privacy: 'public' | 'private';
  };
  stats: {
    moviesWatched: number;
    episodesWatched: number;
    totalRuntime: number;
  };
  followersCount: number;
  followingCount: number;
  following: mongoose.Types.ObjectId[];
  followers: mongoose.Types.ObjectId[];
  onboardingCompleted: boolean;
  favoriteMovies: Array<{
    tmdbId: number;
    title: string;
    posterPath: string;
    releaseDate: string;
  }>;
  favoriteTvShows: Array<{
    tmdbId: number;
    name: string;
    posterPath: string;
    firstAirDate: string;
  }>;
  streak: {
    current: number;
    lastLoginDate: Date | null;
  };
  dailyPick: {
    tmdbId: number | null;
    date: Date | null;
    watched: boolean;
  };
  recommendationQuota: {
    remaining: number;
    lastResetDate: Date;
  };
  blacklistedMovies: number[]; // Array of TMDB IDs
  savedActivities: mongoose.Types.ObjectId[]; // Bookmarked activities
  mastery: {
    score: number;
    level: number;
    title: string;
  };
  moodProfile: {
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
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidatePassword: string): Promise<boolean>;
}

const userSchema = new Schema<IUser>(
  {
    username: {
      type: String,
      required: [true, 'Username is required'],
      unique: true,
      trim: true,
      minlength: [3, 'Username must be at least 3 characters'],
      maxlength: [30, 'Username cannot exceed 30 characters']
    },
    usernameLastChanged: {
      type: Date,
      default: null
    },
    name: {
      type: String,
      trim: true,
      maxlength: [100, 'Name cannot exceed 100 characters']
    },
    avatar: {
      type: String,
      default: null
    },
    banner: {
      type: String,
      default: null
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      trim: true,
      lowercase: true,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email']
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [6, 'Password must be at least 6 characters'],
      select: false
    },
    profileSettings: {
      privacy: {
        type: String,
        enum: ['public', 'private'],
        default: 'public'
      }
    },
    stats: {
      moviesWatched: {
        type: Number,
        default: 0
      },
      episodesWatched: {
        type: Number,
        default: 0
      },
      totalRuntime: {
        type: Number,
        default: 0
      }
    },
    followersCount: {
      type: Number,
      default: 0
    },
    followingCount: {
      type: Number,
      default: 0
    },
    following: [
      {
        type: Schema.Types.ObjectId,
        ref: 'User'
      }
    ],
    followers: [
      {
        type: Schema.Types.ObjectId,
        ref: 'User'
      }
    ],
    onboardingCompleted: {
      type: Boolean,
      default: false
    },
    favoriteMovies: [
      {
        tmdbId: {
          type: Number,
          required: true
        },
        title: {
          type: String,
          required: true
        },
        posterPath: String,
        releaseDate: String
      }
    ],
    favoriteTvShows: [
      {
        tmdbId: {
          type: Number,
          required: true
        },
        name: {
          type: String,
          required: true
        },
        posterPath: String,
        firstAirDate: String
      }
    ],
    streak: {
      current: {
        type: Number,
        default: 0
      },
      lastLoginDate: {
        type: Date,
        default: null
      }
    },
    dailyPick: {
      tmdbId: {
        type: Number,
        default: null
      },
      date: {
        type: Date,
        default: null
      },
      watched: {
        type: Boolean,
        default: false
      }
    },
    recommendationQuota: {
      remaining: {
        type: Number,
        default: 3
      },
      lastResetDate: {
        type: Date,
        default: Date.now
      }
    },
    blacklistedMovies: [{
      type: Number
    }],
    savedActivities: [{
      type: Schema.Types.ObjectId,
      ref: 'Activity'
    }],
    mastery: {
      score: {
        type: Number,
        default: 0
      },
      level: {
        type: Number,
        default: 1
      },
      title: {
        type: String,
        default: 'Acemi İzleyici'
      }
    },
    moodProfile: {
      adrenaline: { type: Number, default: 50 },
      melancholy: { type: Number, default: 50 },
      joy: { type: Number, default: 50 },
      tension: { type: Number, default: 50 },
      intellect: { type: Number, default: 50 },
      romance: { type: Number, default: 50 },
      wonder: { type: Number, default: 50 },
      nostalgia: { type: Number, default: 50 },
      darkness: { type: Number, default: 50 },
      inspiration: { type: Number, default: 50 }
    }
  },
  {
    timestamps: true
  }
);

// Note: email and username indexes are already created by unique:true

// Hash password before saving
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) {
    return next();
  }

  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error as Error);
  }
});

// Method to compare password
userSchema.methods.comparePassword = async function (
  candidatePassword: string
): Promise<boolean> {
  return bcrypt.compare(candidatePassword, this.password);
};

export const User = mongoose.model<IUser>('User', userSchema);

