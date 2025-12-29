import { User } from '../models/user.model';

export class GamificationService {
    private static LEVELS = [
        { threshold: 0, title: 'novice', level: 1 },
        { threshold: 51, title: 'ticketHolder', level: 2 },
        { threshold: 251, title: 'movieBuff', level: 3 },
        { threshold: 1001, title: 'criticAmateur', level: 4 },
        { threshold: 2501, title: 'cinephile', level: 5 },
        { threshold: 5001, title: 'cultureGuardian', level: 6 },
        { threshold: 10001, title: 'grandmaster', level: 7 },
    ];

    static async updateMastery(userId: string, xpDelta: number) {
        if (xpDelta === 0) return;

        const user = await User.findById(userId);
        if (!user) return;

        // Update Score
        user.mastery.score = Math.max(0, user.mastery.score + xpDelta);

        // Calculate New Level and Title
        let currentLevel = user.mastery.level;
        let currentTitle = user.mastery.title;

        // Find the highest threshold reached
        for (let i = this.LEVELS.length - 1; i >= 0; i--) {
            if (user.mastery.score >= this.LEVELS[i].threshold) {
                currentLevel = this.LEVELS[i].level;
                currentTitle = this.LEVELS[i].title;
                break;
            }
        }

        if (currentLevel !== user.mastery.level || currentTitle !== user.mastery.title) {
            user.mastery.level = currentLevel;
            user.mastery.title = currentTitle;
            // Optionally create a notification here: "You reached level X!"
        }

        await user.save();
    }

    static getLevelInfo(score: number) {
        let currentLevel = this.LEVELS[0];
        let nextLevel = null;

        // Find current and next level
        for (let i = this.LEVELS.length - 1; i >= 0; i--) {
            if (score >= this.LEVELS[i].threshold) {
                currentLevel = this.LEVELS[i];
                nextLevel = this.LEVELS[i + 1] || null;
                break;
            }
        }

        let progressPercent = 0;
        let scoreToNextLevel = 0;
        let nextLevelScore = 0;

        if (nextLevel) {
            const range = nextLevel.threshold - currentLevel.threshold;
            const progress = score - currentLevel.threshold;
            progressPercent = Math.min(100, Math.max(0, (progress / range) * 100));
            scoreToNextLevel = nextLevel.threshold - score;
            nextLevelScore = nextLevel.threshold;
        } else {
            // Max level reached
            progressPercent = 100;
            scoreToNextLevel = 0;
            nextLevelScore = currentLevel.threshold;
        }

        return {
            level: currentLevel.level,
            title: currentLevel.title,
            score,
            nextLevelScore,
            scoreToNextLevel,
            progressPercent: parseFloat(progressPercent.toFixed(1))
        };
    }
    static async checkAndResetStreak(userId: string) {
        const user = await User.findById(userId);
        if (!user || !user.streak || !user.streak.lastLoginDate) return;

        const lastLogin = new Date(user.streak.lastLoginDate);
        const now = new Date();

        // Normalize to midnight for calendar day comparison
        const lastDate = new Date(lastLogin.setHours(0, 0, 0, 0));
        const today = new Date(now.setHours(0, 0, 0, 0));

        // Calculate difference in days
        const diffTime = Math.abs(today.getTime() - lastDate.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        console.log(`[Streak Check] User: ${userId}, Diff: ${diffDays} days`);

        if (diffDays > 1) {
            // Missed at least one day
            if (user.streak.hasFreeze) {
                // Use Freeze
                console.log(`[Streak Freeze] User ${userId} used a freeze!`);
                user.streak.hasFreeze = false;
                // Streak is preserved (do not reset)
                // But we should update lastLoginDate? 
                // No, if we update lastLoginDate to Today, we basically "filled" the gap.
                // If we don't update key date, next check will still show diff > 1?
                // YES. We must bridge the gap or update the date to "Yesterday" effectively?
                // Or just update to Today as if they logged in?
                // The check is running NOW (on read/login). So they ARE triggering activity now.
                // So if we save, we might act as if they continued?
                // User said: "Consume the freeze... Do NOT reset the streak."
                // The goal is: current streak remains.
                // NOTE: This function is called on READ (getDailyPick).
                // It does NOT imply the user "Watched" something today yet to increment.
                // But it resets "old" streaks.
                // If I have a freeze, I consume it, and I KEEP the current streak value.
                // The user logic implies "Streak Freeze used" to SAVE the streak from resetting.

                // We must save the user to persist freeze consumption.
                await user.save();

                // Notify User
                try {
                    const { Notification } = await import('../models/notification.model');
                    const { socketService } = await import('../services/socket.service');

                    const notification = await Notification.create({
                        userId: user._id,
                        type: 'system', // or new type 'freeze_used'
                        message: '🔥 Streak Freeze used to save your streak!',
                        data: {
                            streak: user.streak.current
                        }
                    });
                    socketService.emitToUser(user._id.toString(), 'notification', notification);
                } catch (e) {
                    console.error('Failed to send freeze notification', e);
                }

            } else {
                // Reset Streak
                console.log(`[Streak Reset] User ${userId} lost streak of ${user.streak.current}`);
                user.streak.current = 0;
                await user.save();
            }
        }
    }
}
