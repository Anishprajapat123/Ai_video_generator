import mongoose, { Schema } from 'mongoose';
const schema = new Schema({
  _id: { type: String, required: true },
  count: { type: Number, default: 0 },
  expiresAt: { type: Date, required: true, expires: 0 },
}, { collection: 'rate_limits', versionKey: false });
export const RateLimitModel = mongoose.model('RateLimit', schema);
