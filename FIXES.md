# Confirmed compatibility fixes

This branch addresses failures reproduced while running codex-web behind a reverse-proxy subpath.

## Electron BrowserWindow compatibility

The ChatGPT desktop main bundle calls `BrowserWindow.isVisible()`. The web Electron stub did not implement that method, causing:

```text
TypeError: t.isVisible is not a function
```

The compatibility wrapper adds visibility tracking across `show()`, `hide()`, and `destroy()` without changing the generated Electron stub.

## Electron net.fetch relative URLs

Electron accepts backend-relative requests such as `/wham/usage`, while Node's global `fetch()` requires an absolute URL. The old stub forwarded relative paths directly and the application surfaced HTTP 500 responses for account, usage, profile, task, onboarding, Statsig bootstrap, and beacon requests.

The wrapper now resolves:

```text
/wham/usage                 -> https://chatgpt.com/backend-api/wham/usage
/backend-api/ps/plugins/... -> https://chatgpt.com/backend-api/ps/plugins/...
```

Absolute URLs and request options, including headers and bodies, are preserved.

## Reverse-proxy subpath PWA support

The generated webview linked to `/manifest.json`, and the manifest also used root-relative paths. Under a deployment such as `/lab/codex/app/`, those requests escaped the application prefix and could return HTML, producing a manifest JSON syntax error.

The manifest URL, scope, start URL, share target, and icon URL are now relative to the deployed application path.

## Validation

Run:

```bash
npm run build:server
npm run test:electron-compat
```

Then load the application and verify that logs no longer contain `isVisible is not a function` or HTTP 500 responses for `/wham/*` requests.

Plugin and app catalog 30-second timeouts are intentionally not masked here. Direct authenticated API and standalone app-server tests succeeded, so those calls should be re-tested after this compatibility layer is deployed before changing app-server behavior.
