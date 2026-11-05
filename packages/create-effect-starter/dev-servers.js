// Waits for a generated project's dev servers to become usable.
//
// The API's runtime `--watch` restarts it whenever its source or a workspace
// package changes. While the API process is down, the web dev server answers
// `/api` requests with an empty 502, so readiness must require an `ok` proxy response instead of parsing the
// body unconditionally. Transient failures are retried until the deadline.
// Without a `webUrl` (projects without a frontend), only the API must be ready.
export async function waitForDevServers({
  response,
  apiUrl,
  webUrl,
  shouldStop = () => false,
  timeoutMs = 60_000,
  delay = async () => {},
}) {
  const deadline = Date.now() + timeoutMs;
  let proxyStatus;
  for (;;) {
    const api = await response(apiUrl);
    if (!webUrl && api?.ok) return { ready: true, api };
    const web = webUrl ? await response(webUrl) : undefined;
    const proxy = api?.ok && web?.ok ? await response(`${webUrl}/api/health`) : undefined;
    if (api?.ok && web?.ok && proxy?.ok) return { ready: true, api, web, proxy };
    if (proxy) proxyStatus = proxy.status;
    if (shouldStop()) return { ready: false, reason: "exited", proxyStatus };
    if (Date.now() >= deadline) return { ready: false, reason: "timeout", proxyStatus };
    await delay();
  }
}
