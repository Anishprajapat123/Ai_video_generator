import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../errors/app-error.js';
import { ApiResponse } from '@ai-video-studio/shared-types';
import { logger } from '../utils/logger.js';
import { env } from '../../config/env.js';

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next: NextFunction
): Response | void {
  const reqId = req.id || 'unknown';
  // A stream or proxy can fail after headers are sent (for example, a client aborting a media download).
  // Let Express close the connection instead of crashing the server with a second response.
  if (res.headersSent) {
    logger.error(`Error after response started [${reqId}]:`, err);
    return next(err);
  }

  // Handle custom AppError
  if (err instanceof AppError) {
    if (!err.isOperational) {
      logger.error(`Non-operational AppError [${reqId}]:`, err);
    }
    const response: ApiResponse = {
      success: false,
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
        requestId: reqId,
      },
    };
    return res.status(err.statusCode).json(response);
  }

  // Handle Zod validation errors
  if (err instanceof ZodError) {
    const formattedErrors = err.errors.map((e) => ({
      path: e.path.join('.'),
      message: e.message,
    }));
    // Log field names and rule failures (never submitted values) so a rejected form is diagnosable.
    logger.warn(`Validation failed [${reqId}] ${req.method} ${req.originalUrl}: ${formattedErrors.map(e => `${e.path || 'body'}: ${e.message}`).join('; ')}`);

    const response: ApiResponse = {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request payload',
        details: { issues: formattedErrors },
        requestId: reqId,
      },
    };
    return res.status(400).json(response);
  }

  // Handle standard MongoDB CastError / ValidationError / Duplicate Key
  if (err.name === 'CastError') {
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid resource ID format',
        requestId: reqId,
      },
    };
    return res.status(400).json(response);
  }

  if ((err as { code?: number }).code === 11000) {
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'RESOURCE_CONFLICT',
        message: 'A duplicate record already exists with that unique field.',
        requestId: reqId,
      },
    };
    return res.status(409).json(response);
  }

  if (err.name === 'ValidationError') return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid resource data', requestId: reqId } });
  if (err.name === 'VersionError') return res.status(409).json({ success: false, error: { code: 'RESOURCE_CONFLICT', message: 'Resource changed; reload and retry', requestId: reqId } });
  const httpError = err as Error & { status?: number; type?: string };
  if (httpError.type === 'entity.parse.failed') return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid JSON body', requestId: reqId } });
  if (httpError.status === 413) return res.status(413).json({ success: false, error: { code: 'FILE_TOO_LARGE', message: 'Request body is too large', requestId: reqId } });
  // Catch-all Internal Server Error
  logger.error(`Unhandled Exception [${reqId}]:`, err);

  const response: ApiResponse = {
    success: false,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: env.isProd ? 'An unexpected internal server error occurred.' : err.message,
      details: env.isDev ? { stack: err.stack } : null,
      requestId: reqId,
    },
  };
  return res.status(500).json(response);
}

