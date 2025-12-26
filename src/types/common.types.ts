/**
 * Shared common types
 */

export interface ApiResponse<T = unknown> {
    success: boolean;
    message: string;
    data?: T;
    code?: number;
}

export interface ErrorResponse {
    success: false;
    message: string;
    code: number;
    errors?: Array<{
        field: string;
        message: string;
    }>;
}
