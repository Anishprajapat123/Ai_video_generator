import mongoose, { Schema, Document } from 'mongoose';

export interface IMotionGraphicElement {
  id: string;
  type: string;
  properties: Record<string, unknown>;
  animation?: {
    type: string;
    duration: number;
    delay?: number;
  };
}

export interface ISceneDocument extends Document {
  workspaceId: mongoose.Types.ObjectId;
  projectId: mongoose.Types.ObjectId;
  storyboardId?: mongoose.Types.ObjectId;
  sceneNumber: number;
  title: string;
  duration: number;
  narration?: string;
  visualDescription?: string;
  visualAssetIds: mongoose.Types.ObjectId[];
  voiceAssetId?: mongoose.Types.ObjectId | null;
  subtitleId?: mongoose.Types.ObjectId | null;
  motionGraphics: IMotionGraphicElement[];
  timeline: {
    startTime: number;
    endTime: number;
  };
  transition: {
    type: 'fade' | 'slide-left' | 'slide-right' | 'wipe' | 'none';
    duration: number;
  };
  status: 'draft' | 'pending' | 'ready' | 'rendering' | 'failed';
  createdAt: Date;
  updatedAt: Date;
}

const MotionGraphicElementSchema = new Schema<IMotionGraphicElement>(
  {
    id: { type: String, required: true },
    type: { type: String, required: true },
    properties: { type: Schema.Types.Mixed, default: {} },
    animation: {
      type: { type: String },
      duration: { type: Number, default: 0.5 },
      delay: { type: Number, default: 0 },
    },
  },
  { _id: false }
);

const SceneSchema = new Schema<ISceneDocument>(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    storyboardId: { type: Schema.Types.ObjectId, ref: 'Storyboard' },
    sceneNumber: { type: Number, required: true },
    title: { type: String, required: true },
    duration: { type: Number, required: true, default: 10 },
    narration: { type: String },
    visualDescription: { type: String },
    visualAssetIds: [{ type: Schema.Types.ObjectId, ref: 'MediaAsset' }],
    voiceAssetId: { type: Schema.Types.ObjectId, ref: 'MediaAsset', default: null },
    subtitleId: { type: Schema.Types.ObjectId, default: null },
    motionGraphics: [MotionGraphicElementSchema],
    timeline: {
      startTime: { type: Number, default: 0 },
      endTime: { type: Number, default: 10 },
    },
    transition: {
      type: { type: String, enum: ['fade', 'slide-left', 'slide-right', 'wipe', 'none'], default: 'fade' },
      duration: { type: Number, default: 1 },
    },
    status: {
      type: String,
      enum: ['draft', 'pending', 'ready', 'rendering', 'failed'],
      default: 'draft',
    },
  },
  {
    timestamps: true,
  }
);

SceneSchema.index({ projectId: 1, sceneNumber: 1 });

export const SceneModel = mongoose.model<ISceneDocument>('Scene', SceneSchema);

