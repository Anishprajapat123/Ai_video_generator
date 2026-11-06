import mongoose, { Schema, Document } from 'mongoose';

export interface IGenerationJobDocument extends Document {
  workspaceId: mongoose.Types.ObjectId;
  projectId?: mongoose.Types.ObjectId;
  sceneId?: mongoose.Types.ObjectId;
  pipelineRunId?: mongoose.Types.ObjectId;
  requestedBy: mongoose.Types.ObjectId;
  providerId: string;
  aiModel?: string;
  capability: string;
  jobType: string;
  status: 'pending' | 'queued' | 'processing' | 'waiting-for-provider' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  inputReference?: Record<string, unknown>;
  outputAssetIds: mongoose.Types.ObjectId[];
  externalJobId?: string;
  attempts: number;
  maxAttempts: number;
  error?: string | null;
  startedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
  resourceKey?: string;
  expiresAt?: Date;
}

const GenerationJobSchema = new Schema<IGenerationJobDocument>(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
    projectId: { type: Schema.Types.ObjectId, ref: 'Project' },
    sceneId: { type: Schema.Types.ObjectId, ref: 'Scene' },
    pipelineRunId: { type: Schema.Types.ObjectId },
    requestedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    providerId: { type: String, required: true },
    aiModel: { type: String },
    capability: { type: String, required: true },
    jobType: { type: String, required: true },
    status: {
      type: String,
      enum: ['pending', 'queued', 'processing', 'waiting-for-provider', 'completed', 'failed', 'cancelled'],
      default: 'queued',
      index: true,
    },
    progress: { type: Number, default: 0 },
    inputReference: { type: Schema.Types.Mixed },
    outputAssetIds: [{ type: Schema.Types.ObjectId, ref: 'MediaAsset' }],
    externalJobId: { type: String },
    attempts: { type: Number, default: 0 },
    maxAttempts: { type: Number, default: 3 },
    error: { type: String, default: null },
    startedAt: { type: Date },
    completedAt: { type: Date },
    resourceKey: { type: String },
    expiresAt: { type: Date },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

GenerationJobSchema.index({ workspaceId: 1, status: 1, createdAt: -1 });
GenerationJobSchema.index({ resourceKey: 1 }, { unique: true, partialFilterExpression: { resourceKey: { $type: 'string' } } });

export const GenerationJobModel = mongoose.model<IGenerationJobDocument>('GenerationJob', GenerationJobSchema);

