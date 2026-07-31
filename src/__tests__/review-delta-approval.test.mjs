import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const projectRoot = fileURLToPath(new URL("../..", import.meta.url));
const jobId = `job-${"c".repeat(32)}`;
const aggregateFingerprint = "c".repeat(64);
const approval = {
  schema: "site7-push-bridge.review-delta-approval",
  version: 1,
  jobId,
  aggregateFingerprint,
  machineNumber: 102,
  value: -2500,
  approvedAt: "2026-07-31T05:10:00.000Z",
  approvalMethod: "explicit-user-confirmation",
};
let server;
let worker;

before(async () => {
  server = await createServer({
    root: projectRoot,
    configFile: false,
    appType: "custom",
    logLevel: "silent",
    server: { middlewareMode: true },
  });
  worker = await server.ssrLoadModule("/src/autoWorker.jsx");
});

after(async () => {
  await server?.close();
});

function reviewRow(overrides = {}) {
  return {
    num: "102",
    val: -2500,
    status: "review",
    reviewConfirmed: false,
    confidence: 0.842,
    machineNumberVerified: true,
    jointMatch: {
      accepted: true,
      resolvedNum: "102",
      matchedBy: "num",
    },
    calibration: {
      source: "panel",
      quality: 0.98,
    },
    boundaryObservation: null,
    valueConstraint: null,
    reasonCodes: ["short-series"],
    shortSeriesValidation: {
      accepted: false,
      originalValue: -2500,
    },
    ...overrides,
  };
}

test("exact job-bound review approval confirms only its matching review row", () => {
  const result = worker.applyApprovedReviewDeltas([reviewRow()], {
    jobId,
    aggregateFingerprint,
    approvals: [approval],
  });
  assert.equal(result.rejected.length, 0);
  assert.equal(result.applied.length, 1);
  assert.equal(result.rows[0].status, "review");
  assert.equal(result.rows[0].reviewConfirmed, true);
  assert.equal(result.rows[0].val, -2500);
  assert.equal(result.rows[0].valueSource, "explicit-review-user-approval");
  assert.equal(result.rows[0].reviewDeltaApprovalAudit.jobId, jobId);
});

test("review approval fails closed for a different value or boundary evidence", () => {
  for (const row of [
    reviewRow({ val: -3000 }),
    reviewRow({ boundaryObservation: { kind: "censored-top" } }),
    reviewRow({ reasonCodes: ["short-series", "boundary-touch"] }),
  ]) {
    const result = worker.applyApprovedReviewDeltas([row], {
      jobId,
      aggregateFingerprint,
      approvals: [approval],
    });
    assert.equal(result.applied.length, 0);
    assert.equal(result.rejected.length, 1);
    assert.equal(result.rows[0].reviewConfirmed, false);
  }
});

test("manifest binds review approval to the exact job fingerprint", () => {
  const manifest = {
    jobId,
    aggregateFingerprint,
    files: [{
      name: "image.jpg",
      type: "image/jpeg",
      url: "/api/files/0",
    }],
    context: {},
    reviewDeltaApprovals: [approval],
    resultUrl: `/api/results/${jobId}`,
  };
  const normalized = worker.normalizeJobManifest(
    manifest,
    "http://127.0.0.1:43123",
  );
  assert.deepEqual(normalized.reviewDeltaApprovals, [approval]);
  assert.throws(
    () => worker.normalizeJobManifest({
      ...manifest,
      reviewDeltaApprovals: [{
        ...approval,
        aggregateFingerprint: "d".repeat(64),
      }],
    }, "http://127.0.0.1:43123"),
    /does not match/u,
  );
});
