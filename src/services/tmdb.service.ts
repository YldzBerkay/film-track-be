import axios, { AxiosInstance } from 'axios';
import { getTMDBLanguage } from '../config/i18n';

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
      profile_path: string | null;
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

    try {
      // Try movie search first
      const movieParams: any = {
        query: sanitizedQuery,
        page: 1,
        ...this.getLanguageParams(lang)
      };
      if (year) {
        movieParams.primary_release_year = year;
      }

      const movieResponse = await this.client.get('/search/movie', { params: movieParams });
      const movieResults: TMDBSearchResponse<TMDBMovie> = movieResponse.data;

      if (movieResults.results && movieResults.results.length > 0) {
        const movie = movieResults.results[0];
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

      const tvResponse = await this.client.get('/search/tv', { params: tvParams });
      const tvResults: TMDBSearchResponse<TMDBTvShow> = tvResponse.data;

      if (tvResults.results && tvResults.results.length > 0) {
        const show = tvResults.results[0];
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

  static async searchTvShows(query: string, page: number = 1, lang?: string): Promise<TMDBSearchResponse<TMDBTvShow>> {
    try {
      const response = await this.client.get('/search/tv', {
        params: {
          query,
          page,
          ...this.getLanguageParams(lang)
        }
      });
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
          append_to_response: 'credits,videos,similar',
          ...langParams
        }
      });
      return response.data;
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
      return response.data;
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
}

