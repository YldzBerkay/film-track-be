import { Router } from 'express';
import { BadgeController } from '../controllers/badge.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();

router.get('/', authMiddleware, BadgeController.getBadges);

export default router;
