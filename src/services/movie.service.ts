import { Movie } from '../models/movie.model';
import { TMDBService } from './tmdb.service';

export class MovieService {

    /**
     * Hydrate a list of items with localized data.
     * Checks cache first to avoid unnecessary TMDB calls.
     */
    static async hydrateItems(items: any[], lang: string, forceRefresh: boolean = false): Promise<any[]> {
        if (!lang || items.length === 0) return items;

        const tmdbIds = items
            .map(i => i.tmdbId)
            .filter(id => !!id)
            .map(id => Number(id));

        if (tmdbIds.length === 0) return items;

        const movieDocs = await Movie.find({ tmdbId: { $in: tmdbIds } }).lean();
        const movieMap = new Map(movieDocs.map(m => [m.tmdbId, m]));

        const enrichedItems = items.map(item => {
            const movieDoc = movieMap.get(Number(item.tmdbId));
            // Resolve mediaType from item OR database cache
            const resolvedMediaType = item.mediaType || movieDoc?.mediaType || 'movie';

            return {
                ...item,
                mediaType: resolvedMediaType,
                releaseDate: item.releaseDate || movieDoc?.releaseDate,
                originalLanguage: item.originalLanguage || movieDoc?.originalLanguage,
                originCountry: item.originCountry || movieDoc?.originCountry,
                translations: (item.translations && item.translations.length > 0)
                    ? item.translations
                    : (movieDoc?.translations || [])
            };
        });

        return this.hydrateMoviesWithLanguage(enrichedItems, lang, forceRefresh);
    }

    /**
     * Core hydration logic.
     * FEATURE: Uses "Fire-and-Forget" for DB updates to speed up UI response.
     */
    static async hydrateMoviesWithLanguage(movies: any[], lang: string, forceRefresh: boolean = false): Promise<any[]> {
        if (!lang) return movies;

        const hydrationPromises = movies.map(async (movie) => {
            let translationData = movie.translations?.find((t: any) => t.iso_639_1 === lang);

            // Check if we need to heal missing metadata (new fields)
            const missingMetadata = !movie.originalLanguage || !movie.originCountry || !movie.releaseDate;
            const needsFetch = !translationData || missingMetadata || forceRefresh;

            let releaseDate = movie.releaseDate;

            if (needsFetch) {
                try {
                    // 1. FETCH FROM TMDB (Critical Path - Must Await)
                    let tmdbData: any = null;
                    const tmdbIdStr = movie.tmdbId.toString();

                    if (movie.mediaType === 'tv') {
                        tmdbData = await TMDBService.getShowDetails(tmdbIdStr, lang);
                    } else {
                        tmdbData = await TMDBService.getMovieDetails(tmdbIdStr, lang);
                    }

                    if (tmdbData) {
                        const newTranslation = {
                            iso_639_1: lang,
                            title: movie.mediaType === 'tv' ? tmdbData.name : tmdbData.title,
                            overview: tmdbData.overview,
                            posterPath: tmdbData.poster_path,
                            genres: tmdbData.genres?.map((g: any) => g.name) || []
                        };

                        translationData = newTranslation;

                        // Capture Metadata for Root Document
                        // Also capture release date if missing
                        const date = tmdbData.release_date || tmdbData.first_air_date;
                        if (date) releaseDate = date;

                        const metadataUpdate = {
                            originalLanguage: tmdbData.original_language,
                            originCountry: tmdbData.origin_country || tmdbData.production_countries?.map((c: any) => c.iso_3166_1) || [],
                            releaseDate: releaseDate
                        };

                        // 2. SAVE TO DB (Background Path - DO NOT AWAIT)
                        this.saveTranslationInBackground(movie.tmdbId, movie.mediaType, lang, newTranslation, forceRefresh, metadataUpdate);
                    }
                } catch (err) {
                    // Silent fail, fallback to original
                }
            }

            if (!translationData) {
                translationData = {
                    title: movie.title || movie.mediaTitle || 'Unknown',
                    overview: movie.overview,
                    posterPath: movie.posterPath,
                    genres: movie.genres || [],
                    iso_639_1: 'default'
                };
            }

            return {
                ...movie,
                title: translationData.title,
                overview: translationData.overview,
                posterPath: translationData.posterPath || movie.posterPath,
                genres: translationData.genres,
                originalLanguage: movie.originalLanguage, // Start passing these
                originCountry: movie.originCountry,
                releaseDate: releaseDate,
                firstAirDate: releaseDate // Map to both for compatibility
            };
        });

        return Promise.all(hydrationPromises);
    }

    private static async saveTranslationInBackground(
        tmdbId: number,
        mediaType: string,
        lang: string,
        newTranslation: any,
        forceRefresh: boolean,
        metadataUpdate?: { originalLanguage: string, originCountry: string[], releaseDate?: string }
    ) {
        try {
            if (forceRefresh) {
                await Movie.updateOne(
                    { tmdbId: Number(tmdbId) },
                    { $pull: { translations: { iso_639_1: lang } } }
                );
            }

            await Movie.updateOne(
                { tmdbId: Number(tmdbId) },
                {
                    $push: { translations: newTranslation },
                    $set: metadataUpdate ? {
                        originalLanguage: metadataUpdate.originalLanguage,
                        originCountry: metadataUpdate.originCountry,
                        releaseDate: metadataUpdate.releaseDate
                    } : {}
                }
            );
        } catch (error) {
            console.error(`[Localization] Background save failed for ${tmdbId}:`, error);
        }
    }
}
