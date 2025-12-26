import { User, IUser } from '../models/user.model';
import { RefreshToken } from '../models/refresh-token.model';
import { WatchlistService } from './watchlist.service';
import { WatchedListService } from './watched-list.service';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

interface RegisterData {
  username: string;
  email: string;
  password: string;
}

interface LoginData {
  email: string;
  password: string;
}

interface AuthResponse {
  user: {
    id: string;
    username: string;
    email: string;
    streak?: number;
    avatar: string | null;
  };
  accessToken: string;
  refreshToken: string;
}

export class AuthService {
  private static readonly JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
  private static readonly JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '15m';
  private static readonly REFRESH_TOKEN_EXPIRES_IN_DAYS = 14; // 2 weeks with sliding expiration

  static async register(data: RegisterData): Promise<AuthResponse> {
    // Check if user already exists
    const existingUser = await User.findOne({
      $or: [{ email: data.email }, { username: data.username }]
    });

    if (existingUser) {
      if (existingUser.email === data.email) {
        throw new Error('Email already registered');
      }
      if (existingUser.username === data.username) {
        throw new Error('Username already taken');
      }
    }

    // Create new user
    const user = new User({
      username: data.username,
      email: data.email,
      password: data.password
    });

    await user.save();

    // Create default lists for the new user
    await WatchlistService.createDefaultWatchlist(user._id.toString());
    await WatchedListService.createDefaultWatchedList(user._id.toString());

    // Generate tokens
    const accessToken = this.generateAccessToken(user._id.toString());
    const refreshToken = await this.generateRefreshToken(user._id.toString());

    return {
      user: {
        id: user._id.toString(),
        username: user.username,
        email: user.email,
        avatar: user.avatar
      },
      accessToken,
      refreshToken
    };
  }

  static async login(data: LoginData): Promise<AuthResponse> {
    // Find user by email and include password
    const user = await User.findOne({ email: data.email }).select('+password');

    if (!user) {
      throw new Error('Invalid email or password');
    }

    // Check password
    const isPasswordValid = await user.comparePassword(data.password);

    if (!isPasswordValid) {
      throw new Error('Invalid email or password');
    }

    // Generate tokens
    const accessToken = this.generateAccessToken(user._id.toString());
    const refreshToken = await this.generateRefreshToken(user._id.toString());

    return {
      user: {
        id: user._id.toString(),
        username: user.username,
        email: user.email,
        streak: user.streak?.current || 0,
        avatar: user.avatar
      },
      accessToken,
      refreshToken
    };
  }

  static async refreshAccessToken(refreshTokenString: string): Promise<AuthResponse> {
    // Find refresh token
    const refreshTokenDoc = await RefreshToken.findOne({
      token: refreshTokenString
    }).populate('userId');

    if (!refreshTokenDoc) {
      throw new Error('Invalid refresh token');
    }

    // Check if token is expired
    if (refreshTokenDoc.expiresAt < new Date()) {
      await RefreshToken.deleteOne({ _id: refreshTokenDoc._id });
      throw new Error('Refresh token expired');
    }

    const user = refreshTokenDoc.userId as unknown as IUser;

    // Generate new tokens (token rotation)
    const newAccessToken = this.generateAccessToken(user._id.toString());
    const newRefreshToken = await this.generateRefreshToken(user._id.toString());

    // Delete old refresh token
    await RefreshToken.deleteOne({ _id: refreshTokenDoc._id });

    return {
      user: {
        id: user._id.toString(),
        username: user.username,
        email: user.email,
        streak: user.streak?.current || 0,
        avatar: user.avatar
      },
      accessToken: newAccessToken,
      refreshToken: newRefreshToken
    };
  }

  static async revokeRefreshToken(refreshTokenString: string): Promise<void> {
    await RefreshToken.deleteOne({ token: refreshTokenString });
  }

  static async revokeAllUserTokens(userId: string): Promise<void> {
    await RefreshToken.deleteMany({ userId });
  }

  private static generateAccessToken(userId: string): string {
    return jwt.sign({ userId }, this.JWT_SECRET, {
      expiresIn: this.JWT_EXPIRES_IN
    } as jwt.SignOptions);
  }

  private static async generateRefreshToken(userId: string): Promise<string> {
    // Generate random token
    const token = crypto.randomBytes(64).toString('hex');

    // Calculate expiration date
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + this.REFRESH_TOKEN_EXPIRES_IN_DAYS);

    // Save to database
    await RefreshToken.create({
      userId,
      token,
      expiresAt
    });

    return token;
  }
}

