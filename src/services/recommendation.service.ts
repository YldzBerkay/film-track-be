import { Activity } from '../models/activity.model';
import { WatchedList } from '../models/watched-list.model';
import { TMDBService } from './tmdb.service';
import { MovieService } from './movie.service';
import { User } from '../models/user.model';
import { Movie } from '../models/movie.model';
import { MoodService, MoodVector } from './mood.service';
import { AIService } from './ai.service';
import { UserRecommendationCache, ICachedRecommendation } from '../models/user-recommendation-cache.model';

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

interface ResolvedMovie {
    tmdbId: number;
    title: string;
    posterPath: string;
    backdropPath: string;
    overview: string;
    releaseDate: string;
    genres?: string[]; // Added genres for boost logic
    moodVector: MoodVector;
    isNewlyDiscovered: boolean;
}

// Threshold check result
export interface ThresholdMeta {
    currentCount: number;
    requiredCount: number;
    remaining: number;
}

export interface MoodRecommendationResult {
    success: boolean;
    data?: MoodRecommendation[];
    error?: string;
    meta?: ThresholdMeta;
}

// Minimum movies required for AI recommendations
const MINIMUM_RATED_MOVIES = 25;
const MAX_DAYS = 30;
const TIME_DECAY_DAYS = 14;

// 1. Which emotion balances which? (The Chemistry)
const MOOD_ANTIDOTES: Record<string, string[]> = {
    'adrenaline': ['nostalgia', 'romance', 'wonder'], // Slow down
    'melancholy': ['joy', 'inspiration', 'wonder'],   // Cheer up
    'joy': ['darkness', 'tension', 'intellect'],      // Get serious
    'tension': ['joy', 'wonder', 'romance'],          // Relax
    'intellect': ['adrenaline', 'joy'],               // Brain off
    'romance': ['tension', 'darkness', 'adrenaline'], // Less mushy
    'wonder': ['nostalgia', 'melancholy'],            // Grounding
    'nostalgia': ['adrenaline', 'intellect'],         // Modernize
    'darkness': ['joy', 'inspiration', 'romance'],    // Lighten up
    'inspiration': ['melancholy', 'darkness']         // Reality check
};

// 2. Which genre represents which emotion? (The Technical Filter)
const MOOD_GENRE_MAP: Record<string, string[]> = {
    'adrenaline': ['Action', 'Adventure', 'War'],
    'melancholy': ['Drama'],
    'joy': ['Comedy', 'Family', 'Animation', 'Music'],
    'tension': ['Thriller', 'Horror'],
    'intellect': ['Science Fiction', 'Mystery', 'Documentary', 'Crime'],
    'romance': ['Romance'],
    'wonder': ['Fantasy', 'Science Fiction', 'Adventure'],
    'nostalgia': ['History', 'Western'],
    'darkness': ['Horror', 'Crime', 'Mystery'],
    'inspiration': ['Documentary', 'History', 'Drama']
};

export class RecommendationService {
    // Sitcoms: Friends, B99, The Office, Parks & Rec, The Good Place, Rick and Morty
    private static readonly FALLBACK_SHOW_IDS = [1668, 48891, 2316, 8592, 66573, 60625];
    private static readonly MAX_RUNTIME_MINUTES = 35;

    /**
     * Check if user has enough rated movies for AI recommendations
     * Returns null if threshold met, or ThresholdMeta if not met
     */
    static async checkMovieThreshold(userId: string): Promise<ThresholdMeta | null> {
        const watchedList = await WatchedList.findOne({ userId, isDefault: true }).lean();

        if (!watchedList?.items) {
            return {
                currentCount: 0,
                requiredCount: MINIMUM_RATED_MOVIES,
                remaining: MINIMUM_RATED_MOVIES
            };
        }

        // Count movies (not TV) with valid rating
        const ratedMovieCount = watchedList.items.filter(
            item => item.mediaType === 'movie' && item.rating && item.rating > 0
        ).length;

        if (ratedMovieCount < MINIMUM_RATED_MOVIES) {
            return {
                currentCount: ratedMovieCount,
                requiredCount: MINIMUM_RATED_MOVIES,
                remaining: MINIMUM_RATED_MOVIES - ratedMovieCount
            };
        }

        return null; // Threshold met
    }

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
     * Calculate target vector for mood-based recommendations
     * For 'match' mode: returns the original userMood
     * For 'shift' mode: constructs a fresh "Antidote Vector" from neutral base
     * 
     * FIX: In 'shift' mode, we do NOT copy the userMood. We build a fresh target.
     * If user has high Adrenaline (e.g., 69), we explicitly want LOW Adrenaline (e.g., 10),
     * regardless of arbitrary thresholds.
     */
    private static calculateTargetVector(userMood: MoodVector, mode: 'match' | 'shift'): MoodVector {
        if (mode === 'match') {
            return userMood;
        }

        // SHIFT MODE: Construct a "Counter-Vector" from neutral base
        // Start with a fresh, neutral target (low intensity negatives, moderate positives)
        const target: MoodVector = {
            adrenaline: 20,
            melancholy: 20,
            joy: 50,       // Default slightly hopeful
            tension: 20,
            intellect: 50, // Neutral - preserved
            romance: 30,
            wonder: 50,
            nostalgia: 30,
            darkness: 10,
            inspiration: 50
        };

        // 1. ANALYZE & INVERT: Handle Adrenaline/Tension (The Stress Axis)
        if (userMood.adrenaline > 50 || userMood.tension > 50) {
            target.adrenaline = 10; // Force calm
            target.tension = 10;    // Force relax
            target.joy = 85;        // Boost joy as antidote
            target.nostalgia = 70;  // Nostalgia is calming
        }

        // 2. Handle Melancholy/Darkness (The Sadness Axis)
        if (userMood.melancholy > 50 || userMood.darkness > 50) {
            target.melancholy = 10;
            target.darkness = 10;
            target.joy = 90;        // High Joy
            target.inspiration = 85; // High Inspiration
            target.wonder = 80;      // High Wonder
        }

        // 3. Handle Over-Joy (To ground them - shift from pure Comedy to Intellect/Thriller)
        if (userMood.joy > 80 && userMood.intellect < 40) {
            target.joy = 40;
            target.intellect = 85;
            target.tension = 60; // Add some spice
        }

        // 4. Handle "Boredom" (Low everything) - boost excitement
        const isBored = Object.values(userMood).every(v => v < 60);
        if (isBored) {
            target.adrenaline = 85;
            target.wonder = 85;
            target.inspiration = 80;
        }

        console.log(`[TargetVector] SHIFT CALCULATION:`);
        console.log(`   User: Adrenaline=${userMood.adrenaline}, Tension=${userMood.tension}, Melancholy=${userMood.melancholy}`);
        console.log(`   Target: Adrenaline=${target.adrenaline}, Tension=${target.tension}, Joy=${target.joy}`);

        return target;
    }



    /**
     * Calculate time decay factor (Consistent with MoodService)
     */
    private static calculateTimeDecay(activityDate: Date): number {
        const now = new Date();
        const daysDiff = Math.floor((now.getTime() - activityDate.getTime()) / (1000 * 60 * 60 * 24));

        if (daysDiff <= TIME_DECAY_DAYS) {
            return 1.0;
        } else if (daysDiff <= MAX_DAYS) {
            const decayRange = MAX_DAYS - TIME_DECAY_DAYS;
            const decayProgress = (daysDiff - TIME_DECAY_DAYS) / decayRange;
            return 1.0 - decayProgress * 0.5;
        }
        return 0.5;
    }

    /**
     * Get mood-based movie recommendations
     * @param mode 'match' = similar mood, 'shift' = opposite mood to change user's mood
     * @param includeWatched whether to include movies the user has already watched (not used in AI mode)
     */
    static async getMoodBasedRecommendations(
        userId: string,
        mode: 'match' | 'shift' = 'match',
        limit: number = 10,
        includeWatched: boolean = false,
        lang?: string,
        forceRefresh: boolean = false
    ): Promise<MoodRecommendation[]> {
        try {
            console.log(`[MoodBased] Delegating to AI Curation (${mode.toUpperCase()} mode) ${forceRefresh ? '- FORCE REFRESH' : ''}`);

            // Simply call the updated AI method for BOTH modes
            return await this.getAICuratedRecommendations(userId, limit, lang, forceRefresh, mode);

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
                            runtime: movie.runtime,
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

            // Fetch full movie details to get runtime
            const fullMovie = await TMDBService.getMovie(randomMovie.id, lang);

            return {
                tmdbId: randomMovie.id,
                title: randomMovie.title,
                year: new Date(randomMovie.release_date).getFullYear(),
                runtime: fullMovie.runtime || 0,
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


    /**
     * Get recent watched items with "Polarized Influence Score" for AI context
     * Used to tell the LLM what the user hated (-0.8) or loved (+0.9) recently.
     */
    static async getRecentWatchedWithInfluence(userId: string, limit: number = 10): Promise<Array<{
        title: string;
        genres: string[];
        rating: number;
        influenceScore: number;
        watchedAt: Date;
    }>> {
        // 1. Get recent activities with ratings
        const activities = await Activity.find({
            userId,
            actionType: 'watched', // 'watched' or 'rating' ? Check Activity enum. Usually 'watched'.
            rating: { $exists: true, $ne: null }
        })
            .sort({ createdAt: -1 })
            .limit(limit * 2)
            .lean();

        // 2. Process and calculate influence
        const result = [];
        const processedIds = new Set<number>();

        for (const act of activities) {
            if (result.length >= limit) break;
            if (processedIds.has(Number(act.tmdbId))) continue;

            const tmdbId = Number(act.tmdbId);
            const mediaType = act.mediaType === 'tv_show' || act.mediaType === 'tv_episode' ? 'tv' : 'movie';

            // STRICT FILTER: Only include movies in the AI context payload
            // TV shows have different storytelling dynamics and skew movie recommendations
            if (mediaType !== 'movie') continue;

            // Get movie details for genres
            const movie = await Movie.findOne({ tmdbId, mediaType });

            // Calculate Influence
            // Formula: Normalize(Rating - 5.5) * TimeDecay
            const rating = act.rating!;
            if (rating >= 5 && rating <= 6) continue;

            const rawScore = rating - 5.5;
            const normalizedScore = rawScore / 4.5;

            const timeDecay = this.calculateTimeDecay(new Date(act.createdAt));
            const influenceScore = Number((normalizedScore * timeDecay).toFixed(2));

            result.push({
                title: act.mediaTitle || 'Unknown',
                genres: movie?.genres || [],
                rating: rating,
                influenceScore: influenceScore,
                watchedAt: act.createdAt
            });

            processedIds.add(tmdbId);
        }

        return result;
    }

    // ============================================================
    // AI CURATION WITH DYNAMIC DATABASE EXPANSION
    // ============================================================

    // Type: ResolvedMovie is defined inline in the method return types

    /**
     * Build a human-readable mood description from top dimensions
     */
    private static buildMoodDescription(mood: MoodVector): string {
        const dimensions: { key: keyof MoodVector; label: string }[] = [
            { key: 'adrenaline', label: 'High Adrenaline' },
            { key: 'melancholy', label: 'Melancholic' },
            { key: 'joy', label: 'Joyful' },
            { key: 'tension', label: 'Tense' },
            { key: 'intellect', label: 'Intellectual' },
            { key: 'romance', label: 'Romantic' },
            { key: 'wonder', label: 'Wonderous' },
            { key: 'nostalgia', label: 'Nostalgic' },
            { key: 'darkness', label: 'Dark' },
            { key: 'inspiration', label: 'Inspiring' }
        ];

        // Get top 3 dimensions (above 60)
        const topDimensions = dimensions
            .filter(d => mood[d.key] >= 60)
            .sort((a, b) => mood[b.key] - mood[a.key])
            .slice(0, 3)
            .map(d => d.label);

        // Get bottom 2 dimensions (below 40) for contrast
        const lowDimensions = dimensions
            .filter(d => mood[d.key] < 40)
            .sort((a, b) => mood[a.key] - mood[b.key])
            .slice(0, 2)
            .map(d => `Low ${d.label}`);

        const description = [...topDimensions, ...lowDimensions].join(', ');
        return description || 'Balanced mood across all dimensions';
    }

    /**
     * Get recent user feedback context for AI prompt injection
     * Fetches liked/disliked/rated items from the last N days
     */
    private static async getRecentFeedbackContext(userId: string, days: number = 14): Promise<string> {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);

        const watchedList = await WatchedList.findOne({ userId, isDefault: true }).lean();
        if (!watchedList || !watchedList.items) {
            return '';
        }

        // Filter items from the last N days (movies only)
        const recentItems = watchedList.items.filter(item =>
            item.mediaType === 'movie' &&
            new Date(item.watchedAt || item.addedAt) >= cutoffDate
        );

        if (recentItems.length === 0) {
            return '';
        }

        // Categorize by feedback and rating
        const likedTitles: string[] = [];
        const dislikedTitles: string[] = [];
        const ratedTitles: string[] = [];

        recentItems.forEach(item => {
            if (item.feedback === 'like') {
                likedTitles.push(item.title);
            } else if (item.feedback === 'dislike') {
                dislikedTitles.push(item.title);
            }

            if (item.rating) {
                ratedTitles.push(`${item.title} (${item.rating}/10)`);
            }
        });

        // Build context string
        const contextParts: string[] = [];

        if (likedTitles.length > 0) {
            contextParts.push(`The user explicitly LIKED: ${likedTitles.join(', ')}`);
        }
        if (dislikedTitles.length > 0) {
            contextParts.push(`The user explicitly DISLIKED: ${dislikedTitles.join(', ')}`);
        }
        if (ratedTitles.length > 0) {
            contextParts.push(`The user RATED: ${ratedTitles.join(', ')}`);
        }

        if (contextParts.length === 0) {
            return '';
        }

        return `
[RECENT USER FEEDBACK - LAST ${days} DAYS]
${contextParts.join('\n')}

INSTRUCTION:
Use this feedback to refine the next suggestions.
- If they Liked a movie, find structurally similar films.
- If they Disliked a movie, avoid that specific sub-genre or tone.
- Consider their rating patterns when selecting recommendations.
`;
    }
    /**
     * Resolve a movie title: Check DB -> Search TMDB -> Analyze -> Save
     */
    /**
     * Resolve a movie title: Check DB -> Search TMDB -> Analyze -> Save
     * Supports Polyglot Caching: checks and fetches translations on demand
     */
    private static async resolveAndAnalyzeMovie(
        title: string,
        excludeIds: Set<number>,
        lang: string = 'en'
    ): Promise<ResolvedMovie | null> {
        try {
            // 1. Check if movie exists in our database (case-insensitive title OR check by ID if we could, but we only have title here)
            // Ideally we should search TMDB first to get ID, then check DB by ID?
            // Current flow: DB Title Match -> specific to existing movies.

            // Parse title for year if present "Title (YYYY)"
            const match = title.match(/^(.+?)\s*\((\d{4})\)$/);
            let searchTitle = title;
            let searchYear: number | undefined = undefined;

            if (match) {
                searchTitle = match[1].trim();
                searchYear = parseInt(match[2]);
            }

            // 1. Check if movie exists in our database
            // Note: DB search by exact string regex might fail if we have "Title" but searching "Title (Year)"
            // Better to search DB by the parsed title if we have one.
            const dbSearchTitle = searchTitle;

            const existingMovie = await Movie.findOne({
                title: { $regex: new RegExp(`^${dbSearchTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
                mediaType: 'movie',
                // Optional: Check year if existingMovie has releaseDate? 
                // Getting intricate, but basic title match is usually enough for local DB check.
            }).lean();

            if (existingMovie && existingMovie.moodVector) {
                // Skip if already watched
                if (excludeIds.has(existingMovie.tmdbId)) return null;

                // POLYGLOT CACHING: Check if we have the requested language
                const targetIso = lang;
                const translation = existingMovie.translations?.find(t => t.iso_639_1 === targetIso);

                let resolvedTitle = existingMovie.title;
                let resolvedOverview = existingMovie.overview || '';
                let resolvedPoster = existingMovie.posterPath || '';
                let resolvedGenres = existingMovie.genres || [];

                if (translation) {
                    console.log(`[Polyglot] Cache hit for ${existingMovie.title} (${targetIso})`);
                    resolvedTitle = translation.title;
                    resolvedOverview = translation.overview;
                    resolvedPoster = translation.posterPath;
                    resolvedGenres = translation.genres;
                } else if (targetIso !== 'en') {
                    // MISSING TRANSLATION: Fetch from TMDB and cache it
                    console.log(`[Polyglot] Cache miss for ${existingMovie.title} (${targetIso}). Fetching...`);
                    try {
                        const details = await TMDBService.getMovieDetails(existingMovie.tmdbId.toString(), targetIso);

                        const newTranslation = {
                            iso_639_1: targetIso,
                            title: details.title,
                            overview: details.overview,
                            posterPath: details.poster_path || '',
                            genres: details.genres?.map(g => g.name) || []
                        };

                        // Use the fetched data for return
                        resolvedTitle = newTranslation.title;
                        resolvedOverview = newTranslation.overview;
                        resolvedPoster = newTranslation.posterPath;
                        resolvedGenres = newTranslation.genres;

                        // Save to DB
                        await Movie.updateOne(
                            { _id: existingMovie._id },
                            { $push: { translations: newTranslation } }
                        );
                        console.log(`[Polyglot] Saved translation for ${existingMovie.title} (${targetIso})`);

                    } catch (err) {
                        console.warn(`[Polyglot] Failed to fetch translation for ${existingMovie.title} (${targetIso})`, err);
                        // Fallback to default English data is implicit since we initialized vars with existingMovie.*
                    }
                } else {
                    // English fallback (and missing english translation in array, which is fine, main fields are default)
                    // Check if genres are empty (legacy backfill)
                    if (!resolvedGenres || resolvedGenres.length === 0) {
                        // Backfill logic for Default Language (Legacy)
                        console.log(`[AI Curation] Backfilling genres for: ${existingMovie.title}`);
                        try {
                            const details = await TMDBService.getMovieDetails(existingMovie.tmdbId.toString(), 'en');
                            resolvedGenres = details.genres?.map(g => g.name) || [];
                            if (resolvedGenres.length > 0) {
                                await Movie.updateOne({ _id: existingMovie._id }, { $set: { genres: resolvedGenres } });
                            }
                        } catch (err) { console.warn(`[AI Curation] Failed to backfill genres`); }
                    }
                }

                return {
                    tmdbId: existingMovie.tmdbId,
                    title: resolvedTitle,
                    posterPath: resolvedPoster,
                    backdropPath: '', // we could cache this too but sticking to poster for now
                    overview: resolvedOverview,
                    releaseDate: existingMovie.releaseDate || '',
                    genres: resolvedGenres,
                    moodVector: existingMovie.moodVector as MoodVector,
                    isNewlyDiscovered: false
                };
            }

            // 2. Search TMDB for the movie (using the language and optional year)
            // Use searchTitle and searchYear
            const searchResult = await TMDBService.searchMovies(searchTitle, 1, lang, searchYear);
            if (!searchResult.results || searchResult.results.length === 0) {
                // Retry in English if specific lang failed
                if (lang !== 'en') {
                    const fallbackSearch = await TMDBService.searchMovies(searchTitle, 1, 'en', searchYear);
                    if (!fallbackSearch.results || fallbackSearch.results.length === 0) {
                        console.warn(`[AI Curation] Movie not found on TMDB: ${title}`);
                        return null;
                    }
                    // Proceed with English result but fetch details in target lang later
                    // Actually, if we search in English, we find the English record.
                } else {
                    console.warn(`[AI Curation] Movie not found on TMDB: ${title}`);
                    return null;
                }
            }

            // Use the first result. Note: Title might be in English or Target Lang depending on search
            // If we search by 'title' (which comes from AI in English), we might get English results even if we pass 'tr' logic depending on TMDB...
            // Actually AI suggestions are usually English.
            // Best Practice: Search in English to match the AI Title properly.
            // THEN fetch details in Target Lang.

            const enSearchResult = await TMDBService.searchMovies(searchTitle, 1, 'en', searchYear);
            if (!enSearchResult.results || enSearchResult.results.length === 0) {
                return null;
            }

            // SMART SELECTION: Do NOT just take [0].
            // Sometimes the first result is a low-quality entry.
            // Priority: Valid Poster AND Vote Count > 10
            let bestMatch = enSearchResult.results[0]; // Default fallback

            if (enSearchResult.results.length > 1) {
                // 1. Filter out garbage (no poster, very low votes)
                const validCandidates = enSearchResult.results.filter((m: any) => m.poster_path && m.vote_count > 10);

                // 2. If we have valid candidates, sort by vote count (popularity proxy)
                if (validCandidates.length > 0) {
                    bestMatch = validCandidates.sort((a: any, b: any) => b.vote_count - a.vote_count)[0];
                }
            }

            const tmdbMovie = bestMatch;

            // Skip if already watched
            if (excludeIds.has(tmdbMovie.id)) return null;

            // 3. Get full movie details in TARGET language
            const details = await TMDBService.getMovieDetails(tmdbMovie.id.toString(), lang);
            const genres = details.genres?.map(g => g.name) || [];

            // 4. Analyze with AI (always use English title/overview for consistency in analysis)
            // But we can save the translated metadata.
            // We need English details for AI Analysis though.
            let englishDetails = details;
            if (lang !== 'en') {
                englishDetails = await TMDBService.getMovieDetails(tmdbMovie.id.toString(), 'en');
            }

            const moodVector = await AIService.getOrAnalyzeMovie(
                tmdbMovie.id,
                'movie',
                englishDetails.title, // Use English title for DB main field
                englishDetails.overview, // Use English overview for DB main field
                englishDetails.genres?.map(g => g.name) || [],
                englishDetails.poster_path || '',
                englishDetails.release_date
            );

            // If target lang is NOT English, we must make sure we allow AIService to save the main movie record first (which it does),
            // and THEN we append our translation. 
            // `getOrAnalyzeMovie` saves the movie. Now we update it with translation.

            if (lang !== 'en') {
                const newTranslation = {
                    iso_639_1: lang,
                    title: details.title,
                    overview: details.overview,
                    posterPath: details.poster_path || '',
                    genres: genres
                };

                await Movie.updateOne(
                    { tmdbId: tmdbMovie.id, mediaType: 'movie' },
                    { $push: { translations: newTranslation } }
                );
            }

            return {
                tmdbId: tmdbMovie.id,
                title: details.title, // Return translated title
                posterPath: details.poster_path || '',
                backdropPath: details.backdrop_path || '',
                overview: details.overview,
                releaseDate: details.release_date,
                genres: genres,
                moodVector,
                isNewlyDiscovered: true
            };
        } catch (error) {
            console.error(`[AI Curation] Failed to resolve movie: ${title}`, error);
            return null;
        }
    }

    /**
     * Get AI-curated recommendations with weekly caching
     * 
     * CACHE-FIRST LOGIC:
     * 1. Check for valid cached recommendations (not expired)
     * 2. If cached and not forceRefresh, return cached
     * 3. Otherwise, generate new recommendations via AI
     * 4. Save to cache with 7-day expiry
     * 5. Return recommendations
     */
    static async getAICuratedRecommendations(
        userId: string,
        limit: number = 10,
        lang?: string,
        forceRefresh: boolean = false,
        mode: 'match' | 'shift' = 'match'
    ): Promise<MoodRecommendation[]> {
        const startTime = Date.now();
        const CACHE_DURATION_DAYS = 7;

        try {
            // 1. Check cache first (unless forceRefresh)
            if (!forceRefresh) {
                const cachedData = await UserRecommendationCache.findOne({
                    userId,
                    moodMode: mode,
                    expiresAt: { $gt: new Date() }
                }).lean();

                if (cachedData && cachedData.recommendations.length > 0) {
                    const cacheAge = Math.floor((Date.now() - new Date(cachedData.generatedAt).getTime()) / (1000 * 60 * 60 * 24));
                    console.log(`[AI Curation] Returning cached recommendations (${cacheAge} days old, ${cachedData.recommendations.length} items)`);

                    // Map to a format suitable for hydration and return
                    // Note: Cached items might not have the full 'translations' array attached, 
                    // allowing 'hydrateMoviesWithLanguage' to naturally fetch missing languages from TMDB if needed.
                    // We must pass objects that have at least 'tmdbId' and the fields we want to populate.
                    let basicRecs: any[] = cachedData.recommendations.slice(0, limit).map(rec => ({
                        _id: (rec as any)._id, // If stored
                        tmdbId: rec.tmdbId,
                        title: rec.title,
                        posterPath: rec.posterPath,
                        backdropPath: rec.backdropPath,
                        overview: rec.overview,
                        releaseDate: rec.releaseDate,
                        moodVector: rec.moodVector,
                        moodSimilarity: rec.moodSimilarity,
                        moodMatchType: 'match' as const,
                        translations: [] // Initialize empty so hydration check doesn't crash but assumes missing
                    }));

                    // HYDRATE CACHED ITEMS
                    if (lang) {
                        basicRecs = await MovieService.hydrateMoviesWithLanguage(basicRecs, lang, forceRefresh);
                    }

                    return basicRecs;
                }
            }

            console.log(`[AI Curation] ${forceRefresh ? 'Force refresh requested' : 'Cache miss/expired'}, generating new recommendations...`);

            // 2. Get user's current mood
            const userMood = await MoodService.getUserMood(userId);

            // 3. Build mood description for AI curator
            const moodDescription = this.buildMoodDescription(userMood);
            console.log(`[AI Curation] User mood description: ${moodDescription}`);

            // 3b. Identify Top 3 Dominant Dimensions for Genre Mapping
            const sortedMoods = Object.entries(userMood)
                .sort(([, a], [, b]) => b - a)
                .slice(0, 3)
                .map(([key]) => key);

            // 3c. BRANCHED LOGIC: Match vs Shift
            let targetGenres = new Set<string>();
            let aiInstruction = '';

            if (mode === 'match') {
                // MATCH LOGIC: Map Dominant Moods -> Genres
                sortedMoods.forEach(mood => {
                    const genres = MOOD_GENRE_MAP[mood] || [];
                    genres.forEach(g => targetGenres.add(g));
                });
                aiInstruction = `The user loves '${sortedMoods.join(', ')}' movies. Suggest ${limit + 15} feature films that perfectly match this mood.`;
                console.log(`[AI Curation] MATCH Mode - Target Genres: ${Array.from(targetGenres).join(', ')}`);
            } else if (mode === 'shift') {
                // SHIFT LOGIC: Map Dominant Moods -> Antidotes -> Genres
                const antidoteEmotions = new Set<string>();

                sortedMoods.forEach(mood => {
                    const antidotes = MOOD_ANTIDOTES[mood] || [];
                    antidotes.forEach(a => antidoteEmotions.add(a));
                });

                // Map Antidotes to Genres
                antidoteEmotions.forEach(emotion => {
                    const genres = MOOD_GENRE_MAP[emotion] || [];
                    genres.forEach(g => targetGenres.add(g));
                });

                // Identify Genres to AVOID (the user's current dominant mood genres)
                const avoidGenres = new Set<string>();
                sortedMoods.forEach(mood => {
                    const genres = MOOD_GENRE_MAP[mood] || [];
                    genres.forEach(g => avoidGenres.add(g));
                });

                const antidoteList = Array.from(antidoteEmotions).join(', ');
                const avoidList = Array.from(avoidGenres).join(', ');

                // STRONG PROMPT: Explicitly forbid the user's current mood genres
                aiInstruction = `
CURRENT STATE: The user is feeling '${sortedMoods.join(', ')}' (typical genres: ${avoidList}).
GOAL: They need a 'Mood Shift' / Palette Cleanser.
TASK: Suggest ${limit + 15} feature films that evoke '${antidoteList}'.
CONSTRAINT: Do NOT suggest ${avoidList} movies. 
Example: If they are tense, do NOT suggest Thrillers. Suggest Comedy or Fantasy instead.
`;
                console.log(`[AI Curation] SHIFT Mode - Antidotes: ${antidoteList}, Avoid: ${avoidList}, Target Genres: ${Array.from(targetGenres).join(', ')}`);
            }

            const genreList = Array.from(targetGenres);

            // 4. Build exclusion set (watched movies) - still exclude what user has seen
            const excludeIds = new Set<number>();
            const watchedList = await WatchedList.findOne({ userId, isDefault: true }).lean();
            if (watchedList?.items) {
                watchedList.items
                    .filter(item => item.mediaType === 'movie')
                    .forEach(item => excludeIds.add(item.tmdbId));
            }

            const activities = await Activity.find({ userId, type: { $in: ['movie_watched', 'rating'] } });
            activities.forEach(act => excludeIds.add(Number(act.tmdbId)));

            // 5. REPLENISHMENT LOOP: Ask AI for movies until we hit the limit
            const allRankedMovies: any[] = [];
            let attempts = 0;
            const MAX_ATTEMPTS = 3;

            // Updated Prompt to include Genre Constraints AND Recent Feedback
            const feedbackContext = await this.getRecentFeedbackContext(userId, 14);
            const formattingRule = "IMPORTANT FORMATTING RULE: Return the movie titles strictly in this format: 'Original English Title (YYYY)'. Example: 'The Matrix (1999)', 'Interstellar (2014)'. Do not include any other text.";
            let basePrompt = `${aiInstruction} Focus primarily on these genres: ${genreList.join(', ')}. Do NOT suggest TV Series. ${formattingRule}`;

            if (feedbackContext) {
                basePrompt = `${moodDescription}\n\n${basePrompt}\n\n${feedbackContext}`;
            } else {
                basePrompt = `${moodDescription}\n\n${basePrompt}`;
            }

            while (allRankedMovies.length < limit && attempts < MAX_ATTEMPTS) {
                attempts++;
                const neededCount = (limit - allRankedMovies.length);
                const requestCount = neededCount + 10; // Always request buffer

                console.log(`[AI Curation] Attempt ${attempts}/${MAX_ATTEMPTS}: Need ${neededCount} more, asking for ${requestCount}.`);

                let currentPrompt = basePrompt;
                if (attempts > 1) {
                    // In retries, explicitly forbid what we already have
                    const currenttitles = allRankedMovies.map(m => m.title).join(', ');
                    currentPrompt += `\n\nCONSTRAINT: Do NOT suggest these movies again: ${currenttitles}. Suggest different ones.`;
                }

                try {
                    console.log(`[AI Curation] Sending request for ${requestCount} items...`);
                    const suggestedTitles = await AIService.getCuratorSuggestions(
                        currentPrompt,
                        requestCount
                    );

                    if (suggestedTitles.length === 0) {
                        console.warn('[AI Curation] No suggestions received in this attempt.');
                        if (attempts === 1 && allRankedMovies.length === 0) {
                            throw new Error('AI service failed to generate recommendations.');
                        }
                        break; // Stop if AI stops giving output
                    }

                    console.log(`[AI Curation] AI suggested ${suggestedTitles.length} films:`, suggestedTitles);

                    // 6. Resolve ALL AI-suggested movies in parallel
                    const resolutionPromises = suggestedTitles.map(title =>
                        this.resolveAndAnalyzeMovie(title, excludeIds, lang || 'en')
                    );

                    const resolvedMovies = (await Promise.all(resolutionPromises))
                        .filter((m): m is ResolvedMovie => m !== null);

                    console.log(`[AI Curation] Resolved ${resolvedMovies.length} movies in attempt ${attempts}`);

                    // 7. Calculate target vector and similarity
                    const targetVector = this.calculateTargetVector(userMood, mode);

                    const batchRanked = resolvedMovies
                        .map(movie => {
                            let sim = this.calculateCosineSimilarity(targetVector, movie.moodVector) * 100;

                            // GENRE BOOST: +5% if movie has at least one matching genre
                            const hasMatchingGenre = movie.genres && movie.genres.some((g: string) => targetGenres.has(g));
                            if (hasMatchingGenre) {
                                sim += 5;
                            }

                            // 3. THE SKEPTIC PENALTY
                            if (mode === 'shift') {
                                const similarityToOriginalMood = this.calculateCosineSimilarity(userMood, movie.moodVector);

                                if (similarityToOriginalMood > 0.65) {
                                    console.log(`[Skeptic Filter] Penalizing '${movie.title}' in Shift Mode.`);
                                    sim -= 50;
                                }

                                if (userMood.tension > 60 && movie.moodVector.tension > 60) {
                                    console.log(`[Skeptic Filter] Hard Block '${movie.title}': High Tension match.`);
                                    sim -= 100;
                                }

                                if (userMood.melancholy > 60 && movie.moodVector.melancholy > 60) {
                                    console.log(`[Skeptic Filter] Hard Block '${movie.title}': High Melancholy match.`);
                                    sim -= 100;
                                }
                            }

                            sim = Math.min(Math.max(sim, 0), 100);
                            sim = Number(sim.toFixed(1));

                            return {
                                ...movie,
                                moodSimilarity: sim,
                                moodMatchType: mode
                            };
                        })
                        .filter(m => {
                            if (m.moodSimilarity <= 40) {
                                console.log(`[Filter] Dropped '${m.title}' (Score: ${m.moodSimilarity})`);
                                return false;
                            }
                            return true;
                        });

                    console.log(`[AI Curation] Batch yielded ${batchRanked.length} valid movies.`);

                    // Add to cumulative list
                    for (const movie of batchRanked) {
                        // Check for duplicates (just in case)
                        if (!allRankedMovies.some(existing => existing.tmdbId === movie.tmdbId)) {
                            allRankedMovies.push(movie);
                            // Add to exclude list for next iteration
                            excludeIds.add(movie.tmdbId);
                        }
                    }

                } catch (err) {
                    console.error(`[AI Curation] Error in attempt ${attempts}:`, err);
                    // If first attempt fails completely, throw. Otherwise continue with what we have.
                    if (attempts === 1 && allRankedMovies.length === 0) throw err;
                }
            }

            // Final sort and slice
            const rankedMovies = allRankedMovies
                .sort((a, b) => b.moodSimilarity - a.moodSimilarity)
                .slice(0, limit);

            // 8. Save to cache with 7-day expiry
            const expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + CACHE_DURATION_DAYS);

            const cacheData: ICachedRecommendation[] = rankedMovies.map(movie => ({
                tmdbId: movie.tmdbId,
                title: movie.title,
                posterPath: movie.posterPath,
                backdropPath: movie.backdropPath,
                overview: movie.overview,
                releaseDate: movie.releaseDate,
                moodVector: movie.moodVector,
                moodSimilarity: movie.moodSimilarity
            }));

            await UserRecommendationCache.findOneAndUpdate(
                { userId, moodMode: mode },
                {
                    userId,
                    recommendations: cacheData,
                    moodMode: mode,
                    generatedAt: new Date(),
                    expiresAt
                },
                { upsert: true, new: true }
            );

            console.log(`[AI Curation] Cached ${cacheData.length} recommendations, expires: ${expiresAt.toISOString()}`);

            const elapsed = Date.now() - startTime;
            console.log(`[AI Curation] Completed in ${elapsed}ms with ${rankedMovies.length} results (100% AI-driven)`);

            // 9. Format response - ONLY AI-suggested movies
            return rankedMovies.map(movie => ({
                tmdbId: movie.tmdbId,
                title: movie.title,
                posterPath: movie.posterPath,
                backdropPath: movie.backdropPath,
                overview: movie.overview,
                releaseDate: movie.releaseDate,
                moodVector: movie.moodVector,
                moodSimilarity: movie.moodSimilarity,
                moodMatchType: 'match' as const
            }));

        } catch (error) {
            console.error('[AI Curation] Error:', error);
            // 100% AI-driven: no fallback, return empty on error
            return [];
        }
    }

    /**
     * Process user feedback on recommendations (Like/Dislike)
     * - LIKE: Merge movie mood into user profile with high influence
     * - DISLIKE: Blacklist movie and apply negative vector adjustment
     */
    static async processRecommendationFeedback(
        userId: string,
        tmdbId: number,
        title: string,
        action: 'like' | 'dislike'
    ): Promise<{ success: boolean; message: string }> {
        try {
            const user = await User.findById(userId);
            if (!user) {
                throw new Error('User not found');
            }

            // Get movie mood vector
            const movie = await Movie.findOne({ tmdbId, mediaType: 'movie' }).lean();
            let moodVector = movie?.moodVector;

            if (!moodVector) {
                // Fetch and analyze if not in DB
                moodVector = await AIService.getOrAnalyzeMovie(tmdbId, 'movie', title);
            }

            if (action === 'like') {
                // Reinforce: merge movie mood into user profile with high weight (0.3)
                const currentMood = await MoodService.getUserMood(userId);
                const influence = 0.3;

                const adjustedMood: MoodVector = {
                    adrenaline: Math.round(currentMood.adrenaline * (1 - influence) + moodVector.adrenaline * influence),
                    melancholy: Math.round(currentMood.melancholy * (1 - influence) + moodVector.melancholy * influence),
                    joy: Math.round(currentMood.joy * (1 - influence) + moodVector.joy * influence),
                    tension: Math.round(currentMood.tension * (1 - influence) + moodVector.tension * influence),
                    intellect: Math.round(currentMood.intellect * (1 - influence) + moodVector.intellect * influence),
                    romance: Math.round(currentMood.romance * (1 - influence) + moodVector.romance * influence),
                    wonder: Math.round(currentMood.wonder * (1 - influence) + moodVector.wonder * influence),
                    nostalgia: Math.round(currentMood.nostalgia * (1 - influence) + moodVector.nostalgia * influence),
                    darkness: Math.round(currentMood.darkness * (1 - influence) + moodVector.darkness * influence),
                    inspiration: Math.round(currentMood.inspiration * (1 - influence) + moodVector.inspiration * influence)
                };

                // Update user's mood profile
                await MoodService.setUserMood(userId, adjustedMood);
                console.log(`[Feedback] LIKE: Reinforced user ${userId} mood profile with ${title}`);

            } else if (action === 'dislike') {
                // Blacklist the movie
                if (!user.blacklistedMovies.includes(tmdbId)) {
                    user.blacklistedMovies.push(tmdbId);
                }

                // Apply negative vector: reduce influence of this movie's mood profile
                const currentMood = await MoodService.getUserMood(userId);
                const negativeInfluence = 0.15;

                const adjustedMood: MoodVector = {
                    adrenaline: Math.round(Math.max(0, Math.min(100, currentMood.adrenaline - (moodVector.adrenaline - 50) * negativeInfluence))),
                    melancholy: Math.round(Math.max(0, Math.min(100, currentMood.melancholy - (moodVector.melancholy - 50) * negativeInfluence))),
                    joy: Math.round(Math.max(0, Math.min(100, currentMood.joy - (moodVector.joy - 50) * negativeInfluence))),
                    tension: Math.round(Math.max(0, Math.min(100, currentMood.tension - (moodVector.tension - 50) * negativeInfluence))),
                    intellect: Math.round(Math.max(0, Math.min(100, currentMood.intellect - (moodVector.intellect - 50) * negativeInfluence))),
                    romance: Math.round(Math.max(0, Math.min(100, currentMood.romance - (moodVector.romance - 50) * negativeInfluence))),
                    wonder: Math.round(Math.max(0, Math.min(100, currentMood.wonder - (moodVector.wonder - 50) * negativeInfluence))),
                    nostalgia: Math.round(Math.max(0, Math.min(100, currentMood.nostalgia - (moodVector.nostalgia - 50) * negativeInfluence))),
                    darkness: Math.round(Math.max(0, Math.min(100, currentMood.darkness - (moodVector.darkness - 50) * negativeInfluence))),
                    inspiration: Math.round(Math.max(0, Math.min(100, currentMood.inspiration - (moodVector.inspiration - 50) * negativeInfluence)))
                };

                await MoodService.setUserMood(userId, adjustedMood);
                await user.save();
                console.log(`[Feedback] DISLIKE: Blacklisted ${title} for user ${userId}, applied negative adjustment`);
            }

            // Invalidate recommendation cache to get fresh recommendations next time
            await UserRecommendationCache.deleteOne({ userId, moodMode: 'match' });

            return { success: true, message: 'Feedback processed successfully' };

        } catch (error) {
            console.error('[Feedback] Error:', error);
            throw error;
        }
    }

    /**
     * Process RL feedback with support for detailed metrics (rating, feedback score)
     * Maps to existing logic for now but extensible for RL rewards
     */
    static async processRLFeedback(
        userId: string,
        tmdbId: number,
        mediaType: string,
        feedback: number,
        rating: number
    ): Promise<any> {
        try {
            // 1. Fetch title if needed (for consistency with internal logic)
            let title = 'Unknown Movie';
            try {
                // Try to find in DB first
                const existing = await Movie.findOne({ tmdbId, mediaType });
                if (existing) {
                    title = existing.title;
                } else {
                    // Fetch from TMDB
                    // Defaulting to 'en' as we don't have lang context, or 'en-US'
                    const details = await TMDBService.getMovieDetails(tmdbId.toString(), 'en-US');
                    title = details.title;
                }
            } catch (err) {
                console.warn(`[RL Feedback] Could not resolve title for TMDB ${tmdbId}`);
            }

            // 2. Map feedback to action
            // Feedback: 1 (Like), -1 (Dislike)
            // Rating: 0-10
            const action = feedback > 0 ? 'like' : 'dislike';

            // 3. Delegate to existing logic
            // In future, we can use 'rating' to adjust the influence weight dynamically
            return await this.processRecommendationFeedback(userId, tmdbId, title, action);

        } catch (error) {
            console.error('[RL Feedback] Error:', error);
            throw error;
        }
    }

    /**
     * Get a single replacement recommendation (uses quota)
     * Returns new movie or QUOTA_EXCEEDED error
     * @param rejectedTitle Optional: title of the movie the user rejected, for context injection
     */
    static async getSingleReplacement(
        userId: string,
        excludeTmdbIds: number[],
        rejectedTitle?: string,
        lang?: string
    ): Promise<{ success: boolean; data?: MoodRecommendation; error?: string; remaining?: number }> {
        try {
            const user = await User.findById(userId);
            if (!user) {
                throw new Error('User not found');
            }

            // Check and reset quota if new month
            const now = new Date();
            const lastReset = user.recommendationQuota?.lastResetDate || new Date(0);
            if (now.getMonth() !== lastReset.getMonth() || now.getFullYear() !== lastReset.getFullYear()) {
                user.recommendationQuota = { remaining: 3, lastResetDate: now };
                await user.save();
            }

            // Check quota
            if (user.recommendationQuota.remaining <= 0) {
                return { success: false, error: 'QUOTA_EXCEEDED', remaining: 0 };
            }

            // Decrement quota
            user.recommendationQuota.remaining -= 1;
            await user.save();

            // Build full exclusion set
            const fullExclusions = new Set<number>([
                ...excludeTmdbIds,
                ...(user.blacklistedMovies || [])
            ]);

            // Get user's current mood
            const userMood = await MoodService.getUserMood(userId);
            const moodDescription = this.buildMoodDescription(userMood);

            // Build prompt with rejection context if available
            let promptWithContext = moodDescription;
            if (rejectedTitle) {
                promptWithContext += `\n\nUser rejected "${rejectedTitle}". Suggest an immediate alternative that is tonally different.`;
                console.log(`[Replace] User rejected: ${rejectedTitle}`);
            }

            // Ask AI for a few suggestions
            const suggestedTitles = await AIService.getCuratorSuggestions(promptWithContext, 5);

            if (suggestedTitles.length === 0) {
                return { success: false, error: 'NO_SUGGESTIONS', remaining: user.recommendationQuota.remaining };
            }

            // Resolve movies until we find one not in exclusion list
            for (const title of suggestedTitles) {
                const resolved = await this.resolveAndAnalyzeMovie(title, fullExclusions);
                if (resolved) {
                    const recommendation: MoodRecommendation = {
                        tmdbId: resolved.tmdbId,
                        title: resolved.title,
                        posterPath: resolved.posterPath,
                        backdropPath: resolved.backdropPath,
                        overview: resolved.overview,
                        releaseDate: resolved.releaseDate,
                        moodVector: resolved.moodVector,
                        moodSimilarity: Math.round(this.calculateCosineSimilarity(userMood, resolved.moodVector) * 100),
                        moodMatchType: 'match'
                    };
                    return { success: true, data: recommendation, remaining: user.recommendationQuota.remaining };
                }
            }

            return { success: false, error: 'NO_VALID_MOVIES', remaining: user.recommendationQuota.remaining };

        } catch (error) {
            console.error('[Replace] Error:', error);
            throw error;
        }
    }

    /**
     * Get user's current replacement quota
     */
    static async getQuota(userId: string): Promise<{ remaining: number; total: number }> {
        const user = await User.findById(userId);
        if (!user) {
            return { remaining: 0, total: 3 };
        }

        // Check and reset quota if new month
        const now = new Date();
        const lastReset = user.recommendationQuota?.lastResetDate || new Date(0);
        if (now.getMonth() !== lastReset.getMonth() || now.getFullYear() !== lastReset.getFullYear()) {
            user.recommendationQuota = { remaining: 3, lastResetDate: now };
            await user.save();
        }

        return { remaining: user.recommendationQuota?.remaining ?? 3, total: 3 };
    }


}
