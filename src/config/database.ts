import mongoose from 'mongoose';
import { seedShiftRules } from '../scripts/seed-shift-rules';

export const connectDatabase = async (): Promise<void> => {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/cinetrack';

    await mongoose.connect(mongoUri);

    console.log('✅ MongoDB connected successfully');

    // Auto-seed ShiftRules on startup
    await seedShiftRules();
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};


