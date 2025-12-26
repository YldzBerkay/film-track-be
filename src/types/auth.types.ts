/**
 * Shared authentication types
 */

export interface RegisterData {
    username: string;
    nickname: string;
    email: string;
    password: string;
}

export interface LoginData {
    email: string;
    password: string;
}

export interface AuthResponse {
    user: {
        id: string;
        username: string;
        email: string;
    };
    accessToken: string;
    refreshToken: string;
}

export interface JwtPayload {
    userId: string;
}
