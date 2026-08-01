import test from "node:test";
import assert from "node:assert/strict";

import {
  AUTO_IMPORT_MIN_CONFIDENCE,
  classifyNonDeltaPushRecord,
  evaluateDecodedPushScan,
  resolveRegisteredPushStore,
} from "../pushImportProcessor.js";
import {
  AUTO_HEADER_CONTEXT_ENGINE_VERSION,
  AUTO_HEADER_CONTEXT_SOURCE,
} from "../pushInbox.js";

const fingerprint = {
  algorithm: "SHA-256",
  hash: "a".repeat(64),
  fileCount: 1,
  fileHashes: ["b".repeat(64)],
};
const stores = [{ id: "store-1", name: "テスト中央店" }];
const machines = [{ name: "Pテスト 1/319" }];

const contextEvidence = {
  source: AUTO_HEADER_CONTEXT_SOURCE,
  version: 1,
  profileVotes: 2,
  headerFileCount: 1,
};

function makeScan(overrides = {}) {
  return {
    id: "scan-20260730-1",
    storeId: "store-1",
    storeName: "テスト中央店",
    date: "2026-07-30",
    event: "",
    machineName: "Pテスト 1/319",
    createdAt: "2026-07-30T09:00:00.000Z",
    sourceFingerprint: fingerprint,
    analysisEngineVersion: "windows-local-v1",
    rows: [{
      num: "17",
      val: 11450,
      px: 80,
      confidence: AUTO_IMPORT_MIN_CONFIDENCE,
      confidencePermille: AUTO_IMPORT_MIN_CONFIDENCE * 1000,
      status: "ok",
      machineNumberVerified: true,
      machineName: "Pテスト 1/319",
      cumulativeStarts: 717,
      normalSpins: 583,
      firstHitCount: 2,
      maxPayout: 11450,
      totalStarts: 9,
    }],
    ...overrides,
  };
}

test("登録済み店舗IDと名前が一致すれば正規の店舗へ解決する", () => {
  const result = resolveRegisteredPushStore(makeScan(), stores);
  assert.equal(result.status, "ready");
  assert.equal(result.store, stores[0]);
});

test("店舗IDが同じでも名前が違えば上書きせず拒否する", () => {
  const result = resolveRegisteredPushStore(
    makeScan({ storeName: "別の店舗" }),
    stores,
  );
  assert.deepEqual(
    { status: result.status, code: result.code },
    { status: "rejected", code: "store-name-conflict" },
  );
});

test("店舗IDなしは一意な正規化名だけを許可する", () => {
  const result = resolveRegisteredPushStore(
    makeScan({ storeId: null, storeName: "テスト 中央店" }),
    stores,
  );
  assert.equal(result.status, "ready");
  assert.equal(result.store.id, "store-1");
});

test("確定行・登録済み店舗・登録済み機種だけが自動取込readyになる", () => {
  const result = evaluateDecodedPushScan(makeScan(), {
    stores,
    builtInMachines: machines,
  });
  assert.equal(result.status, "ready");
  assert.equal(result.scan.storeId, "store-1");
  assert.equal(result.scan.rows[0].rank, "B++");
});

test("解析エンジンの確定下限未満は自動取込しない", () => {
  const scan = makeScan();
  scan.rows[0] = {
    ...scan.rows[0],
    confidence: AUTO_IMPORT_MIN_CONFIDENCE - 0.001,
    confidencePermille: AUTO_IMPORT_MIN_CONFIDENCE * 1000 - 1,
  };
  const result = evaluateDecodedPushScan(scan, {
    stores,
    builtInMachines: machines,
  });
  assert.deepEqual(
    { status: result.status, code: result.code },
    { status: "rejected", code: "not-strict-auto-import" },
  );
});

test("未登録機種は削除・保存せず、登録後に再試行できるpending扱いにする", () => {
  const result = evaluateDecodedPushScan(makeScan(), {
    stores,
    builtInMachines: [],
  });
  assert.deepEqual(
    { status: result.status, code: result.code },
    { status: "waiting", code: "machine-not-registered" },
  );
});

test("trusted header consensus permits unknown store and machine as observed labels", () => {
  const observedMachine = "P現地表示だけの機種";
  const scan = makeScan({
    storeId: null,
    storeName: "現地表示だけの店舗",
    machineName: observedMachine,
    analysisEngineVersion: AUTO_HEADER_CONTEXT_ENGINE_VERSION,
    contextEvidence,
    rows: [{
      ...makeScan().rows[0],
      machineName: "Ｐ現地表示だけの機種",
    }],
  });
  const result = evaluateDecodedPushScan(scan, {
    stores,
    builtInMachines: [],
  });
  assert.equal(result.status, "ready");
  assert.equal(result.scan.storeId, null);
  assert.equal(result.scan.storeName, "現地表示だけの店舗");
  assert.equal(result.scan.machineName, observedMachine);
  assert.equal(result.scan.rows[0].machineName, observedMachine);
  assert.deepEqual(result.scan.contextEvidence, contextEvidence);
  assert.equal(result.machineValidation.unregisteredCount, 1);
});

test("trusted unknown machine rejects mixed row labels", () => {
  const baseRow = makeScan().rows[0];
  const scan = makeScan({
    storeId: null,
    storeName: "現地店舗",
    machineName: "P観測機種A",
    analysisEngineVersion: AUTO_HEADER_CONTEXT_ENGINE_VERSION,
    contextEvidence,
    rows: [
      { ...baseRow, machineName: "Ｐ観測機種Ａ" },
      { ...baseRow, num: "18", machineName: "P観測機種B" },
    ],
  });
  const result = evaluateDecodedPushScan(scan, {
    stores,
    builtInMachines: [],
  });
  assert.deepEqual(
    { status: result.status, code: result.code },
    { status: "rejected", code: "machine-name-conflict" },
  );
});

test("unknown labels keep the legacy waiting behavior without exact trusted context", () => {
  const base = makeScan({
    storeId: null,
    storeName: "未登録店舗",
    machineName: "P未登録",
    rows: [{ ...makeScan().rows[0], machineName: "P未登録" }],
  });
  const withoutEvidence = evaluateDecodedPushScan(base, {
    stores,
    builtInMachines: [],
  });
  assert.deepEqual(
    { status: withoutEvidence.status, code: withoutEvidence.code },
    { status: "waiting", code: "store-not-registered" },
  );

  const wrongEngine = evaluateDecodedPushScan({
    ...base,
    analysisEngineVersion: "windows-local-v1-auto-worker",
    contextEvidence,
  }, {
    stores,
    builtInMachines: [],
  });
  assert.deepEqual(
    { status: wrongEngine.status, code: wrongEngine.code },
    { status: "waiting", code: "store-not-registered" },
  );

  const invalidEvidence = evaluateDecodedPushScan({
    ...base,
    analysisEngineVersion: AUTO_HEADER_CONTEXT_ENGINE_VERSION,
    contextEvidence: { ...contextEvidence, profileVotes: 1 },
  }, {
    stores,
    builtInMachines: [],
  });
  assert.deepEqual(
    { status: invalidEvidence.status, code: invalidEvidence.code },
    { status: "waiting", code: "store-not-registered" },
  );
});

test("known store and machine labels are canonicalized to master names", () => {
  const canonicalStores = [{ id: "known-store", name: "正式 店舗Ａ" }];
  const canonicalMachines = [{
    name: "P正式機種 1/319",
    aliases: ["P観測機種"],
  }];
  const scan = makeScan({
    storeId: null,
    storeName: "正式店舗A",
    machineName: "P観測機種",
    analysisEngineVersion: AUTO_HEADER_CONTEXT_ENGINE_VERSION,
    contextEvidence,
    rows: [{ ...makeScan().rows[0], machineName: "P観測機種" }],
  });
  const result = evaluateDecodedPushScan(scan, {
    stores: canonicalStores,
    builtInMachines: canonicalMachines,
  });
  assert.equal(result.status, "ready");
  assert.equal(result.scan.storeId, "known-store");
  assert.equal(result.scan.storeName, "正式 店舗Ａ");
  assert.equal(result.scan.machineName, "P正式機種 1/319");
  assert.equal(result.scan.rows[0].machineName, "P正式機種 1/319");
});

test("trusted Tokyo Ghoul import repairs the known Kisuke PAO OCR alias", () => {
  const kisukeStores = [{ id: "kisuke-pao", name: "スーパーキスケPAO" }];
  const ghoulMachines = [{
    name: "e東京喰種W",
    aliases: ["e東京喰種", "東京喰種"],
  }];
  const scan = makeScan({
    storeId: null,
    storeName: "スーバーキスケPA0",
    machineName: "e東京喰種",
    analysisEngineVersion: AUTO_HEADER_CONTEXT_ENGINE_VERSION,
    contextEvidence,
    rows: [{ ...makeScan().rows[0], machineName: "e東京喰種" }],
  });

  const result = evaluateDecodedPushScan(scan, {
    stores: kisukeStores,
    builtInMachines: ghoulMachines,
  });
  assert.equal(result.status, "ready");
  assert.equal(result.scan.storeId, "kisuke-pao");
  assert.equal(result.scan.storeName, "スーパーキスケPAO");
  assert.equal(result.scan.machineName, "e東京喰種W");
  assert.equal(result.scan.rows[0].machineName, "e東京喰種W");

  const untrusted = evaluateDecodedPushScan({
    ...scan,
    analysisEngineVersion: "windows-local-v1",
    contextEvidence: undefined,
  }, {
    stores: kisukeStores,
    builtInMachines: ghoulMachines,
  });
  assert.deepEqual(
    { status: untrusted.status, code: untrusted.code },
    { status: "waiting", code: "store-not-registered" },
  );
});

test("trusted context never bypasses store ID conflicts or configured layout review", () => {
  const unknownId = evaluateDecodedPushScan(makeScan({
    storeId: "not-registered-id",
    analysisEngineVersion: AUTO_HEADER_CONTEXT_ENGINE_VERSION,
    contextEvidence,
  }), {
    stores,
    builtInMachines: machines,
  });
  assert.deepEqual(
    { status: unknownId.status, code: unknownId.code },
    { status: "waiting", code: "store-not-registered" },
  );

  const nameConflict = evaluateDecodedPushScan(makeScan({
    storeName: "別の店舗",
    analysisEngineVersion: AUTO_HEADER_CONTEXT_ENGINE_VERSION,
    contextEvidence,
  }), {
    stores,
    builtInMachines: machines,
  });
  assert.deepEqual(
    { status: nameConflict.status, code: nameConflict.code },
    { status: "rejected", code: "store-name-conflict" },
  );

  const layoutMismatch = evaluateDecodedPushScan(makeScan({
    analysisEngineVersion: AUTO_HEADER_CONTEXT_ENGINE_VERSION,
    contextEvidence,
  }), {
    stores,
    builtInMachines: machines,
    hallMaps: {
      "store-1": [{
        id: "outside",
        name: "別島",
        machineName: machines[0].name,
        start: 100,
        end: 120,
      }],
    },
  });
  assert.deepEqual(
    { status: layoutMismatch.status, code: layoutMismatch.code },
    { status: "waiting", code: "store-layout-review" },
  );
});

test("trusted context does not permit a missing machine label", () => {
  const scan = makeScan({
    analysisEngineVersion: AUTO_HEADER_CONTEXT_ENGINE_VERSION,
    contextEvidence,
    rows: [{ ...makeScan().rows[0], machineName: "" }],
  });
  const result = evaluateDecodedPushScan(scan, {
    stores,
    builtInMachines: machines,
  });
  assert.deepEqual(
    { status: result.status, code: result.code },
    { status: "rejected", code: "machine-name-missing" },
  );
});

test("店舗の島配置がある場合は台番号を照合し、島情報も保持する", () => {
  const result = evaluateDecodedPushScan(makeScan(), {
    stores,
    builtInMachines: machines,
    hallMaps: {
      "store-1": [{
        id: "island-a",
        name: "海コーナー",
        machineName: "Pテスト 1/319",
        start: 17,
        end: 20,
      }],
    },
  });
  assert.equal(result.status, "ready");
  assert.equal(result.scan.rows[0].islandId, "island-a");
  assert.equal(result.scan.rows[0].island, "海コーナー");
});

test("店舗の島配置範囲外なら推測登録せず保留する", () => {
  const result = evaluateDecodedPushScan(makeScan(), {
    stores,
    builtInMachines: machines,
    hallMaps: {
      "store-1": [{
        id: "island-b",
        name: "別コーナー",
        machineName: "Pテスト 1/319",
        start: 100,
        end: 120,
      }],
    },
  });
  assert.deepEqual(
    { status: result.status, code: result.code },
    { status: "waiting", code: "store-layout-review" },
  );
});

test("legacy review recovery resolves finalized data and marks invalid retries once", () => {
  const notice = {
    jobId: "job-review-1",
    date: "2026-07-30",
    storeName: "Test Store",
    machineName: "Test Machine",
    pendingMachines: [{ machineNumber: "20", reasons: ["bounded-delta"] }],
    blockingReasons: ["bounded-delta"],
    sourceFingerprint: {
      algorithm: "SHA-256",
      hash: "c".repeat(64),
      fileCount: 4,
    },
  };
  const recoveryRecord = {
    processingContext: {
      legacyReviewRecoveryVersion: 1,
      sourceFingerprint: "c".repeat(64),
      finalizedByBatchId: "final-delta-1",
    },
  };
  const resolved = classifyNonDeltaPushRecord(recoveryRecord, {
    valid: true,
    kind: "review",
    reviewNotice: notice,
  });
  assert.equal(resolved.status, "resolved");
  assert.equal(resolved.details.resolvedByBatchId, "final-delta-1");
  assert.equal(resolved.details.legacyReviewRecoveryVersion, 1);

  const pendingReview = classifyNonDeltaPushRecord({
    processingContext: {
      ...recoveryRecord.processingContext,
      finalizedByBatchId: null,
    },
  }, {
    valid: true,
    kind: "review",
    reviewNotice: notice,
  });
  assert.equal(pendingReview.status, "review");
  assert.equal(pendingReview.details.pendingMachineCount, 1);

  const invalid = classifyNonDeltaPushRecord(recoveryRecord, {
    valid: false,
    kind: null,
    errors: ["invalid review"],
  });
  assert.equal(invalid.status, "rejected");
  assert.equal(invalid.details.legacyReviewRecoveryVersion, 1);
});

test("future payload schema stays pending without a retry loop", () => {
  const deferred = classifyNonDeltaPushRecord({}, {
    valid: false,
    kind: "unsupported",
    unsupportedPayloadSchema: "pachi-tracker.future-import",
    errors: ["unsupported"],
  });
  assert.equal(deferred.status, "pending");
  assert.equal(deferred.summaryKey, "waiting");
  assert.deepEqual(deferred.details, {
    reasonCodes: ["unsupported-payload-schema"],
    payloadSchema: "pachi-tracker.future-import",
  });
});
