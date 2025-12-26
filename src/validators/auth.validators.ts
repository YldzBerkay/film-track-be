import { body, ValidationChain } from 'express-validator';

export const registerValidation: ValidationChain[] = [
    body('username')
        .trim()
        .isLength({ min: 3, max: 30 })
        .withMessage('Username must be between 3 and 30 characters')
        .matches(/^[a-zA-Z0-9_]+$/)
        .withMessage('Username can only contain letters, numbers, and underscores'),

    body('nickname')
        .trim()
        .isLength({ min: 2, max: 50 })
        .withMessage('Nickname must be between 2 and 50 characters')
        .notEmpty()
        .withMessage('Nickname is required'),

    body('email')
        .trim()
        .isEmail()
        .withMessage('Please provide a valid email')
        .normalizeEmail(),

    body('password')
        .isLength({ min: 6 })
        .withMessage('Password must be at least 6 characters')
        .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
        .withMessage('Password must contain at least one uppercase letter, one lowercase letter, and one number')
];

export const loginValidation: ValidationChain[] = [
    body('email')
        .trim()
        .isEmail()
        .withMessage('Please provide a valid email')
        .normalizeEmail(),

    body('password')
        .notEmpty()
        .withMessage('Password is required')
];

export const refreshTokenValidation: ValidationChain[] = [
    body('refreshToken')
        .notEmpty()
        .withMessage('Refresh token is required')
];
