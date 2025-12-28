import { MoodSnapshot } from '../models/mood-snapshot.model';
import mongoose from 'mongoose';
import { MoodVector } from './mood.service';

export interface MoodTrend {
    date: string;
    value: number;
}

export class AnalyticsService {
    
    // Boyutları statik olarak tanımlayalım, tekrar tekrar yazmayalım
    private static readonly DIMENSIONS: (keyof MoodVector)[] = [
        'adrenaline', 'melancholy', 'joy', 'tension', 'intellect',
        'romance', 'wonder', 'nostalgia', 'darkness', 'inspiration'
    ];

    /**
     * Get daily average mood evolution over X days
     * IMPROVEMENT: Uses Aggregation to group by day and calculate averages on DB side.
     */
    static async getMoodEvolution(userId: string, days: number = 30): Promise<Record<keyof MoodVector, MoodTrend[]>> {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        // Dinamik olarak $avg operatörlerini oluştur
        const groupStageFields: any = { _id: { $dateToString: { format: "%Y-%m-%d", date: "$timestamp" } } };
        
        this.DIMENSIONS.forEach(dim => {
            groupStageFields[dim] = { $avg: `$mood.${dim}` };
        });

        const rawData = await MoodSnapshot.aggregate([
            { 
                $match: { 
                    userId: new mongoose.Types.ObjectId(userId),
                    timestamp: { $gte: startDate }
                } 
            },
            { 
                $group: groupStageFields 
            },
            { 
                $sort: { _id: 1 } // Tarihe göre sırala
            }
        ]);

        // Veriyi Frontend'in beklediği formata çevir
        const trends: Record<string, MoodTrend[]> = {};
        this.DIMENSIONS.forEach(dim => trends[dim] = []);

        rawData.forEach(day => {
            const dateStr = day._id;
            this.DIMENSIONS.forEach(dim => {
                trends[dim].push({
                    date: dateStr,
                    value: Math.round(day[dim] || 0) // Küsuratları temizle
                });
            });
        });

        return trends as Record<keyof MoodVector, MoodTrend[]>;
    }

    /**
     * Get average mood by day of week (1=Sunday, 7=Saturday in Mongo)
     * IMPROVEMENT: 100% DB-side calculation using $dayOfWeek
     */
    static async getDayOfWeekPatterns(userId: string): Promise<Record<string, number[]>> {
        const startDate = new Date();
        startDate.setMonth(startDate.getMonth() - 6);

        const groupStageFields: any = { _id: { $dayOfWeek: "$timestamp" } };
        this.DIMENSIONS.forEach(dim => {
            groupStageFields[dim] = { $avg: `$mood.${dim}` };
        });

        const rawData = await MoodSnapshot.aggregate([
            { 
                $match: { 
                    userId: new mongoose.Types.ObjectId(userId),
                    timestamp: { $gte: startDate }
                } 
            },
            { $group: groupStageFields },
            { $sort: { _id: 1 } }
        ]);

        // Initialize empty arrays (0-6 index, Sunday to Saturday)
        // Note: MongoDB $dayOfWeek returns 1 (Sun) to 7 (Sat). We map to 0-6.
        const averages: Record<string, number[]> = {};
        this.DIMENSIONS.forEach(dim => averages[dim] = new Array(7).fill(0));

        rawData.forEach(day => {
            // Mongo 1..7 -> JS Array 0..6
            const dayIndex = day._id - 1; 
            if (dayIndex >= 0 && dayIndex < 7) {
                this.DIMENSIONS.forEach(dim => {
                    averages[dim][dayIndex] = Math.round(day[dim] || 0);
                });
            }
        });

        return averages;
    }

    /**
     * Get genre correlation with moods
     * Uses Aggregation via 'lookup' to join Activities/Movies efficiently
     */
    static async getGenreMoodCorrelations(userId: string): Promise<Array<{ genre: string; dominantMoods: Partial<MoodVector>; count: number }>> {
        const results = await MoodSnapshot.aggregate([
            {
                $match: {
                    userId: new mongoose.Types.ObjectId(userId),
                    triggerActivityId: { $exists: true }
                }
            },
            // Join with Activities collection
            {
                $lookup: {
                    from: 'activities', // Collection name (usually lowercase plural)
                    localField: 'triggerActivityId',
                    foreignField: '_id',
                    as: 'activity'
                }
            },
            { $unwind: '$activity' }, // Array'i objeye çevir
            { $unwind: '$activity.genres' }, // Genre array'ini parçala (Duplicate rows per genre)
            // Şimdi her satır tek bir Genre ve Mood içeriyor. Gruplayalım.
            {
                $group: {
                    _id: '$activity.genres',
                    count: { $sum: 1 },
                    // Tüm moodların ortalamasını al
                    adrenaline: { $avg: '$mood.adrenaline' },
                    melancholy: { $avg: '$mood.melancholy' },
                    joy: { $avg: '$mood.joy' },
                    tension: { $avg: '$mood.tension' },
                    intellect: { $avg: '$mood.intellect' },
                    romance: { $avg: '$mood.romance' },
                    wonder: { $avg: '$mood.wonder' },
                    nostalgia: { $avg: '$mood.nostalgia' },
                    darkness: { $avg: '$mood.darkness' },
                    inspiration: { $avg: '$mood.inspiration' }
                }
            },
            {
                $match: {
                    count: { $gte: 2 } // En az 2 veri noktası olan janrları al (Gürültüyü önle)
                }
            },
            { $sort: { count: -1 } }
        ]);

        // Format the output
        return results.map(r => {
            const dominantMoods: any = {};
            this.DIMENSIONS.forEach(dim => {
                if (r[dim] > 0) dominantMoods[dim] = Math.round(r[dim]);
            });

            return {
                genre: r._id,
                dominantMoods,
                count: r.count
            };
        });
    }
}