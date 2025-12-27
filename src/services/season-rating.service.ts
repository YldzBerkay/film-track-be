import mongoose from 'mongoose';
import { SeasonRating, ISeasonRating } from '../models/season-rating.model';

export class SeasonRatingService {
    static async rateSeason(
        userId: mongoose.Types.ObjectId,
        tvId: number,
        seasonNumber: number,
        rating: number
    ): Promise<ISeasonRating> {
        const existingRating = await SeasonRating.findOne({
            userId,
            tvId,
            seasonNumber
        });

        if (existingRating) {
            existingRating.rating = rating;
            existingRating.ratedAt = new Date();
            await existingRating.save();
            return existingRating;
        }

        const newRating = new SeasonRating({
            userId,
            tvId,
            seasonNumber,
            rating,
            ratedAt: new Date()
        });

        await newRating.save();
        return newRating;
    }

    static async getUserRating(
        userId: mongoose.Types.ObjectId,
        tvId: number,
        seasonNumber: number
    ): Promise<number | null> {
        const rating = await SeasonRating.findOne({
            userId,
            tvId,
            seasonNumber
        });

        return rating ? rating.rating : null;
    }

    static async getUserRatingsForShow(
        userId: mongoose.Types.ObjectId,
        tvId: number
    ): Promise<Map<number, number>> {
        const ratings = await SeasonRating.find({
            userId,
            tvId
        });

        const ratingsMap = new Map<number, number>();
        ratings.forEach(r => {
            ratingsMap.set(r.seasonNumber, r.rating);
        });

        return ratingsMap;
    }

    static async getPublicStats(
        tvId: number,
        seasonNumber: number
    ): Promise<{ count: number; averageRating: number }> {
        const result = await SeasonRating.aggregate([
            {
                $match: {
                    tvId,
                    seasonNumber
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
        seasonNumber: number
    ): Promise<boolean> {
        const result = await SeasonRating.deleteOne({
            userId,
            tvId,
            seasonNumber
        });

        return result.deletedCount > 0;
    }

    static async getShowPublicStats(
        tvId: number
    ): Promise<Record<number, { count: number; averageRating: number }>> {
        const result = await SeasonRating.aggregate([
            {
                $match: {
                    tvId
                }
            },
            {
                $group: {
                    _id: '$seasonNumber',
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
