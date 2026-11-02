import mongoose, { Schema, Document } from 'mongoose';

export interface IStoryboardSceneSummary {
  sceneId: string;
  title: string;
  description: string;
  duration: number;
  order: number;
  visualType: 'animation' | 'image' | 'video' | 'typography' | 'hybrid';
  transition: string;
}

export interface IStoryboardDocument extends Document {
  workspaceId: mongoose.Types.ObjectId;
  projectId: mongoose.Types.ObjectId;
  scriptId: mongoose.Types.ObjectId;
  version: number;
  title: string;
  scenes: IStoryboardSceneSummary[];
  totalDuration: number;
  status: 'draft' | 'approved' | 'superseded';
  providerMetadata?: {
    providerId: string;
    model: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

const StoryboardSceneSchema = new Schema<IStoryboardSceneSummary>(
  {
    sceneId: { type: String, required: true },
    title: { type: String, required: true },
    description: { type: String, required: true },
    duration: { type: Number, required: true },
    order: { type: Number, required: true },
    visualType: {
      type: String,
      enum: ['animation', 'image', 'video', 'typography', 'hybrid'],
      default: 'animation',
    },
    transition: { type: String, default: 'fade' },
  },
  { _id: false }
);

const StoryboardSchema = new Schema<IStoryboardDocument>(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    scriptId: { type: Schema.Types.ObjectId, ref: 'Script', required: true },
    version: { type: Number, default: 1 },
    title: { type: String, required: true },
    scenes: [StoryboardSceneSchema],
    totalDuration: { type: Number, default: 0 },
    status: { type: String, enum: ['draft', 'approved', 'superseded'], default: 'draft' },
    providerMetadata: {
      providerId: { type: String },
      model: { type: String },
    },
  },
  {
    timestamps: true,
  }
);

StoryboardSchema.index({ projectId: 1, version: -1 });

export const StoryboardModel = mongoose.model<IStoryboardDocument>('Storyboard', StoryboardSchema);

