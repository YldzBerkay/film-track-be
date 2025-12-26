import { Activity } from '../models/activity.model';
import { TMDBService } from './tmdb.service';
import { User } from '../models/user.model';
import { Movie } from '../models/movie.model';
import { MoodService, MoodVector } from './mood.service';

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

export interface MoodRecommendation {
    tmdbId: number;
    title: string;
    posterPath: string;
    backdropPath: string;
    overview: string;
    releaseDate: string;
    moodVector: MoodVector;
    moodSimilarity: number;
    moodMatchType: 'match' | 'shift';
}

export class RecommendationService {
    // Sitcoms: Friends, B99, The Office, Parks & Rec, The Good Place, Rick and Morty
    private static readonly FALLBACK_SHOW_IDS = [1668, 48891, 2316, 8592, 66573, 60625];
    private static readonly MAX_RUNTIME_MINUTES = 35;

    /**
     * Calculate cosine similarity between two mood vectors
     */
    private static calculateCosineSimilarity(a: MoodVector, b: MoodVector): number {
        const keys: (keyof MoodVector)[] = [
            'adrenaline', 'melancholy', 'joy', 'tension', 'intellect',
            'romance', 'wonder', 'nostalgia', 'darkness', 'inspiration'
        ];

        let dotProduct = 0;
        let normA = 0;
        let normB = 0;

        for (const key of keys) {
            dotProduct += a[key] * b[key];
            normA += a[key] * a[key];
            normB += b[key] * b[key];
        }

        if (normA === 0 || normB === 0) return 0;
        return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
    }

    /**
     * Calculate inverse mood for "shift my mood" feature
     * High values become low, low values become high
     */
    private static invertMood(mood: MoodVector): MoodVector {
        return {
            adrenaline: 100 - mood.adrenaline,
            melancholy: 100 - mood.melancholy,
            joy: 100 - mood.joy,
            tension: 100 - mood.tension,
            intellect: 100 - mood.intellect,
            romance: 100 - (mood.romance || 50),
            wonder: 100 - (mood.wonder || 50),
            nostalgia: 100 - (mood.nostalgia || 50),
            darkness: 100 - (mood.darkness || 50),
            inspiration: 100 - (mood.inspiration || 50)
        };
    }

    /**
     * Get mood-based movie recommendations
     * @param mode 'match' = similar mood, 'shift' = opposite mood to change user's mood
     * @param includeWatched whether to include movies the user has already watched
     */
    static async getMoodBasedRecommendations(
        userId: string,
        mode: 'match' | 'shift' = 'match',
        limit: number = 10,
        includeWatched: boolean = false,
        lang?: string
    ): Promise<MoodRecommendation[]> {
        try {
            // 1. Get user's current mood
            const userMood = await MoodService.getUserMood(userId);

            // 2. Get user's watched movies (only if excluding watched)
            let excludeIds = new Set<number>();
            if (!includeWatched) {
                const watchedActivities = await Activity.find({
                    userId,
                    type: { $in: ['movie_watched', 'rating', 'review'] }
                }).distinct('tmdbId');
                excludeIds = new Set(watchedActivities.map(id => Number(id)));
            }

            // 3. Get movies with mood vectors from our database
            const query: any = { moodVector: { $exists: true } };
            if (!includeWatched && excludeIds.size > 0) {
                query.tmdbId = { $nin: [...excludeIds] };
            }
            const moviesWithMood = await Movie.find(query).lean();

            // 4. Target mood depends on mode
            const targetMood = mode === 'shift' ? this.invertMood(userMood) : userMood;

            // 5. Calculate similarity scores
            const scoredMovies = moviesWithMood
                .filter(movie => movie.moodVector)
                .map(movie => ({
                    tmdbId: movie.tmdbId,
                    title: movie.title,
                    posterPath: movie.posterPath || '',
                    backdropPath: '',
                    overview: movie.overview || '',
                    releaseDate: movie.releaseDate || '',
                    moodVector: movie.moodVector!,
                    moodSimilarity: this.calculateCosineSimilarity(targetMood, movie.moodVector!),
                    moodMatchType: mode
                }))
                .sort((a, b) => b.moodSimilarity - a.moodSimilarity)
                .slice(0, limit);

            // 6. If we don't have enough movies with mood vectors, supplement with popular movies
            if (scoredMovies.length < limit) {
                const needed = limit - scoredMovies.length;
                const popularMovies = await TMDBService.getPopularMovies(1, lang);

                const additionalMovies = popularMovies.results
                    .filter(m => !excludeIds.has(m.id) && !scoredMovies.some(s => s.tmdbId === m.id))
                    .slice(0, needed)
                    .map(m => ({
                        tmdbId: m.id,
                        title: m.title,
                        posterPath: m.poster_path || '',
                        backdropPath: m.backdrop_path || '',
                        overview: m.overview,
                        releaseDate: m.release_date,
                        moodVector: userMood, // Use user mood as placeholder
                        moodSimilarity: 0.5, // Neutral score
                        moodMatchType: mode
                    }));

                scoredMovies.push(...additionalMovies);
            }

            return scoredMovies;

        } catch (error) {
            console.error('Mood Recommendations Error:', error);
            throw new Error('Failed to generate mood-based recommendations.');
        }
    }

    static async getMealtimeRandomPick(userId: string, lang?: string): Promise<MealtimeRecommendation> {
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
                    const showDetails = await TMDBService.getShowDetails(randomId.toString(), lang);

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

                        const episodeDetails = await TMDBService.getSeasonDetails(
                            randomId.toString(),
                            randomSeason.season_number,
                            lang
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
            const fallbackShow = await TMDBService.getShowDetails('1668', lang);
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

    static async getDailyRandomMovie(userId: string, lang?: string): Promise<any> {
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
                        const movie = await TMDBService.getMovie(user.dailyPick.tmdbId, lang);
                        return {
                            tmdbId: movie.id,
                            title: movie.title,
                            year: new Date(movie.release_date).getFullYear(),
                            genre: 'Movie',
                            backdropUrl: TMDBService.getBackdropUrl(movie.backdrop_path),
                            overview: movie.overview,
                            watched: user.dailyPick?.watched || false
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
            const popularMovies = await TMDBService.getPopularMovies(randomPage, lang);

            // 3. Filter candidates - exclude watched movies and unreleased movies
            const today = new Date().toISOString().split('T')[0];
            const candidates = popularMovies.results.filter(movie =>
                !excludeIds.has(movie.id) &&
                movie.release_date &&
                movie.release_date <= today
            );

            let randomMovie;
            if (candidates.length === 0) {
                // Determine fallback (popular page 1, first movie that isn't excluded, or just first one)
                const fallback = await TMDBService.getPopularMovies(1, lang);
                randomMovie = fallback.results[0];
            } else {
                // 4. Pick a random candidate
                randomMovie = candidates[Math.floor(Math.random() * candidates.length)];
            }

            // 5. Save persistence
            if (user.dailyPick) {
                user.dailyPick.tmdbId = randomMovie.id;
                user.dailyPick.date = now;
                user.dailyPick.watched = false;
            } else {
                user.dailyPick = {
                    tmdbId: randomMovie.id,
                    date: now,
                    watched: false
                };
            }
            await user.save();

            return {
                tmdbId: randomMovie.id,
                title: randomMovie.title,
                year: new Date(randomMovie.release_date).getFullYear(),
                genre: 'Movie',
                backdropUrl: TMDBService.getBackdropUrl(randomMovie.backdrop_path),
                overview: randomMovie.overview,
                watched: false
            };

        } catch (error) {
            console.error('Daily Pick Error:', error);
            throw new Error('Failed to get daily pick.');
        }
    }

    /**
     * Get a mealtime recommendation based on shared interests with friends
     */
    static async getFriendMealtimePick(userId: string, friendIds: string[], lang?: string): Promise<MealtimeRecommendation & { sharedWith: string[] }> {
        try {
            // 1. Get all users (current user + friends)
            const allUserIds = [userId, ...friendIds];
            const users = await User.find({ _id: { $in: allUserIds } }).select('favoriteTvShows username name');

            if (users.length !== allUserIds.length) {
                throw new Error('One or more users not found');
            }

            // 2. Find shared TV shows (intersection of all users' favorites)
            const tvShowMaps = users.map(u => new Set(u.favoriteTvShows.map(s => s.tmdbId)));

            let sharedShowIds: number[] = [];
            if (tvShowMaps.length > 0) {
                // Start with first user's shows
                sharedShowIds = [...tvShowMaps[0]];

                // Intersect with all other users
                for (let i = 1; i < tvShowMaps.length; i++) {
                    sharedShowIds = sharedShowIds.filter(id => tvShowMaps[i].has(id));
                }
            }

            // 3. If no shared shows, use union of all favorites
            if (sharedShowIds.length === 0) {
                const allShows = new Set<number>();
                users.forEach(u => u.favoriteTvShows.forEach(s => allShows.add(s.tmdbId)));
                sharedShowIds = [...allShows];
            }

            // 4. If still no shows, use fallbacks
            if (sharedShowIds.length === 0) {
                sharedShowIds = [...this.FALLBACK_SHOW_IDS];
            }

            // 5. Try to find a valid episode from shared shows
            for (let attempt = 0; attempt < 5; attempt++) {
                const randomShowId = sharedShowIds[Math.floor(Math.random() * sharedShowIds.length)];

                try {
                    const showDetails = await TMDBService.getShowDetails(randomShowId.toString(), lang);

                    // Filter out specials (season 0) and empty seasons
                    const validSeasons = showDetails.seasons.filter(
                        s => s.season_number > 0 && s.episode_count > 0
                    );

                    if (validSeasons.length === 0) continue;

                    const randomSeason = validSeasons[Math.floor(Math.random() * validSeasons.length)];
                    const randomEpisodeNumber = Math.floor(Math.random() * randomSeason.episode_count) + 1;

                    const seasonDetails = await TMDBService.getSeasonDetails(
                        randomShowId.toString(),
                        randomSeason.season_number,
                        lang
                    );

                    const episode = seasonDetails.episodes.find(e => e.episode_number === randomEpisodeNumber);

                    if (episode) {
                        // Get friend usernames for display
                        const friendUsers = users.filter(u => u._id.toString() !== userId);

                        return {
                            showTitle: showDetails.name,
                            showPoster: TMDBService.getPosterUrl(showDetails.poster_path),
                            episodeTitle: episode.name,
                            seasonNumber: randomSeason.season_number,
                            episodeNumber: randomEpisodeNumber,
                            runtime: showDetails.episode_run_time[0] || 30,
                            overview: episode.overview || showDetails.overview,
                            stillPath: episode.still_path ? TMDBService.getBackdropUrl(episode.still_path) : null,
                            sharedWith: friendUsers.map(u => u.name || u.username)
                        };
                    }
                } catch (err) {
                    console.warn(`Failed to process show ${randomShowId} for friend recommendation`, err);
                    continue;
                }
            }

            // Fallback
            const fallbackShow = await TMDBService.getShowDetails('1668', lang);
            return {
                showTitle: fallbackShow.name,
                showPoster: TMDBService.getPosterUrl(fallbackShow.poster_path),
                episodeTitle: 'The One Where They All Watch Together',
                seasonNumber: 1,
                episodeNumber: 1,
                runtime: 22,
                overview: 'A fallback recommendation when shared selection fails.',
                stillPath: null,
                sharedWith: friendIds.length > 0 ? ['your friends'] : []
            };

        } catch (error) {
            console.error('Friend Mealtime Pick Error:', error);
            throw new Error('Failed to get friend recommendation.');
        }
    }
}
