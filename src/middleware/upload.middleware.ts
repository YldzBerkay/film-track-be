import multer from 'multer';
import { Request } from 'express';

// Use memory storage to process image with sharp before saving
const storage = multer.memoryStorage();

const fileFilter = (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    // Only accept images
    if (file.mimetype.startsWith('image/')) {
        cb(null, true);
    } else {
        cb(new Error('Only images are allowed!') as any, false);
    }
};

export const upload = multer({
    storage: storage,
    limits: {
        fileSize: 1 * 1024 * 1024 // 1MB limit
    },
    fileFilter: fileFilter
});
