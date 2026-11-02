import mongoose, { Schema, Document } from 'mongoose';

export interface IWorkspaceDocument extends Document {
  name: string;
  slug: string;
  ownerId: mongoose.Types.ObjectId;
  type: 'personal' | 'team' | 'enterprise';
  status: 'active' | 'archived';
  settings: {
    defaultLanguage: string;
    defaultAspectRatio: '16:9' | '9:16' | '1:1' | '4:5';
    defaultResolution: '720p' | '1080p' | '4k';
  };
  createdAt: Date;
  updatedAt: Date;
}

const WorkspaceSchema = new Schema<IWorkspaceDocument>(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: ['personal', 'team', 'enterprise'], default: 'personal' },
    status: { type: String, enum: ['active', 'archived'], default: 'active' },
    settings: {
      defaultLanguage: { type: String, default: 'en' },
      defaultAspectRatio: { type: String, enum: ['16:9', '9:16', '1:1', '4:5'], default: '16:9' },
      defaultResolution: { type: String, enum: ['720p', '1080p', '4k'], default: '1080p' },
    },
  },
  {
    timestamps: true,
  }
);

export const WorkspaceModel = mongoose.model<IWorkspaceDocument>('Workspace', WorkspaceSchema);

