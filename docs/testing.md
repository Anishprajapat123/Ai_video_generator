# Repeatable local verification

Refresh/reconnection browser fixture: start a built frontend on port 3101, then run `node scripts/verify-job-recovery.mjs`. To use another local frontend, set `RECOVERY_TEST_URL` to its origin. The fixture intercepts all API calls, blocks writes and verifies refresh recovery, a dropped status response, navigation to the finished script and cleanup of its cached request. It does not create projects, videos or AI requests.

Run routine checks:

```powershell
npm.cmd run verify
```

This runs typecheck, all unit/MongoDB integration tests and the production build. MongoDB must already be running. Integration tests use `ai_video_studio_test`, or an explicit `MONGODB_TEST_URI` ending in `_test`. Provider requests in tests are mocked and real API credentials are removed from the child environment.

For browser/audio and real local rendering checks as well:

```powershell
npm.cmd run verify:full
```

Full verification starts isolated API/frontend/proxy services on ports 5101/3101/3102 and uses `ai_video_studio_browser_test`. Leave those ports free; MongoDB must be running. Do not start the studio for this check. It requires installed local voices and the bundled Remotion browser. It checks native audio playback and decoded signal, Hindi narration, narrow-screen overflow, save/undo/redo/reload persistence, camera motion, visual warnings, refresh recovery, portrait/landscape caption rendering, custom vector MP4 rendering, duration, clip trimming, original sound and a silent held frame. External provider keys are disabled in the isolated API. Browser fixtures are cleaned up afterward. Render artifacts remain under `storage/verification` for inspection. These automated checks cannot judge artistic quality or prove hardware audibility.

Both commands stop on the first failure and save a summary to `storage/verification/latest-checks.json`. Neither command calls Gemini or Flow. Live provider checks are deliberately excluded; never add them to routine verification.

Routine regression tests include interrupted generation polling, reconnecting with the same request ID, concurrent submission deduplication and persisted background-job results.
