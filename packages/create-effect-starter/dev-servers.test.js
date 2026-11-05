import assert from "node:assert/strict";
import { test } from "node:test";

import { waitForDevServers } from "./dev-servers.js";

const apiUrl = "http://127.0.0.1:1/api/health";
const webUrl = "http://127.0.0.1:2";
const proxyUrl = `${webUrl}/api/health`;

function fakeResponse(status, body = "") {
  return {
    ok: status >= 200 && status <= 299,
    status,
    body,
    json() {
      return Promise.resolve(JSON.parse(this.body));
    },
  };
}

function scriptedResponse(steps) {
  const calls = [];
  return {
    calls,
    response: async (url) => {
      calls.push(url);
      const step = steps.shift();
      if (step instanceof Error) throw step;
      return step;
    },
  };
}

void test("returns all three responses once the proxy is healthy", async () => {
  const api = fakeResponse(200, '{"ok":true,"service":"api"}');
  const web = fakeResponse(200, '<div id="root">');
  const proxy = fakeResponse(200, '{"ok":true,"service":"api"}');
  const { response, calls } = scriptedResponse([api, web, proxy]);

  assert.deepEqual(await waitForDevServers({ response, apiUrl, webUrl }), {
    ready: true,
    api,
    web,
    proxy,
  });
  assert.deepEqual(calls, [apiUrl, webUrl, proxyUrl]);
});

void test("retries while the proxy returns the empty 502 emitted during an API restart", async () => {
  // The dev API restarts when its source changes; while it is down the proxy
  // fails with an empty body. Parsing that body used to throw
  // "SyntaxError: Unexpected end of JSON input".
  const restarting = fakeResponse(502);
  const api = fakeResponse(200, '{"ok":true,"service":"api"}');
  const web = fakeResponse(200, '<div id="root">');
  const proxy = fakeResponse(200, '{"ok":true,"service":"api"}');
  const { response } = scriptedResponse([api, web, restarting, api, web, proxy]);

  const result = await waitForDevServers({ response, apiUrl, webUrl });
  // The verifier parses this body; the empty 502 body throws instead.
  assert.deepEqual(await result.proxy.json(), { ok: true, service: "api" });
  assert.deepEqual(await result.api.json(), { ok: true, service: "api" });
});

void test("does not request the proxy before the API and web server respond", async () => {
  const api = fakeResponse(200, '{"ok":true,"service":"api"}');
  const web = fakeResponse(200, '<div id="root">');
  const proxy = fakeResponse(200, '{"ok":true,"service":"api"}');
  const { response, calls } = scriptedResponse([undefined, fakeResponse(200), api, web, proxy]);

  await waitForDevServers({ response, apiUrl, webUrl });
  assert.deepEqual(calls, [apiUrl, webUrl, apiUrl, webUrl, proxyUrl]);
});

void test("does not report a proxy status when the proxy was never probed", async () => {
  // Only a healthy API and web server justify probing the proxy.
  const { response, calls } = scriptedResponse([undefined, fakeResponse(200)]);

  assert.deepEqual(await waitForDevServers({ response, apiUrl, webUrl, timeoutMs: 0 }), {
    ready: false,
    reason: "timeout",
    proxyStatus: undefined,
  });
  assert.deepEqual(calls, [apiUrl, webUrl]);
});

void test("reports the last proxy status when the servers never become ready", async () => {
  const api = fakeResponse(200, '{"ok":true,"service":"api"}');
  const web = fakeResponse(200, '<div id="root">');
  const { response } = scriptedResponse([api, web, fakeResponse(502)]);

  assert.deepEqual(await waitForDevServers({ response, apiUrl, webUrl, timeoutMs: 0 }), {
    ready: false,
    reason: "timeout",
    proxyStatus: 502,
  });
});

void test("reports an exited dev process instead of a timeout", async () => {
  const { response, calls } = scriptedResponse([undefined, undefined]);

  assert.deepEqual(
    await waitForDevServers({
      response,
      apiUrl,
      webUrl,
      shouldStop: () => true,
    }),
    { ready: false, reason: "exited", proxyStatus: undefined },
  );
  assert.deepEqual(calls, [apiUrl, webUrl]);
});

void test("without a frontend only waits for the API", async () => {
  const api = fakeResponse(200, '{"ok":true,"service":"api"}');
  const { response, calls } = scriptedResponse([undefined, api]);

  assert.deepEqual(await waitForDevServers({ response, apiUrl }), { ready: true, api });
  assert.deepEqual(calls, [apiUrl, apiUrl]);
});
