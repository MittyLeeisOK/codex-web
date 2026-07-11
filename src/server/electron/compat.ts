import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import electronStub = require("./index.js");

const patchMarker = Symbol.for("codex-web.electron-compat-patched");
const patchedModule = electronStub as typeof electronStub & {
  [patchMarker]?: boolean;
};

type CodexAuthFile = {
  tokens?: {
    access_token?: unknown;
    account_id?: unknown;
  };
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

function getCodexAuthPath(): string {
  const codexHome = process.env.CODEX_HOME?.trim();
  if (codexHome) {
    return path.join(codexHome, "auth.json");
  }
  return path.join(os.homedir(), ".codex", "auth.json");
}

async function readCodexAuthHeaders(): Promise<{
  accessToken?: string;
  accountId?: string;
}> {
  try {
    const raw = await readFile(getCodexAuthPath(), "utf8");
    const auth = JSON.parse(raw) as CodexAuthFile;
    const accessToken = auth.tokens?.access_token;
    const accountId = auth.tokens?.account_id;
    return {
      accessToken:
        typeof accessToken === "string" && accessToken ? accessToken : undefined,
      accountId:
        typeof accountId === "string" && accountId ? accountId : undefined,
    };
  } catch (error) {
    console.warn(
      `[electron-main-stub] unable to read Codex auth file at ${getCodexAuthPath()}`,
      error instanceof Error ? error.message : String(error),
    );
    return {};
  }
}

function isChatGptRequest(input: string | URL): boolean {
  try {
    return new URL(String(input)).hostname === "chatgpt.com";
  } catch {
    return false;
  }
}

async function resolveElectronFetchInit(
  input: string | URL,
  init?: RequestInit,
): Promise<RequestInit | undefined> {
  const headers = new Headers(init?.headers);
  const attachAuth = headers.get("X-OpenAI-Attach-Auth") !== null;

  if (!attachAuth || !isChatGptRequest(input)) {
    return init;
  }

  const { accessToken, accountId } = await readCodexAuthHeaders();
  headers.delete("X-OpenAI-Attach-Auth");
  headers.delete("X-OpenAI-Attach-Integrity-State");

  if (accessToken && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }
  if (accountId && !headers.has("ChatGPT-Account-ID")) {
    headers.set("ChatGPT-Account-ID", accountId);
  }
  if (!headers.has("OAI-Product-Sku")) {
    headers.set("OAI-Product-Sku", "codex");
  }

  return {
    ...init,
    headers,
  };
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
    const resolvedInput = resolveElectronFetchInput(input);
    const resolvedInit = await resolveElectronFetchInit(resolvedInput, init);
    return originalFetch(resolvedInput, resolvedInit);
  };

  patchedModule[patchMarker] = true;
}

export = electronStub;
