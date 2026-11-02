import { ErrorCode } from '@ai-video-studio/shared-types';

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: ErrorCode;
  public readonly details?: Record<string, unknown> | null;
  public readonly isOperational: boolean;

  constructor(
    statusCode: number,
    code: ErrorCode,
    message: string,
    details?: Record<string, unknown> | null,
    isOperational = true
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = isOperational;
    Object.setPrototypeOf(this, new.target.prototype);
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message: string, code: ErrorCode = 'VALIDATION_ERROR', details?: Record<string, unknown>): AppError {
    return new AppError(400, code, message, details);
  }

  static unauthorized(message = 'Authentication required', code: ErrorCode = 'AUTHENTICATION_REQUIRED'): AppError {
    return new AppError(401, code, message);
  }

  static forbidden(message = 'Permission denied', code: ErrorCode = 'RESOURCE_ACCESS_DENIED'): AppError {
    return new AppError(403, code, message);
  }

  static notFound(message = 'Resource not found', code: ErrorCode = 'RESOURCE_NOT_FOUND'): AppError {
    return new AppError(404, code, message);
  }

  static conflict(message: string, code: ErrorCode = 'RESOURCE_CONFLICT'): AppError {
    return new AppError(409, code, message);
  }

  static internal(message = 'An unexpected internal error occurred'): AppError {
    return new AppError(500, 'INTERNAL_SERVER_ERROR', message, null, false);
  }
}

