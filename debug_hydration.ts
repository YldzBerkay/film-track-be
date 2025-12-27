
import mongoose from 'mongoose';
import { RecommendationService } from './src/services/recommendation.service';
import { User } from './src/models/user.model';
import { Movie } from './src/models/movie.model';
// Mock services if needed, but we want real DB access.

async function runDebug() {
    try {
        console.log('Connecting to DB...');
        await mongoose.connect('mongodb://localhost:27017/cinetrack');
        console.log('Connected.');

        const user = await User.findOne();
        if (!user) {
            console.error('No user found.');
            return;
        }
        console.log(`Using user: ${user.username} (${user._id})`);

        console.log('--- Calling getMoodBasedRecommendations with lang="en" ---');
        // We only care about the Hydration logs which will appear in stdout
        const result = await RecommendationService.getMoodBasedRecommendations(
            user._id.toString(),
            'match', // mode
            5, // limit
            false, // includeWatched
            'en', // lang
            true // forceRefresh
        );

        console.log('--- Result ---');
        result.forEach(r => {
            console.log(`ID: ${r.tmdbId} | Title: ${r.title}`);
        });

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await mongoose.disconnect();
    }
}

runDebug();
