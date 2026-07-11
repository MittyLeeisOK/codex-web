"use strict";
const { readFile } = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const electronStub = require("./index.js");
const patchMarker = Symbol.for("codex-web.electron-compat-patched");

function resolveElectronFetchInput(input) {
    if (input instanceof URL || typeof input !== "string" || !input.startsWith("/")) {
        return input;
    }
    if (input.startsWith("/backend-api/")) {
        return `https://chatgpt.com${input}`;
    }
    return `https://chatgpt.com/backend-api${input}`;
}

function getCodexAuthPath() {
    const codexHome = process.env.CODEX_HOME?.trim();
    if (codexHome) {
        return path.join(codexHome, "auth.json");
    }
    return path.join(os.homedir(), ".codex", "auth.json");
}

async function readCodexAuthHeaders() {
    try {
        const raw = await readFile(getCodexAuthPath(), "utf8");
        const auth = JSON.parse(raw);
        const accessToken = auth.tokens?.access_token;
        const accountId = auth.tokens?.account_id;
        return {
            accessToken: typeof accessToken === "string" && accessToken ? accessToken : undefined,
            accountId: typeof accountId === "string" && accountId ? accountId : undefined,
        };
    }
    catch (error) {
        console.warn(
            `[electron-main-stub] unable to read Codex auth file at ${getCodexAuthPath()}`,
            error instanceof Error ? error.message : String(error),
        );
        return {};
    }
}

function isChatGptRequest(input) {
    try {
        return new URL(String(input)).hostname === "chatgpt.com";
    }
    catch {
        return false;
    }
}

async function resolveElectronFetchInit(input, init) {
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

if (!electronStub[patchMarker]) {
    const visibility = new WeakMap();
    const prototype = electronStub.BrowserWindow.prototype;

    if (typeof prototype.isVisible !== "function") {
        const originalDestroy = prototype.destroy;
        const originalHide = prototype.hide;
        const originalIsDestroyed = prototype.isDestroyed;
        const originalShow = prototype.show;

        prototype.show = function show(...args) {
            visibility.set(this, true);
            return originalShow.apply(this, args);
        };
        prototype.hide = function hide(...args) {
            visibility.set(this, false);
            return originalHide.apply(this, args);
        };
        prototype.destroy = function destroy(...args) {
            visibility.set(this, false);
            return originalDestroy.apply(this, args);
        };
        prototype.isVisible = function isVisible() {
            return !originalIsDestroyed.call(this) && (visibility.get(this) ?? true);
        };
    }

    const originalFetch = electronStub.net.fetch.bind(electronStub.net);
    electronStub.net.fetch = async function fetch(input, init) {
        const resolvedInput = resolveElectronFetchInput(input);
        const resolvedInit = await resolveElectronFetchInit(resolvedInput, init);
        return originalFetch(resolvedInput, resolvedInit);
    };

    electronStub[patchMarker] = true;
}

module.exports = electronStub;
