import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { responseCompression } from "../../server/http";

test("large JSON negotiates compression and preserves the full response", async () => {
  const app = express(), data = { evidence: "Repeated site evidence. ".repeat(10000) };
  app.use(responseCompression);
  app.get("/", (_req, res) => res.json(data));
  app.get("/api/events", (_req, res) => { res.type("text/event-stream").send(`data: ${data.evidence}\n\n`); });
  const server = app.listen(0, "127.0.0.1");
  try {
    await once(server, "listening");
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const compressed = await fetch(url, { headers: { "Accept-Encoding": "gzip" } });
    assert.equal(compressed.headers.get("content-encoding"), "gzip");
    assert.match(compressed.headers.get("vary")!, /Accept-Encoding/);

    assert.deepEqual(await compressed.json(), data);
    const plain = await fetch(url, { headers: { "Accept-Encoding": "gzip;q=0, identity" } });
    assert.equal(plain.headers.get("content-encoding"), null);
    assert.deepEqual(await plain.json(), data);
    const events = await fetch(`${url}/api/events`, { headers: { "Accept-Encoding": "gzip" } });
    assert.equal(events.headers.get("content-encoding"), null);
    assert.match(await events.text(), /^data: /);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
