import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { decodeDeltaImportPayload } from "../pushInbox.js";

const projectRoot = fileURLToPath(new URL("../..", import.meta.url));
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

const jobId = `job-${"a".repeat(32)}`;
const aggregateFingerprint = "a".repeat(64);
const approval = {
  schema: "site7-push-bridge.bounded-delta-approval",
  version: 1,
  jobId,
  aggregateFingerprint,
  machineNumber: 96,
  value: 30_000,
  approvedAt: "2026-07-30T01:00:00.000Z",
  approvalMethod: "explicit-user-confirmation",
};

function boundedRow(overrides = {}) {
  return {
    num: "96",
    val: null,
    rank: null,
    px: 1914,
    status: "bounded",
    confidence: 0,
    machineNumber: "96",
    machineNumberVerified: true,
    jointMatch: { accepted: true, resolvedNum: "96", matchedBy: "num" },
    valueSource: "bounded-range",
    reasonCodes: ["endpoint-clipped-top", "clipped-series"],
    calibration: { source: "panel", quality: 1 },
    boundaryObservation: {
      kind: "censored-top",
      boundary: "top",
      exact: false,
      value: 29_500,
    },
    deltaRange: {
      kind: "censored-top",
      boundary: "top",
      exact: false,
      boundaryValue: 29_500,
      observedCandidate: 30_000,
      source: "graph-boundary",
      lower: null,
      upper: null,
    },
    rawGraphCandidate: {
      val: 30_000,
      confidence: 0.967,
      status: "review",
      boundaryObservation: {
        kind: "censored-top",
        boundary: "top",
        exact: false,
        value: 29_500,
      },
    },
    ...overrides,
  };
}

function boundedAnalysis() {
  const slot = boundedRow({
    val: 30_000,
    rank: "SS",
    status: "review",
    valueSource: "graph",
    confidence: 0.967,
    machineNumberOcr: { accepted: true, candidate: "96" },
  });
  delete slot.deltaRange;
  return {
    slots: [slot],
    reports: [],
    numberOcr: {
      accepted: true,
      source: "joint-site-seven",
      numbers: ["96"],
      reasonCodes: [],
    },
    jointMatch: {
      summary: {
        matchedCount: 1,
        unmatchedGraphCount: 0,
        unmatchedRowCount: 0,
      },
      reviewReasons: [],
    },
    siteSevenRows: [{
      num: "96",
      cumulativeStarts: 2808,
      normalSpins: 1166,
      firstHitCount: 6,
      maxPayout: 40_600,
      totalStarts: 39,
      machineName: "Test Machine",
      reviewRequired: false,
      reviewConfirmed: false,
      globalReviewRequired: false,
      numAccepted: true,
      fieldAccepted: {
        num: true,
        cumulativeStarts: true,
        normalSpins: true,
        firstHitCount: true,
        maxPayout: true,
        totalStarts: true,
      },
      sourceType: "local-image-ocr",
    }],
    siteSevenSummary: {
      rowCount: 1,
      reviewCount: 0,
      skippedCount: 0,
      duplicateCount: 0,
      failedFileCount: 0,
      unsafeFileCount: 0,
      reports: [],
    },
  };
}

test("job-bound approval only converts matching censored-top evidence", () => {
  const result = worker.applyApprovedBoundedDeltas([boundedRow()], {
    jobId,
    aggregateFingerprint,
    approvals: [approval],
    getRank: () => ({ rank: "SS" }),
  });
  assert.equal(result.rejected.length, 0);
  assert.equal(result.applied.length, 1);
  assert.equal(result.rows[0].status, "ok");
  assert.equal(result.rows[0].val, 30_000);
  assert.equal(result.rows[0].estimated, true);
  assert.equal(result.rows[0].confidence, 0.7);
  assert.equal(
    result.rows[0].boundedDeltaApprovalAudit.boundaryValue,
    29_500,
  );

  for (const unsafeRow of [
    boundedRow({ reasonCodes: ["endpoint-clipped-top"] }),
    boundedRow({ calibration: { source: "image-median", quality: 1 } }),
    boundedRow({
      rawGraphCandidate: {
        ...boundedRow().rawGraphCandidate,
        val: 30_500,
      },
      deltaRange: {
        ...boundedRow().deltaRange,
        observedCandidate: 30_500,
      },
    }),
  ]) {
    const rejected = worker.applyApprovedBoundedDeltas([unsafeRow], {
      jobId,
      aggregateFingerprint,
      approvals: [approval],
      getRank: () => ({ rank: "SS" }),
    });
    assert.equal(rejected.applied.length, 0);
    assert.equal(rejected.rejected.length, 1);
    assert.equal(rejected.rows[0].status, "bounded");
  }
});

test("worker becomes strict-ready only when the sole bounded row uses the exact approval", async () => {
  const candidate = await worker.buildAutoWorkerCandidate(
    boundedAnalysis(),
    { machineName: "Test Machine" },
    {
      jobId,
      aggregateFingerprint,
      boundedDeltaApprovals: [approval],
    },
  );
  assert.equal(candidate.strictReady, true, candidate.blockingReasons.join(","));
  assert.deepEqual(candidate.blockingReasons, []);
  assert.equal(candidate.validation.unresolvedCount, 0);
  assert.equal(candidate.validation.boundedCount, 0);
  assert.equal(candidate.appliedBoundedDeltaApprovals.length, 1);

  const noApproval = await worker.buildAutoWorkerCandidate(
    boundedAnalysis(),
    { machineName: "Test Machine" },
  );
  assert.equal(noApproval.strictReady, false);
  assert.ok(noApproval.blockingReasons.includes("bounded-delta"));
});

test("manifest rejects approvals for another job/fingerprint or conflicting shape", () => {
  const manifest = {
    jobId,
    aggregateFingerprint,
    files: [{
      name: "image.jpg",
      type: "image/jpeg",
      url: "/api/files/0",
    }],
    context: {},
    boundedDeltaApprovals: [approval],
    resultUrl: `/api/results/${jobId}`,
  };
  const normalized = worker.normalizeJobManifest(
    manifest,
    "http://127.0.0.1:43123",
  );
  assert.deepEqual(normalized.boundedDeltaApprovals, [approval]);
  assert.throws(
    () => worker.normalizeJobManifest({
      ...manifest,
      boundedDeltaApprovals: [{
        ...approval,
        aggregateFingerprint: "b".repeat(64),
      }],
    }, "http://127.0.0.1:43123"),
    /does not match/u,
  );
});

test("compact estimate audit is decoded onto rows and retained on the scan", () => {
  const fingerprint = {
    algorithm: "SHA-256",
    hash: aggregateFingerprint,
    fileCount: 1,
    fileHashes: ["b".repeat(64)],
  };
  const payload = {
    schema: "pachi-tracker.delta-import",
    version: 1,
    source: "site-seven-windows",
    compactRows: true,
    scan: {
      id: `delta-auto-${aggregateFingerprint.slice(0, 32)}`,
      storeId: null,
      storeName: "Test Store",
      date: "2026-07-24",
      event: "",
      machineName: "Test Machine",
      sourceFingerprint: fingerprint,
      analysisEngineVersion: "windows-local-v1-auto-worker-header-v1",
      observedAt: "2026-07-30T00:00:00.000Z",
      rows: [
        [30, -3500, 100, 700, null, 10, 1, 100, 10, 1],
        [96, 30_000, 100, 700, null, 10, 1, 100, 10, 1],
      ],
      estimatedRows: [
        [30, -3500, "short-3of4", null, null, null],
        [
          96,
          30_000,
          "user-censored-top",
          approval.approvedAt,
          29_500,
          jobId,
        ],
      ],
    },
  };
  const decoded = decodeDeltaImportPayload(payload, {
    createdAt: "2026-07-30T01:01:00.000Z",
    now: Date.parse("2026-07-30T01:02:00.000Z"),
  });
  assert.equal(decoded.valid, true, decoded.errors.join("\n"));
  assert.equal(decoded.scan.rows[0].estimated, true);
  assert.equal(decoded.scan.rows[0].valueSource, "paired-windows-estimate");
  assert.equal(decoded.scan.rows[0].estimateAudit.source, "short-3of4");
  assert.equal(decoded.scan.rows[1].estimated, true);
  assert.equal(
    decoded.scan.rows[1].valueSource,
    "paired-windows-user-approved-estimate",
  );
  assert.deepEqual(decoded.scan.rows[1].estimateAudit, {
    source: "user-censored-top",
    approvedAt: approval.approvedAt,
    boundaryValue: 29_500,
    jobId,
  });
  assert.deepEqual(decoded.scan.estimatedRows, payload.scan.estimatedRows);

  const legacy = structuredClone(payload);
  delete legacy.scan.estimatedRows;
  const legacyDecoded = decodeDeltaImportPayload(legacy, {
    createdAt: "2026-07-30T01:01:00.000Z",
    now: Date.parse("2026-07-30T01:02:00.000Z"),
  });
  assert.equal(legacyDecoded.valid, true);
  assert.equal(legacyDecoded.scan.rows.some((row) => row.estimated), false);

  const invalidMutations = [
    (value) => value.scan.estimatedRows[1].push("extra"),
    (value) => value.scan.estimatedRows.push([...value.scan.estimatedRows[0]]),
    (value) => { value.scan.estimatedRows[0][2] = "unknown-source"; },
    (value) => { value.scan.estimatedRows[1][1] = 30_500; },
    (value) => { value.scan.estimatedRows[1][4] = 30_500; },
    (value) => { value.scan.estimatedRows[1][5] = "job-other"; },
  ];
  for (const mutate of invalidMutations) {
    const invalid = structuredClone(payload);
    mutate(invalid);
    const changed = decodeDeltaImportPayload(invalid, {
      createdAt: "2026-07-30T01:01:00.000Z",
      now: Date.parse("2026-07-30T01:02:00.000Z"),
    });
    assert.equal(changed.valid, false);
  }
});
