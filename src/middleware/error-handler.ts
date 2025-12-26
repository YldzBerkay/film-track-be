import { Request, Response, NextFunction } from 'express';
import { ValidationError as ExpressValidationError } from 'express-validator';

export interface ApiError extends Error {
  statusCode?: number;
  code?: number;
  errors?: ExpressValidationError[];
}

export const errorHandler = (
  err: ApiError,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

  // Validation errors
  if (err.errors && Array.isArray(err.errors)) {
    res.status(400).json({
      success: false,
      message: 'Validation failed',
      code: 400,
      errors: err.errors.map((error) => ({
        field: (error as any).type === 'field' ? (error as any).path : 'unknown',
        message: (error as any).msg
      }))
    });
    return;
  }

  // Mongoose duplicate key error
  if (err.name === 'MongoServerError' && (err as any).code === 11000) {
    const field = Object.keys((err as any).keyPattern)[0];
    res.status(400).json({
      success: false,
      message: `${field.charAt(0).toUpperCase() + field.slice(1)} already exists`,
      code: 400
    });
    return;
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    res.status(400).json({
      success: false,
      message: 'Validation failed',
      code: 400,
      errors: Object.values((err as any).errors).map((error: any) => ({
        field: error.path,
        message: error.message
      }))
    });
    return;
  }

  // Default error
  res.status(statusCode).json({
    success: false,
    message,
    code: statusCode
  });
};

