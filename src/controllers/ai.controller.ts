import { Request, Response } from 'express';
import { AIService } from '../services/ai.service';
import { VerifyMemoryRequest } from '../types/ai.types';
import { User } from '../models/user.model';
import { UserService } from '../services/user.service';

export class AIController {
    static async verifyMemory(req: Request, res: Response): Promise<void> {
        try {
            const { filmTitle, filmOverview, userMemory } = req.body as VerifyMemoryRequest;
            const userId = (req as any).user?.id;

            if (!filmTitle || !filmOverview || !userMemory) {
                res.status(400).json({
                    success: false,
                    message: 'Missing required fields: filmTitle, filmOverview, userMemory'
                });
                return;
            }

            if (userMemory.length < 25) {
                res.status(400).json({
                    success: false,
                    message: 'User memory must be at least 25 characters'
                });
                return;
            }

            const result = await AIService.verifyFilmMemory(filmTitle, filmOverview, userMemory);

            let currentStreak = 0;

            if (userId) {
                const user = await User.findById(userId);
                if (user) {
                    currentStreak = user.streak?.current || 0;

                    // If AI confirms user watched the movie, update the daily pick status and streak
                    if (result.watched) {
                        // Check if we ALREADY incremented for today/this pick (Idempotency)
                        if (!user.dailyPick || !user.dailyPick.watched) {
                            if (!user.dailyPick) {
                                user.dailyPick = { tmdbId: null, date: null, watched: true };
                            } else {
                                user.dailyPick.watched = true;
                            }

                            // Increment Streak
                            user.streak.current = (user.streak.current || 0) + 1;
                            user.streak.lastLoginDate = new Date(); // Update last activity for streak

                            await user.save();
                            currentStreak = user.streak.current;
                        }
                    }
                }
            }

            res.json({
                success: true,
                data: {
                    ...result,
                    dailyStreak: currentStreak
                }
            });
        } catch (error) {
            console.error('AI Controller Error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to verify memory'
            });
        }
    }
}
