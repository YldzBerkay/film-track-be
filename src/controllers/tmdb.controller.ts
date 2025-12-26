import { Request, Response, NextFunction } from 'express';
import { TMDBService } from '../services/tmdb.service';

export class TMDBController {
  static async searchMovies(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { query, page = 1, lang } = req.query;

      if (!query || typeof query !== 'string') {
        res.status(400).json({
          success: false,
          message: 'Query parameter is required',
          code: 400
        });
        return;
      }

      const results = await TMDBService.searchMovies(query, Number(page), lang as string | undefined);

      res.status(200).json({
        success: true,
        data: results
      });
    } catch (error) {
      next(error);
    }
  }

  static async searchTvShows(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { query, page = 1, lang } = req.query;

      if (!query || typeof query !== 'string') {
        res.status(400).json({
          success: false,
          message: 'Query parameter is required',
          code: 400
        });
        return;
      }

      const results = await TMDBService.searchTvShows(query, Number(page), lang as string | undefined);

      res.status(200).json({
        success: true,
        data: results
      });
    } catch (error) {
      next(error);
    }
  }

  static async searchPeople(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { query, page = 1, lang } = req.query;

      if (!query || typeof query !== 'string') {
        res.status(400).json({
          success: false,
          message: 'Query parameter is required',
          code: 400
        });
        return;
      }

      const results = await TMDBService.searchPeople(query, Number(page), lang as string | undefined);

      res.status(200).json({
        success: true,
        data: results
      });
    } catch (error) {
      next(error);
    }
  }

  static async getPopularMovies(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { page = 1, lang } = req.query;
      const results = await TMDBService.getPopularMovies(Number(page), lang as string | undefined);

      res.status(200).json({
        success: true,
        data: results
      });
    } catch (error) {
      next(error);
    }
  }

  static async getPopularTvShows(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { page = 1, lang } = req.query;
      const results = await TMDBService.getPopularTvShows(Number(page), lang as string | undefined);

      res.status(200).json({
        success: true,
        data: results
      });
    } catch (error) {
      next(error);
    }
  }

  static async getMovieDetails(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { tmdbId } = req.params;
      const { lang } = req.query;

      if (!tmdbId) {
        res.status(400).json({
          success: false,
          message: 'TMDB ID is required',
          code: 400
        });
        return;
      }

      const details = await TMDBService.getMovieDetails(tmdbId, lang as string | undefined);

      res.status(200).json({
        success: true,
        data: details
      });
    } catch (error) {
      next(error);
    }
  }

  static async getShowDetails(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { tmdbId } = req.params;
      const { lang } = req.query;

      if (!tmdbId) {
        res.status(400).json({
          success: false,
          message: 'TMDB ID is required',
          code: 400
        });
        return;
      }

      const details = await TMDBService.getShowDetails(tmdbId, lang as string | undefined);

      res.status(200).json({
        success: true,
        data: details
      });
    } catch (error) {
      next(error);
    }
  }

  static async getSeasonDetails(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { tvId, seasonNumber } = req.params;
      const { lang } = req.query;

      if (!tvId || !seasonNumber) {
        res.status(400).json({
          success: false,
          message: 'TV ID and Season Number are required',
          code: 400
        });
        return;
      }

      const details = await TMDBService.getSeasonDetails(tvId, Number(seasonNumber), lang as string | undefined);

      res.status(200).json({
        success: true,
        data: details
      });
    } catch (error) {
      next(error);
    }
  }
}

