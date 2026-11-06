import { z } from 'zod';

export function parseEnvironment(source: NodeJS.ProcessEnv) {
  const parsed = z.object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(5000),
    FRONTEND_URL: z.string().url().default('http://localhost:3000'),
    ALLOW_REGISTRATION: z.enum(['true', 'false']).optional(),
    MONGODB_URI: z.string().min(1).default('mongodb://127.0.0.1:27017/ai_video_studio?replicaSet=rs0'),
    GEMINI_API_KEY: z.string().default(''),
    GEMINI_MODEL: z.string().regex(/^[a-zA-Z0-9._-]*$/).default(''),
    GEMINI_ALTERNATE_MODELS: z.string().regex(/^(?:[a-zA-Z0-9._-]+(?:,[a-zA-Z0-9._-]+)*)?$/).default(''),
    OPENROUTER_API_KEY: z.string().default(''),
    OPENROUTER_TIMEOUT_MS: z.coerce.number().int().min(1000).max(90000).default(90000),
    AI_TEAM_ENABLED: z.enum(['true', 'false']).default('true').transform(value => value === 'true'),
    ELEVENLABS_API_KEY: z.string().default(''),
    ELEVENLABS_MODEL: z.string().regex(/^[a-zA-Z0-9_-]+$/).default('eleven_flash_v2_5'),
    NARRATION_PROVIDER: z.enum(['elevenlabs', 'kitten-local', 'piper-local']).default('elevenlabs'),
    LOCAL_TTS_PYTHON: z.string().min(1).default(process.platform === 'win32' ? '.tts-venv/Scripts/python.exe' : '.tts-venv/bin/python'),
    LOCAL_TTS_MODEL_DIR: z.string().min(1).default('storage/voices/kitten'),
    ENABLE_HOSTED_VIDEO: z.enum(['true', 'false']).default('false').transform(value => value === 'true'),
    ENABLE_FLOW_VIDEO: z.enum(['true', 'false']).default('false').transform(value => value === 'true'),
    ENABLE_MOCK_PROVIDER: z.enum(['true', 'false']).default('false').transform(v => v === 'true'),
    PROVIDER_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000).default(30000),
    LOCAL_STORAGE_PATH: z.string().min(1).default('./storage'),
  }).parse(source);
  const frontend = new URL(parsed.FRONTEND_URL);
  if (!['http:', 'https:'].includes(frontend.protocol) || frontend.origin !== parsed.FRONTEND_URL) throw new Error('FRONTEND_URL must be an HTTP(S) origin without a trailing slash');
  if (parsed.NODE_ENV === 'production' && (parsed.ENABLE_MOCK_PROVIDER || frontend.protocol !== 'https:')) throw new Error('Production requires HTTPS and mocks disabled');
  const secureCookies = parsed.NODE_ENV === 'production';
  // Sharing a development server must not disable the launcher's local links.
  const allowedOrigins = [...new Set([frontend.origin, ...(parsed.NODE_ENV === 'development' ? ['http://localhost:3000', 'http://127.0.0.1:3000'] : [])])];
  return { ...parsed, allowedOrigins, secureCookies, allowRegistration: parsed.ALLOW_REGISTRATION === undefined ? parsed.NODE_ENV !== 'production' : parsed.ALLOW_REGISTRATION === 'true', isDev: parsed.NODE_ENV === 'development', isProd: parsed.NODE_ENV === 'production' };
}
