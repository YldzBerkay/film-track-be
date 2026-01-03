import mongoose from 'mongoose';
import { EpisodeRating, IEpisodeRating } from '../models/episode-rating.model';

export class EpisodeRatingService {
    static async rateEpisode(
        userId: mongoose.Types.ObjectId,
        tvId: number,
        seasonNumber: number,
        episodeNumber: number,
        rating: number,
        options?: { skipActivity: boolean }
    ): Promise<IEpisodeRating> {
        const existingRating = await EpisodeRating.findOne({
            userId,
            tvId,
            seasonNumber,
            episodeNumber
        });

        if (existingRating) {
            existingRating.rating = rating;
            existingRating.ratedAt = new Date();
            await existingRating.save();
            return existingRating;
        }

        const newRating = new EpisodeRating({
            userId,
            tvId,
            seasonNumber,
            episodeNumber,
            rating,
            ratedAt: new Date()
        });

        await newRating.save();
        return newRating;
    }

    static async getUserRating(
        userId: mongoose.Types.ObjectId,
        tvId: number,
        seasonNumber: number,
        episodeNumber: number
    ): Promise<number | null> {
        const rating = await EpisodeRating.findOne({
            userId,
            tvId,
            seasonNumber,
            episodeNumber
        });

        return rating ? rating.rating : null;
    }

    static async getUserRatingsForSeason(
        userId: mongoose.Types.ObjectId,
        tvId: number,
        seasonNumber: number
    ): Promise<Map<number, number>> {
        const ratings = await EpisodeRating.find({
            userId,
            tvId,
            seasonNumber
        });

        const ratingsMap = new Map<number, number>();
        ratings.forEach(r => {
            ratingsMap.set(r.episodeNumber, r.rating);
        });

        return ratingsMap;
    }

    static async getPublicStats(
        tvId: number,
        seasonNumber: number,
        episodeNumber: number
    ): Promise<{ count: number; averageRating: number }> {
        const result = await EpisodeRating.aggregate([
            {
                $match: {
                    tvId,
                    seasonNumber,
                    episodeNumber
                }
            },
            {
                $group: {
                    _id: null,
                    count: { $sum: 1 },
                    averageRating: { $avg: '$rating' }
                }
            }
        ]);

        if (result.length === 0) {
            return { count: 0, averageRating: 0 };
        }

        return {
            count: result[0].count,
            averageRating: Math.round(result[0].averageRating * 10) / 10
        };
    }

    static async removeRating(
        userId: mongoose.Types.ObjectId,
        tvId: number,
        seasonNumber: number,
        episodeNumber: number
    ): Promise<boolean> {
        const result = await EpisodeRating.deleteOne({
            userId,
            tvId,
            seasonNumber,
            episodeNumber
        });

        return result.deletedCount > 0;
    }

    static async getSeasonPublicStats(
        tvId: number,
        seasonNumber: number
    ): Promise<Record<number, { count: number; averageRating: number }>> {
        const result = await EpisodeRating.aggregate([
            {
                $match: {
                    tvId,
                    seasonNumber
                }
            },
            {
                $group: {
                    _id: '$episodeNumber',
                    count: { $sum: 1 },
                    averageRating: { $avg: '$rating' }
                }
            }
        ]);

        const stats: Record<number, { count: number; averageRating: number }> = {};
        result.forEach(item => {
            stats[item._id] = {
                count: item.count,
                averageRating: Math.round(item.averageRating * 10) / 10
            };
        });

        return stats;
    }
}
