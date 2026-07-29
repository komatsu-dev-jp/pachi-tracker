import test from "node:test";
import assert from "node:assert/strict";

import {
  AUTO_IMPORT_MIN_CONFIDENCE,
  evaluateDecodedPushScan,
  resolveRegisteredPushStore,
} from "../pushImportProcessor.js";

const fingerprint = {
  algorithm: "SHA-256",
  hash: "a".repeat(64),
  fileCount: 1,
  fileHashes: ["b".repeat(64)],
};
const stores = [{ id: "store-1", name: "テスト中央店" }];
const machines = [{ name: "Pテスト 1/319" }];

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
