import { Activity } from '../models/activity.model';
import { TMDBService } from './tmdb.service';
import { User } from '../models/user.model';

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

    static async getDailyRandomMovie(userId: string): Promise<any> {
        try {
            const user = await User.findById(userId);
            if (!user) {
                throw new Error('User not found');
            }

            // Logic: Day starts at 00:00 Local Time (GMT+3).
            const threeHours = 3 * 60 * 60 * 1000;
            const now = new Date();
            const getStreakDateString = (date: Date) => {
                const adjustedDate = new Date(date.getTime() + threeHours);
                return adjustedDate.toISOString().split('T')[0];
            };
            const todayStreakDate = getStreakDateString(now);

            // Check if existing pick is valid for today and try to fetch it
            if (user.dailyPick && user.dailyPick.date && user.dailyPick.tmdbId) {
                const pickDateString = getStreakDateString(user.dailyPick.date);
                if (pickDateString === todayStreakDate) {
                    try {
                        // Return stored pick
                        const movie = await TMDBService.getMovie(user.dailyPick.tmdbId);
                        return {
                            tmdbId: movie.id,
                            title: movie.title,
                            year: new Date(movie.release_date).getFullYear(),
                            genre: 'Movie',
                            backdropUrl: TMDBService.getBackdropUrl(movie.backdrop_path),
                            overview: movie.overview
                        };
                    } catch (err) {
                        console.warn('Stored daily pick not found in TMDB, generating new one.');
                        // Fall through to generate new pick
                    }
                }
            }

            // Generate NEW pick
            // 1. Get user's watched/rated/favorite movies to exclude
            const activities = await Activity.find({
                userId,
                type: { $in: ['movie_watched', 'rating', 'review'] }
            }).distinct('tmdbId');

            const excludeIds = new Set(activities.map(id => Number(id)));

            // 2. Fetch a random page of popular movies (Pages 1-20 to ensure variety)
            const randomPage = Math.floor(Math.random() * 20) + 1;
            const popularMovies = await TMDBService.getPopularMovies(randomPage);

            // 3. Filter candidates
            const candidates = popularMovies.results.filter(movie => !excludeIds.has(movie.id));

            let randomMovie;
            if (candidates.length === 0) {
                // Determine fallback (popular page 1, first movie that isn't excluded, or just first one)
                const fallback = await TMDBService.getPopularMovies(1);
                randomMovie = fallback.results[0];
            } else {
                // 4. Pick a random candidate
                randomMovie = candidates[Math.floor(Math.random() * candidates.length)];
            }

            // 5. Save persistence
            if (user.dailyPick) {
                user.dailyPick.tmdbId = randomMovie.id;
                user.dailyPick.date = now;
            } else {
                user.dailyPick = {
                    tmdbId: randomMovie.id,
                    date: now
                };
            }
            await user.save();

            return {
                tmdbId: randomMovie.id,
                title: randomMovie.title,
                year: new Date(randomMovie.release_date).getFullYear(),
                genre: 'Movie', // We could fetch genres if needed, or mapped from IDs
                backdropUrl: TMDBService.getBackdropUrl(randomMovie.backdrop_path),
                overview: randomMovie.overview
            };

        } catch (error) {
            console.error('Daily Pick Error:', error);
            throw new Error('Failed to get daily pick.');
        }
    }
}
