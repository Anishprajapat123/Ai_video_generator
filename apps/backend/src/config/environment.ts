import { z } from 'zod';

export function parseEnvironment(source: NodeJS.ProcessEnv) {
  const parsed = z.object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(5000),
    FRONTEND_URL: z.string().url().default('http://localhost:3000'),
    MONGODB_URI: z.string().min(1).default('mongodb://127.0.0.1:27017/ai_video_studio?replicaSet=rs0'),
    REDIS_URL: z.string().url().default('redis://127.0.0.1:6379'),
    GEMINI_API_KEY: z.string().default(''),
    GEMINI_MODEL: z.string().regex(/^[a-zA-Z0-9._-]*$/).default(''),
    ELEVENLABS_API_KEY: z.string().default(''),
    ENABLE_MOCK_PROVIDER: z.enum(['true', 'false']).default('false').transform(v => v === 'true'),
    PROVIDER_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000).default(30000),
    STORAGE_PROVIDER: z.enum(['local', 's3']).default('local'),
    LOCAL_STORAGE_PATH: z.string().min(1).default('./storage'),
    LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  }).parse(source);
  const frontend = new URL(parsed.FRONTEND_URL);
  if (!['http:', 'https:'].includes(frontend.protocol) || frontend.origin !== parsed.FRONTEND_URL) throw new Error('FRONTEND_URL must be an HTTP(S) origin without a trailing slash');
  if (parsed.NODE_ENV === 'production' && (parsed.ENABLE_MOCK_PROVIDER || frontend.protocol !== 'https:')) throw new Error('Production requires HTTPS and mocks disabled');
  return { ...parsed, isDev: parsed.NODE_ENV === 'development', isProd: parsed.NODE_ENV === 'production' };
}
