import mongoose, { Document, Schema } from 'mongoose';

export interface IComment extends Document {
    text: string;
    userId: mongoose.Types.ObjectId;
    activityId: mongoose.Types.ObjectId;
    parentId: mongoose.Types.ObjectId | null; // Immediate parent
    rootId: mongoose.Types.ObjectId | null;   // Top-level parent
    replyToUser?: mongoose.Types.ObjectId;    // User being replied to (for deep replies)
    replyCount: number;                       // Count of direct children (or subtree?) Instagram usually shows total replies. Let's say total replies for root, direct for others? Or just direct? Request said "Cached count of direct children".
    likes: mongoose.Types.ObjectId[];
    dislikes: mongoose.Types.ObjectId[];
    likesCount: number;
    dislikesCount: number;
    isDeleted: boolean;
    deletedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

const commentSchema = new Schema<IComment>(
    {
        text: {
            type: String,
            required: true,
            trim: true,
            maxlength: 2200 // Instagram limit-ish
        },
        userId: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },
        activityId: {
            type: Schema.Types.ObjectId,
            ref: 'Activity',
            required: true
        },
        parentId: {
            type: Schema.Types.ObjectId,
            ref: 'Comment',
            default: null
        },
        rootId: {
            type: Schema.Types.ObjectId,
            ref: 'Comment',
            default: null
        },
        replyToUser: {
            type: Schema.Types.ObjectId,
            ref: 'User'
        },
        replyCount: {
            type: Number,
            default: 0
        },
        likes: [{
            type: Schema.Types.ObjectId,
            ref: 'User'
        }],
        dislikes: [{
            type: Schema.Types.ObjectId,
            ref: 'User'
        }],
        likesCount: {
            type: Number,
            default: 0
        },
        dislikesCount: {
            type: Number,
            default: 0
        },
        isDeleted: {
            type: Boolean,
            default: false,
            index: true
        },
        deletedAt: {
            type: Date,
            default: null
        }
    },
    {
        timestamps: true
    }
);

// Indexes
commentSchema.index({ activityId: 1, rootId: 1, createdAt: -1 }); // Fetch top-level comments
commentSchema.index({ rootId: 1, createdAt: 1 });                 // Fetch all replies for a thread
commentSchema.index({ parentId: 1 });                             // Fetch direct replies if needed

export const Comment = mongoose.model<IComment>('Comment', commentSchema);
