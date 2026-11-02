import mongoose, { Schema, Document } from 'mongoose';

export interface IProjectDocument extends Document {
  workspaceId: mongoose.Types.ObjectId;
  ownerId: mongoose.Types.ObjectId;
  title: string;
  description?: string;
  creationType: 'prompt' | 'script' | 'document' | 'image' | 'audio' | 'video' | 'article' | 'template';
  status: 'draft' | 'processing' | 'ready' | 'rendering' | 'completed' | 'failed' | 'archived';
  settings: {
    duration: number;
    aspectRatio: '16:9' | '9:16' | '1:1' | '4:5';
    resolution: '720p' | '1080p' | '4k';
    fps: number;
    language: string;
    style: string;
    subtitlesEnabled: boolean;
    musicEnabled: boolean;
  };
  scriptId?: mongoose.Types.ObjectId | null;
  storyboardId?: mongoose.Types.ObjectId | null;
  brandKitId?: mongoose.Types.ObjectId | null;
  currentVersionId?: mongoose.Types.ObjectId | null;
  thumbnailAssetId?: mongoose.Types.ObjectId | null;
  finalVideoAssetId?: mongoose.Types.ObjectId | null;
  deletedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const ProjectSchema = new Schema<IProjectDocument>(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    creationType: {
      type: String,
      enum: ['prompt', 'script', 'document', 'image', 'audio', 'video', 'article', 'template'],
      default: 'prompt',
    },
    status: {
      type: String,
      enum: ['draft', 'processing', 'ready', 'rendering', 'completed', 'failed', 'archived'],
      default: 'draft',
      index: true,
    },
    settings: {
      duration: { type: Number, default: 60 },
      aspectRatio: { type: String, enum: ['16:9', '9:16', '1:1', '4:5'], default: '16:9' },
      resolution: { type: String, enum: ['720p', '1080p', '4k'], default: '1080p' },
      fps: { type: Number, default: 30 },
      language: { type: String, default: 'en' },
      style: { type: String, default: 'animated-explainer' },
      subtitlesEnabled: { type: Boolean, default: true },
      musicEnabled: { type: Boolean, default: true },
    },
    deletedAt: { type: Date, default: null },
    scriptId: { type: Schema.Types.ObjectId, ref: 'Script', default: null },
    storyboardId: { type: Schema.Types.ObjectId, ref: 'Storyboard', default: null },
    brandKitId: { type: Schema.Types.ObjectId, ref: 'BrandKit', default: null },
    currentVersionId: { type: Schema.Types.ObjectId, default: null },
    thumbnailAssetId: { type: Schema.Types.ObjectId, ref: 'MediaAsset', default: null },
    finalVideoAssetId: { type: Schema.Types.ObjectId, ref: 'MediaAsset', default: null },
  },
  {
    timestamps: true,
    optimisticConcurrency: true,
  }
);

ProjectSchema.index({ workspaceId: 1, updatedAt: -1 });
ProjectSchema.index({ workspaceId: 1, status: 1 });

export const ProjectModel = mongoose.model<IProjectDocument>('Project', ProjectSchema);

