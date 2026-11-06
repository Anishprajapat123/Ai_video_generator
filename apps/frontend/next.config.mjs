import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const backend = process.env.BACKEND_URL || 'http://127.0.0.1:5000';
export default {
  turbopack: { root },
  // The launcher passes the current tunnel origin; allow only that host.
  allowedDevOrigins: process.env.FRONTEND_URL ? [new URL(process.env.FRONTEND_URL).hostname] : [],
  // Allow the backend's 120-second provider deadline to return a structured response.
  experimental: { proxyTimeout: 150_000 },
  async rewrites() {
    return [{ source: '/api/v1/:path*', destination: `${backend}/api/v1/:path*` }];
  },
};
