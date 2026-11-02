import mongoose, { Schema, Document } from 'mongoose';

export interface IWorkspaceMemberDocument extends Document {
  workspaceId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  role: 'owner' | 'admin' | 'editor' | 'viewer';
  status: 'active' | 'invited' | 'suspended';
  joinedAt?: Date;
  createdAt: Date;
}

const WorkspaceMemberSchema = new Schema<IWorkspaceMemberDocument>(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    role: { type: String, enum: ['owner', 'admin', 'editor', 'viewer'], default: 'editor' },
    status: { type: String, enum: ['active', 'invited', 'suspended'], default: 'active' },
    joinedAt: { type: Date, default: Date.now },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

WorkspaceMemberSchema.index({ workspaceId: 1, userId: 1 }, { unique: true });

export const WorkspaceMemberModel = mongoose.model<IWorkspaceMemberDocument>('WorkspaceMember', WorkspaceMemberSchema);

