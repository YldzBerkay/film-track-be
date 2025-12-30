import cron from 'node-cron';
import pLimit from 'p-limit';
import { WatchedList } from '../models/watched-list.model';
import { Watchlist } from '../models/watchlist.model';
import { NotificationLog } from '../models/notification-log.model';
import { TMDBService } from './tmdb.service';
import { NotificationService } from './notification.service';

export class TvTrackerService {
    private static limit = pLimit(5); // Process 5 shows at a time

    /**
     * Start the daily cron job
     */
    static initialize(): void {
        console.log('⏰ Initializing TV Tracker Cron Job (08:00 AM)...');
        // Daily at 08:00 AM
        cron.schedule('0 8 * * *', async () => {
            console.log('🚀 Running Daily TV Episode Check...');
            await this.checkNewEpisodes();
        });
    }

    /**
     * Core logic to find new episodes and notify users
     */
    static async checkNewEpisodes(): Promise<void> {
        try {
            // 1. Aggregate unique TV show IDs that users are interested in
            const uniqueShowIds = await this.getUniqueTrackedTvIds();
            console.log(`🔍 Found ${uniqueShowIds.length} unique TV shows to check.`);

            const today = new Date().toISOString().split('T')[0];

            // 2. Process shows in batches to respect rate limits
            const tasks = uniqueShowIds.map(showId => this.limit(async () => {
                try {
                    const details = await TMDBService.getShowDetails(showId.toString());

                    // Check next_episode_to_air
                    const nextEpisode = (details as any).next_episode_to_air;
                    if (nextEpisode && nextEpisode.air_date === today) {
                        await this.notifyForEpisode(
                            showId,
                            nextEpisode.season_number,
                            nextEpisode.episode_number,
                            details.name,
                            details.poster_path
                        );
                    }

                    // Also check last_episode_to_air (just in case air_date was today)
                    const lastEpisode = (details as any).last_episode_to_air;
                    if (lastEpisode && lastEpisode.air_date === today) {
                        await this.notifyForEpisode(
                            showId,
                            lastEpisode.season_number,
                            lastEpisode.episode_number,
                            details.name,
                            details.poster_path
                        );
                    }
                } catch (error) {
                    console.error(`Failed to check show ${showId}:`, error);
                }
            }));

            await Promise.all(tasks);
            console.log('✅ Daily TV Episode Check completed.');
        } catch (error) {
            console.error('❌ Error in checkNewEpisodes:', error);
        }
    }

    /**
     * Get unique TV IDs from both WatchedList and Watchlist
     */
    private static async getUniqueTrackedTvIds(): Promise<number[]> {
        // Find TV shows in default WatchedLists (assuming these are being tracked)
        const watchedTv = await WatchedList.aggregate([
            { $unwind: '$items' },
            { $match: { 'items.mediaType': 'tv' } },
            { $group: { _id: '$items.tmdbId' } }
        ]);

        // Find TV shows in all Watchlists
        const watchlistedTv = await Watchlist.aggregate([
            { $unwind: '$items' },
            { $match: { 'items.mediaType': 'tv' } },
            { $group: { _id: '$items.tmdbId' } }
        ]);

        const allIds = [
            ...watchedTv.map(item => item._id),
            ...watchlistedTv.map(item => item._id)
        ];

        // Return unique IDs
        return Array.from(new Set(allIds));
    }

    /**
     * Send notifications to all users tracking a specific show
     */
    private static async notifyForEpisode(
        tmdbId: number,
        season: number,
        episode: number,
        showName: string,
        posterPath: string | null
    ): Promise<void> {
        // 1. Check if we already notified for this episode
        const alreadyNotified = await NotificationLog.findOne({
            tmdbId,
            seasonNumber: season,
            episodeNumber: episode
        });

        if (alreadyNotified) return;

        // 2. Find all users who have this show in their lists
        const userIdsInWatched = await WatchedList.find({
            'items.tmdbId': tmdbId,
            'items.mediaType': 'tv'
        }).distinct('userId');

        const userIdsInWatchlist = await Watchlist.find({
            'items.tmdbId': tmdbId,
            'items.mediaType': 'tv'
        }).distinct('userId');

        const uniqueUserIds = Array.from(new Set([
            ...userIdsInWatched.map(id => id.toString()),
            ...userIdsInWatchlist.map(id => id.toString())
        ]));

        if (uniqueUserIds.length === 0) return;

        // 3. Log notification to prevent duplicates
        await NotificationLog.create({
            tmdbId,
            seasonNumber: season,
            episodeNumber: episode
        });

        // 4. Send bulk notifications
        const message = `New episode of ${showName} (S${season}E${episode}) is out today!`;
        await NotificationService.createAndSendBulk(
            uniqueUserIds,
            'new_episode',
            message,
            { tmdbId, season, episode, posterPath }
        );

        console.log(`🔔 Sent NEW_EPISODE alert for ${showName} to ${uniqueUserIds.length} users.`);
    }
}
