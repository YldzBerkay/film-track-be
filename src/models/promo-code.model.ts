import mongoose, { Document, Schema } from 'mongoose';

export interface IPromoCode extends Document {
    code: string;
    durationDays: number;
    isRedeemed: boolean;
    redeemedBy: mongoose.Types.ObjectId | null;
    redeemedAt: Date | null;
    createdAt: Date;
}

const promoCodeSchema = new Schema<IPromoCode>(
    {
        code: {
            type: String,
            required: true,
            unique: true,
            uppercase: true,
            trim: true
        },
        durationDays: {
            type: Number,
            required: true,
            min: 1
        },
        isRedeemed: {
            type: Boolean,
            default: false
        },
        redeemedBy: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            default: null
        },
        redeemedAt: {
            type: Date,
            default: null
        }
    },
    {
        timestamps: { createdAt: true, updatedAt: false }
    }
);

export const PromoCode = mongoose.model<IPromoCode>('PromoCode', promoCodeSchema);
