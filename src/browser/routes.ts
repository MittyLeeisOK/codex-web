// The browser path this SPA is actually mounted at (e.g. "/lab/codex/app/"
// when reverse-proxied under a path prefix, or "/" for a bare-root deploy).
// Captured once at module load - i.e. from the real address-bar URL the user
// is looking at before any client-side navigation runs - so that mapping the
// *internal* "/" (home) route back to a browser path never collapses onto
// the domain root. Doing that instead of hardcoding "/" is what previously
// caused Settings (whose internal route stack can transiently pass through
// "/") to silently rewrite the address bar from "/lab/codex/app/" to "/" via
// pushState (no reload, url unchanged from the user's POV) - so a later
// browser refresh reloaded the site's actual homepage instead of codex-web.
//
// A "/thread/<id>" entry point is proxied at the domain root regardless of
// mount prefix (see the nginx comment on the /thread/ location block), so it
// carries no information about the prefix; fall back to the app's known
// public mount path in that case.
const FALLBACK_HOME_BROWSER_PATH = "/lab/codex/app/";

const homeBrowserPath: string = (() => {
  if (typeof window === "undefined") return FALLBACK_HOME_BROWSER_PATH;

  const { pathname } = window.location;
  if (/^\/thread\/([^/]+)$/.test(pathname)) {
    return FALLBACK_HOME_BROWSER_PATH;
  }

  return pathname || FALLBACK_HOME_BROWSER_PATH;
})();

export function mapBrowserPathToInitialRoute(pathname: string, search: string) {
  if (pathname === "/share/receive" && search) {
    const params = new URLSearchParams(search);

    const prompt = ["title", "text", "url"]
      .flatMap((name) => {
        const value = params.get(name);
        return value === null ? [] : [`${name}: ${value}`];
      })
      .join("\n");

    return {
      memoryPath: prompt
        ? `/?${new URLSearchParams({ prompt }).toString()}`
        : "/",
      browserPath: homeBrowserPath,
    };
  }

  return {
    memoryPath: mapBrowserPathToRoute(pathname),
  };
}

function mapBrowserPathToRoute(pathname: string): string {
  const match = pathname.match(/^\/thread\/([^/]+)$/);
  if (match) {
    try {
      return `/local/${decodeURIComponent(match[1])}`;
    } catch {
      return "/";
    }
  }

  return "/";
}

export function mapMemoryPathToBrowserPath(pathname: string) {
  if (pathname === "/") {
    return { path: homeBrowserPath, titleChange: "Codex" };
  }

  const match = pathname.match(/^\/local\/([^/?#]+)$/);
  if (!match) {
    return null;
  }

  return { path: `/thread/${encodeURIComponent(match[1])}` };
}

export function dispatchNavigateToRoute(path: string): void {
  window.dispatchEvent(
    new MessageEvent("message", {
      data: {
        type: "navigate-to-route",
        path,
      },
    }),
  );
}

window.addEventListener("popstate", () => {
  dispatchNavigateToRoute(mapBrowserPathToRoute(window.location.pathname));
});
