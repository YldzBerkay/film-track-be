import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller';
import { registerValidation, loginValidation, changePasswordValidation } from '../validators/auth.validators';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();

router.post('/register', registerValidation, AuthController.register);
router.post('/login', loginValidation, AuthController.login);
router.post('/refresh', AuthController.refreshToken);
router.post('/logout', AuthController.logout);
router.post('/change-password', authMiddleware, changePasswordValidation, AuthController.changePassword);

export default router;

