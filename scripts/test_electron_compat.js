#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");

async function main() {
  const originalFetch = globalThis.fetch;
  const requests = [];

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
      headers: { "x-test-header": "preserved" },
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
    assert.equal(requests[0].init.headers["x-test-header"], "preserved");

    console.log("Electron compatibility smoke test passed");
  } finally {
    globalThis.fetch = originalFetch;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
