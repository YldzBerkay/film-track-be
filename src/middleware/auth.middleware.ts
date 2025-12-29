import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { User } from '../models/user.model';

import { Server } from 'socket.io';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    username: string;
  };
  io?: Server;
}

export const authMiddleware = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      res.status(401).json({
        success: false,
        message: 'Authentication required',
        code: 401
      });
      return;
    }

    const jwtSecret = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
    const decoded = jwt.verify(token, jwtSecret) as { userId: string };

    const user = await User.findById(decoded.userId).select('-password');

    if (!user) {
      res.status(401).json({
        success: false,
        message: 'User not found',
        code: 401
      });
      return;
    }

    req.user = {
      id: user._id.toString(),
      email: user.email,
      username: user.username
    };

    next();
  } catch (error) {
    res.status(401).json({
      success: false,
      message: 'Invalid or expired token',
      code: 401
    });
  }
};

/**
 * Optional auth middleware - extracts user if token present but doesn't fail if missing
 */
export const optionalAuthMiddleware = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      // No token, but that's OK - just continue without user
      next();
      return;
    }

    const jwtSecret = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
    const decoded = jwt.verify(token, jwtSecret) as { userId: string };

    const user = await User.findById(decoded.userId).select('-password');

    if (user) {
      req.user = {
        id: user._id.toString(),
        email: user.email,
        username: user.username
      };
    }

    next();
  } catch (error) {
    // Token invalid, but still continue without user
    next();
  }
};

