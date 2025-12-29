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
}
