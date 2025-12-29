import { Request, Response, NextFunction } from 'express';
import { PromoCode } from '../models/promo-code.model';
import { User, IUser } from '../models/user.model';
import { SubscriptionTier } from '../models/subscription.types';
import crypto from 'crypto';

class AppError extends Error {
    statusCode: number;
    constructor(message: string, statusCode: number) {
        super(message);
        this.statusCode = statusCode;
    }
}

export class SubscriptionController {
    static async redeemCode(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { code } = req.body;
            const userId = (req as any).user.id;

            if (!code) {
                throw new AppError('Code is required', 400);
            }

            const promoCode = await PromoCode.findOne({ code: code.toUpperCase() });

            if (!promoCode) {
                throw new AppError('Invalid promo code', 404);
            }

            if (promoCode.isRedeemed) {
                throw new AppError('This code has already been redeemed', 400);
            }

            const user = await User.findById(userId);
            if (!user) {
                throw new AppError('User not found', 404);
            }

            // Calculate new expiry date
            const now = new Date();
            let newExpiryDate: Date;

            if (user.subscription.tier === SubscriptionTier.PREMIUM && user.subscription.expiresAt && user.subscription.expiresAt > now) {
                // Extend existing subscription
                newExpiryDate = new Date(user.subscription.expiresAt);
                newExpiryDate.setDate(newExpiryDate.getDate() + promoCode.durationDays);
            } else {
                // New or expired subscription
                newExpiryDate = new Date();
                newExpiryDate.setDate(newExpiryDate.getDate() + promoCode.durationDays);
            }

            // Check previous tier to decide on startedAt
            const wasFree = user.subscription.tier === SubscriptionTier.FREE;

            // Update User
            user.subscription.tier = SubscriptionTier.PREMIUM;
            user.subscription.expiresAt = newExpiryDate;

            if (wasFree) {
                user.subscription.startedAt = now;
            }

            await user.save();

            // Update Promo Code
            promoCode.isRedeemed = true;
            promoCode.redeemedBy = user._id as any;
            promoCode.redeemedAt = now;
            await promoCode.save();

            res.status(200).json({
                success: true,
                message: 'Premium subscription activated successfully',
                data: {
                    tier: user.subscription.tier,
                    expiresAt: user.subscription.expiresAt
                }
            });
        } catch (error) {
            next(error);
        }
    }

    static async generateCodes(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            // Simple admin check: In real app, check role or secret headers
            // For now we assume this route is protected by simple auth or dev usage

            const { count = 10, durationDays = 30 } = req.body;
            const codes = [];

            for (let i = 0; i < count; i++) {
                const randomString = crypto.randomBytes(4).toString('hex').toUpperCase();
                const code = `PROMO${durationDays}-${randomString}`;

                await PromoCode.create({
                    code,
                    durationDays
                });
                codes.push(code);
            }

            res.status(201).json({
                success: true,
                message: `${count} codes generated successfully`,
                data: codes
            });
        } catch (error) {
            next(error);
        }
    }
}
