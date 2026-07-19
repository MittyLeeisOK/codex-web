# Codex Core Update Assessment - 2026-07-18

Scope: assessment only. The running `/root/codex-web/scratch` tree was not
replaced.

Source checked:

| Item | Result |
| --- | --- |
| Official appcast | `https://persistent.oaistatic.com/codex-app-prod/appcast.xml` |
| Current embedded app | `26.707.61608` |
| Latest appcast app | `26.715.31925` |
| Sparkle version | `5551` |
| Published | `Sat, 18 Jul 2026 05:09:45 +0000` |
| Full package | `https://persistent.oaistatic.com/codex-app-prod/ChatGPT-darwin-arm64-26.715.31925.zip` |
| Full package size | `568215546` |
| Staging directory | `/tmp/codex-update-IpKSEv` |

CLI status:

| Item | Result |
| --- | --- |
| npm `@openai/codex` latest | `0.144.5` |
| npm `@openai/codex` alpha | `0.145.0-alpha.23` |
| Local CLI | `/root/.local/bin/codex`, `codex-cli 0.144.5` |
| Recommendation | Keep stable `0.144.5`; do not adopt alpha for this update. |

Patch compatibility dry run against `26.715.31925`:

| Patch | Result |
| --- | --- |
| `webview-favicon.patch` | Target exists; dry-run hunk succeeds with fuzz/offset. |
| `webview-preload.patch` | Target exists; dry-run succeeds. |
| `webview-style.patch` | Target exists; viewport hunk succeeds, injected style/script hunk fails because `index.html` changed. |
| `webview-pwa.patch` | Target exists; hunk fails because `index.html` changed. |
| `webview-remove-csp.patch` | Target exists; hunk fails because CSP injection moved. |
| `sentry-disable-shell.patch` | `worker.js` target exists but hunk fails; sqlite bundle target was renamed. |
| `sentry-disable-webview.patch` | Old webview chunk target missing. |
| `webview-app-host-services.patch` | Old app-host chunk target missing. |
| `webview-initial-route.patch` | Old page chunk target missing. |
| `webview-prompt-search-param.patch` | Both old target chunks missing. |
| `webview-prosemirror-inputmode.patch` | Old target chunk missing. |
| `webview-use-atfs-for-local-files.patch` | Old target chunk missing. |
| `webview-thread-title.patch` | Old target chunk missing. |
| `webview-electron-shim-close-sidebar.patch` | Old target chunk missing. |

Observed bundle churn:

| Metric | `26.707.61608` | `26.715.31925` |
| --- | ---: | ---: |
| webview size | `198M` | `189M` |
| top-level webview JS assets | `4596` | `4650` |
| removed asset filenames | `4617` | n/a |
| added asset filenames | n/a | `4681` |

Important new-version anchors:

| Anchor | Current location in `26.715.31925` |
| --- | --- |
| main HTML script | `webview/assets/index-Aq7izHxe.js` |
| `initializeAppHostServices` | `webview/assets/rpc-Xf3qsQTf.js` |
| `connect-app-host` | `webview/assets/app-initial~avatarOverlayCompositionSurface~artifact-tab-content.electron~notebook-preview-~l16cgjx9-CcJF-AY4.js`; also `.vite/build/preload.js` and `.vite/build/window-all-closed-CZr9g6FK.js` |
| `initialRoute` | multiple chunks, including `webview/assets/app-initial~app-main~appgen-settings-page~page~appgen-library-page~appgen-page~appgen-setti~ogh9jurw-Ccxu2qV_.js` |
| `Sentry.init` | `webview/assets/app-initial~artifact-tab-content.electron~notebook-preview-panel~app-main~appgen-settings-p~jj50pjos-D3LKdNnF.js`; `.vite/build/window-all-closed-CZr9g6FK.js` |
| `DeviceCheck` | `.vite/build/main-DvTOqeoA.js`, `.vite/build/preload.js`, `.vite/build/src-DU0S2Fqi.js`, and related webview chunks |
| `cookies.on` | `.vite/build/main-DvTOqeoA.js` |
| `flat-project-sidebar-preferences-v1` | `webview/assets/app-initial~artifact-tab-content.electron~app-main~pull-request-code-review~new-thread-pane~kxdmdety-BYDpRpQS.js` |

Validation performed:

| Check | Result |
| --- | --- |
| Download latest full package | Completed in staging. |
| Extract app package and `app.asar` | Completed in staging. |
| Parse staged package version | `openai-codex-electron 26.715.31925`. |
| Existing patch dry-run on staged source | Mostly failed; see table above. |
| Current local electron compat smoke test | Passed. |
| Current local `npm run build:server` | Passed. |
| Current `mitty-space-codex.service` | Active. |
| Current `codex-app-server-listen.service` | Active. |
| Current local HTTP smoke test | `curl -I http://127.0.0.1:8214/` returned `200 OK`. |

Assessment:

This update is worth adapting, but it should be handled as a staged remap, not
a direct version bump. The CLI is already current, while the Desktop webview has
enough bundle churn that most local patches no longer apply. The high-risk item
is still app-host service initialization: `initializeAppHostServices()` moved
into `rpc-Xf3qsQTf.js`, and the `connect-app-host` / `MessageChannel` path still
exists. The previous browser-shim bypass must be remapped before deployment, or
the frontend can hang before React renders.

Recommended next step:

1. Keep production on `26.707.61608` until the staged tree is fully patched.
2. Remap HTML patches first: viewport/mobile CSS, preload, favicon, PWA,
   manifest, CSP removal.
3. Remap the required runtime patches next: app-host service bridge,
   initial-route fallback, shell/webview Sentry disable.
4. Treat the previously disabled convenience patches as optional:
   thread title, close sidebar, prosemirror inputmode, ATFS local file display,
   prompt query-param prefill.
5. Run `prepare_asar`, `npm run build:browser`, `npm run build:server`,
   headless browser startup checks, nginx asset/cache checks, and systemd smoke
   tests before swapping production.
