import mongoose, { Document, Schema } from 'mongoose';
import bcrypt from 'bcrypt';

export interface IUser extends Document {
  username: string;
  nickname: string;
  email: string;
  password: string;
  profileSettings: {
    privacy: 'public' | 'private';
  };
  stats: {
    moviesWatched: number;
    episodesWatched: number;
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
    nickname: {
      type: String,
      required: [true, 'Nickname is required'],
      trim: true,
      minlength: [2, 'Nickname must be at least 2 characters'],
      maxlength: [50, 'Nickname cannot exceed 50 characters']
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
    ]
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

