import axios, { AxiosInstance } from 'axios';
import { getTMDBLanguage } from '../config/i18n';
import { TMDB_GENRE_MAP } from '../utils/tmdb-genre-map';

export interface TMDBMovie {
  id: number;
  title: string;
  release_date: string;
  poster_path: string | null;
  overview: string;
  backdrop_path: string | null;
  runtime?: number;
}

export interface TMDBTvShow {
  id: number;
  name: string;
  first_air_date: string;
  poster_path: string | null;
  overview: string;
  backdrop_path: string | null;
}

export interface TMDBPerson {
  id: number;
  name: string;
  original_name: string;
  media_type: 'person';
  adult: boolean;
  popularity: number;
  gender: number;
  known_for_department: string;
  profile_path: string | null;
  known_for: Array<TMDBMovie | TMDBTvShow>;
}

export interface TMDBSearchResponse<T> {
  results: T[];
  total_results: number;
  total_pages: number;
  page: number;
}

export interface TMDBMovieDetails extends TMDBMovie {
  genres: Array<{ id: number; name: string }>;
  credits?: {
    cast: Array<{
      id: number;
      name: string;
      character: string;
      profile_path: string | null;
    }>;
    crew: Array<{
      id: number;
      name: string;
      job: string;
      department: string;
      profile_path: string | null;
    }>;
  };
  keywords?: {
    keywords: Array<{
      id: number;
      name: string;
    }>;
  };
  videos?: {
    results: Array<{
      key: string;
      name: string;
      site: string;
      type: string;
    }>;
  };
  similar?: {
    results: TMDBMovie[];
  };
}

/**
 * Enriched movie data for AI mood analysis
 */
export interface MovieForAI {
  tmdbId: number;
  title: string;
  overview: string;
  director?: string;
  cast: string[];
  keywords: string[];
  genres: string[];
  releaseDate: string;
  posterPath: string;
}

export interface TMDBTvShowDetails extends TMDBTvShow {
  genres: Array<{ id: number; name: string }>;
  number_of_seasons: number;
  number_of_episodes: number;
  episode_run_time: number[];
  seasons: Array<{
    id: number;
    season_number: number;
    name: string;
    episode_count: number;
    poster_path: string | null;
    air_date: string;
  }>;
}

export interface TMDBSeasonDetails {
  id: number;
  name: string;
  season_number: number;
  air_date: string;
  episodes: Array<{
    id: number;
    episode_number: number;
    name: string;
    overview: string;
    still_path: string | null;
    air_date: string;
    vote_average: number;
  }>;
}

export class TMDBService {
  private static readonly BASE_URL = 'https://api.themoviedb.org/3';
  private static readonly API_KEY = process.env.TMDB_API_KEY || '';
  private static readonly IMAGE_BASE_URL = 'https://image.tmdb.org/t/p';

  private static client: AxiosInstance = axios.create({
    baseURL: this.BASE_URL,
    params: {
      api_key: this.API_KEY,
      include_adult: false
    }
  });

  private static getLanguageParams(lang?: string): { language: string } {
    return { language: getTMDBLanguage(lang) };
  }

  static async searchMovies(query: string, page: number = 1, lang?: string, year?: number): Promise<TMDBSearchResponse<TMDBMovie>> {
    try {
      const params: any = {
        query,
        page,
        ...this.getLanguageParams(lang)
      };

      if (year) {
        params.primary_release_year = year;
      }

      const response = await this.client.get('/search/movie', { params });
      // Sort by popularity as TMDB search sorts by relevance
      if (response.data && response.data.results) {
        response.data.results.sort((a: any, b: any) => (b.popularity || 0) - (a.popularity || 0));
      }
      return response.data;
    } catch (error) {
      console.error('TMDb Search Error:', error);
      throw new Error('Failed to search movies');
    }
  }

  /**
   * Sanitize search query to handle special characters
   * Converts en-dashes, em-dashes to regular hyphens, normalizes Unicode
   */
  private static sanitizeQuery(query: string): string {
    return query
      // Normalize Unicode to decomposed form then recompose
      .normalize('NFKC')
      // Dashes
      .replace(/[–—−‐‑‒―]/g, '-')  // Various dash characters to hyphen
      // Colons
      .replace(/[：﹕]/g, ':')  // Full-width and small colons to regular
      // Quotes
      .replace(/[''‚‛]/g, "'")  // Smart single quotes
      .replace(/[""„‟]/g, '"')  // Smart double quotes
      // Spaces
      .replace(/[\u00A0\u2000-\u200B\u202F\u205F\u3000]/g, ' ')  // Various space characters
      // Remove invisible characters
      .replace(/[\u200C\u200D\uFEFF]/g, '')
      .trim();
  }

  /**
   * Search for content (movie first, then TV fallback)
   * Returns the result with mediaType indicator
   */
  static async searchContent(
    query: string,
    year?: number,
    lang?: string
  ): Promise<{
    result: TMDBMovie | TMDBTvShow | null;
    mediaType: 'movie' | 'tv';
    details: TMDBMovieDetails | TMDBTvShowDetails | null;
  }> {
    const sanitizedQuery = this.sanitizeQuery(query);
    console.log(`[TMDB searchContent] Query: "${query}" → Sanitized: "${sanitizedQuery}", Year: ${year}`);

    try {
      // Try movie search first (with year if provided)
      const movieParams: any = {
        query: sanitizedQuery,
        page: 1,
        ...this.getLanguageParams(lang)
      };
      if (year) {
        movieParams.primary_release_year = year;
      }

      let movieResponse = await this.client.get('/search/movie', { params: movieParams });
      let movieResults: TMDBSearchResponse<TMDBMovie> = movieResponse.data;

      // If no results with year, retry WITHOUT year
      if ((!movieResults.results || movieResults.results.length === 0) && year) {
        console.log(`[TMDB searchContent] No results with year ${year}, retrying without year...`);
        delete movieParams.primary_release_year;
        movieResponse = await this.client.get('/search/movie', { params: movieParams });
        movieResults = movieResponse.data;
      }

      if (movieResults.results && movieResults.results.length > 0) {
        const movie = movieResults.results[0];
        console.log(`[TMDB searchContent] Found movie: "${movie.title}" (ID: ${movie.id})`);
        const details = await this.getMovieDetails(movie.id.toString(), lang);
        return { result: movie, mediaType: 'movie', details };
      }

      // Fallback to TV search
      const tvParams: any = {
        query: sanitizedQuery,
        page: 1,
        ...this.getLanguageParams(lang)
      };
      if (year) {
        tvParams.first_air_date_year = year;
      }

      let tvResponse = await this.client.get('/search/tv', { params: tvParams });
      let tvResults: TMDBSearchResponse<TMDBTvShow> = tvResponse.data;

      // If no results with year, retry WITHOUT year
      if ((!tvResults.results || tvResults.results.length === 0) && year) {
        console.log(`[TMDB searchContent] No TV results with year ${year}, retrying without year...`);
        delete tvParams.first_air_date_year;
        tvResponse = await this.client.get('/search/tv', { params: tvParams });
        tvResults = tvResponse.data;
      }

      if (tvResults.results && tvResults.results.length > 0) {
        const show = tvResults.results[0];
        console.log(`[TMDB searchContent] Found TV: "${show.name}" (ID: ${show.id})`);
        const details = await this.getShowDetails(show.id.toString(), lang);
        return { result: show, mediaType: 'tv', details };
      }

      // Nothing found
      return { result: null, mediaType: 'movie', details: null };
    } catch (error) {
      console.error('TMDb Search Content Error:', error);
      return { result: null, mediaType: 'movie', details: null };
    }
  }

  /**
   * Find content by external ID (IMDB ID)
   * Uses TMDB's /find endpoint for accurate lookup
   */
  static async findByExternalId(
    imdbId: string,
    lang?: string
  ): Promise<{
    result: TMDBMovie | TMDBTvShow | null;
    mediaType: 'movie' | 'tv';
    details: TMDBMovieDetails | TMDBTvShowDetails | null;
    episodeInfo?: { seasonNumber: number; episodeNumber: number };
  }> {
    console.log(`[TMDB findByExternalId] Looking up IMDB ID: ${imdbId}`);

    try {
      const response = await this.client.get(`/find/${imdbId}`, {
        params: {
          external_source: 'imdb_id',
          ...this.getLanguageParams(lang)
        }
      });

      const data = response.data;

      // Check for movie results first
      if (data.movie_results && data.movie_results.length > 0) {
        const movie = data.movie_results[0] as TMDBMovie;
        console.log(`[TMDB findByExternalId] Found movie: "${movie.title}" (TMDB ID: ${movie.id})`);
        const details = await this.getMovieDetails(movie.id.toString(), lang);
        return { result: movie, mediaType: 'movie', details };
      }

      // Check for TV Episode results (resolve to parent show)
      // PRIORITY: Check episodes first to capture episode-specific info (season/episode numbers)
      if (data.tv_episode_results && data.tv_episode_results.length > 0) {
        const episode = data.tv_episode_results[0];
        if (episode.show_id) {
          console.log(`[TMDB findByExternalId] Found TV Episode: "${episode.name}" (ID: ${episode.id}), resolving parent show ID: ${episode.show_id}`);
          const details = await this.getShowDetails(episode.show_id.toString(), lang);
          return {
            result: details,
            mediaType: 'tv',
            details,
            episodeInfo: {
              seasonNumber: episode.season_number,
              episodeNumber: episode.episode_number
            }
          };
        }
      }

      // Check for TV results
      if (data.tv_results && data.tv_results.length > 0) {
        const show = data.tv_results[0] as TMDBTvShow;
        console.log(`[TMDB findByExternalId] Found TV: "${show.name}" (TMDB ID: ${show.id})`);
        const details = await this.getShowDetails(show.id.toString(), lang);
        return { result: show, mediaType: 'tv', details };
      }

      // Nothing found
      console.log(`[TMDB findByExternalId] No results for IMDB ID: ${imdbId}`);
      return { result: null, mediaType: 'movie', details: null };
    } catch (error) {
      console.error(`[TMDB findByExternalId] Error looking up ${imdbId}:`, error);
      return { result: null, mediaType: 'movie', details: null };
    }
  }

  static async searchTvShows(query: string, page: number = 1, lang?: string): Promise<TMDBSearchResponse<TMDBTvShow>> {
    try {
      const response = await this.client.get('/search/tv', {
        params: {
          query,
          page,
          ...this.getLanguageParams(lang)
        }
      });
      // Sort by popularity as TMDB search sorts by relevance
      if (response.data && response.data.results) {
        response.data.results.sort((a: any, b: any) => (b.popularity || 0) - (a.popularity || 0));
      }
      return response.data;
    } catch (error) {
      console.error('TMDb TV Search Error:', error);
      throw new Error('Failed to search TV shows');
    }
  }

  static async getPopularMovies(page: number = 1, lang?: string): Promise<TMDBSearchResponse<TMDBMovie>> {
    try {
      const response = await this.client.get('/movie/popular', {
        params: { page, ...this.getLanguageParams(lang) }
      });
      return response.data;
    } catch (error) {
      console.error('TMDb Popular Movies Error:', error);
      throw new Error('Failed to get popular movies');
    }
  }

  static async searchPeople(query: string, page: number = 1, lang?: string): Promise<TMDBSearchResponse<TMDBPerson>> {
    try {
      const response = await this.client.get('/search/person', {
        params: {
          query,
          page,
          ...this.getLanguageParams(lang)
        }
      });
      // Sort by popularity as TMDB search sorts by relevance
      if (response.data && response.data.results) {
        response.data.results.sort((a: any, b: any) => (b.popularity || 0) - (a.popularity || 0));
      }
      return response.data;
    } catch (error) {
      console.error('TMDb Person Search Error:', error);
      throw new Error('Failed to search people');
    }
  }

  static async getMovie(id: number, lang?: string): Promise<TMDBMovie> {
    try {
      const response = await this.client.get(`/movie/${id}`, {
        params: this.getLanguageParams(lang)
      });
      return response.data;
    } catch (error) {
      console.error('TMDb Get Movie Error:', error);
      throw new Error('Failed to get movie');
    }
  }



  static async getPopularTvShows(page: number = 1, lang?: string): Promise<TMDBSearchResponse<TMDBTvShow>> {
    try {
      const response = await this.client.get('/tv/popular', {
        params: {
          page,
          ...this.getLanguageParams(lang)
        }
      });
      return response.data;
    } catch (error) {
      console.error('TMDb Popular TV Shows Error:', error);
      throw new Error('Failed to get popular TV shows');
    }
  }

  static async getMovieDetails(tmdbId: string, lang?: string): Promise<TMDBMovieDetails> {
    const langParams = this.getLanguageParams(lang);
    console.log(`[TMDB] Fetching details for ID ${tmdbId} in language: ${langParams.language}`);
    try {
      const response = await this.client.get(`/movie/${tmdbId}`, {
        params: {
          append_to_response: 'credits,videos,similar,keywords',
          ...langParams
        }
      });
      const data = response.data;

      // Override genres with English standardization
      if (data.genres) {
        data.genres = data.genres.map((g: any) => ({
          ...g,
          name: TMDB_GENRE_MAP[g.id] || g.name // Fallback to original if not in map
        }));
      }

      return data;
    } catch (error) {
      console.error('TMDb Movie Details Error:', error);
      throw new Error('Failed to get movie details');
    }
  }

  static async getShowDetails(tmdbId: string, lang?: string): Promise<TMDBTvShowDetails> {
    try {
      const response = await this.client.get(`/tv/${tmdbId}`, {
        params: {
          append_to_response: 'credits',
          ...this.getLanguageParams(lang)
        }
      });
      const data = response.data;

      // Override genres with English standardization
      if (data.genres) {
        data.genres = data.genres.map((g: any) => ({
          ...g,
          name: TMDB_GENRE_MAP[g.id] || g.name
        }));
      }

      return data;
    } catch (error) {
      console.error('TMDb TV Show Details Error:', error);
      throw new Error('Failed to get TV show details');
    }
  }

  static async getSeasonDetails(tvId: string, seasonNumber: number, lang?: string): Promise<TMDBSeasonDetails> {
    try {
      const response = await this.client.get(`/tv/${tvId}/season/${seasonNumber}`, {
        params: this.getLanguageParams(lang)
      });
      return response.data;
    } catch (error) {
      console.error('TMDb Season Details Error:', error);
      throw new Error('Failed to get season details');
    }
  }

  static getPosterUrl(posterPath: string | null, size: string = 'w500'): string {
    if (!posterPath) {
      return 'https://via.placeholder.com/500x750?text=No+Image';
    }
    return `${this.IMAGE_BASE_URL}/${size}${posterPath}`;
  }

  static getBackdropUrl(backdropPath: string | null, size: string = 'original'): string {
    if (!backdropPath) {
      return 'https://via.placeholder.com/1920x1080?text=No+Image';
    }
    return `${this.IMAGE_BASE_URL}/${size}${backdropPath}`;
  }

  /**
   * Get enriched movie data for AI mood analysis
   * Extracts director, top cast, and keywords from TMDB
   */
  static async getMovieForAI(tmdbId: number, lang?: string): Promise<MovieForAI> {
    try {
      const details = await this.getMovieDetails(tmdbId.toString(), lang || 'en');

      // Extract director from crew (job = 'Director')
      const director = details.credits?.crew?.find(
        (member) => member.job === 'Director'
      )?.name;

      // Extract top 5 cast members by order (first 5 are leads)
      const cast = details.credits?.cast
        ?.slice(0, 5)
        .map((actor) => actor.name) || [];

      // Extract top 10 keywords
      const keywords = details.keywords?.keywords
        ?.slice(0, 10)
        .map((kw) => kw.name) || [];

      // Extract genre names (Standardized)
      const genres = details.genres?.map((g) => TMDB_GENRE_MAP[g.id] || g.name) || [];

      return {
        tmdbId: details.id,
        title: details.title,
        overview: details.overview || '',
        director,
        cast,
        keywords,
        genres,
        releaseDate: details.release_date || '',
        posterPath: details.poster_path || ''
      };
    } catch (error) {
      console.error(`[TMDB] Failed to get movie for AI: ${tmdbId}`, error);
      throw new Error('Failed to get enriched movie data');
    }
  }
}

