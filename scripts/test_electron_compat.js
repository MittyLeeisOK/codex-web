#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

async function main() {
  const originalFetch = globalThis.fetch;
  const originalCodexHome = process.env.CODEX_HOME;
  const originalHttpsProxy = process.env.HTTPS_PROXY;
  const codexHome = fs.mkdtempSync(path.join(os.tmpdir(), "codex-web-auth-"));
  const requests = [];

  fs.writeFileSync(
    path.join(codexHome, "auth.json"),
    JSON.stringify({
      tokens: {
        access_token: "test-access-token",
        account_id: "test-account-id",
      },
    }),
    { mode: 0o600 },
  );
  process.env.CODEX_HOME = codexHome;
  process.env.HTTPS_PROXY = "http://127.0.0.1:7892";

  globalThis.fetch = async (input, init) => {
    requests.push({ input: String(input), init });
    return new Response("{}", {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    const electron = require("../src/server/electron/compat.js");
    const broadcasts = [];
    globalThis.__codexElectronIpcBridge.broadcastToRenderer = (message) => {
      broadcasts.push(message);
    };

    const window = new electron.BrowserWindow();
    const secondaryWindow = new electron.BrowserWindow();

    assert.deepEqual(
      electron.BrowserWindow.getAllWindows().map((candidate) => candidate.id),
      [window.id],
    );
    assert.equal(electron.BrowserWindow.getFocusedWindow()?.id, window.id);
    assert.equal(electron.BrowserWindow.fromId(window.id)?.id, window.id);
    assert.equal(electron.BrowserWindow.fromId(secondaryWindow.id), null);
    assert.deepEqual(
      electron.webContents.getAllWebContents().map((candidate) => candidate.id),
      [window.webContents.id],
    );
    secondaryWindow.focus();
    assert.equal(electron.BrowserWindow.getFocusedWindow()?.id, window.id);

    window.webContents.send("codex:test", { source: "primary" });
    secondaryWindow.webContents.send("codex:test", { source: "secondary" });
    assert.deepEqual(broadcasts, [
      {
        type: "ipc-main-event",
        channel: "codex:test",
        args: [{ source: "primary" }],
      },
    ]);

    await secondaryWindow.webContents.loadURL("http://localhost:5175/local/test");
    assert.deepEqual(broadcasts.at(-1), {
      type: "open-browser-url",
      url: "http://localhost:5175/local/test",
    });

    electron.ipcMain.handle("codex:test:sanitize", (_event, payload) => payload);
    const sanitizedPayload =
      await globalThis.__codexElectronIpcBridge.handleRendererInvoke(
        "codex:test:sanitize",
        [
          {
            headers: {
              "X-OpenAI-Attach-Auth": "true",
              "X-OpenAI-Attach-Desktop-Surface": "true",
              "X-OpenAI-Attach-DeviceCheck-Token": "true",
              "X-OpenAI-Attach-Integrity-State": "true",
            },
          },
        ],
      );
    assert.deepEqual(sanitizedPayload.headers, {
      "X-OpenAI-Attach-Auth": "true",
    });

    assert.equal(window.isVisible(), true);
    window.hide();
    assert.equal(window.isVisible(), false);
    window.show();
    assert.equal(window.isVisible(), true);
    window.destroy();
    assert.equal(window.isVisible(), false);

    await electron.net.fetch("/wham/usage", {
      headers: {
        "x-test-header": "preserved",
        "X-OpenAI-Attach-Auth": "true",
        "X-OpenAI-Attach-DeviceCheck-Token": "true",
        "X-OpenAI-Attach-Integrity-State": "true",
      },
    });
    await electron.net.fetch("/celsius/ws/user", {
      headers: {
        "X-OpenAI-Attach-Auth": "true",
        "X-OpenAI-Attach-DeviceCheck-Token": "true",
        "X-OpenAI-Attach-Integrity-State": "true",
      },
    });
    await electron.net.fetch("/backend-api/ps/plugins/list");
    await electron.net.fetch("https://example.com/absolute");
    await electron.net.fetch("https://chatgpt.com/backend-api/test", {
      headers: {
        "User-Agent": "Codex Desktop/test",
      },
    });
    await electron.net.fetch("https://chatgpt.com/backend-api/already-authed", {
      headers: {
        Authorization: "Bearer existing-token",
        "X-OpenAI-Attach-DeviceCheck-Token": "true",
        "X-OpenAI-Attach-Integrity-State": "true",
      },
    });

    assert.equal(
      requests[0].input,
      "https://chatgpt.com/backend-api/wham/usage",
    );
    assert.equal(
      requests[1].input,
      "https://chatgpt.com/celsius/ws/user",
    );
    assert.equal(
      requests[2].input,
      "https://chatgpt.com/backend-api/ps/plugins/list",
    );
    assert.equal(requests[3].input, "https://example.com/absolute");

    const headers = new Headers(requests[0].init.headers);
    assert.equal(headers.get("x-test-header"), "preserved");
    assert.equal(headers.get("authorization"), "Bearer test-access-token");
    assert.equal(headers.get("chatgpt-account-id"), "test-account-id");
    assert.equal(headers.get("oai-product-sku"), "codex");
    assert.equal(headers.get("accept"), "application/json");
    assert.match(headers.get("user-agent"), /Chrome\/120/);
    assert.equal(headers.has("x-openai-attach-auth"), false);
    assert.equal(headers.has("x-openai-attach-devicecheck-token"), false);
    assert.equal(headers.has("x-openai-attach-integrity-state"), false);

    const celsiusHeaders = new Headers(requests[1].init.headers);
    assert.equal(celsiusHeaders.has("x-openai-attach-auth"), false);
    assert.equal(celsiusHeaders.has("x-openai-attach-devicecheck-token"), false);
    assert.equal(celsiusHeaders.has("x-openai-attach-integrity-state"), false);
    assert.equal(celsiusHeaders.get("authorization"), "Bearer test-access-token");

    const unauthenticatedChatGptHeaders = new Headers(requests[2].init.headers);
    assert.equal(unauthenticatedChatGptHeaders.get("accept"), "application/json");
    assert.match(unauthenticatedChatGptHeaders.get("user-agent"), /Chrome\/120/);
    assert.ok(requests[3].init.dispatcher);
    const overriddenChatGptHeaders = new Headers(requests[4].init.headers);
    assert.match(overriddenChatGptHeaders.get("user-agent"), /Chrome\/120/);
    const alreadyAuthedHeaders = new Headers(requests[5].init.headers);
    assert.equal(alreadyAuthedHeaders.get("authorization"), "Bearer existing-token");
    assert.equal(alreadyAuthedHeaders.has("x-openai-attach-devicecheck-token"), false);
    assert.equal(alreadyAuthedHeaders.has("x-openai-attach-integrity-state"), false);

    console.log("Electron compatibility smoke test passed");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalCodexHome === undefined) {
      delete process.env.CODEX_HOME;
    } else {
      process.env.CODEX_HOME = originalCodexHome;
    }
    if (originalHttpsProxy === undefined) {
      delete process.env.HTTPS_PROXY;
    } else {
      process.env.HTTPS_PROXY = originalHttpsProxy;
    }
    fs.rmSync(codexHome, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
