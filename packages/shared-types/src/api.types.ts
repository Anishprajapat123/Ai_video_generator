export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  meta?: ApiMeta;
  error?: ApiError;
}

export interface ApiMeta {
  page?: number;
  limit?: number;
  total?: number;
  totalPages?: number;
  requestId?: string;
  timestamp?: string;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown> | null;
  requestId?: string;
}

export type ErrorCode =
  | 'AUTHENTICATION_REQUIRED'
  | 'INVALID_CREDENTIALS'
  | 'EMAIL_NOT_VERIFIED'
  | 'SESSION_EXPIRED'
  | 'CSRF_VALIDATION_FAILED'
  | 'RESOURCE_NOT_FOUND'
  | 'RESOURCE_ACCESS_DENIED'
  | 'VALIDATION_ERROR'
  | 'RESOURCE_CONFLICT'
  | 'QUOTA_EXCEEDED'
  | 'PROVIDER_DISABLED'
  | 'PROVIDER_UNAVAILABLE'
  | 'PROVIDER_RATE_LIMITED'
  | 'PROVIDER_AUTHENTICATION_FAILED'
  | 'PROVIDER_TIMEOUT'
  | 'PROVIDER_INVALID_RESPONSE'
  | 'UPLOAD_FAILED'
  | 'INVALID_FILE_TYPE'
  | 'FILE_TOO_LARGE'
  | 'JOB_NOT_FOUND'
  | 'JOB_ALREADY_COMPLETED'
  | 'JOB_CANNOT_BE_CANCELLED'
  | 'JOB_FAILED'
  | 'RENDER_FAILED'
  | 'RENDER_UNAVAILABLE'
  | 'STORAGE_ERROR'
  | 'INTERNAL_SERVER_ERROR';

