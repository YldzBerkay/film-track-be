import { Router } from 'express';
import { UserController } from '../controllers/user.controller';
import { authMiddleware, optionalAuthMiddleware } from '../middleware/auth.middleware';

const router = Router();

// Protected route - get current user's profile (must be before /:username)
router.get('/profile/me', authMiddleware, UserController.getCurrentProfile);

// Public route - search users
router.get('/search', UserController.searchUsers);

// Followers/Following lists (public)
router.get('/:userId/followers', UserController.getFollowers);
router.get('/:userId/following', UserController.getFollowing);

// Follow/Unfollow routes (protected)
router.post('/:userId/follow', authMiddleware, UserController.followUser);
router.delete('/:userId/follow', authMiddleware, UserController.unfollowUser);
router.delete('/:userId/follower', authMiddleware, UserController.removeFollower);

// Public route with optional auth - get profile by username
router.get('/:username', optionalAuthMiddleware, UserController.getProfile);

export default router;

