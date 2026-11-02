import { Response } from 'express';
import { ApiResponse, ApiMeta } from '@ai-video-studio/shared-types';

export function sendSuccess<T>(res: Response, data: T, meta?: ApiMeta, statusCode = 200): Response {
  const payload: ApiResponse<T> = {
    success: true,
    data,
    meta: {
      ...meta,
      timestamp: new Date().toISOString(),
    },
  };
  return res.status(statusCode).json(payload);
}

export function sendCreated<T>(res: Response, data: T, meta?: ApiMeta): Response {
  return sendSuccess(res, data, meta, 201);
}

export function sendAccepted<T>(res: Response, data: T, meta?: ApiMeta): Response {
  return sendSuccess(res, data, meta, 202);
}

