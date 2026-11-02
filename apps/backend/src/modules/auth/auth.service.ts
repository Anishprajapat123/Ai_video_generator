import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { createSession } from './session.service.js';
import bcrypt from 'bcryptjs';
import { UserModel } from '../../database/models/User.model.js';
import { WorkspaceModel } from '../../database/models/Workspace.model.js';
import { WorkspaceMemberModel } from '../../database/models/WorkspaceMember.model.js';
import { AppError } from '../../common/errors/app-error.js';

export class AuthService {
  async register(name: string, email: string, password: string) {
    const existing = await UserModel.findOne({ email: email.toLowerCase() });
    if (existing) {
      throw AppError.conflict('An account with this email already exists');
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const user = new UserModel({
      name,
      email: email.toLowerCase(),
      passwordHash,
      emailVerified: false,
    });
    return mongoose.connection.transaction(async (session) => {
    await user.save({ session });

    // Create default personal workspace
    const slug = `${name.toLowerCase().replace(/[^a-z0-9]/g, '-')}-studio-${randomUUID()}`;
    const workspace = new WorkspaceModel({
      name: `${name}'s Studio`,
      slug,
      ownerId: user._id,
      type: 'personal',
    });
    await workspace.save({ session });

    // Add workspace membership
    const membership = new WorkspaceMemberModel({
      workspaceId: workspace._id,
      userId: user._id,
      role: 'owner',
    });
    await membership.save({ session });

    user.defaultWorkspaceId = workspace._id;
    await user.save({ session });



    return {
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        defaultWorkspaceId: workspace._id.toString(),
      },
      workspace: {
        id: workspace._id.toString(),
        name: workspace.name,
        slug: workspace.slug,
      },
    };
    });
  }

  async login(email: string, candidatePass: string) {
    const user = await UserModel.findOne({ email: email.toLowerCase() }).select('+passwordHash');
    if (!user || user.status !== 'active') {
      throw AppError.unauthorized('Invalid email or password', 'INVALID_CREDENTIALS');
    }

    const isMatch = await user.comparePassword(candidatePass);
    if (!isMatch) {
      throw AppError.unauthorized('Invalid email or password', 'INVALID_CREDENTIALS');
    }

    user.lastLoginAt = new Date();
    await user.save();

    const workspaceId = user.defaultWorkspaceId?.toString() || '';
    const token = await createSession(user.id);

    return {
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        defaultWorkspaceId: workspaceId,
      },
      token,
    };
  }

  async getMe(userId: string) {
    const user = await UserModel.findById(userId).select('-passwordHash');
    if (!user) {
      throw AppError.notFound('User profile not found');
    }
    return user;
  }

}

export const authService = new AuthService();

