# Codex Core Update Log - 2026-07-13

Source checked:

| Item | Result |
| --- | --- |
| Official appcast | `https://persistent.oaistatic.com/codex-app-prod/appcast.xml` |
| Previous embedded app | `26.707.30751` |
| New embedded app | `26.707.61608` |
| Sparkle version | `5200` |
| Published | `Mon, 13 Jul 2026 00:59:34 +0000` |
| CLI stable | `@openai/codex@0.144.1`, local already current |
| CLI alpha | `@openai/codex@0.145.0-alpha.4`, not adopted |

Downloaded official package:

| Field | Value |
| --- | --- |
| URL | `https://persistent.oaistatic.com/codex-app-prod/ChatGPT-darwin-arm64-26.707.61608.zip` |
| Size | `565574827` |
| Signature | `b19jhH5N29NSFZSTSKurbavv08q+8z4ClfZOjLzBHyor3FtA4R05VqmQyi9s5nAfQrXwxjBR/QqfpGORkMmMBQ==` |
| Temporary path | `/tmp/tmp.TBu9ELCMSP/file.zip` |

Updated files and behavior:

| Area | Change |
| --- | --- |
| `scripts/prepare` | Updated embedded app version from `26.707.30751` to `26.707.61608`. |
| `scripts/prepare_asar` | Cleans stale `scratch/ChatGPT.app` and `scratch/asar` before extracting the new official package. |
| `scripts/prepare_asar` | Prettier now only runs on patch target files that exist in the new extracted source. |
| `patches/webview-style.patch` | Retargeted index bundle to `index-BtZb5ZU2.js`; viewport patch kept with `viewport-fit=cover` and `interactive-widget=resizes-content`. |
| `patches/webview-preload.patch` | Made HTML insertion anchor less brittle around `meta charset`. |
| `patches/webview-favicon.patch` | Made HTML insertion anchor less brittle around `<title>Codex</title>`. |
| `patches/webview-pwa.patch` | Made HTML insertion anchor less brittle around `<title>Codex</title>` and favicon. |
| `patches/webview-pwa.patch` | Changed manifest link from `./manifest.json` to `/manifest.json` so nested SPA routes do not request `/app/manifest.json`. |
| `patches/webview-initial-route.patch` | Retargeted to `app-initial~app-main~page-CMpPiY3-.js`; kept initial route fallback to `window.__ELECTRON_SHIM__.initialRoute`. |
| `patches/sentry-disable-shell.patch` | Retargeted sqlite bundle to `sqlite-WcOhlxIC.js`; shell-side Sentry disable still applies. |
| `patches/sentry-disable-webview.patch` | Retargeted webview Sentry initialization to `app-initial~app-main~pull-request-code-review~onboarding-page~hotkey-window-thread-page~cha~b76hmflu-CeoeefuW.js` and set `enabled: !1`. |
| `patches/webview-app-host-services.patch` | Retargeted app-host service bridge to `app-initial~app-main~new-thread-panel-page~onboarding-page~login-route~appgen-library-page~~gpgl9un5-_t04Xpau.js`. |
| `patches/webview-app-host-services.patch` | Bypasses the upstream `connect-app-host` `MessageChannel` path when running under the browser shim and initializes app-host services directly from `window.__ELECTRON_SHIM__`. |
| `scripts/prepare_asar` | Re-enabled `webview-app-host-services.patch` after remapping it to the new upstream chunk. |
| `src/server/electron/index.ts` | Added a minimal `session.defaultSession.cookies` shim for upstream `DeviceCheck` startup code: `on/off/once/removeListener/get/set/remove/flushStore`. |
| `src/server/main.ts` | Added a fallback for nested `*/manifest.json` requests to serve the real manifest JSON instead of SPA `index.html`. |

Temporarily disabled patches requiring remap:

| Patch | Reason |
| --- | --- |
| `webview-thread-title.patch` | Hosted window title atom/state owner moved out of the old chunk. Needs new state owner mapping. |
| `webview-electron-shim-close-sidebar.patch` | Sidebar controller chunk was reshuffled. Needs `closeSidebar` hook remap. |
| `webview-prosemirror-inputmode.patch` | Composer editor factory moved into a minified shared chunk. Needs stable inputmode hook remap before re-enabling. |
| `webview-use-atfs-for-local-files.patch` | Path-display helper around the old `Dot/Eot` expression was rewritten. Needs semantic remap. |
| `webview-prompt-search-param.patch` | Home/new-thread composer was split across new chunks. Needs both prompt prefill call sites remapped. |

Validation performed:

| Check | Result |
| --- | --- |
| `prepare_asar` | Passed with enabled patches. |
| `npm run build:browser` | Passed. |
| `npm run build:server` | Passed. |
| Extracted version | `scratch/asar/package.json` reports `26.707.61608`. |
| First service start | Failed before the shim fix because upstream now calls `electron.session.defaultSession.cookies.on(...)`. |
| Shim fix validation | `npm run build:server` passed after adding the cookies shim. |
| Service restart | `mitty-space-codex.service` active and `codex-app-server-listen.service` active. |
| HTTP smoke test | `curl -I http://127.0.0.1:8214/` returned `200 OK`. |
| Manifest smoke test | `/manifest.json` and `/app/manifest.json` return `application/json`. |
| Sentry smoke test | Service logs after restart contain no `sentry-ipc` or `Sentry SDK failed` errors. |
| Frontend hang root cause | Upstream `initializeAppHostServices()` now waits on a `connect-app-host` `MessageChannel`; the browser shim's `ipcRenderer.postMessage()` ignores calls with transferred ports, so the promise never resolved and React root render never started. |
| Frontend hang validation | Headless browser check on `http://127.0.0.1:8214/` reported `hasStartupLoader=false`, `electronBridge=true`, no probe errors/rejections, and normal `__backend/ipc` websocket traffic. |
| Runtime log validation | Service logs contain `[statsig-refresh-diagnostics] React root render requested` followed by routed `thread/list`, `plugin/list`, `account/read`, and other app-server requests. |
| Reverse proxy mobile/cache fix | `/etc/nginx/sites-available/mitty-space` now serves `/lab/codex/app/assets/` directly from `scratch/asar/webview/assets/`; missing stale chunks return `404` instead of SPA `index.html`, preventing cached mobile entrypoints from hanging at the frontend-resource phase. |
| Reverse proxy validation | `/lab/codex/app/assets/preload.js` returns `200` with `private, no-cache`; real hashed chunks return `200` with immutable cache; missing nested chunks return `404` with `private, no-cache`. |
| Mobile proxy validation | Headless mobile browser check on `https://mitty.space/lab/codex/app/` through nginx reported `hasStartupLoader=false`, `hasMittyOverlay=false`, no network failures, and normal IPC websocket traffic. |
| Startup watchdog refinement | `/root/mitty-space-v2/public/codex-startup-watchdog.js` uses four real startup phases. The outer `/lab/codex` page owns `1/4 验证并打开 Codex`; the app watchdog advances to `2/4` when `.startup-loader` appears, `3/4` when it disappears, and `4/4` when Codex sidebar DOM is ready. |
| Startup injection timing | `/etc/nginx/sites-available/mitty-space` now injects `/codex-startup-watchdog.js` at the start of Codex's `<body>` instead of deferred before `</body>`, so the watchdog observes the real loader lifecycle instead of attaching after most startup DOM already exists. |
| Startup failure messaging | `/root/mitty-space-v2/src/app/lab/codex/status/page.tsx` now shows concise evidence-based failure text: trigger reason, current phase, and backend service status. It avoids speculative wording such as network fluctuation guesses. |
| Sidebar project grouping | Restored official persisted sidebar preference `flat-project-sidebar-preferences-v1.mode` from `list` to `project` and registered `/root/Documents/Codex` alongside `/root` in saved/active workspace roots and project order. Backup kept at `/root/.codex/.codex-global-state.json.bak-2026-07-13T03-18-58-226Z`. |
| Desktop startup validation | Headless desktop browser check on `https://mitty.space/lab/codex/app/` showed `2/4 准备前端资源` while `.startup-loader` existed, `3/4 建立 IPC bridge` after it disappeared, and final sidebar project rows for `dotex`, `pasar-eazylink`, `root`, and `Codex`. |
| Temporary download cleanup | Removed `/tmp/tmp.TBu9ELCMSP`. |
| Temporary download cleanup | Removed `/tmp/tmp.1wVAMNj4Yx`. |
| Temporary download cleanup | Removed partial retry directory `/tmp/tmp.F9n9QAlaDv`. |

Next update rule:

Before deleting the previous source on any future Codex core update, keep the old extracted source and compare old/new bundle maps, patch targets, and semantic anchors. Only remove the previous `scratch/asar` and `scratch/ChatGPT.app` after the new version has been extracted, patched, built, smoke-tested, and logged.

Auto-update research note:

Automatic core updates are feasible only as a staged pipeline: check official appcast, download to a staging path, extract to a separate staging source, compare bundle map changes, apply patches, run build and smoke tests, then swap and restart services only on success. A blind auto-update is not safe because several local patches target hashed/minified upstream bundles.
