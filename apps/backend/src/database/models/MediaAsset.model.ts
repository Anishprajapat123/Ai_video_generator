import mongoose, { Schema, Document } from 'mongoose';

export interface IMediaAssetDocument extends Document {
  workspaceId: mongoose.Types.ObjectId;
  projectId?: mongoose.Types.ObjectId;
  sceneId?: mongoose.Types.ObjectId;
  uploadedBy: mongoose.Types.ObjectId;
  name: string;
  type: 'image' | 'video' | 'audio' | 'document' | 'thumbnail' | 'other';
  mimeType: string;
  size: number;
  width?: number;
  height?: number;
  duration?: number;
  storageProvider: 'local' | 's3';
  storageKey: string;
  source: 'upload' | 'ai-generated' | 'stock' | 'template' | 'remotion-generated';
  sourceUrl?: string;
  status: 'pending' | 'ready' | 'failed';
  createdAt: Date;
  updatedAt: Date;
}

const MediaAssetSchema = new Schema<IMediaAssetDocument>(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
    projectId: { type: Schema.Types.ObjectId, ref: 'Project' },
    sceneId: { type: Schema.Types.ObjectId, ref: 'Scene' },
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true },
    type: {
      type: String,
      enum: ['image', 'video', 'audio', 'document', 'thumbnail', 'other'],
      required: true,
      index: true,
    },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
    width: { type: Number },
    height: { type: Number },
    duration: { type: Number },
    storageProvider: { type: String, enum: ['local', 's3'], default: 'local' },
    storageKey: { type: String, required: true },
    source: {
      type: String,
      enum: ['upload', 'ai-generated', 'stock', 'template', 'remotion-generated'],
      default: 'upload',
    },
    sourceUrl: { type: String },
    status: { type: String, enum: ['pending', 'ready', 'failed'], default: 'ready' },
  },
  {
    timestamps: true,
  }
);

MediaAssetSchema.index({ workspaceId: 1, createdAt: -1 });

export const MediaAssetModel = mongoose.model<IMediaAssetDocument>('MediaAsset', MediaAssetSchema);

