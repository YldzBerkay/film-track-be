import { Router } from 'express';
import { CommentController } from '../controllers/comment.controller';
import { authMiddleware as protect } from '../middleware/auth.middleware';

const router = Router();

// Get top-level comments for an activity
router.get('/', protect, CommentController.getComments);

// Get replies for a comment
router.get('/:id/replies', protect, CommentController.getReplies);

// Create a comment (or reply)
router.post('/', protect, CommentController.createComment);

// Delete a comment
router.delete('/:id', protect, CommentController.deleteComment);

export default router;
