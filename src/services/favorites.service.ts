import { User } from '../models/user.model';
import { AIService } from './ai.service';
import { Movie } from '../models/movie.model';

interface SaveFavoritesData {
  userId: string;
  favoriteMovies: Array<{
    tmdbId: number;
    title: string;
    posterPath: string;
    releaseDate: string;
  }>;
  favoriteTvShows: Array<{
    tmdbId: number;
    name: string;
    posterPath: string;
    firstAirDate: string;
  }>;
}

export class FavoritesService {
  static async saveFavorites(data: SaveFavoritesData): Promise<void> {
    const user = await User.findById(data.userId);

    if (!user) {
      throw new Error('User not found');
    }

    // Validate: Must have exactly 5 movies and 5 TV shows
    if (data.favoriteMovies.length !== 5) {
      throw new Error('Must select exactly 5 movies');
    }

    if (data.favoriteTvShows.length !== 5) {
      throw new Error('Must select exactly 5 TV shows');
    }

    // Check for duplicates
    const movieIds = data.favoriteMovies.map((m) => m.tmdbId);
    const tvShowIds = data.favoriteTvShows.map((t) => t.tmdbId);

    if (new Set(movieIds).size !== movieIds.length) {
      throw new Error('Duplicate movies are not allowed');
    }

    if (new Set(tvShowIds).size !== tvShowIds.length) {
      throw new Error('Duplicate TV shows are not allowed');
    }

    // Update user
    user.favoriteMovies = data.favoriteMovies;
    user.favoriteTvShows = data.favoriteTvShows;
    user.onboardingCompleted = true;

    await user.save();
  }

  static async getUserFavorites(userId: string) {
    const user = await User.findById(userId).select('favoriteMovies favoriteTvShows onboardingCompleted');

    if (!user) {
      throw new Error('User not found');
    }

    return {
      favoriteMovies: user.favoriteMovies,
      favoriteTvShows: user.favoriteTvShows,
      onboardingCompleted: user.onboardingCompleted
    };
  }
}

