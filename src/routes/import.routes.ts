import { Router } from 'express';
import multer from 'multer';
import { ImportController } from '../controllers/import.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();

// Configure multer for CSV file upload (memory storage)
const csvUpload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit for CSV
    },
    fileFilter: (req, file, cb) => {
        // Accept CSV files
        if (file.mimetype === 'text/csv' ||
            file.mimetype === 'application/vnd.ms-excel' ||
            file.originalname.endsWith('.csv')) {
            cb(null, true);
        } else {
            cb(new Error('Only CSV files are allowed') as any, false);
        }
    }
});

// POST /api/import/watch-history - Import watch history from CSV
router.post(
    '/watch-history',
    authMiddleware,
    csvUpload.single('file'),
    ImportController.importWatchHistory
);

export default router;
