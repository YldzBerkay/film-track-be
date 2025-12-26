import { UserStats } from '../models/user-stats.model';
import { Activity } from '../models/activity.model';
import { User } from '../models/user.model';

export interface Badge {
    id: string;
    name: string;
    description: string;
    icon: string;
    earnedAt?: Date;
    progress?: number;
    threshold?: number;
}

export interface BadgeDefinition {
    id: string;
    name: string;
    description: string;
    icon: string;
    evaluate: (context: BadgeContext) => Promise<{ earned: boolean; progress?: number; threshold?: number }>;
}

interface BadgeContext {
    userId: string;
    mood: {
        adrenaline: number;
        melancholy: number;
        joy: number;
        tension: number;
        intellect: number;
        romance: number;
        wonder: number;
        nostalgia: number;
        darkness: number;
        inspiration: number;
    };
    activityCount: number;
    movieCount: number;
    tvCount: number;
}

export class BadgeService {
    private static readonly BADGE_DEFINITIONS: BadgeDefinition[] = [
        {
            id: 'thrill_seeker',
            name: 'Thrill Seeker',
            description: 'Adrenaline score above 75',
            icon: '🔥',
            evaluate: async (ctx) => ({
                earned: ctx.mood.adrenaline >= 75,
                progress: ctx.mood.adrenaline,
                threshold: 75
            })
        },
        {
            id: 'deep_thinker',
            name: 'Deep Thinker',
            description: 'Intellect score above 80',
            icon: '🧠',
            evaluate: async (ctx) => ({
                earned: ctx.mood.intellect >= 80,
                progress: ctx.mood.intellect,
                threshold: 80
            })
        },
        {
            id: 'hopeless_romantic',
            name: 'Hopeless Romantic',
            description: 'Romance score above 70',
            icon: '💕',
            evaluate: async (ctx) => ({
                earned: ctx.mood.romance >= 70,
                progress: ctx.mood.romance,
                threshold: 70
            })
        },
        {
            id: 'joy_bringer',
            name: 'Joy Bringer',
            description: 'Joy score above 80',
            icon: '😊',
            evaluate: async (ctx) => ({
                earned: ctx.mood.joy >= 80,
                progress: ctx.mood.joy,
                threshold: 80
            })
        },
        {
            id: 'night_owl',
            name: 'Night Owl',
            description: 'High tension and darkness combo (both > 60)',
            icon: '🦉',
            evaluate: async (ctx) => ({
                earned: ctx.mood.tension >= 60 && ctx.mood.darkness >= 60,
                progress: Math.min(ctx.mood.tension, ctx.mood.darkness),
                threshold: 60
            })
        },
        {
            id: 'dreamer',
            name: 'Dreamer',
            description: 'Wonder score above 75',
            icon: '✨',
            evaluate: async (ctx) => ({
                earned: ctx.mood.wonder >= 75,
                progress: ctx.mood.wonder,
                threshold: 75
            })
        },
        {
            id: 'rising_star',
            name: 'Rising Star',
            description: 'Inspiration score above 80',
            icon: '🌟',
            evaluate: async (ctx) => ({
                earned: ctx.mood.inspiration >= 80,
                progress: ctx.mood.inspiration,
                threshold: 80
            })
        },
        {
            id: 'melancholic_soul',
            name: 'Melancholic Soul',
            description: 'Melancholy score above 70',
            icon: '🌧️',
            evaluate: async (ctx) => ({
                earned: ctx.mood.melancholy >= 70,
                progress: ctx.mood.melancholy,
                threshold: 70
            })
        },
        {
            id: 'nostalgic_heart',
            name: 'Nostalgic Heart',
            description: 'Nostalgia score above 70',
            icon: '📼',
            evaluate: async (ctx) => ({
                earned: ctx.mood.nostalgia >= 70,
                progress: ctx.mood.nostalgia,
                threshold: 70
            })
        },
        {
            id: 'balanced_explorer',
            name: 'Balanced Explorer',
            description: 'All mood dimensions between 40-60 (balanced)',
            icon: '⚖️',
            evaluate: async (ctx) => {
                const moods = [
                    ctx.mood.adrenaline, ctx.mood.melancholy, ctx.mood.joy,
                    ctx.mood.tension, ctx.mood.intellect, ctx.mood.romance,
                    ctx.mood.wonder, ctx.mood.nostalgia, ctx.mood.darkness,
                    ctx.mood.inspiration
                ];
                const balanced = moods.every(m => m >= 40 && m <= 60);
                return { earned: balanced };
            }
        },
        {
            id: 'cinephile',
            name: 'Cinephile',
            description: 'Watched 50+ movies',
            icon: '🎬',
            evaluate: async (ctx) => ({
                earned: ctx.movieCount >= 50,
                progress: ctx.movieCount,
                threshold: 50
            })
        },
        {
            id: 'movie_buff',
            name: 'Movie Buff',
            description: 'Watched 100+ movies',
            icon: '🏆',
            evaluate: async (ctx) => ({
                earned: ctx.movieCount >= 100,
                progress: ctx.movieCount,
                threshold: 100
            })
        }
    ];

    static async evaluateBadges(userId: string): Promise<Badge[]> {
        try {
            // Get user's current mood
            const userStats = await UserStats.findOne({ userId }).lean();
            const mood = userStats?.currentMood || {
                adrenaline: 50, melancholy: 50, joy: 50, tension: 50, intellect: 50,
                romance: 50, wonder: 50, nostalgia: 50, darkness: 50, inspiration: 50
            };

            // Get activity counts
            const movieCount = await Activity.countDocuments({
                userId,
                type: 'movie_watched'
            });
            const tvCount = await Activity.countDocuments({
                userId,
                type: { $in: ['tv_show_watched', 'tv_episode_watched'] }
            });
            const activityCount = movieCount + tvCount;

            const context: BadgeContext = {
                userId,
                mood: mood as BadgeContext['mood'],
                activityCount,
                movieCount,
                tvCount
            };

            // Evaluate all badges
            const badges: Badge[] = [];
            for (const def of this.BADGE_DEFINITIONS) {
                const result = await def.evaluate(context);
                badges.push({
                    id: def.id,
                    name: def.name,
                    description: def.description,
                    icon: def.icon,
                    earnedAt: result.earned ? new Date() : undefined,
                    progress: result.progress,
                    threshold: result.threshold
                });
            }

            return badges;
        } catch (error) {
            console.error('Badge Evaluation Error:', error);
            return [];
        }
    }

    static async getEarnedBadges(userId: string): Promise<Badge[]> {
        const badges = await this.evaluateBadges(userId);
        return badges.filter(b => b.earnedAt);
    }
}
