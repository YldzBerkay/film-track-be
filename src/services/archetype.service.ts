import { MoodVector } from './mood.service';

/**
 * Cinematic Archetype definitions based on dominant mood dimensions
 */
export interface ArchetypeDefinition {
    name: string;
    displayName: string;
    emoji: string;
    description: string;
    conditions: (mood: MoodVector) => boolean;
}

const ARCHETYPES: ArchetypeDefinition[] = [
    {
        name: 'vigilante',
        displayName: 'The Vigilante',
        emoji: '🦇',
        description: 'Drawn to dark, action-packed stories of justice',
        conditions: (m) => m.adrenaline > 70 && m.darkness > 70
    },
    {
        name: 'philosopher',
        displayName: 'The Philosopher',
        emoji: '🤔',
        description: 'Seeks profound, thought-provoking narratives',
        conditions: (m) => m.intellect > 70 && m.melancholy > 50
    },
    {
        name: 'thrill_seeker',
        displayName: 'The Thrill Seeker',
        emoji: '🎢',
        description: 'Lives for edge-of-seat tension and excitement',
        conditions: (m) => m.adrenaline > 80 && m.tension > 60
    },
    {
        name: 'hopeless_romantic',
        displayName: 'The Hopeless Romantic',
        emoji: '💕',
        description: 'Heart yearns for love stories and happy endings',
        conditions: (m) => m.romance > 80 && m.joy > 50
    },
    {
        name: 'explorer',
        displayName: 'The Explorer',
        emoji: '🧭',
        description: 'Craves wonder, discovery, and new worlds',
        conditions: (m) => m.wonder > 80 && m.intellect > 60
    },
    {
        name: 'comfort_seeker',
        displayName: 'The Comfort Seeker',
        emoji: '🛋️',
        description: 'Finds solace in joyful, nostalgic comfort watches',
        conditions: (m) => m.joy > 70 && m.nostalgia > 60
    },
    {
        name: 'critic',
        displayName: 'The Critic',
        emoji: '🎭',
        description: 'High standards, favors complex intellectual fare',
        conditions: (m) => m.intellect > 80 && m.joy < 30
    },
    {
        name: 'dreamer',
        displayName: 'The Dreamer',
        emoji: '✨',
        description: 'Lost in wonder, inspiration, and imaginative stories',
        conditions: (m) => m.wonder > 70 && m.inspiration > 70
    },
    {
        name: 'night_owl',
        displayName: 'The Night Owl',
        emoji: '🌙',
        description: 'Drawn to darkness, mystery, and nocturnal tales',
        conditions: (m) => m.darkness > 75 && m.tension > 50
    },
    {
        name: 'nostalgic',
        displayName: 'The Nostalgic',
        emoji: '📼',
        description: 'Lives for throwbacks and memory lane journeys',
        conditions: (m) => m.nostalgia > 80
    }
];

const DEFAULT_ARCHETYPE: Omit<ArchetypeDefinition, 'conditions'> = {
    name: 'cinephile',
    displayName: 'The Cinephile',
    emoji: '🎬',
    description: 'Balanced taste across all genres and moods'
};

export class ArchetypeService {
    /**
     * Determine a user's cinematic archetype based on their mood vector
     * Returns the first matching archetype or default
     */
    static getArchetype(mood: MoodVector): { name: string; displayName: string; emoji: string; description: string } {
        for (const archetype of ARCHETYPES) {
            if (archetype.conditions(mood)) {
                return {
                    name: archetype.name,
                    displayName: archetype.displayName,
                    emoji: archetype.emoji,
                    description: archetype.description
                };
            }
        }

        return DEFAULT_ARCHETYPE;
    }

    /**
     * Get all available archetypes (for UI display)
     */
    static getAllArchetypes(): Array<{ name: string; displayName: string; emoji: string; description: string }> {
        return [
            ...ARCHETYPES.map(a => ({
                name: a.name,
                displayName: a.displayName,
                emoji: a.emoji,
                description: a.description
            })),
            DEFAULT_ARCHETYPE
        ];
    }

    /**
     * Get archetype by name
     */
    static getArchetypeByName(name: string): { name: string; displayName: string; emoji: string; description: string } | null {
        const archetype = ARCHETYPES.find(a => a.name === name);
        if (archetype) {
            return {
                name: archetype.name,
                displayName: archetype.displayName,
                emoji: archetype.emoji,
                description: archetype.description
            };
        }
        if (name === 'cinephile') {
            return DEFAULT_ARCHETYPE;
        }
        return null;
    }
}
