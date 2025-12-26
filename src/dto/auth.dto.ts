import { RegisterData, LoginData, AuthResponse } from '../types';

/**
 * Request DTOs
 */
export type RegisterRequestDto = RegisterData;

export type LoginRequestDto = LoginData;

export interface RefreshTokenRequestDto {
    refreshToken: string;
}

export interface LogoutRequestDto {
    refreshToken?: string;
}

/**
 * Response DTOs
 */
export type AuthResponseDto = AuthResponse;

export interface MessageResponseDto {
    success: boolean;
    message: string;
}
