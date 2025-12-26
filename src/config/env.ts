import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

/**
 * Centralized environment configuration
 * All environment variables should be accessed through this module
 */
export const config = {
    // Server
    port: parseInt(process.env.PORT || '3000', 10),
    nodeEnv: process.env.NODE_ENV || 'development',

    // Database
    mongodbUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/cinetrack',

    // JWT
    jwtSecret: process.env.JWT_SECRET || 'your-secret-key-change-in-production',
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '15m',
    refreshTokenExpiresInDays: 30,

    // External APIs
    tmdbApiKey: process.env.TMDB_API_KEY || '',
    tmdbBaseUrl: 'https://api.themoviedb.org/3',

    // OpenAI
    openaiApiKey: process.env.OPENAI_API_KEY || '',
} as const;

// Type for the config object
export type Config = typeof config;
