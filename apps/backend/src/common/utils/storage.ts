import path from 'node:path';
import { env } from '../../config/env.js';

// Resolve consistently when launched from either workspace or repository root.
export const mediaDirectory = path.resolve(__dirname, '../../../../..', env.LOCAL_STORAGE_PATH, 'media');
