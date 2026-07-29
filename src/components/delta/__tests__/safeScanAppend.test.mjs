import test from "node:test";
import assert from "node:assert/strict";

import { appendScanWithoutLoss, makeScan } from "../deltaSelectors.js";

test("過去記録を削除せず新規記録だけを追記する", () => {
  const previous = [{ id: "old", date: "2020-01-01" }, null];
  const next = { id: "new", date: "2026-07-29" };
  const result = appendScanWithoutLoss(previous, next);
  assert.equal(result.status, "saved");
  assert.deepEqual(result.scans, [previous[0], null, next]);
  assert.equal(previous.length, 2);
});

test("同じSHA-256は重複保存しない", () => {
  const hash = "a".repeat(64);
  const previous = [{ id: "old", sourceFingerprint: { hash } }];
  const result = appendScanWithoutLoss(previous, {
    id: "new",
    sourceFingerprint: { hash },
  });
  assert.equal(result.status, "duplicate");
  assert.deepEqual(result.scans, previous);
  assert.equal(previous.length, 1);
});

test("同一IDを無確認で上書きしない", () => {
  const previous = [{ id: "same", rows: [{ num: "17", val: 1000 }] }];
  const result = appendScanWithoutLoss(previous, {
    id: "same",
    rows: [{ num: "17", val: 2000 }],
  });
  assert.equal(result.status, "id-conflict");
  assert.deepEqual(result.scans, previous);
  assert.equal(result.scans[0].rows[0].val, 1000);
});

test("300件を超えても通常保存では古い記録を自動削除しない", () => {
  const previous = Array.from({ length: 301 }, (_, index) => ({
    id: `old-${index}`,
    date: "2020-01-01",
  }));
  const next = { id: "new", date: "2026-07-29" };
  const result = appendScanWithoutLoss(previous, next);
  assert.equal(result.status, "saved");
  assert.equal(result.scans.length, 302);
  assert.equal(result.scans[0].id, "old-0");
  assert.equal(result.scans.at(-1), next);
});

test("保存レコードに有効なSHA-256指紋と解析版を保持する", () => {
  const hashA = "a".repeat(64);
  const hashB = "b".repeat(64);
  const scan = makeScan({
    id: "fingerprinted",
    rows: [],
    sourceFingerprint: {
      algorithm: "SHA-256",
      hash: hashA,
      fileCount: 1,
      fileHashes: [hashB],
    },
    analysisEngineVersion: "test-version",
  });
  assert.deepEqual(scan.sourceFingerprint, {
    algorithm: "SHA-256",
    hash: hashA,
    fileCount: 1,
    fileHashes: [hashB],
  });
  assert.equal(scan.analysisEngineVersion, "test-version");
});
