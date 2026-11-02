import mongoose, { Schema, Document } from 'mongoose';
import bcrypt from 'bcryptjs';

export interface IUserDocument extends Document {
  name: string;
  email: string;
  passwordHash: string;
  avatar?: string | null;
  status: 'active' | 'suspended' | 'pending';
  emailVerified: boolean;
  defaultWorkspaceId?: mongoose.Types.ObjectId;
  preferences: {
    language: string;
    theme: 'light' | 'dark' | 'system';
    timezone: string;
  };
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidate: string): Promise<boolean>;
}

const UserSchema = new Schema<IUserDocument>(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    avatar: { type: String, default: null },
    status: { type: String, enum: ['active', 'suspended', 'pending'], default: 'active' },
    emailVerified: { type: Boolean, default: false },
    defaultWorkspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace' },
    preferences: {
      language: { type: String, default: 'en' },
      theme: { type: String, enum: ['light', 'dark', 'system'], default: 'light' },
      timezone: { type: String, default: 'Asia/Kolkata' },
    },
    lastLoginAt: { type: Date },
  },
  {
    timestamps: true,
  }
);

UserSchema.methods.comparePassword = async function (candidate: string): Promise<boolean> {
  return bcrypt.compare(candidate, this.passwordHash);
};

export const UserModel = mongoose.model<IUserDocument>('User', UserSchema);

