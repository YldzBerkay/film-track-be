
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { Movie } from '../src/models/movie.model';
import { Activity } from '../src/models/activity.model';
import { WatchedList } from '../src/models/watched-list.model';

dotenv.config({ path: path.join(__dirname, '../.env') });

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/film-track';

// Turkish to English Genre Mapping
const GENRE_MIGRATION_MAP: Record<string, string> = {
    // Direct Translations
    'Korku': 'Horror',
    'Bilim-Kurgu': 'Science Fiction',
    'Bilim Kurgu': 'Science Fiction',
    'Gizem': 'Mystery',
    'Gerilim': 'Thriller',
    'Suç': 'Crime',
    'Macera': 'Adventure',
    'Komedi': 'Comedy',
    'Fantastik': 'Fantasy',
    'Animasyon': 'Animation',
    'Aile': 'Family',
    'Savaş': 'War',
    'Tarih': 'History',
    'Müzik': 'Music',
    'Romantik': 'Romance',
    'Belgesel': 'Documentary',
    'Aksiyon': 'Action',
    'Vahşi Batı': 'Western',

    // TV Specific
    'Aksiyon & Macera': 'Action & Adventure',
    'Çocuk': 'Kids',
    'Haber': 'News',
    'Gerçeklik': 'Reality',
    'Bilim Kurgu & Fantastik': 'Sci-Fi & Fantasy',
    'Pembe Dizi': 'Soap',
    'Sohbet': 'Talk',
    'Savaş & Politik': 'War & Politics'
};

async function migrateGenres() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(MONGO_URI);
        console.log('Connected.');

        const turkishGenres = Object.keys(GENRE_MIGRATION_MAP);

        // 1. Migrate Movies
        console.log('Migrating Movies...');
        const movies = await Movie.find({ genres: { $in: turkishGenres } });
        console.log(`Found ${movies.length} movies with Turkish genres.`);

        let moviesUpdated = 0;
        for (const movie of movies) {
            let changed = false;
            const newGenres = (movie.genres || []).map(g => {
                if (GENRE_MIGRATION_MAP[g]) {
                    changed = true;
                    return GENRE_MIGRATION_MAP[g];
                }
                return g;
            });

            if (changed) {
                // Deduplicate genres just in case
                movie.genres = [...new Set(newGenres)];
                await movie.save();
                moviesUpdated++;
            }
        }
        console.log(`Updated ${moviesUpdated} movies.`);

        // 2. Migrate Activities
        console.log('Migrating Activities...');
        const activities = await Activity.find({ genres: { $in: turkishGenres } });
        console.log(`Found ${activities.length} activities with Turkish genres.`);

        let activitiesUpdated = 0;
        for (const activity of activities) {
            let changed = false;
            const newGenres = (activity.genres || []).map(g => {
                if (GENRE_MIGRATION_MAP[g]) {
                    changed = true;
                    return GENRE_MIGRATION_MAP[g];
                }
                return g;
            });

            if (changed) {
                activity.genres = [...new Set(newGenres)];
                await activity.save();
                activitiesUpdated++;
            }
        }
        console.log(`Updated ${activitiesUpdated} activities.`);

        // 3. Migrate WatchedLists
        console.log('Migrating WatchedLists...');
        // We find documents where ANY item has a Turkish genre
        const watchedLists = await WatchedList.find({ 'items.genres': { $in: turkishGenres } });
        console.log(`Found ${watchedLists.length} watched lists with Turkish genres.`);

        let watchedListsUpdated = 0;
        for (const list of watchedLists) {
            let listChanged = false;
            for (const item of list.items) {
                let itemChanged = false;
                const newGenres = (item.genres || []).map(g => {
                    if (GENRE_MIGRATION_MAP[g]) {
                        itemChanged = true;
                        listChanged = true;
                        return GENRE_MIGRATION_MAP[g];
                    }
                    return g;
                });

                if (itemChanged) {
                    item.genres = [...new Set(newGenres)];
                }
            }

            if (listChanged) {
                // Mongoose might not detect deep changes in array of subdocuments automatically unless referenced
                list.markModified('items');
                await list.save();
                watchedListsUpdated++;
            }
        }
        console.log(`Updated ${watchedListsUpdated} watched lists.`);

        console.log('Migration Complete.');
        process.exit(0);
    } catch (error) {
        console.error('Migration Failed:', error);
        process.exit(1);
    }
}

migrateGenres();
