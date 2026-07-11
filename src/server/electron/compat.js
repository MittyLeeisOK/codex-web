"use strict";
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
        return originalFetch(resolveElectronFetchInput(input), init);
    };

    electronStub[patchMarker] = true;
}

module.exports = electronStub;
