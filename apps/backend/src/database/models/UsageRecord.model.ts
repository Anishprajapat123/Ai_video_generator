import mongoose, { Schema } from 'mongoose';
const schema = new Schema({
  userId: { type: Schema.Types.ObjectId, required: true },
  workspaceId: { type: Schema.Types.ObjectId, required: true },
  projectId: Schema.Types.ObjectId,
  sceneId: Schema.Types.ObjectId,
  requestId: { type: String, required: true },
  providerId: { type: String, required: true },
  capability: { type: String, required: true },
  model: String,
  usage: { inputTokens: Number, outputTokens: Number, characters: Number, durationSeconds: Number },
  estimatedCost: Number,
  status: { type: String, enum: ['success', 'failed'], required: true },
}, { collection: 'usage_records', timestamps: { createdAt: true, updatedAt: false } });
schema.index({ workspaceId: 1, createdAt: -1 });
schema.index({ userId: 1, createdAt: -1 });
export const UsageRecordModel = mongoose.model('UsageRecord', schema);
