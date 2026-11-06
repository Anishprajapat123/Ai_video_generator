import express from 'express';
import { csrfProtection } from './common/middleware/csrf.middleware.js';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import apiRouter from './routes/index.js';
import { requestIdMiddleware } from './common/middleware/request-id.middleware.js';
import { errorHandler } from './common/middleware/error.middleware.js';
import { env } from './config/env.js';

export function createApp() {
  const app = express();

  // Security & parsing middleware
  app.use(
    cors({
      origin: env.allowedOrigins,
      credentials: true,
    })
  );
  app.disable('x-powered-by');
  app.use(requestIdMiddleware);
  app.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff'); next(); });
  app.use(cookieParser());
  app.use(csrfProtection);
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));



  // Mount API v1 router
  app.use('/api/v1', apiRouter);

  // Fallback 404 handler
  app.use((_req, res) => {
    res.status(404).json({
      success: false,
      error: {
        code: 'RESOURCE_NOT_FOUND',
        message: 'Endpoint not found',
      },
    });
  });

  // Central Error Handler
  app.use(errorHandler);

  return app;
}

