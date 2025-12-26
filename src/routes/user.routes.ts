import { Router } from 'express';
import { UserController } from '../controllers/user.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();

// Protected route - get current user's profile (must be before /:username)
router.get('/profile/me', authMiddleware, UserController.getCurrentProfile);

// Public route - search users
router.get('/search', UserController.searchUsers);

// Public route - get profile by username
router.get('/:username', UserController.getProfile);

export default router;

