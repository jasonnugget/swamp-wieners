import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { once } from "node:events";
import { waitForApi } from "../../server/dev-readiness";

async function listen(server: Server) {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");
  return `http://127.0.0.1:${address.port}/api/health`;
}
async function close(server: Server) {
  server.closeAllConnections();
  await new Promise<void>(resolve => server.close(() => resolve()));
}
test("development readiness retries incomplete responses and only accepts healthy API JSON", async t => {
  let attempts = 0;
  const server = createServer((_req, res) => {
    attempts++;
    if (attempts === 1) { res.writeHead(503); res.end("Starting"); }
    else if (attempts === 2) res.end("Not JSON");
    else res.end(JSON.stringify({ ok: attempts >= 4, version: "test-model" }));
  });
  t.after(() => close(server));
  await waitForApi(await listen(server), 2000, 1);
  assert.equal(attempts, 4);
});
test("development readiness fails clearly if the API never starts", async () => {
  const server = createServer();
  const url = await listen(server);
  await close(server);
  await assert.rejects(waitForApi(url, 50, 1), /PlanIT API did not become ready.*Check the API process output/);
});
test("development readiness bounds a hung health request", async t => {
  const server = createServer(() => {});
  t.after(() => close(server));
  await assert.rejects(waitForApi(await listen(server), 50, 1), /within 50ms/);
});
