/**
 * Activity types
 */

export type ActivityType = 'movie_watched' | 'tv_episode_watched' | 'tv_show_watched' | 'review' | 'rating';
export type MediaType = 'movie' | 'tv_show' | 'tv_episode';
export type FeedType = 'following' | 'friends' | 'global';

export interface CreateActivityData {
    userId: string;
    type: ActivityType;
    mediaType: MediaType;
    tmdbId: number;
    mediaTitle: string;
    mediaPosterPath?: string | null;
    seasonNumber?: number;
    episodeNumber?: number;
    episodeTitle?: string;
    rating?: number;
    reviewText?: string;
    isSpoiler?: boolean;
    genres?: string[];
}

export interface FeedQuery {
    userId: string;
    feedType?: FeedType;
    page?: number;
    limit?: number;
}

export interface PaginationResult {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
}
