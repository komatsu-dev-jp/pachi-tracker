import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

import { createServer } from "vite";

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

function completeAnalysis(overrides = {}) {
  return {
    slots: [{
      val: 1200,
      px: 10,
      status: "ok",
      machineNumber: "17",
      machineNumberOcr: { accepted: true, candidate: "17" },
    }],
    reports: [{
      imageIndex: 0,
      name: "graph.png",
      total: 1,
      readable: 1,
      review: 0,
      missing: 0,
      machineNumberOcrAccepted: true,
      error: null,
    }],
    numberOcr: {
      accepted: true,
      source: "joint-site-seven",
      numbers: ["17"],
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
      num: "17",
      cumulativeStarts: 717,
      normalSpins: 717,
      firstHitCount: 2,
      maxPayout: 11450,
      totalStarts: 9,
      machineName: "P大海物語5 MTE2",
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
    ...overrides,
  };
}

function advisoryWindowsOcrHints(overrides = {}) {
  return {
    schema: "site7-push-bridge.windows-ocr-hints",
    version: 1,
    generatedAt: "2026-07-30T08:00:00.000Z",
    advisoryOnly: true,
    engine: "Windows.Media.Ocr",
    policy: {
      requiresIndependentMatch: true,
      requiresMultiProfileAgreement: true,
      minimumMatchingProfiles: 2,
      maySetStrictReady: false,
      engineConfidenceAvailable: false,
      networkUsed: false,
      sourceModified: false,
    },
    files: [{
      fileIndex: 0,
      source: {
        sha256: "a".repeat(64),
        readOnlyAccess: true,
        unchanged: true,
      },
      profiles: [
        { profileId: "full-original", numericTokens: [{ value: 17 }] },
        { profileId: "full-shrink-075", numericTokens: [{ value: 17 }] },
      ],
    }],
    ...overrides,
  };
}

function advisoryWindowsOcrHintSummary(overrides = {}) {
  return {
    schema: "site7-push-bridge.windows-ocr-hints-summary",
    version: 1,
    generatedAt: "2026-07-30T08:00:00.000Z",
    advisoryOnly: true,
    summaryOnly: true,
    engine: "Windows.Media.Ocr",
    policy: {
      requiresIndependentMatch: true,
      requiresMultiProfileAgreement: true,
      minimumMatchingProfiles: 2,
      maySetStrictReady: false,
      engineConfidenceAvailable: false,
      networkUsed: false,
      sourceModified: false,
    },
    retention: {
      rawHintsPersisted: false,
      rawHintsIncludedInManifest: false,
      coordinatesPersisted: false,
      recognizedTextPersisted: false,
    },
    rawHintsSha256: "b".repeat(64),
    rawHintsBytes: 16 * 1024 * 1024,
    fileCount: 1,
    profileCount: 8,
    numericTokenCount: 10_000,
    files: [{
      fileIndex: 0,
      source: {
        sha256: "a".repeat(64),
        size: 123_456,
        readOnlyAccess: true,
        unchanged: true,
      },
      profileCount: 8,
      numericTokenCount: 10_000,
    }],
    ...overrides,
  };
}

test("localhost以外のページと外部URLを拒否する", () => {
  assert.equal(worker.isLoopbackHostname("localhost"), true);
  assert.equal(worker.isLoopbackHostname("127.0.0.1"), true);
  assert.equal(worker.isLoopbackHostname("example.com"), false);
  assert.throws(
    () => worker.requireLoopbackLocation({ hostname: "example.com" }),
    /localhost/u,
  );
  assert.throws(
    () => worker.resolveSameOriginUrl("https://example.com/input.png", "http://127.0.0.1:43123"),
    /localhost以外/u,
  );
});

test("ジョブ情報は同一オリジンの許可形式だけに正規化する", () => {
  const job = worker.normalizeJobManifest({
    jobId: "job-001",
    files: [
      { name: "graph.png", type: "image/png", url: "/api/files/graph.png" },
      { name: "table.csv", type: "text/csv", url: "/api/files/table.csv" },
    ],
    context: {
      storeId: "store-1",
      storeName: "テスト店",
      date: "2026-07-30",
      machineName: "P大海物語5 MTE2",
    },
    resultUrl: "/api/auto-worker/jobs/job-001/result",
  }, "http://127.0.0.1:43123");
  assert.equal(job.jobId, "job-001");
  assert.deepEqual(job.files.map(({ kind }) => kind), ["image", "csv"]);
  assert.equal(job.files[0].url, "http://127.0.0.1:43123/api/files/graph.png");
  assert.equal(job.resultUrl, "http://127.0.0.1:43123/api/auto-worker/jobs/job-001/result");
  assert.equal(job.context.storeName, "テスト店");
});

test("Windows標準OCRは安全ルールを再検査し、判断に使わない要約だけを保持する", () => {
  const manifest = {
    jobId: "job-ocr-hints",
    files: [{ name: "table.jpg", type: "image/jpeg", url: "/api/files/table.jpg" }],
    context: {},
    ocrHints: advisoryWindowsOcrHints(),
    resultUrl: "/api/results/job-ocr-hints",
  };
  const job = worker.normalizeJobManifest(manifest, "http://127.0.0.1:43123");

  assert.equal(job.ocrHints.advisoryOnly, true);
  assert.equal(job.ocrHints.policy.maySetStrictReady, false);
  assert.equal(job.ocrHints.fileCount, 1);
  assert.equal(job.ocrHints.profileCount, 2);
  assert.equal(job.ocrHints.numericTokenCount, 2);
  assert.equal("profiles" in job.ocrHints.files[0], false);
  assert.throws(
    () => worker.normalizeJobManifest({
      ...manifest,
      ocrHints: advisoryWindowsOcrHints({
        policy: {
          ...advisoryWindowsOcrHints().policy,
          maySetStrictReady: true,
        },
      }),
    }, "http://127.0.0.1:43123"),
    /安全ルール/u,
  );
});

test("全検証を通過した解析だけstrictReadyになる", async () => {
  const candidate = await worker.buildAutoWorkerCandidate(
    completeAnalysis(),
    { machineName: "P大海物語5 MTE2" },
  );
  assert.equal(candidate.strictReady, true);
  assert.deepEqual(candidate.blockingReasons, []);
  assert.equal(candidate.candidateRows.length, 1);
  assert.equal(candidate.candidateRows[0].num, "17");
  assert.equal(candidate.candidateRows[0].val, 1200);
  assert.equal(candidate.validation.valid, true);
  assert.equal(candidate.validation.unresolvedCount, 0);
  assert.equal(candidate.validation.boundedCount, 0);
});

test("確認待ちのグラフや表は候補を返してもstrictReadyにしない", async () => {
  const analysis = completeAnalysis({
    slots: [{ val: 1200, status: "review" }],
    siteSevenSummary: {
      reviewCount: 1,
      skippedCount: 1,
      duplicateCount: 0,
      failedFileCount: 0,
      unsafeFileCount: 0,
      reports: [],
    },
  });
  const candidate = await worker.buildAutoWorkerCandidate(analysis);
  assert.equal(candidate.strictReady, false);
  assert.ok(candidate.blockingReasons.includes("graph-slot-not-ok"));
  assert.ok(candidate.blockingReasons.includes("site-seven-review-pending"));
});

test("表なし・表項目未確定・表とグラフの件数不一致を自動取込しない", async () => {
  const withoutTable = await worker.buildAutoWorkerCandidate(completeAnalysis({
    siteSevenRows: [],
    jointMatch: null,
  }));
  assert.equal(withoutTable.strictReady, false);
  assert.ok(withoutTable.blockingReasons.includes("no-site-seven-table"));
  assert.ok(withoutTable.blockingReasons.includes("joint-match-missing"));

  const unacceptedAnalysis = completeAnalysis();
  unacceptedAnalysis.siteSevenRows[0].fieldAccepted.maxPayout = false;
  const unaccepted = await worker.buildAutoWorkerCandidate(unacceptedAnalysis);
  assert.equal(unaccepted.strictReady, false);
  assert.ok(unaccepted.blockingReasons.includes("site-seven-table-not-fully-accepted"));

  const mismatched = await worker.buildAutoWorkerCandidate(completeAnalysis({
    slots: [
      completeAnalysis().slots[0],
      { ...completeAnalysis().slots[0], machineNumber: "18" },
    ],
  }));
  assert.equal(mismatched.strictReady, false);
  assert.ok(mismatched.blockingReasons.includes("table-graph-count-mismatch"));
});

test("自動ワーカーはGETで取得し、解析結果をPOSTするだけで端末へ保存しない", async () => {
  const calls = [];
  let postedPayload;
  const origin = "http://127.0.0.1:43123";
  const fetchImpl = async (url, init = {}) => {
    const method = init.method || "GET";
    calls.push({ url: String(url), method });
    if (String(url) === `${origin}/api/auto-worker/jobs/next`) {
      return new Response(JSON.stringify({
        jobId: "job-002",
        files: [{ name: "table.csv", type: "text/csv", url: "/api/files/table.csv" }],
        context: {
          storeId: "store-1",
          storeName: "テスト店",
          date: "2026-07-30",
          machineName: "P大海物語5 MTE2",
        },
        resultUrl: "/api/results/job-002",
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (String(url) === `${origin}/api/files/table.csv`) {
      return new Response("台番,通常中スタート,大当り回数\n17,717,9\n", {
        status: 200,
        headers: { "content-type": "text/csv" },
      });
    }
    if (String(url) === `${origin}/api/results/job-002`) {
      postedPayload = JSON.parse(init.body);
      return new Response(null, { status: 204 });
    }
    throw new Error(`unexpected URL: ${url}`);
  };

  const result = await worker.runAutoWorkerOnce({
    fetchImpl,
    locationLike: {
      hostname: "127.0.0.1",
      origin,
    },
    analyzeImpl: async () => completeAnalysis(),
  });

  assert.equal(result.status, "analyzed");
  assert.deepEqual(calls.map(({ method }) => method), ["GET", "GET", "POST"]);
  assert.equal(postedPayload.jobId, "job-002");
  assert.equal(postedPayload.status, "analyzed");
  assert.equal(postedPayload.strictReady, true);
  assert.equal(postedPayload.policy.persistsLocally, false);
  assert.equal(postedPayload.policy.deletesSourceFiles, false);
  assert.equal(postedPayload.candidateRows[0].num, "17");
  assert.equal(JSON.stringify(postedPayload).includes("data:text"), false);
});

test("解析失敗も既存データを変更せず失敗結果として返す", async () => {
  const origin = "http://localhost:43123";
  let postedPayload;
  const fetchImpl = async (url, init = {}) => {
    if (String(url) === `${origin}/api/auto-worker/jobs/next`) {
      return new Response(JSON.stringify({
        jobId: "job-failed",
        files: [{ name: "table.csv", type: "text/csv", url: "/api/files/table.csv" }],
        context: {},
        resultUrl: "/api/results/job-failed",
      }), { status: 200 });
    }
    if (String(url) === `${origin}/api/files/table.csv`) {
      return new Response("台番\n17\n", {
        status: 200,
        headers: { "content-type": "text/csv" },
      });
    }
    postedPayload = JSON.parse(init.body);
    return new Response(null, { status: 204 });
  };
  const result = await worker.runAutoWorkerOnce({
    fetchImpl,
    locationLike: { hostname: "localhost", origin },
    analyzeImpl: async () => {
      throw new Error("OCR failure");
    },
  });
  assert.equal(result.status, "failed");
  assert.equal(postedPayload.strictReady, false);
  assert.deepEqual(postedPayload.candidateRows, []);
  assert.deepEqual(postedPayload.blockingReasons, ["worker-error"]);
  assert.match(postedPayload.diagnostics.error.message, /OCR failure/u);
});

test("persisted Windows OCR summary remains advisory and contains no raw values", () => {
  const manifest = {
    jobId: "job-ocr-summary",
    files: [{ name: "table.jpg", type: "image/jpeg", url: "/api/files/table.jpg" }],
    context: {},
    ocrHintSummary: advisoryWindowsOcrHintSummary(),
    resultUrl: "/api/results/job-ocr-summary",
  };
  const job = worker.normalizeJobManifest(manifest, "http://127.0.0.1:43123");

  assert.equal(job.ocrHints.summaryOnly, true);
  assert.equal(job.ocrHints.policy.maySetStrictReady, false);
  assert.equal(job.ocrHints.retention.rawHintsPersisted, false);
  assert.equal(job.ocrHints.fileCount, 1);
  assert.equal(job.ocrHints.profileCount, 8);
  assert.equal(job.ocrHints.numericTokenCount, 10_000);
  assert.equal("profiles" in job.ocrHints.files[0], false);
  assert.equal("numericTokens" in job.ocrHints.files[0], false);

  assert.throws(
    () => worker.normalizeJobManifest({
      ...manifest,
      ocrHintSummary: advisoryWindowsOcrHintSummary({
        policy: {
          ...advisoryWindowsOcrHintSummary().policy,
          maySetStrictReady: true,
        },
      }),
    }, "http://127.0.0.1:43123"),
    /安全ルール/u,
  );
  assert.throws(
    () => worker.normalizeJobManifest({
      ...manifest,
      ocrHints: advisoryWindowsOcrHints(),
    }, "http://127.0.0.1:43123"),
    /同時/u,
  );
});
