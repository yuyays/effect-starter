import { createServer } from "node:http";

// Node's `server.close()` only drops connections that are idle at that moment, so a
// keep-alive client that keeps polling (a browser tab, the dev proxy) holds shutdown
// open indefinitely. Once the server stops listening, each connection closes after its
// current response; in-flight requests still finish.
export const createApiServer = () => {
  const server = createServer();
  server.on("request", (_request, response) => {
    if (!server.listening) response.shouldKeepAlive = false;
  });
  return server;
};
