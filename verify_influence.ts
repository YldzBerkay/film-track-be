
import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import { RecommendationService } from './src/services/recommendation.service';
import { User } from './src/models/user.model';
import { Activity } from './src/models/activity.model';

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/cinetrack';

async function verifyInfluence() {
    try {
        await mongoose.connect(MONGO_URI);
        console.log('Connected to MongoDB');

        // 1. Get a user (Berkay)
        const user = await User.findOne({ username: 'berkay' });
        if (!user) {
            console.error('User "berkay" not found');
            return;
        }
        console.log(`Testing for user: ${user.username} (${user._id})`);

        // 2. Call the new method
        const payload = await (RecommendationService as any).getRecentWatchedWithInfluence(user._id.toString(), 10);

        console.log('\n--- Influence Payload ---');
        console.table(payload.map((p: any) => ({
            title: p.title,
            rating: p.rating,
            genres: p.genres.slice(0, 2).join(', '),
            score: p.influenceScore,
            date: p.watchedAt.toISOString().split('T')[0]
        })));

        console.log('\n--- Analysis ---');
        const negatives = payload.filter((p: any) => p.influenceScore < 0);
        const positives = payload.filter((p: any) => p.influenceScore > 0);
        console.log(`Negative Influence Items: ${negatives.length}`);
        console.log(`Positive Influence Items: ${positives.length}`);

        if (negatives.length > 0) {
            console.log('Example Negative:', negatives[0].title, 'Rating:', negatives[0].rating, 'Score:', negatives[0].influenceScore);
        }

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await mongoose.disconnect();
    }
}

verifyInfluence();
