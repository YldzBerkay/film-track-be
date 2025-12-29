import { Response } from 'express';
import { Readable } from 'stream';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const csvParser = require('csv-parser');
import { AuthRequest } from '../middleware/auth.middleware';
import { TMDBService, TMDBMovie, TMDBTvShow, TMDBMovieDetails, TMDBTvShowDetails } from '../services/tmdb.service';
import { GamificationService } from '../services/gamification.service';
import { WatchedListService } from '../services/watched-list.service';
import { AIService } from '../services/ai.service';
import { WatchedList } from '../models/watched-list.model';
import { Activity } from '../models/activity.model';
import mongoose from 'mongoose';

interface CsvRow {
    [key: string]: string;
}

interface ImportResult {
    title: string;
    success: boolean;
    error?: string;
}

// Helper to normalize column names (case-insensitive lookup)
function getColumnValue(row: CsvRow, ...possibleNames: string[]): string | undefined {
    for (const name of possibleNames) {
        const key = Object.keys(row).find(k => k.toLowerCase().trim() === name.toLowerCase());
        if (key && row[key]) {
            return row[key].trim();
        }
    }
    return undefined;
}

// Promise pool for concurrent processing with limit
async function processWithConcurrency<T, R>(
    items: T[],
    limit: number,
    processor: (item: T) => Promise<R>
): Promise<R[]> {
    const results: R[] = [];
    const executing: Promise<void>[] = [];

    for (const item of items) {
        const promise = processor(item).then(result => {
            results.push(result);
        });

        executing.push(promise);

        if (executing.length >= limit) {
            await Promise.race(executing);
            // Remove completed promises
            const completed = executing.filter(p => {
                let resolved = false;
                p.then(() => { resolved = true; });
                return resolved;
            });
            executing.splice(0, executing.length, ...executing.filter(p => !completed.includes(p)));
        }
    }

    await Promise.all(executing);
    return results;
}

export class ImportController {
    /**
     * POST /api/import/watch-history
     * Import watch history from CSV file
     * Body: { overwriteExisting: boolean }
     */
    static async importWatchHistory(req: AuthRequest, res: Response): Promise<void> {
        try {
            const userId = req.user!.id;
            const file = req.file;
            const overwriteExisting = req.body.overwriteExisting === 'true' || req.body.overwriteExisting === true;

            if (!file) {
                res.status(400).json({
                    success: false,
                    message: 'No CSV file uploaded'
                });
                return;
            }

            // Parse CSV from buffer
            const rows: CsvRow[] = [];

            await new Promise<void>((resolve, reject) => {
                const stream = Readable.from(file.buffer);
                stream
                    .pipe(csvParser())
                    .on('data', (row: CsvRow) => rows.push(row))
                    .on('end', () => resolve())
                    .on('error', (err: Error) => reject(err));
            });

            if (rows.length === 0) {
                res.status(400).json({
                    success: false,
                    message: 'CSV file is empty or could not be parsed'
                });
                return;
            }

            const results: ImportResult[] = [];
            const failedItems: string[] = [];
            let importedCount = 0;
            let skippedCount = 0;
            let movieCount = 0;
            let tvCount = 0;

            // Collect items for background moodVector processing
            const itemsForMoodProcessing: Array<{
                tmdbId: number;
                mediaType: 'movie' | 'tv';
                title: string;
                overview?: string;
            }> = [];

            // Process rows with concurrency limit of 5
            const processRow = async (row: CsvRow): Promise<void> => {
                const name = getColumnValue(row, 'name', 'title', 'movie');
                const yearStr = getColumnValue(row, 'year', 'release_year', 'releaseyear');
                const ratingStr = getColumnValue(row, 'rating', 'score', 'stars');
                const dateStr = getColumnValue(row, 'date', 'watched_at', 'watchedat', 'watched');

                // Name is required
                if (!name) {
                    results.push({ title: 'Unknown', success: false, error: 'Missing name' });
                    failedItems.push('Row with missing Name');
                    return;
                }

                try {
                    // Parse year if provided
                    const year = yearStr ? parseInt(yearStr, 10) : undefined;

                    // Search TMDB with movie→TV fallback
                    const { result, mediaType, details } = await TMDBService.searchContent(
                        name,
                        year && !isNaN(year) ? year : undefined,
                        'en'
                    );

                    if (!result || !details) {
                        results.push({ title: name, success: false, error: 'Content not found' });
                        failedItems.push(name);
                        return;
                    }

                    // Get title based on media type
                    const title = mediaType === 'movie'
                        ? (result as TMDBMovie).title
                        : (result as TMDBTvShow).name;
                    const posterPath = result.poster_path;

                    // Convert rating from 0-5 to 1-10 scale
                    let rating: number | undefined;
                    if (ratingStr) {
                        const parsedRating = parseFloat(ratingStr);
                        if (!isNaN(parsedRating)) {
                            rating = Math.min(10, Math.max(1, Math.round(parsedRating * 2)));
                        }
                    }

                    // Parse watched date
                    let watchedAt: Date | undefined;
                    if (dateStr) {
                        const parsedDate = new Date(dateStr);
                        if (!isNaN(parsedDate.getTime())) {
                            watchedAt = parsedDate;
                        }
                    }

                    // Check if item already exists in watched list
                    const existingItem = await WatchedList.findOne({
                        userId: new mongoose.Types.ObjectId(userId),
                        isDefault: true,
                        'items.tmdbId': result.id,
                        'items.mediaType': mediaType
                    });

                    if (existingItem) {
                        if (!overwriteExisting) {
                            // Skip - keep existing data
                            skippedCount++;
                            results.push({ title, success: true, error: 'Skipped (existing)' });
                            return;
                        }

                        // Overwrite existing item
                        await WatchedList.findOneAndUpdate(
                            {
                                userId: new mongoose.Types.ObjectId(userId),
                                isDefault: true,
                                'items.tmdbId': result.id,
                                'items.mediaType': mediaType
                            },
                            {
                                $set: {
                                    'items.$.rating': rating,
                                    'items.$.watchedAt': watchedAt || new Date()
                                }
                            }
                        );

                        results.push({ title, success: true });
                        importedCount++;
                        return;
                    }

                    // Calculate runtime
                    let runtime = 0;
                    if (mediaType === 'movie') {
                        runtime = (details as TMDBMovieDetails).runtime || 0;
                    } else {
                        const tvDetails = details as TMDBTvShowDetails;
                        // Estimate runtime for TV: avg episode runtime * total episodes
                        const avgEpisodeRuntime = tvDetails.episode_run_time?.[0] || 45;
                        runtime = avgEpisodeRuntime * (tvDetails.number_of_episodes || 1);
                    }

                    // Add new item to watched list
                    await WatchedListService.addItem(userId, {
                        tmdbId: result.id,
                        mediaType,
                        title,
                        posterPath: posterPath || undefined,
                        runtime,
                        genres: details.genres?.map((g: { name: string }) => g.name) || [],
                        rating,
                        watchedAt
                    });

                    // Track counts by media type
                    if (mediaType === 'movie') {
                        movieCount++;
                    } else {
                        tvCount++;
                    }

                    // Collect for background mood processing
                    itemsForMoodProcessing.push({
                        tmdbId: result.id,
                        mediaType,
                        title,
                        overview: (details as any).overview
                    });

                    results.push({ title, success: true });
                    importedCount++;
                } catch (error) {
                    console.error(`Failed to import "${name}":`, error);
                    results.push({ title: name, success: false, error: 'Processing error' });
                    failedItems.push(name);
                }
            };

            // Process all rows with concurrency limit
            await processWithConcurrency(rows, 5, processRow);

            // Create single summary activity if any items were imported
            // Create single summary activity if any items were imported (newly added)
            const totalNewItems = movieCount + tvCount;

            if (totalNewItems > 0) {
                const messageParts: string[] = [];
                if (movieCount > 0) {
                    messageParts.push(`${movieCount} movie${movieCount > 1 ? 's' : ''}`);
                }
                if (tvCount > 0) {
                    messageParts.push(`${tvCount} TV series`);
                }

                await Activity.create({
                    userId,
                    type: 'bulk_import',
                    mediaType: movieCount > 0 ? 'movie' : 'tv_show',
                    tmdbId: 0,
                    mediaTitle: `Imported ${messageParts.join(' and ')}`,
                    mediaPosterPath: null,
                    createdAt: new Date()
                });
            }

            // Gamification: +1 XP per imported item (max 100 per batch)
            if (totalNewItems > 0) {
                const xpEarned = Math.min(totalNewItems, 100);
                await GamificationService.updateMastery(userId, xpEarned);
            }

            // Calculate estimated processing time (1.5 sec per item for AI analysis)
            const estimatedProcessingSeconds = Math.ceil(itemsForMoodProcessing.length * 1.5);

            res.json({
                success: true,
                data: {
                    importedCount,
                    skippedCount,
                    failedCount: failedItems.length,
                    failedItems,
                    estimatedProcessingSeconds: itemsForMoodProcessing.length > 0 ? estimatedProcessingSeconds : 0
                }
            });

            // Fire-and-forget: Process imported items for moodVector analysis in background
            if (itemsForMoodProcessing.length > 0) {
                AIService.processImportedMoviesInBackground(itemsForMoodProcessing)
                    .catch(err => console.error('[Import] Background mood processing error:', err));
            }
        } catch (error) {
            console.error('Import watch history error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to import watch history'
            });
        }
    }
}

