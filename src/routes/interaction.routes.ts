import { Router } from 'express';
import { InteractionController } from '../controllers/interaction.controller';
import { authMiddleware as protect } from '../middleware/auth.middleware';

const router = Router();

// Toggle Reaction (Like/Dislike)
router.post('/reaction', protect, InteractionController.toggleReaction);

export default router;
