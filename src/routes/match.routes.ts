import { Router } from 'express';
import { MatchController } from '../controllers/match.controller';
import { authMiddleware as protect } from '../middleware/auth.middleware';

const router = Router();

// Get taste match compatibility with another user
router.get('/:targetUserId', protect, MatchController.getTasteMatch);

export default router;
