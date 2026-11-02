import http from 'http';
import { createApp } from './app.js';
import { connectDatabase, disconnectDatabase } from './database/connection.js';
import { env } from './config/env.js';
import { logger } from './common/utils/logger.js';

async function bootstrap() {
  // Connect to Database
  await connectDatabase();

  const app = createApp();
  const server = http.createServer(app);

  server.listen(env.PORT, () => {
    logger.info(`🚀 AI Video Studio API server running on http://localhost:${env.PORT}/api/v1`);
    logger.info(`   Environment: ${env.NODE_ENV}`);
    logger.info(`   Health check: http://localhost:${env.PORT}/api/v1/health`);
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info(`[Server] Received ${signal}. Shutting down gracefully...`);
    server.close(async () => {
      await disconnectDatabase();
      logger.info('[Server] HTTP server closed.');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

bootstrap().catch((err) => {
  logger.error('Fatal bootstrapping error:', err);
  process.exit(1);
});

