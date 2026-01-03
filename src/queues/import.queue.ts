import { Queue } from 'bullmq';
import dotenv from 'dotenv';
dotenv.config();

const connection = {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD || undefined
};

export const IMPORT_QUEUE_NAME = 'import-queue';

export const importQueue = new Queue(IMPORT_QUEUE_NAME, {
    connection,
    defaultJobOptions: {
        attempts: 3,
        backoff: {
            type: 'exponential',
            delay: 1000,
        },
        removeOnComplete: 1000, // Keep last 1000 jobs
        removeOnFail: 5000     // Keep failed jobs longer for debugging
    }
});
