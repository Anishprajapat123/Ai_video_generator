import mongoose, { Schema } from 'mongoose';
const SessionSchema = new Schema({
  tokenHash: { type: String, required: true, unique: true, select: false },
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  expiresAt: { type: Date, required: true, expires: 0 },
}, { timestamps: true, collection: 'sessions' });
export const SessionModel = mongoose.model('Session', SessionSchema);
