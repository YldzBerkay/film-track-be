import mongoose, { Document, Schema } from 'mongoose';

/**
 * Condition for a shift rule dimension
 * At least one of min/max should be specified
 */
export interface DimensionCondition {
    min?: number;  // userMood[key] >= min
    max?: number;  // userMood[key] <= max
}

/**
 * ShiftRule: Database-driven mood shift configuration
 * Replaces hardcoded "antidote" logic in recommendation service
 */
export interface IShiftRule extends Document {
    name: string;
    description?: string;
    priority: number;  // Higher = evaluated first

    // Condition logic: All specified conditions must be met (AND logic)
    // For OR logic within a rule, create multiple rules with same targetEffects
    conditions: {
        adrenaline?: DimensionCondition;
        melancholy?: DimensionCondition;
        joy?: DimensionCondition;
        tension?: DimensionCondition;
        intellect?: DimensionCondition;
        romance?: DimensionCondition;
        wonder?: DimensionCondition;
        nostalgia?: DimensionCondition;
        darkness?: DimensionCondition;
        inspiration?: DimensionCondition;
    };

    // Target mood values to apply when rule matches
    // Only specified dimensions will override the neutral base
    targetEffects: {
        adrenaline?: number;
        melancholy?: number;
        joy?: number;
        tension?: number;
        intellect?: number;
        romance?: number;
        wonder?: number;
        nostalgia?: number;
        darkness?: number;
        inspiration?: number;
    };

    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}

const dimensionConditionSchema = {
    min: { type: Number, min: 0, max: 100 },
    max: { type: Number, min: 0, max: 100 }
};

const shiftRuleSchema = new Schema<IShiftRule>(
    {
        name: {
            type: String,
            required: true,
            unique: true,
            trim: true
        },
        description: {
            type: String,
            trim: true
        },
        priority: {
            type: Number,
            required: true,
            default: 5,
            index: true
        },
        conditions: {
            adrenaline: dimensionConditionSchema,
            melancholy: dimensionConditionSchema,
            joy: dimensionConditionSchema,
            tension: dimensionConditionSchema,
            intellect: dimensionConditionSchema,
            romance: dimensionConditionSchema,
            wonder: dimensionConditionSchema,
            nostalgia: dimensionConditionSchema,
            darkness: dimensionConditionSchema,
            inspiration: dimensionConditionSchema
        },
        targetEffects: {
            adrenaline: { type: Number, min: 0, max: 100 },
            melancholy: { type: Number, min: 0, max: 100 },
            joy: { type: Number, min: 0, max: 100 },
            tension: { type: Number, min: 0, max: 100 },
            intellect: { type: Number, min: 0, max: 100 },
            romance: { type: Number, min: 0, max: 100 },
            wonder: { type: Number, min: 0, max: 100 },
            nostalgia: { type: Number, min: 0, max: 100 },
            darkness: { type: Number, min: 0, max: 100 },
            inspiration: { type: Number, min: 0, max: 100 }
        },
        isActive: {
            type: Boolean,
            default: true,
            index: true
        }
    },
    {
        timestamps: true
    }
);

// Compound index for active rules sorted by priority
shiftRuleSchema.index({ isActive: 1, priority: -1 });

export const ShiftRule = mongoose.model<IShiftRule>('ShiftRule', shiftRuleSchema);
