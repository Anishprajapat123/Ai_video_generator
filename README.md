# AI Video Studio

An API-first video creation platform for educational and business explainers. This repository contains the Express/TypeScript backend, shared types and three Next.js frontend screens. Background workers and rendering remain planned.

Read [PROJECT_STATUS.md](PROJECT_STATUS.md) for the architecture decisions, implementation inventory and next milestones.

## Frontend

The approved Stitch dashboard, Create Video and Script Review designs are implemented in `apps/frontend`, at `/`, `/create` and `/scripts/:scriptId`. Run the backend with `npm.cmd run dev:backend` and, in a second terminal, run `npm.cmd run dev:frontend`. Open `http://localhost:3000`. Sign in or create an account through the small built-in access panel.

The frontend proxies `/api/v1` to `http://127.0.0.1:5000`, preserving cookie authentication and CSRF. Set `BACKEND_URL` in the frontend process environment to change this destination; keep backend `FRONTEND_URL` aligned with the browser origin. The frontend never receives provider credentials.

The dashboard shows actual projects and offers search and access to Script Review. Create Video saves a project, calls the existing synchronous script API and opens the saved script for review. Script Review supports section navigation, heading/narration editing, word counts, estimated duration, draft saving and approval. Stale saves/approvals are rejected; editing approved content creates a new draft version and invalidates downstream storyboard/export references. Approval alone never starts generation. Regeneration returns to Create Video for an explicit prompt/provider submission. Browser-tab draft recovery preserves prompts and the created project ID across navigation/reload. Script import, background jobs and other unbuilt features remain unavailable. Mock generation must be selected explicitly in Advanced settings after enabling it on the backend.

Check the frontend with `npm.cmd run typecheck:frontend` and `npm.cmd run build:frontend`.

## Local setup

Use Node.js 22 or newer and npm. MongoDB must support transactions: use a replica set, Atlas, or a compatible sharded cluster. A standalone MongoDB instance is insufficient.

1. Run `npm.cmd ci` from the repository root.
2. Copy `.env.example` to `.env` only if you do not already have a local environment file.
3. Start your MongoDB replica set. If Docker Compose is available, `docker compose up -d --wait` starts the loopback-only development database defined in `compose.yaml`. Do not run this against an already occupied port 27017.
4. Run `npm.cmd run build:types`, then `npm.cmd run dev:backend`.
5. Check `http://localhost:5000/api/v1/health`.

The backend fails startup if MongoDB is unavailable or cannot support transactions. Docker and MongoDB are not bundled with the application. The Compose setup is for local development, not production.

## Checks

```powershell
npm.cmd run build
npm.cmd run typecheck
npm.cmd test
```

The routine tests mock database boundaries and external APIs. To additionally run the real MongoDB integration test, set a dedicated database URI with a database name ending in `_test`:

```powershell
$env:MONGODB_TEST_URI = 'mongodb://127.0.0.1:27017/ai_video_studio_test?replicaSet=rs0'
npm.cmd test
```

The integration test cleans up only records it creates. It never calls a real AI provider.

## Authentication contract

JWT bearer tokens have been replaced with opaque server-managed sessions. Existing JWT cookies must be replaced by signing in again. Raw session tokens are sent only in HttpOnly cookies; MongoDB stores their SHA-256 hashes. Logout deletes the session immediately. Sessions expire after seven days; expiration is checked on every request independently of TTL cleanup.

Before any state-changing request (including login or registration), call `GET /api/v1/auth/csrf` with browser credentials enabled. Keep its `data.csrfToken` in memory and send it as `X-CSRF-Token`; the browser also sends the HttpOnly CSRF cookie. Use `credentials: 'include'` for API requests. The endpoint reuses a valid cookie so other tabs cannot invalidate an in-flight write. The frontend coordinates token initialization and retries only middleware CSRF rejections once. Production requires HTTPS, a configured `FRONTEND_URL` origin, and a same-site frontend/API deployment with the present cookie policy.

Registration passwords require at least 8 characters and at most 72 UTF-8 bytes. Login retains compatibility with existing bcrypt hashes. Login and registration limits are stored atomically in MongoDB. Proxy trust is disabled; configure a specific trusted proxy topology before deploying behind a reverse proxy, otherwise requests share the proxy's IP limit.

## Content APIs currently available

All paths below are relative to `/api/v1`. Protected writes require active owner, admin or editor membership; active viewers can read.

| Resource | Implemented operations |
|---|---|
| Auth | `GET /auth/csrf`, `POST /auth/register`, `POST /auth/login`, `GET /auth/me`, `POST /auth/logout` |
| Workspaces | `GET /workspaces`, `POST /workspaces`, `GET /workspaces/:workspaceId` |
| Projects | `GET/POST /workspaces/:workspaceId/projects`, `GET/PATCH/DELETE /projects/:projectId` |
| Legacy project aliases | `GET /projects?workspaceId=...`, `POST /projects` with `workspaceId` or the default workspace |
| Scripts | `POST /projects/:projectId/scripts/generate`, `GET /scripts/:scriptId`, `POST /scripts/:scriptId/approve` |
| Storyboards | `POST /projects/:projectId/storyboards/generate`, `GET /storyboards/:storyboardId`, `POST /storyboards/:storyboardId/approve` |
| Scenes | `GET /projects/:projectId/scenes`, `GET/PATCH /scenes/:sceneId`, `POST /scenes/:sceneId/regenerate` |
| Providers | Authenticated `GET /providers` |

Generation is currently synchronous and returns content, unlike the planned asynchronous `202` job contract. Storyboards currently map approved script sections to scenes without a second AI call. A project is ready only after storyboard approval. Scene edits reset approval, update all scene timings and invalidate dependent asset references. Deleted projects are hidden immediately; their records and media references remain for a future controlled cleanup workflow.

## AI configuration

Gemini requires both `GEMINI_API_KEY` and an explicitly selected `GEMINI_MODEL`. Choose a currently supported model that your account can access under your intended usage terms; no model or free allowance is assumed. The adapter follows the [official generateContent API](https://ai.google.dev/api/generate-content), sends credentials in the header, bounds request time and validates JSON output locally. Real provider calls were not exercised during this repair.

For offline content testing, set `ENABLE_MOCK_PROVIDER=true` and explicitly send `providerId: "mock-ai"` in script requests or inside scene rewrite `instructions`. Mock output is marked `[MOCK]`, never selected as automatic fallback, and forbidden in production. No audio files are fabricated. Provider request outcomes and available usage quantities are recorded; unverified costs remain unspecified. Application generation limits are currently 20 requests per user per hour, shared across script and scene generation. Provider account quotas and monetary budgets still need implementation.

Production index creation must be handled explicitly before accepting traffic (`autoIndex` is enabled only in development). Required indexes are declared in each model, including unique user emails, session hashes, workspace memberships and TTL expiration. Existing collection names are retained to avoid silently disconnecting existing data; naming migrations to match every DDD collection are still pending.
