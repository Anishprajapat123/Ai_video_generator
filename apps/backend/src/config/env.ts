import dotenv from 'dotenv';
import path from 'node:path';
import { parseEnvironment } from './environment.js';

// Works from either the monorepo root or the backend workspace.
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });
dotenv.config();
export const env = parseEnvironment(process.env);
