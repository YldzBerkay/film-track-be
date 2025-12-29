
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { User } from '../src/models/user.model';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/film-track';

const TITLE_MAPPING: { [key: string]: string } = {
    'Acemi İzleyici': 'RANK_NOVICE',
    'Biletçi': 'RANK_TICKET_HOLDER',
    'Film Tutkunu': 'RANK_MOVIE_BUFF',
    'Amatör Eleştirmen': 'RANK_CRITIC_AMATEUR',
    'Sinefil': 'RANK_CINEPHILE',
    'Kültür Bekçisi': 'RANK_CULTURE_GUARDIAN',
    'Sinema Üstadı': 'RANK_GRANDMASTER'
};

async function migrateTitles() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('Connected to MongoDB');

        const users = await User.find({});
        console.log(`Found ${users.length} users to check.`);

        let updatedCount = 0;

        for (const user of users) {
            if (user.mastery && user.mastery.title) {
                const currentTitle = user.mastery.title;
                const newTitle = TITLE_MAPPING[currentTitle];

                if (newTitle) {
                    user.mastery.title = newTitle;
                    await user.save();
                    updatedCount++;
                    console.log(`Updated user ${user.username}: ${currentTitle} -> ${newTitle}`);
                } else if (Object.values(TITLE_MAPPING).includes(currentTitle)) {
                    // Already migrated
                } else {
                    console.log(`Skipping unknown title for ${user.username}: ${currentTitle}`);
                }
            }
        }

        console.log(`Migration complete. Updated ${updatedCount} users.`);
        process.exit(0);

    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
}

migrateTitles();
