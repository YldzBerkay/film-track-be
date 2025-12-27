import { Movie } from '../models/movie.model';
import { TMDBService } from './tmdb.service';

export class MovieService {
    /**
     * Hydrate a list of items (movies/shows) with localized data.
     * Efficiently checks the Movie collection for cached translations before fetching from TMDB.
     */
    static async hydrateItems(items: any[], lang: string, forceRefresh: boolean = false): Promise<any[]> {
        if (!lang || items.length === 0) return items;

        // 1. Extract IDs
        const tmdbIds = items.map(i => i.tmdbId).filter(id => !!id);

        if (tmdbIds.length === 0) return items;

        // 2. Fetch corresponding Movie documents to check cache
        const movieDocs = await Movie.find({ tmdbId: { $in: tmdbIds } }).lean();
        const movieMap = new Map(movieDocs.map(m => [m.tmdbId, m]));

        // 3. Merge translations into items
        const enrichedItems = items.map(item => {
            const movieDoc = movieMap.get(item.tmdbId);
            return {
                ...item,
                // If the item doesn't have translations, borrow them from the Movie doc
                translations: (item.translations && item.translations.length > 0)
                    ? item.translations
                    : (movieDoc?.translations || [])
            };
        });

        // 4. Run hydration logic
        return this.hydrateMoviesWithLanguage(enrichedItems, lang, forceRefresh);
    }

    /**
     * Core hydration logic using Explicit DTO Construction pattern.
     */
    static async hydrateMoviesWithLanguage(movies: any[], lang: string, forceRefresh: boolean = false): Promise<any[]> {
        if (!lang) return movies;

        console.log(`[Localization] Hydrating ${movies.length} movies for language: ${lang} (ForceRefresh: ${forceRefresh})`);

        const hydrationPromises = movies.map(async (movieDoc) => {
            // Ensure we're working with a raw object or similar, but we'll build a fresh DTO anyway.
            const movie = movieDoc.toObject ? movieDoc.toObject() : movieDoc;

            let translationData = movie.translations?.find((t: any) => t.iso_639_1 === lang);

            // 3. Fallback Mechanism (Fetch & Save)
            if (!translationData || forceRefresh) {
                if (!translationData) {
                    console.log(`[Localization] Translation MISSING for ${movie.title} (${lang}). Fetching from TMDB...`);
                } else {
                    console.log(`[Localization] Force Refresh active for ${movie.title} (${lang}). Re-fetching...`);
                }

                try {
                    // Fetch from TMDB Service
                    // Adapt for TV shows if mediaType is 'tv'
                    // The hydration logic was originally designed for MOVIES.
                    // However, TMDBService.getMovieDetails gets MOVIE details.
                    // If we have TV shows, we might need getShowDetails.
                    // BUT: The 'Movie' model is used for caching both? 
                    // Let's check RecommendationService usage. It seemed to focus on movies.
                    // WatchedList can contain TV shows.

                    let newTranslation: any = null;

                    if (movie.mediaType === 'tv') {
                        const tmdbData = await TMDBService.getShowDetails(movie.tmdbId.toString(), lang);
                        if (tmdbData) {
                            newTranslation = {
                                iso_639_1: lang,
                                title: tmdbData.name, // TV shows use 'name'
                                overview: tmdbData.overview,
                                posterPath: tmdbData.poster_path,
                                genres: tmdbData.genres?.map((g: any) => g.name) || []
                            };
                        }
                    } else {
                        // Default to movie (safe fallback or explicit check)
                        const tmdbData = await TMDBService.getMovieDetails(movie.tmdbId.toString(), lang);
                        if (tmdbData) {
                            newTranslation = {
                                iso_639_1: lang,
                                title: tmdbData.title,
                                overview: tmdbData.overview,
                                posterPath: tmdbData.poster_path,
                                genres: tmdbData.genres?.map((g: any) => g.name) || []
                            };
                        }
                    }

                    if (newTranslation) {
                        // CRITICAL: Push to DB immediately so next time it's fast
                        // Pull old if exists (for forceRefresh)
                        await Movie.updateOne(
                            { tmdbId: movie.tmdbId },
                            { $pull: { translations: { iso_639_1: lang } } }
                        ).catch(err => console.error(`[Localization] Failed to pull old translation for ${movie.title}:`, err));

                        await Movie.updateOne(
                            { tmdbId: movie.tmdbId },
                            { $push: { translations: newTranslation } }
                        ).catch(err => console.error(`[Localization] Failed to save translation for ${movie.title}:`, err));

                        translationData = newTranslation;
                    }
                } catch (err) {
                    console.error(`[Localization] TMDB Fetch failed for ${movie.title}, falling back to default:`, err);
                    // Fallback to existing root data if fetch fails
                    translationData = {
                        title: movie.title,
                        overview: movie.overview,
                        posterPath: movie.posterPath,
                        genres: movie.genres,
                        iso_639_1: 'default'
                    };
                }
            }

            // Safety check
            if (!translationData) {
                translationData = {
                    title: movie.title,
                    overview: movie.overview,
                    posterPath: movie.posterPath,
                    genres: movie.genres,
                    iso_639_1: 'default'
                };
            }

            // 4. Return CLEAN Object (DTO)
            // Preserve all original fields from the item, then overwrite with localized ones
            return {
                ...movie,
                title: translationData.title || movie.title,
                overview: translationData.overview || movie.overview,
                posterPath: translationData.posterPath || movie.posterPath,
                genres: translationData.genres && translationData.genres.length > 0
                    ? translationData.genres
                    : movie.genres
            };
        });

        return Promise.all(hydrationPromises);
    }
}
