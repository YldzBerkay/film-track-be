import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import path from 'path';
import { User } from '../src/models/user.model';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/film-track';
const BACKEND_URL = process.env.API_URL || 'http://localhost:3000';

const DEFAULT_AVATARS = [
    'default_blue.webp',
    'default_gray.webp',
    'default_green.webp',
    'default_orange.webp',
    'default_pink.webp',
    'default_purple.webp'
];

async function assignDefaultAvatars() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(MONGODB_URI);
        console.log('Connected to MongoDB.');

        // Find users with no avatar or empty avatar string
        const usersWithoutAvatar = await User.find({
            $or: [
                { avatar: null },
                { avatar: '' },
                { avatar: { $exists: false } }
            ]
        });

        console.log(`Found ${usersWithoutAvatar.length} users without an avatar.`);

        if (usersWithoutAvatar.length === 0) {
            console.log('No users to update.');
            return;
        }

        let updatedCount = 0;

        for (const user of usersWithoutAvatar) {
            // Pick a random avatar
            const randomAvatar = DEFAULT_AVATARS[Math.floor(Math.random() * DEFAULT_AVATARS.length)];

            // Construct the full URL
            // Note: We serve assets at /assets, and images are in assets/images/
            const avatarUrl = `${BACKEND_URL}/assets/images/${randomAvatar}`;

            user.avatar = avatarUrl;
            await user.save();
            updatedCount++;
            console.log(`Updated user ${user.username} with avatar: ${randomAvatar}`);
        }

        console.log(`Successfully updated ${updatedCount} users.`);

    } catch (error) {
        console.error('Migration failed:', error);
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected from MongoDB.');
        process.exit();
    }
}

assignDefaultAvatars();
