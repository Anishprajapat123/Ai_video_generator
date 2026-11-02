import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { logger } from '../common/utils/logger.js';

let isConnected = false;

export async function connectDatabase(): Promise<typeof mongoose> {
  if (isConnected) {
    return mongoose;
  }

  try {
    const conn = await mongoose.connect(env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
      autoIndex: env.isDev,
    });

    const topology = await conn.connection.db!.admin().command({ hello: 1 });
    if (!topology.setName && topology.msg !== 'isdbgrid') {
      await mongoose.disconnect();
      throw new Error('MongoDB must run as a replica set or sharded cluster for atomic multi-document operations');
    }
    isConnected = conn.connections[0].readyState === 1;
    logger.info(`[MongoDB] Connected successfully to ${conn.connection.host}/${conn.connection.name}`);

    mongoose.connection.on('error', (err) => {
      logger.error('[MongoDB] Connection runtime error:', err);
    });

    mongoose.connection.on('disconnected', () => {
      logger.warn('[MongoDB] Disconnected from database server.');
      isConnected = false;
    });

    return conn;
  } catch (error) {
    logger.error('[MongoDB] Database initialization failed');
    throw error;
  }
}

export async function disconnectDatabase(): Promise<void> {
  if (isConnected) {
    await mongoose.disconnect();
    isConnected = false;
    logger.info('[MongoDB] Disconnected gracefully.');
  }
}

