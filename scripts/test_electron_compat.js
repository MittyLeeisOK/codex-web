#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

async function main() {
  const originalFetch = globalThis.fetch;
  const originalCodexHome = process.env.CODEX_HOME;
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

  globalThis.fetch = async (input, init) => {
    requests.push({ input: String(input), init });
    return new Response("{}", {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    const electron = require("../src/server/electron/compat.js");
    const window = new electron.BrowserWindow();

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
        "X-OpenAI-Attach-Integrity-State": "true",
      },
    });
    await electron.net.fetch("/backend-api/ps/plugins/list");
    await electron.net.fetch("https://example.com/absolute");

    assert.equal(
      requests[0].input,
      "https://chatgpt.com/backend-api/wham/usage",
    );
    assert.equal(
      requests[1].input,
      "https://chatgpt.com/backend-api/ps/plugins/list",
    );
    assert.equal(requests[2].input, "https://example.com/absolute");

    const headers = new Headers(requests[0].init.headers);
    assert.equal(headers.get("x-test-header"), "preserved");
    assert.equal(headers.get("authorization"), "Bearer test-access-token");
    assert.equal(headers.get("chatgpt-account-id"), "test-account-id");
    assert.equal(headers.get("oai-product-sku"), "codex");
    assert.equal(headers.has("x-openai-attach-auth"), false);
    assert.equal(headers.has("x-openai-attach-integrity-state"), false);

    console.log("Electron compatibility smoke test passed");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalCodexHome === undefined) {
      delete process.env.CODEX_HOME;
    } else {
      process.env.CODEX_HOME = originalCodexHome;
    }
    fs.rmSync(codexHome, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
