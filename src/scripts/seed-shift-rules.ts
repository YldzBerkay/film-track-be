import mongoose from 'mongoose';
import { ShiftRule } from '../models/shift-rule.model';

/**
 * Seed script for ShiftRule collection
 * Migrates hardcoded shift mode rules to database
 * 
 * Run with: npx ts-node src/scripts/seed-shift-rules.ts
 * Or call seedShiftRules() from app initialization
 */

const SHIFT_RULES_SEED = [
    {
        name: 'High Adrenaline Antidote',
        description: 'Calms users with high adrenaline by recommending peaceful, joyful content',
        priority: 10,
        conditions: {
            adrenaline: { min: 50 }
        },
        targetEffects: {
            adrenaline: 10,
            tension: 10,
            joy: 85,
            nostalgia: 70
        },
        isActive: true
    },
    {
        name: 'High Tension Antidote',
        description: 'Relaxes users with high tension by recommending calm, nostalgic content',
        priority: 10,
        conditions: {
            tension: { min: 50 }
        },
        targetEffects: {
            adrenaline: 10,
            tension: 10,
            joy: 85,
            nostalgia: 70
        },
        isActive: true
    },
    {
        name: 'Melancholy Lifter',
        description: 'Uplifts users with high melancholy by recommending joyful, inspiring content',
        priority: 9,
        conditions: {
            melancholy: { min: 50 }
        },
        targetEffects: {
            melancholy: 10,
            darkness: 10,
            joy: 90,
            inspiration: 85,
            wonder: 80
        },
        isActive: true
    },
    {
        name: 'Darkness Lifter',
        description: 'Brightens users with high darkness by recommending uplifting content',
        priority: 9,
        conditions: {
            darkness: { min: 50 }
        },
        targetEffects: {
            melancholy: 10,
            darkness: 10,
            joy: 90,
            inspiration: 85,
            wonder: 80
        },
        isActive: true
    },
    {
        name: 'Grounding High Joy',
        description: 'Adds depth to users with high joy but low intellect',
        priority: 8,
        conditions: {
            joy: { min: 80 },
            intellect: { max: 40 }
        },
        targetEffects: {
            joy: 40,
            intellect: 85,
            tension: 60
        },
        isActive: true
    },
    {
        name: 'Romance Balancer',
        description: 'Diversifies users heavily focused on romance',
        priority: 7,
        conditions: {
            romance: { min: 70 }
        },
        targetEffects: {
            romance: 40,
            adrenaline: 60,
            wonder: 70,
            inspiration: 65
        },
        isActive: true
    },
    {
        name: 'Intellectual Breather',
        description: 'Offers lighter fare to users who consume heavy intellectual content',
        priority: 6,
        conditions: {
            intellect: { min: 75 },
            joy: { max: 30 }
        },
        targetEffects: {
            intellect: 40,
            joy: 80,
            wonder: 70,
            adrenaline: 50
        },
        isActive: true
    }
];

/**
 * Seed ShiftRules collection with default rules
 * Uses upsert to avoid duplicates
 */
export async function seedShiftRules(): Promise<void> {
    console.log('[Seed] Starting ShiftRules seeding...');

    let created = 0;
    let updated = 0;

    for (const rule of SHIFT_RULES_SEED) {
        const result = await ShiftRule.findOneAndUpdate(
            { name: rule.name },
            rule,
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );

        if (result.createdAt.getTime() === result.updatedAt.getTime()) {
            created++;
        } else {
            updated++;
        }
    }

    console.log(`[Seed] ShiftRules seeding complete: ${created} created, ${updated} updated`);
}

/**
 * CLI runner - only executes if run directly
 */
async function main() {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/film-track';

    try {
        await mongoose.connect(mongoUri);
        console.log('[Seed] Connected to MongoDB');

        await seedShiftRules();

        await mongoose.disconnect();
        console.log('[Seed] Disconnected from MongoDB');
        process.exit(0);
    } catch (error) {
        console.error('[Seed] Error:', error);
        process.exit(1);
    }
}

// Run if called directly (not imported)
if (require.main === module) {
    main();
}
