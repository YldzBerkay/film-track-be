import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller';
import { registerValidation, loginValidation } from '../validators/auth.validators';

const router = Router();

router.post('/register', registerValidation, AuthController.register);
router.post('/login', loginValidation, AuthController.login);
router.post('/refresh', AuthController.refreshToken);
router.post('/logout', AuthController.logout);

export default router;

