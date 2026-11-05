import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

// Node's `server.close()` only drops connections that are idle at that moment, so a
// keep-alive client that keeps polling (a browser tab, the dev proxy) holds shutdown
// open. After shutdown starts, each response closes its connection: new requests get
// `Connection: close`, and connections that finish a response mid-shutdown are closed
// once idle. In-flight requests still finish.
export const createApiServer = () => {
  const server = createServer();
  const closeAfterShutdown = (_request: IncomingMessage, response: ServerResponse) => {
    if (!server.listening) response.setHeader("Connection", "close");
    response.once("finish", () => {
      // The socket counts as idle only after Node finishes processing the response.
      if (!server.listening) setImmediate(() => server.closeIdleConnections());
    });
  };
  server.on("request", closeAfterShutdown);
  // NodeHttpServer also serves `Expect: 100-continue` requests through this event.
  server.on("checkContinue", closeAfterShutdown);
  return server;
};
