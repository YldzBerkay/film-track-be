import { Worker, Job } from 'bullmq';
import mongoose from 'mongoose';
import Redis from 'ioredis';
import { IMPORT_QUEUE_NAME } from '../queues/import.queue';
import { ImportItem } from '../services/import-adapters';
import { TMDBService } from '../services/tmdb.service';
import { WatchedListService } from '../services/watched-list.service';
import { WatchlistService } from '../services/watchlist.service';
import { EpisodeRatingService } from '../services/episode-rating.service';
import { socketService } from '../services/socket.service';
import { NotificationService } from '../services/notification.service';
import { Activity } from '../models/activity.model'; // Direct model access for Binge logic if service missing

import dotenv from 'dotenv';
dotenv.config();

const connection = {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD || undefined
};

const redis = new Redis(connection);

interface ImportJobData {
    item: ImportItem;
    userId: string;
    mode: 'watch-history' | 'custom-list';
    listId?: string; // For custom list
    jobId: string; // Batch ID or Group ID for progress tracking (optional)
    totalNr: number;
    currentNr: number;
}

// Binge Activity Helper
async function handleBingeActivity(userId: string, showId: number, showName: string | undefined, date: Date) {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    // Find existing binge activity for this show today
    const existing = await Activity.findOne({
        userId: new mongoose.Types.ObjectId(userId),
        type: 'season_binge',
        tmdbId: showId, // Storing Show ID here
        createdAt: { $gte: startOfDay, $lte: endOfDay }
    });

    if (existing) {
        // Increment count
        // Assuming metadata stores count? Or using a specific field?
        // Let's assume title holds the string "Watched X episodes..."
        // Parse matches? 
        // Better: Activity model likely doesn't have 'count'. 
        // We'll update the title.
        const currentTitle = existing.mediaTitle; // e.g. "Watched 2 episodes of Breaking Bad"
        const match = currentTitle.match(/Watched (\d+) episodes/);
        let count = match ? parseInt(match[1]) : 1;
        count++;
        existing.mediaTitle = `Watched ${count} episodes of ${showName || 'TV Show'}`;
        existing.updatedAt = new Date(); // Bump timestamp
        await existing.save();
    } else {
        // Create new
        await Activity.create({
            userId,
            type: 'season_binge',
            mediaType: 'tv_show', // It is TV
            tmdbId: showId,
            mediaTitle: `Watched 1 episodes of ${showName || 'TV Show'}`,
            mediaPosterPath: null, // Could fetch
            createdAt: date
        });
    }
}

export const importWorker = new Worker<ImportJobData>(IMPORT_QUEUE_NAME, async (job: Job<ImportJobData>) => {
    const { item, userId, mode, listId, currentNr, totalNr } = job.data;

    // Notify Progress (Start)
    const progressPercent = Math.round(((currentNr - 1) / totalNr) * 100);
    socketService.emitToUser(userId, 'import:progress', {
        percent: progressPercent,
        status: 'processing',
        item: item.title || 'Unknown Item'
    });

    try {
        // 1. Resolve TMDB
        let result = null;
        let mediaType: 'movie' | 'tv' = item.rawType?.includes('episode') ? 'tv' : 'movie'; // Initial guess
        let episodeInfo = null;

        if (item.imdbId && item.imdbId.startsWith('tt')) {
            const lookup = await TMDBService.findByExternalId(item.imdbId);
            result = lookup.result;
            mediaType = lookup.mediaType;
            episodeInfo = lookup.episodeInfo;
        } else if (item.title) {
            // Fallback search
            const search = await TMDBService.searchContent(item.title, item.year);
            result = search.result;
            mediaType = search.mediaType;
        }

        if (!result) {
            throw new Error(`Content not found: ${item.title}`);
        }

        // Calculate runtime
        let runtime = 0;
        if (mediaType === 'movie') {
            runtime = (result as any).runtime || 0;
        } else {
            const avg = (result as any).episode_run_time?.[0] || 45;
            runtime = avg * ((result as any).number_of_episodes || 1);
        }

        // 2. Process based on Mode
        if (mode === 'watch-history') {
            // Custom Episode Logic
            if (episodeInfo && mediaType === 'tv') {
                // It's an episode.
                // A) SAVE RATING
                if (item.rating) {
                    await EpisodeRatingService.rateEpisode(
                        new mongoose.Types.ObjectId(userId),
                        result.id,
                        episodeInfo.seasonNumber,
                        episodeInfo.episodeNumber,
                        item.rating
                    );
                }

                // B) CREATE BINGE ACTIVITY (Smart Handling)
                // Do NOT add to WatchedList (Timeline)
                await handleBingeActivity(userId, result.id, (result as any).name, item.watchedAt || new Date());

            } else {
                // Movie or Full Show
                await WatchedListService.addItem(userId, {
                    tmdbId: result.id,
                    mediaType,
                    title: (result as any).title || (result as any).name,
                    posterPath: result.poster_path || undefined,
                    runtime,
                    rating: item.rating,
                    watchedAt: item.watchedAt,
                    skipActivity: true // Suppress individual activity creation to avoid spam
                    // User wants "clean timeline". Single adds usually create activity.
                    // If batch import, we might want to suppress individual "watched movie" activities if they spam?
                    // But requirement was specifically for Binge.
                    // Let's suppress here and rely on Summary Activity if provided?
                    // Or keep default.
                });
            }
        } else if (mode === 'custom-list' && listId) {
            // Add to custom list
            // If Episode -> Add Parent Show
            await WatchlistService.addItem(listId, userId, {
                tmdbId: result.id,
                mediaType: 'tv', // Always TV for episodes/shows
                title: (result as any).name
            });

            // And Save Rating if Episode
            if (episodeInfo && item.rating) {
                await EpisodeRatingService.rateEpisode(
                    new mongoose.Types.ObjectId(userId),
                    result.id,
                    episodeInfo.seasonNumber,
                    episodeInfo.episodeNumber,
                    item.rating
                );
            }
        }

        // Notify Progress (Complete)
        const completePercent = Math.round((currentNr / totalNr) * 100);
        socketService.emitToUser(userId, 'import:progress', {
            percent: completePercent,
            status: 'success',
            item: item.title
        });

        // Check Batch Completion
        // Check Batch Completion
        const { jobId } = job.data;
        if (jobId) {
            const remaining = await redis.decr(`import_batch:${jobId}`);
            if (remaining <= 0) {
                const message = mode === 'custom-list'
                    ? `Your list import is complete! Processed ${totalNr} items.`
                    : `Your watch history import is complete! Processed ${totalNr} items.`;

                await NotificationService.createAndSendBulk([userId], 'import_completed', message, {
                    batchId: jobId,
                    count: totalNr,
                    mode
                });

                // Cleanup
                await redis.del(`import_batch:${jobId}`);
                console.log(`Import Batch ${jobId} Completed. Notification sent.`);
            }
        }

        return { success: true, title: item.title };

    } catch (err: any) {
        console.error(`Import Job Failed for ${item.title}:`, err.message);
        socketService.emitToUser(userId, 'import:error', {
            item: item.title,
            error: err.message
        });
        throw err;
    }

}, {
    connection,
    concurrency: 1, // Global concurrency per worker
    limiter: {
        max: 1,
        duration: 300 // 1 job per 300ms = ~3.3 req/sec (Safe for TMDB)
    }
});

console.log('Worker initialized for queue:', IMPORT_QUEUE_NAME);
