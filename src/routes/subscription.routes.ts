import { Router } from 'express';
import { SubscriptionController } from '../controllers/subscription.controller';
import { authMiddleware as authenticate } from '../middleware/auth.middleware';

const router = Router();

// Redeem a promo code
router.post('/redeem', authenticate, SubscriptionController.redeemCode);

// Generate promo codes (Admin only - for now just authenticated)
router.post('/generate', authenticate, SubscriptionController.generateCodes);

export default router;
