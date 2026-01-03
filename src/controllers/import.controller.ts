import { Response } from 'express';
import { Readable } from 'stream';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const csvParser = require('csv-parser');
import { AuthRequest } from '../middleware/auth.middleware';
import { TMDBService, TMDBMovie, TMDBTvShow, TMDBMovieDetails, TMDBTvShowDetails } from '../services/tmdb.service';
import { GamificationService } from '../services/gamification.service';
import { WatchedListService } from '../services/watched-list.service';
import { WatchlistService } from '../services/watchlist.service';
import { AIService } from '../services/ai.service';
import { WatchedList } from '../models/watched-list.model';
import { Activity } from '../models/activity.model';
import { EpisodeRatingService } from '../services/episode-rating.service';
import mongoose from 'mongoose';
import { importQueue } from '../queues/import.queue';
import { AdapterFactory, ImportItem } from '../services/import-adapters';

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
            const source = req.body.source || 'imdb';

            if (!file) {
                res.status(400).json({ success: false, message: 'No CSV file uploaded' });
                return;
            }

            const rows: any[] = [];
            await new Promise<void>((resolve, reject) => {
                Readable.from(file.buffer)
                    .pipe(csvParser())
                    .on('data', (r: any) => rows.push(r))
                    .on('end', () => resolve())
                    .on('error', (err: Error) => reject(err));
            });

            if (rows.length === 0) {
                res.status(400).json({ success: false, message: 'CSV file is empty' });
                return;
            }

            const adapter = AdapterFactory.getAdapter(source);
            const items: ImportItem[] = [];
            for (const row of rows) {
                const item = adapter.parse(row);
                if (item) items.push(item);
            }

            if (items.length === 0) {
                res.status(400).json({ success: false, message: 'No valid items found' });
                return;
            }

            const batchId = `history-${userId}-${Date.now()}`;
            const client = await importQueue.client;
            await client.set(`import_batch:${batchId}`, items.length);
            // Set expire in case of stuck jobs? 24h
            await client.expire(`import_batch:${batchId}`, 86400);

            const jobs = items.map((item, index) => ({
                name: 'import-watch-history',
                data: {
                    item,
                    userId,
                    mode: 'watch-history' as const,
                    jobId: batchId,
                    totalNr: items.length,
                    currentNr: index + 1
                },
                opts: {
                    attempts: 3,
                    backoff: { type: 'exponential', delay: 2000 },
                    removeOnComplete: true
                }
            }));

            await importQueue.addBulk(jobs);

            res.json({
                success: true,
                message: 'Import started successfully in background',
                data: {
                    importedCount: 0,
                    queuedCount: items.length,
                    skippedCount: 0,
                    failedCount: 0,
                    failedItems: [],
                    estimatedProcessingSeconds: Math.ceil(items.length * 0.3), // 300ms per item
                    processingInBackground: true
                }
            });

        } catch (error) {
            console.error('Import watch history error:', error);
            res.status(500).json({ success: false, message: 'Failed to import watch history' });
        }
    }

    static async importList(req: AuthRequest, res: Response): Promise<void> {
        try {
            const userId = req.user!.id;
            const file = req.file;
            const source = req.body.source || 'imdb';

            if (!file) {
                res.status(400).json({ success: false, message: 'No CSV file uploaded' });
                return;
            }

            let listName = req.body.listName?.trim();
            if (!listName) {
                const originalName = file.originalname || 'Imported List';
                listName = originalName.replace(/\.[^/.]+$/, '').trim() || 'Imported List';
            }

            const rows: any[] = [];
            await new Promise<void>((resolve, reject) => {
                Readable.from(file.buffer)
                    .pipe(csvParser())
                    .on('data', (r: any) => rows.push(r))
                    .on('end', () => resolve())
                    .on('error', (err: Error) => reject(err));
            });

            if (rows.length === 0) {
                res.status(400).json({ success: false, message: 'CSV file is empty' });
                return;
            }

            // Create List First
            const watchlist = await WatchlistService.createCustomList(userId, listName, 'movie'); // Default type, mixed content supported
            const watchlistId = watchlist._id.toString();

            const adapter = AdapterFactory.getAdapter(source);
            const items: ImportItem[] = [];
            for (const row of rows) {
                const item = adapter.parse(row);
                if (item) items.push(item);
            }

            if (items.length === 0) {
                res.status(400).json({ success: false, message: 'No valid items found' });
                return;
            }

            const batchId = `list-${userId}-${watchlistId}-${Date.now()}`;
            const client = await importQueue.client;
            await client.set(`import_batch:${batchId}`, items.length);
            await client.expire(`import_batch:${batchId}`, 86400);

            const jobs = items.map((item, index) => ({
                name: 'import-list',
                data: {
                    item,
                    userId,
                    mode: 'custom-list' as const,
                    listId: watchlistId,
                    jobId: batchId,
                    totalNr: items.length,
                    currentNr: index + 1
                },
                opts: {
                    attempts: 3,
                    backoff: { type: 'exponential', delay: 2000 },
                    removeOnComplete: true
                }
            }));

            await importQueue.addBulk(jobs);

            res.json({
                success: true,
                message: 'Import started successfully in background',
                data: {
                    listId: watchlistId,
                    listName,
                    importedCount: 0,
                    queuedCount: items.length,
                    estimatedProcessingSeconds: Math.ceil(items.length * 0.3),
                    processingInBackground: true
                }
            });

        } catch (error) {
            console.error('Import list error:', error);
            res.status(500).json({ success: false, message: 'Failed to import list' });
        }
    }
}
