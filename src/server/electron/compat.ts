import electronStub = require("./index.js");

const patchMarker = Symbol.for("codex-web.electron-compat-patched");
const patchedModule = electronStub as typeof electronStub & {
  [patchMarker]?: boolean;
};

function resolveElectronFetchInput(input: string | URL): string | URL {
  if (input instanceof URL || !input.startsWith("/")) {
    return input;
  }

  if (input.startsWith("/backend-api/")) {
    return `https://chatgpt.com${input}`;
  }

  return `https://chatgpt.com/backend-api${input}`;
}

if (!patchedModule[patchMarker]) {
  const visibility = new WeakMap<object, boolean>();
  const BrowserWindow = electronStub.BrowserWindow;
  const prototype = BrowserWindow.prototype as unknown as {
    destroy: (...args: unknown[]) => unknown;
    hide: (...args: unknown[]) => unknown;
    isDestroyed: (...args: unknown[]) => boolean;
    isVisible?: (...args: unknown[]) => boolean;
    show: (...args: unknown[]) => unknown;
  };

  if (typeof prototype.isVisible !== "function") {
    const originalDestroy = prototype.destroy;
    const originalHide = prototype.hide;
    const originalIsDestroyed = prototype.isDestroyed;
    const originalShow = prototype.show;

    prototype.show = function show(
      this: object,
      ...args: unknown[]
    ): unknown {
      visibility.set(this, true);
      return originalShow.apply(this, args);
    };

    prototype.hide = function hide(
      this: object,
      ...args: unknown[]
    ): unknown {
      visibility.set(this, false);
      return originalHide.apply(this, args);
    };

    prototype.destroy = function destroy(
      this: object,
      ...args: unknown[]
    ): unknown {
      visibility.set(this, false);
      return originalDestroy.apply(this, args);
    };

    prototype.isVisible = function isVisible(this: object): boolean {
      return !originalIsDestroyed.call(this) && (visibility.get(this) ?? true);
    };
  }

  const originalFetch = electronStub.net.fetch.bind(electronStub.net);
  electronStub.net.fetch = async function fetch(
    input: string | URL,
    init?: RequestInit,
  ): Promise<Response> {
    return originalFetch(resolveElectronFetchInput(input), init);
  };

  patchedModule[patchMarker] = true;
}

export = electronStub;
