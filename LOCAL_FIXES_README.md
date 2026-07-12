# Local Fixes Summary

Compared:

- Upstream: `0xcaff/codex-web@origin/main`
- Your fork: `MittyLeeisOK/codex-web@mitty/main` (`4cd5e28`)
- Local install: `mitty/main` plus the proxy fix below

## Useful fixes from your fork

- `src/server/electron/compat.ts`: adds an Electron compatibility wrapper.
  - Implements `BrowserWindow.isVisible()`.
  - Converts Electron-style relative `net.fetch()` URLs to `https://chatgpt.com/backend-api/...`.
  - Attaches Codex auth from `~/.codex/auth.json` to ChatGPT backend requests.
- `assets/manifest.json` and `patches/webview-pwa.patch`: make PWA paths relative, which is useful behind `/lab/codex/app/`.
- `src/browser/shim.ts` plus `webview-statsig-override-adapter.patch`: keeps Codex desktop gates usable in the web shim.
- `scripts/test_electron_compat.js`: useful smoke test for the wrapper.

## Useful local-only fix

- `src/server/electron/index.ts`: Node `fetch()` ignored `https_proxy`; local code now uses Undici `ProxyAgent` for `http_proxy` / `https_proxy` and respects `NO_PROXY`.
  - Before: `electron.net.fetch("https://chatgpt.com/...")` timed out after ~10s.
  - After: same request returns `200` in a few hundred ms.

## Mostly non-runtime or less useful

- `.github/*`: CI and templates only.
- `FIXES.md`: documentation only.
- Generated `src/server/**/*.js`, `*.d.ts`, `*.map`: build output required by the running service, but not source-level fixes.
- Your fork does not include upstream `#24` (`Fix file output rendering in browser`); unrelated to startup/proxy, but probably worth merging later.

