import { Router } from 'express';
import { AIController } from '../controllers/ai.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();

// POST /api/ai/verify-memory
router.post('/verify-memory', authMiddleware, AIController.verifyMemory);

export default router;
