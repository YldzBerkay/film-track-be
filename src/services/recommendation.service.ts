import { Activity } from '../models/activity.model';
import { TMDBService } from './tmdb.service';

interface MealtimeRecommendation {
    showTitle: string;
    showPoster: string;
    episodeTitle: string;
    seasonNumber: number;
    episodeNumber: number;
    runtime: number;
    overview: string;
    stillPath: string | null;
}

export class RecommendationService {
    // Sitcoms: Friends, B99, The Office, Parks & Rec, The Good Place, Rick and Morty
    private static readonly FALLBACK_SHOW_IDS = [1668, 48891, 2316, 8592, 66573, 60625];
    private static readonly MAX_RUNTIME_MINUTES = 35;

    static async getMealtimeRandomPick(userId: string): Promise<MealtimeRecommendation> {
        try {
            // 1. Get user's watched shows
            const activities = await Activity.find({
                userId,
                type: 'tv_episode_watched'
            }).distinct('tmdbId');

            let candidateIds = activities as number[]; // Distinct returns array of values

            // If user hasn't watched much, mix in fallbacks
            if (candidateIds.length < 5) {
                candidateIds = [...new Set([...candidateIds, ...this.FALLBACK_SHOW_IDS])];
            }

            // 2. Try to find a valid short show (max 3 attempts)
            for (let i = 0; i < 3; i++) {
                const randomId = candidateIds[Math.floor(Math.random() * candidateIds.length)];

                try {
                    const showDetails = await TMDBService.getShowDetails(randomId.toString());

                    // Calculate average runtime
                    const avgRuntime = showDetails.episode_run_time.length > 0
                        ? showDetails.episode_run_time.reduce((a, b) => a + b, 0) / showDetails.episode_run_time.length
                        : 30; // Default to 30 if unknown

                    if (avgRuntime <= this.MAX_RUNTIME_MINUTES) {
                        // Found a valid show! Pick random episode.
                        const randomSeason = showDetails.seasons[Math.floor(Math.random() * showDetails.seasons.length)];

                        // Skip season 0 (specials) if possible, unless it's the only one
                        if (randomSeason.season_number === 0 && showDetails.seasons.length > 1) {
                            continue; // Retry another show/season
                        }

                        if (randomSeason.episode_count === 0) continue;

                        const randomEpisodeNumber = Math.floor(Math.random() * randomSeason.episode_count) + 1;

                        // Get episode details
                        const episodeDetails = await TMDBService.getSeasonDetails(
                            randomId.toString(),
                            randomSeason.season_number
                        );

                        const episode = episodeDetails.episodes.find(e => e.episode_number === randomEpisodeNumber);

                        if (episode) {
                            return {
                                showTitle: showDetails.name,
                                showPoster: TMDBService.getPosterUrl(showDetails.poster_path),
                                episodeTitle: episode.name,
                                seasonNumber: randomSeason.season_number,
                                episodeNumber: randomEpisodeNumber,
                                runtime: avgRuntime,
                                overview: episode.overview || showDetails.overview,
                                stillPath: episode.still_path ? TMDBService.getBackdropUrl(episode.still_path) : null
                            };
                        }
                    }
                } catch (err) {
                    console.warn(`Failed to process show ${randomId} for recommendation`, err);
                    continue;
                }
            }

            // 3. Fallback if logic fails: Return a hardcoded "Friends" episode recommendation
            // Friends ID: 1668
            const fallbackShow = await TMDBService.getShowDetails('1668');
            return {
                showTitle: fallbackShow.name,
                showPoster: TMDBService.getPosterUrl(fallbackShow.poster_path),
                episodeTitle: 'The One Where They Fallback',
                seasonNumber: 1,
                episodeNumber: 1,
                runtime: 22,
                overview: 'A fallback recommendation when random selection fails.',
                stillPath: null
            };

        } catch (error) {
            console.error('Recommendation Error:', error);
            throw new Error('Failed to generate recommendation.');
        }
    }
}
