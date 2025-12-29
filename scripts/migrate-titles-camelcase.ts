
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { User } from '../src/models/user.model';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/film-track';

// Mapping from OLD (Result of first migration) to NEW (CamelCase)
const TITLE_MAPPING: { [key: string]: string } = {
    'RANK_NOVICE': 'novice',
    'RANK_TICKET_HOLDER': 'ticketHolder',
    'RANK_MOVIE_BUFF': 'movieBuff',
    'RANK_CRITIC_AMATEUR': 'criticAmateur',
    'RANK_CINEPHILE': 'cinephile',
    'RANK_CULTURE_GUARDIAN': 'cultureGuardian',
    'RANK_GRANDMASTER': 'grandmaster',
    // Also include original Turkish just in case some users were missed
    'Acemi İzleyici': 'novice',
    'Biletçi': 'ticketHolder',
    'Film Tutkunu': 'movieBuff',
    'Amatör Eleştirmen': 'criticAmateur',
    'Sinefil': 'cinephile',
    'Kültür Bekçisi': 'cultureGuardian',
    'Sinema Üstadı': 'grandmaster'
};

async function migrateTitlesCamelCase() {
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
                    // Already a camelCase key
                } else {
                    console.log(`Skipping unknown title for ${user.username}: ${currentTitle}`);
                }
            }
        }

        console.log(`Migration to CamelCase complete. Updated ${updatedCount} users.`);
        process.exit(0);

    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
}

migrateTitlesCamelCase();
