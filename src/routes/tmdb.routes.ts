import { Router } from 'express';
import { TMDBController } from '../controllers/tmdb.controller';

const router = Router();

// Search endpoints
router.get('/movies/search', TMDBController.searchMovies);
router.get('/tv/search', TMDBController.searchTvShows);
router.get('/people/search', TMDBController.searchPeople);

// Popular endpoints
router.get('/movies/popular', TMDBController.getPopularMovies);
router.get('/tv/popular', TMDBController.getPopularTvShows);

// Detail endpoints
router.get('/movies/:tmdbId', TMDBController.getMovieDetails);
router.get('/tv/:tmdbId', TMDBController.getShowDetails);
router.get('/tv/:tvId/season/:seasonNumber', TMDBController.getSeasonDetails);

export default router;

