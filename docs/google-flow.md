# Local Google Flow connector

The optional connector is installed locally under ignored `storage/tools/flow-mcp`. It runs GTAI-1/flow-mcp commit `84b548f3aa72b749b82cdbfbb6f91cadebae8642`. Compatible dependency security updates were applied locally; its production audit reported zero vulnerabilities afterward. The studio's own dependencies are unchanged.

This is unofficial browser automation. It operates a separate Chrome profile, requires manual Google sign-in and an awake desktop, and may stop working when Flow changes. Flow's free daily allowance is subject to Google account eligibility and current credit costs. It does not provide free access to Google's paid video API.

## Use

Remotion explainers are now the studio default and use no Flow credits. Choose Google Flow only when you want generated footage.

1. Run `npm.cmd run flow:login`. Finish Google sign-in in the dedicated Chrome window. Open a Flow project there and leave it open.
2. Run `npm.cmd run flow:serve` in a separate terminal, or start the Flow MCP server from VS Code. The bridge listens only on `127.0.0.1:8787` and uses its own local token.
3. Run `npm.cmd run flow:status` to verify sign-in, project and credits. This spends no credits.
4. `npm.cmd run flow:test` is blocked by default. Only an explicit `npm.cmd run flow:test -- --allow-credits` approves one waterfall clip. It fixes the model to Veo 3.1 Lite, one variant, a 10-credit cap, and zero automatic retries. It stops if no credit quote can be verified or if the quote exceeds the cap. A timeout is not proof that Google stopped generation; check Flow before trying again.

Generated downloads land in ignored `storage/flow-output/studio-flow-check`. Chrome sessions and bridge tokens stay in ignored `storage/flow-session`. Never commit either folder or share their contents. No Google password or session token belongs in `.env` or chat.

## Change the Google account

Wait for any active Flow job to finish. In the dedicated Flow Chrome window on the PC, use Google's account menu to switch/sign out and sign in manually. Open a Flow project with the desired account, then run `npm.cmd run flow:status`. Changing the studio login does not change the Flow account. No new key or `.env` change is needed. The connector follows its current signed-in project/session. Eligibility, remaining credits and Google's terms apply to the selected account; switching accounts does not guarantee additional credits.

VS Code MCP configuration includes a `flow` server that runs `node scripts/flow-connector.mjs mcp`. Start it through VS Code's MCP controls. `node scripts/flow-connector.mjs check` verifies protocol initialization and required tools without spending credits. `node scripts/flow-connector.mjs inspect` reads control names without screenshots, clicks or generation. Google authentication remains manual.

## Studio integration

Set `ENABLE_FLOW_VIDEO=true` to show **Google Flow · local Chrome** in Media & Narration's Video provider selector. LTX remains the default and can be selected independently. Choosing Flow alone never submits a request: the per-scene credit checkbox starts unchecked and must be explicitly approved before Generate scene video is enabled. It resets after starting a job or switching scenes/providers. The API also rejects absent/zero credit approval, so hiding or bypassing the checkbox does not remove the guard.

The adapter supports 16:9 and 9:16 scenes, a single Veo 3.1 Lite clip, at most 10 credits, and no retries or provider fallback. It checks the local bridge, signed-in project, balance and active jobs, records the external job ID, and polls that same job. It reads MP4s under `storage/flow-output`, checks playable metadata and saves the clip through the existing protected scene-media transaction. Generated video imports have no application size or clip-duration cap. Narration is retained; preview/export use the saved visual. Reported Flow credits are recorded separately from monetary cost.

An already downloaded clip can be recovered after an import failure without another generation: build the backend, then run `node scripts/recover-flow-video.mjs JOB_ID DOWNLOADED_MP4`. Recovery checks project ownership and scene revisions, preserves narration and marks the existing scene job completed. It never calls Flow generation.

The previous Agent-button timeout came from an open Agent session hiding the normal composer. The launcher applies the idempotent `scripts/flow-compat.mjs` patch to the pinned source and compiled module, closing that panel before the mode check. Restart the bridge after applying an update. This does not bypass authentication or Google restrictions.

Verification includes mocked connector responses and a real user-generated Flow clip that was downloaded and attached to its scene after removing the old import size cap. The current Remotion work submits no Flow generation requests.

## Installation on another machine

Download the pinned upstream commit from [GTAI-1/flow-mcp](https://github.com/GTAI-1/flow-mcp/tree/84b548f3aa72b749b82cdbfbb6f91cadebae8642) into `storage/tools/flow-mcp`, run `npm.cmd ci --ignore-scripts` there, apply compatible security fixes with `npm.cmd audit fix --ignore-scripts`, then run `npm.cmd run build`. Google Chrome and Node.js 22+ are required. No video model, FFmpeg, Whisper or extra narration installation is needed for this clip test.

Upstream package metadata declares ISC; no standalone license file was present at the pinned commit. The connector is installed locally and invoked, not vendored or redistributed by the studio. Consult upstream before distributing its source.
