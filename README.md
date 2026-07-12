# codex-web

a browser frontend for codex desktop, running on a machine you control.

https://github.com/user-attachments/assets/0a33cbd8-741c-412c-9e75-46dfe9324596

## motivation

the agents were never meant to stay trapped in a terminal window for long.
codex desktop brought the power of agents to your local computer, where your
files, credentials, and tools already live.

codex-web brings codex desktop to the browser while keeping the backend on a
machine you control (a linux box in the cloud, your home lab, or a desktop / mac
mini). agents keep running after your laptop closes. you can reconnect from any
device with a browser.

this project aims to be as thin a wrapper as possible to ensure upstream changes
to the codex desktop app can be integrated quickly.

## usage

`codex-web` serves the browser client and hosts the desktop-side bridge. by
default, it listens on `127.0.0.1:8214`.

it will use `codex` from `PATH` if available, or `CODEX_CLI_PATH` if you set
it.

run it with `npx`:

```bash
npx --yes github:0xcaff/codex-web
```

or with nix:

```bash
nix run github:0xcaff/codex-web
```

then open <http://127.0.0.1:8214> in a browser.

### sign in

ensure the codex cli on the host machine is signed in before starting the
server.

```bash
codex login --device-auth
```

### proxying to app-server (advanced usage)

it’s often useful to run the app server separately, so a crash or restart of
codex-web doesn’t interrupt the codex process executing commands.

it's possible to hook codex-web up to an already-running app server using the
`codex_remote_proxy` script.

start a long-lived app server somewhere:

```bash
mkdir -p /tmp/codex-app-server
cd /tmp/codex-app-server
codex app-server --listen unix://codex-app-server.sock
```

then run `codex-web` with the proxy helper:

```bash
nix shell github:0xcaff/codex-web github:0xcaff/codex-web#codex_remote_proxy -c bash -lc '
  export CODEX_UNIX_SOCKET=/tmp/codex-app-server/codex-app-server.sock
  export CODEX_CLI_PATH="$(command -v codex_remote_proxy)"
  codex-web
'
```

`codex app-server proxy --sock ...` is a raw stdio protocol bridge for another
program to use; when run directly in a terminal it will wait for protocol input
rather than opening an interactive prompt.

## reverse proxying under a path prefix

codex-web's built webview has no subpath/basePath support: `index.html` and
its compiled JS chunks reference `/assets/...`, `/manifest.json`, and the
`/__backend/*` IPC endpoints as **absolute root paths**, regardless of where
`index.html` itself was fetched from. if you're putting `codex-web` behind a
reverse proxy under a prefix (e.g. `https://your-domain/lab/codex/` instead
of at the domain root), keep the following in mind.

### proxy every root-level path the app references, not just the prefix

a proxy block for your chosen prefix alone (e.g. `location /lab/codex/ { proxy_pass ...; }`)
is not enough. you also need matching blocks for the root-level paths the
built assets hard-reference: `/assets/`, `/manifest.json`, `/favicon.svg`, and
`/__backend/ipc` (websocket) + `/__backend/upload`. list what codex-web
actually ships (`ls scratch/asar/webview/`) and mirror each top-level
file/directory with its own proxy or static-file location block - anything
missed 404s and the app hangs on its loading screen indefinitely.

`/__backend/ipc` is a websocket connection and needs the upgrade headers:

```nginx
location = /__backend/ipc {
    proxy_pass http://127.0.0.1:8214;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_read_timeout 3600s;
}
```

### `/thread/<id>` URLs are proxied at the domain root, not your prefix

codex-web pushes conversation URLs into browser history as `/thread/<id>`
(not under your chosen prefix), so a direct refresh of that URL must also
resolve to the app - proxy `/thread/` itself, and mirror the same
`/assets/`, `/manifest.json`, `/favicon.svg` blocks under `/thread/` too,
since the browser resolves the app's relative asset paths against
`/thread/<id>` when that's the current URL.

### the app's internal "home" route needs your prefix, not `/`

as of this writing, `src/browser/routes.ts` computes the browser-visible path
for the app's internal home route from `window.location.pathname` at load
time (falling back to a hardcoded default only for the root-proxied
`/thread/<id>` entry point). if you're running an older build that hardcodes
this to `"/"` instead: any internal navigation that passes through the home
route (opening and closing the settings panel does) will silently rewrite
the browser's address bar to the domain root via `pushState` - no page
reload, so nothing looks wrong until the user hits refresh and lands on
whatever your domain root actually serves instead of codex-web. rebuild from
a current checkout if you hit this.

### `gzip_static` serves stale compressed assets after a rebuild

if your proxy serves codex-web's static assets directly (rather than
proxying everything to the node process) and uses nginx's `gzip_static`
module for them, note that it serves a prebuilt `.gz` sibling file whenever
one exists, **without checking that it's newer than the source file**. after
rebuilding (`npm run build:browser`), regenerate any `.gz` siblings for
changed files (e.g. `gzip -k -f -9 assets/preload.js`) or clients will keep
being served the old bundle despite the on-disk `.js` file being current.

## security

run `codex-web` only on trusted networks. treat anyone who can reach the
`codex-web` server as someone who can operate codex on the host machine as the
same user running the server.

if you need authn or authz, implement it outside of `codex-web`: proxy it through
wireguard, tailscale, or an ssh tunnel and put an authentication gateway or
reverse proxy in front.

someone with access to the web ui may be able to:

- run commands on the host, limited only by the permissions of the `codex-web`
  server process.
- read or modify files, environment variables, credentials, ssh keys, and other
  local resources that are accessible to that process.
- use the codex / chatgpt account already signed in on the host. this may
  consume usage quota or billing credits, and may expose account metadata shown
  by the app or cli, such as name or email address.

## features

- hostable on macOS, Linux (and anything codex cli + node will run on)
- reachable from the browser
- thin wrapper, so updates should land fast
- working today:
  - subagents
  - inline images
  - editor sidepanel
  - transcription

## roadmap

some parts of the desktop experience are not wired up yet:

- browser panel support, likely rebuilt around iframes
- computer use on linux, which could become a very powerful feature
- terminal support
- git worker integration
- whatever else people find and file issues for

## issues welcome

if something is broken, missing, or rough around the edges, please file an
issue.

using `codex-web` in an interesting way? post about it on x and tag me
[@0xcaff](https://x.com/0xcaff).

using this at a company and need something more tailored? email me and we can
talk.

## alternatives

* [davej/pocodex](https://github.com/davej/pocodex) i used this until the wheels fell off. i needed subagents
  and an inline image viewer. this didn't have them and was having a hard time
  keeping up with upstream codex updates.
* the native codex remote feature (behind a feature flag) is great for
  connecting to remote codex hosts over ssh to manage long running tasks but
  this only works if you have codex desktop on your client device. this means it
  doesn't work on mobile.
* upcoming first party mobile app from openai. `codex-web` exists and works
  today. i can't wait for the mobile app but judging by the other openai mobile
  apps, i'm a little bit skeptical about the quality of the mobile experience.
  time will tell.
