import { test } from "node:test";
import assert from "node:assert/strict";
import { draftIssue, reportPayload, type CrewDraft } from "../../mobile/src/lib/report-input";
const draft: CrewDraft = {
  requestId: "a8c1fc86-69dc-4caa-bbcc-30c1f39ba859", siteId: "621", server: "http://192.168.1.20:3001",
  teamId: "", author: " Alex Rivera ", category: "soil", description: " Access road blocked by mud. ",
  tasks: ["mobilization"], latitude: 25.43, longitude: -80.33, pinConfirmed: true,
  photoUri: "file:///draft/photo.jpg", updatedAt: "2026-10-17T12:00:00Z",
};
test("mobile reports require photo evidence, a deliberately confirmed finite pin, identity and affected work", () => {
  assert.equal(draftIssue(draft), undefined);
  for (const invalid of [{ photoUri: undefined }, { pinConfirmed: false }, { latitude: NaN }, { longitude: 181 }, { author: " " }, { tasks: [] }, { description: "mud" }]) {
    assert.ok(draftIssue({ ...draft, ...invalid }));
  }
  assert.equal(draftIssue({ ...draft, latitude: 0, longitude: 0 }), undefined);
});
test("native submissions retain retry identity but exclude sandbox paths and draft-only metadata", () => {
  const payload = reportPayload({ ...draft, tasks: ["mobilization", "mobilization"] }, "data:image/jpeg;base64,aGVsbG8=");
  assert.equal(payload.clientRequestId, draft.requestId);
  assert.equal(payload.description, "Access road blocked by mud.");
  assert.equal(payload.author, "Alex Rivera");
  assert.deepEqual(payload.tasks, ["mobilization"]);
  assert.equal(payload.teamId, undefined);
  assert.ok(!("server" in payload) && !("photoUri" in payload) && !("pinConfirmed" in payload));
  assert.throws(() => reportPayload(draft, "file:///draft/photo.jpg"), /could not be read/);
  assert.throws(() => reportPayload({ ...draft, pinConfirmed: false }, "data:image/jpeg;base64,aGVsbG8="), /Confirm/);
});
