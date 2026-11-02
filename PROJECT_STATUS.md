# Project knowledge and implementation status

Reviewed: 2 November 2026. This records the inspected source and all seven supplied specifications. Update this file as milestones are completed.

## Latest frontend implementation

Pre-publication review fixes: successful generation clears the creation recovery entry; legacy completed entries no longer block a second project, while explicit resume/regenerate still work. CSRF tokens are stable across tabs, initialization is coordinated, and only pre-handler CSRF rejection is retried once. Script Review registers its unsaved/pending guard with the shared shell, preventing sign-out or workspace changes without the appropriate confirmation. Regression coverage now totals 22 passing tests including the real MongoDB integration. TypeScript and production builds pass.

Script Review is now implemented at `/scripts/:scriptId` from the approved Stitch screen `baae0daf8a4649728db97c496fd2761e`. It adds section navigation, editable headings/narration, actual word counts, labeled duration estimates, save/approve actions and regeneration navigation. Dashboard script actions and successful generation open this screen. `PATCH /scripts/:scriptId` saves drafts with an expected revision; editing approved content creates a new draft version and invalidates downstream references. Approval checks the revision supplied by the frontend and does not start generation. Integration coverage includes draft persistence, stale saves/approvals, viewer/foreign-user denial, approved-content preservation and downstream invalidation. No audio-pacing visualization or storyboard screen was added.

The shared responsive shell uses the approved neutral/olive styling across the dashboard, Create Video and Script Review. Session sign-in/registration is provided by a small inline access panel; there is no separate designed authentication screen. Workspace selection, real project lists/search, prompt examples/preferences, tab-local creation draft recovery, project saving and synchronous generation are connected to the existing API through a same-origin proxy. Unbuilt navigation and script import remain visibly unavailable. Queues, rendering and publishing remain pending.

Frontend production build and TypeScript checks pass. HTTP smoke verification against an isolated local test database passed for both routes, CSRF/authentication, project creation, explicit mock generation, saved script retrieval, project listing and logout. No real AI calls were made. Visual browser verification was blocked because automatic approval review rejected access to Microsoft Edge. The in-app browser host was also unavailable.

## Product and boundaries

AI Video Studio turns prompts, scripts, documents and media into editable videos. Its first complete flow should produce a short educational or business explainer: prompt → structured script → human approval → storyboard → human approval → scene graphics and narration → subtitles → Remotion composition → FFmpeg validation → downloadable MP4. Individual scenes remain editable and can be regenerated without discarding unrelated assets.

Longer-term features include document-to-course, motion templates, a multitrack editor, media library, brand kits, collaboration, publishing, automation, analytics and subscriptions. These are product scope, not implemented capabilities.

## Specification precedence and conflicts

| Document | Role and precedence |
|---|---|
| `prd.md` v1.0 | Product vision and broad functionality. Its local AI, Python, Motion Canvas and dark editor requirements were superseded by the revised technical/design specifications. |
| `system architecture design.md` v1.1 | Technical baseline: hosted AI APIs, modular monolith, Next.js, Express, MongoDB, BullMQ, Remotion and FFmpeg. No mandatory local AI models or GPU. |
| `pileline specification.md` v1.1 | Eighteen pipeline stages; review gates, asset dependencies, recovery and scene-level invalidation. Filename retained as supplied. |
| `API Provider Integration Specification.md` v1.0 | Provider contracts, Gemini first, ElevenLabs next, optional image/video APIs, usage accounting and cost controls. Paid usage requires explicit approval. |
| `Database Design Document (DDD).md` v1.0 | Workspace ownership, separate content/media/job collections, sessions, usage and versioning. Introduce the 32 planned collections incrementally. |
| `Backend API Specification.md` v1.0 | REST `/api/v1`, opaque sessions, CSRF, workspace roles, validation, asynchronous jobs, idempotency and revision checks. Most endpoints are still planned. |
| `UIUX Design Specification.md` v1.1 | Current visual authority: light ivory, white, stone, charcoal and muted olive. The editor stays light; only the preview stage may be graphite. |

The original documents are preserved. Their superseded sections are historical requirements, not instructions to introduce Ollama, local inference, Motion Canvas or a dark-blue editor. Examples of provider prices, quotas and model identifiers must be rechecked before integration; no free or commercial entitlement is inferred from the documents.

## Architecture map

| Layer | Intended design | Current implementation |
|---|---|---|
| Frontend | Next.js, React, Tailwind, customized shadcn/ui, Zustand, Framer Motion, Lucide | Dashboard and Create Video implemented with Next.js/React, CSS design tokens and Lucide; additional screens/libraries pending |
| API | Express + TypeScript modular monolith; routes → controllers → services | Implemented for core content |
| Identity | Server-managed sessions, workspace RBAC, account lifecycle | Registration/login/logout/me, hashed sessions, CSRF and basic throttling; email/reset/session management UI absent |
| Persistence | MongoDB + Mongoose, transaction-capable deployment | Models for core content, sessions, rate limits, usage; media/job models are scaffolds |
| AI | Central capability manager and provider adapters | Gemini text and explicit development mock; other capabilities absent |
| Jobs | BullMQ with Redis-compatible infrastructure; dedicated workers | Not created; current generation remains synchronous |
| Realtime | Socket.IO with authorized rooms | Not created |
| Media | Local storage adapter initially, object storage later | Metadata model only; no upload/storage/download services |
| Composition | Approved React/Remotion components; no execution of generated JS | Not created |
| Processing | FFmpeg, metadata validation, thumbnails, subtitles/audio mix | Not created |

`apps/backend/src/app.ts` composes HTTP middleware. `routes/index.ts` mounts modules. `common/utils/access.ts` is the shared permission boundary. Provider-specific HTTP lives under `modules/providers/adapters`. `packages/shared-types/src` holds API/domain contracts. `apps/frontend/app` contains the two frontend routes; `components/studio.tsx` manages the shared shell/session, and `lib/api.ts` handles authenticated API calls.

## Repairs completed

- Centralized active workspace membership checks across script, storyboard, scene and project operations. Viewers cannot write; access is checked before provider calls.
- Bound storyboard input scripts to the same project/workspace and required the current approved script.
- Replaced JWTs and default secrets with random opaque sessions stored only as hashes. Logout revokes server-side access; suspended users and expired sessions fail authentication. Removed JWT dependencies.
- Added CSRF protection for all writes including login, production environment validation, password length bounds, request ID sanitization, and atomic MongoDB-backed login/registration/generation limits.
- Made account/workspace creation and content multi-record writes transactional. Database startup requires transaction-capable MongoDB and does not silently continue offline.
- Storyboard generation preserves previous scenes and boards, increments versions, and stores actual scene document IDs in summaries. Active scene lists use the project's active storyboard.
- Script generation validates structured output, derives totals, increments versions and invalidates obsolete storyboard/export references. A generated draft no longer marks the video ready.
- Scene rewrites use a dedicated output contract for narration/visuals. Edits recalculate timings and project/board duration, reset approval and invalidate affected asset references. In-flight rewrites reject stale scene content.
- Provider selection honors explicit choices and rejects disabled/incompatible providers. Mocks are opt-in, visibly labeled, never automatic and disabled in production. No fake audio paths are returned.
- Gemini uses an explicitly configured model, header-based credentials, a timeout, structured JSON validation and sanitized failures. It advertises only the implemented text capability. All request outcomes record available usage; unknown costs are not claimed as zero.
- Added validated project settings, scene patch fields, ObjectIds and pagination; literal search escaping; protected provider inspection; corrected validation middleware so it preserves omitted params/query/body sections.
- Added soft project deletion and optimistic concurrency instead of orphaning dependencies by deleting only the project record. Nested workspace project routes now match the intended API, with original aliases retained.
- Added build/typecheck/test commands, local replica-set Compose configuration, environment documentation and regression tests.

## Verification and limitations

Latest checks: `npm.cmd run build` and `npm.cmd run typecheck` passed. `npm.cmd test` passed 15 tests; the real MongoDB integration test was skipped because `MONGODB_TEST_URI` was not configured.

Routine regression tests cover access denial across all content services, roles, provider routing/accounting, validation, production configuration, HTTP CSRF/session/logout/JSON/rate-limit behavior and Gemini request/error contracts. They mock database/provider boundaries.

The opt-in MongoDB integration test exercises real account/project/content persistence, script approval, storyboard versions, real scene IDs, scene timing updates, retained history, access denial, transaction rollback after an injected write failure and soft deletion. It needs `MONGODB_TEST_URI` targeting a replica-set database ending in `_test`.

This machine has Node/npm but no discoverable MongoDB, mongod or Docker executable. Therefore actual database transactions, Compose startup and live AI generation have not been verified here. No real AI credits were consumed. Git is also unavailable on PATH, so no commit was created.

## Remaining implementation work

1. Run the MongoDB integration suite on a local replica set. Add controlled index deployment and migrate historical duplicate versions/inconsistent scene IDs if existing data needs preservation. Existing JWT clients must sign in again.
2. Add BullMQ/Redis infrastructure, durable job records, user/workspace quotas, concurrency limits and idempotency before exposing generation publicly. Move generation from synchronous responses to the specified `202` job contract. Prevent retries/fallback after uncertain paid outcomes.
3. Implement script draft editing/version history and restoration, richer AI storyboard generation, scene add/delete/reorder/duplicate, project snapshots and editor revisions. Current historical storyboard retention is not a complete undo/restore feature.
4. Build the Next.js design system, authentication flow, dashboard, project library and prompt/script/storyboard screens against the real API. Avoid placeholder success flows or exposing unfinished product areas as working.
5. Add storage/upload APIs and validation; ElevenLabs per-scene voice generation after access/terms are verified; subtitle storage, timing and SRT/VTT export. Image/video generation stays optional; uploaded media and motion graphics must suffice for MVP.
6. Add Remotion components and worker, FFmpeg processing, immutable render snapshots, preview/export/download and output verification. Start with short videos, one export format and limited render concurrency.
7. Complete email verification/reset/change-password, session listing/revocation, audit events, provider budgets/eligibility, deletion cleanup, OpenAPI, operational monitoring and end-to-end tests before public deployment.
8. Then expand templates, brand kits, teams, notifications, document ingestion/course generation, social publishing, automation, analytics and billing.

## Design reference for the next build

The dashboard and Create Video screens have been approved by the user and implemented in `apps/frontend`. See `design/stitch/README.md`, `dashboard.html`, `dashboard.png`, `create-video.html` and `create-video.png` for the original references. Further screens will be reviewed one at a time. Unsupported placeholder features and provider claims were omitted from implementation.

Desktop reference: 1440 × 900, 240px expanded/64px collapsed sidebar. Use Geist Sans (Inter alternative), 8px spacing with a 4px sub-grid, restrained borders, 40–44px buttons and subtle 120–220ms transitions with reduced-motion support.

Core tokens: background `#F7F6F2`, surface `#FFFFFF`, secondary `#F0EFEA`, text `#242520`, border `#E6E4DC`, accent `#777B65`, accent-soft `#ECEDE5`, preview graphite `#292A26`. Supporting/muted text colors in the original spec need contrast checks before being used at small sizes.

The primary dashboard action is Create Video, followed by recent projects and continued work. Start with scene-based editing and progressively reveal advanced timeline controls. Preserve work on failures, show actual job status, and keep approval before expensive generation and final rendering.
