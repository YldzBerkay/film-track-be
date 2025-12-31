import { Router } from 'express';
import { UserController } from '../controllers/user.controller';
import { ActivityController } from '../controllers/activity.controller';
import { authMiddleware, optionalAuthMiddleware } from '../middleware/auth.middleware';
import { upload } from '../middleware/upload.middleware';

const router = Router();

// Protected route - get current user's profile (must be before /:username)
router.get('/profile/me', authMiddleware, UserController.getCurrentProfile);

// Update current user's profile
router.put('/profile/me', authMiddleware, upload.fields([{ name: 'avatar', maxCount: 1 }, { name: 'banner', maxCount: 1 }]), UserController.updateProfile);

// Update privacy settings
router.patch('/profile/privacy', authMiddleware, UserController.updatePrivacy);

// Delete current user's account
router.delete('/me', authMiddleware, UserController.deleteAccount);

// Public route - search users
router.get('/search', UserController.searchUsers);

// Followers/Following lists (public)
router.get('/:userId/followers', UserController.getFollowers);
router.get('/:userId/following', UserController.getFollowing);

// Follow/Unfollow routes (protected)
router.post('/:userId/follow', authMiddleware, UserController.followUser);
router.delete('/:userId/follow', authMiddleware, UserController.unfollowUser);
router.delete('/:userId/follower', authMiddleware, UserController.removeFollower);

// Get user activities (public)
router.get('/:userId/activities', optionalAuthMiddleware, ActivityController.getProfileActivities);

// Public route with optional auth - get profile by username
router.get('/:username', optionalAuthMiddleware, UserController.getProfile);

export default router;

