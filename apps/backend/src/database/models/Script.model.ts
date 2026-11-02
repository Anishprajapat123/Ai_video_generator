import mongoose, { Schema, Document } from 'mongoose';

export interface IScriptSection {
  sectionId: string;
  heading: string;
  narration: string;
  estimatedDuration: number;
  keyMessage?: string;
  visualSuggestion?: string;
  order: number;
}

export interface IScriptDocument extends Document {
  workspaceId: mongoose.Types.ObjectId;
  projectId: mongoose.Types.ObjectId;
  version: number;
  title: string;
  language: string;
  tone: string;
  targetAudience: string;
  sections: IScriptSection[];
  totalWordCount: number;
  estimatedDuration: number;
  status: 'draft' | 'approved' | 'superseded';
  providerMetadata?: {
    providerId: string;
    model: string;
  };
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const ScriptSectionSchema = new Schema<IScriptSection>(
  {
    sectionId: { type: String, required: true },
    heading: { type: String, required: true },
    narration: { type: String, required: true },
    estimatedDuration: { type: Number, required: true },
    keyMessage: { type: String },
    visualSuggestion: { type: String },
    order: { type: Number, required: true },
  },
  { _id: false }
);

const ScriptSchema = new Schema<IScriptDocument>(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    version: { type: Number, default: 1 },
    title: { type: String, required: true },
    language: { type: String, default: 'en' },
    tone: { type: String, default: 'educational' },
    targetAudience: { type: String, default: 'general' },
    sections: [ScriptSectionSchema],
    totalWordCount: { type: Number, default: 0 },
    estimatedDuration: { type: Number, default: 0 },
    status: { type: String, enum: ['draft', 'approved', 'superseded'], default: 'draft' },
    providerMetadata: {
      providerId: { type: String },
      model: { type: String },
    },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  {
    timestamps: true,
    optimisticConcurrency: true,
  }
);

ScriptSchema.index({ projectId: 1, version: -1 });

export const ScriptModel = mongoose.model<IScriptDocument>('Script', ScriptSchema);

