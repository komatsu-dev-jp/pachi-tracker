import assert from "node:assert/strict";
import test from "node:test";

import {
  OBSERVED_CONTEXT_CORRECTION_SCHEMA,
  canonicalizeTrustedObservedStoreName,
  repairTrustedObservedStoreAliases,
} from "../pushContextAliases.js";
import {
  AUTO_HEADER_CONTEXT_ENGINE_VERSION,
  AUTO_HEADER_CONTEXT_SOURCE,
} from "../pushInbox.js";

const contextEvidence = {
  source: AUTO_HEADER_CONTEXT_SOURCE,
  version: 1,
  profileVotes: 2,
  headerFileCount: 1,
};
const sourceFingerprint = {
  algorithm: "SHA-256",
  hash: "a".repeat(64),
  fileCount: 4,
};

function trustedScan(overrides = {}) {
  return {
    id: "scan-tokyo-ghoul",
    storeId: null,
    storeName: "スーバーキスケPA0",
    machineName: "e東京喰種",
    analysisEngineVersion: AUTO_HEADER_CONTEXT_ENGINE_VERSION,
    contextEvidence,
    sourceFingerprint,
    rows: [{ num: "758", val: 30000 }],
    ...overrides,
  };
}

test("信頼済みの既知OCR誤読だけを登録済み店舗へ付け替える", () => {
  const target = trustedScan();
  const manual = trustedScan({
    id: "manual",
    analysisEngineVersion: "manual-v1",
  });
  const unrelated = trustedScan({ id: "unrelated", storeName: "別店PA0" });
  const invalidFingerprint = trustedScan({
    id: "invalid-fingerprint",
    sourceFingerprint: { ...sourceFingerprint, hash: "invalid" },
  });
  const alreadyLinked = trustedScan({ id: "linked", storeId: "other-store" });
  const input = [target, manual, unrelated, invalidFingerprint, alreadyLinked];
  const stores = [{ id: "kisuke-pao", name: "スーパーキスケPAO" }];
  const correctedAt = "2026-08-01T00:00:00.000Z";

  const result = repairTrustedObservedStoreAliases(input, stores, { correctedAt });
  assert.equal(result.repairedCount, 1);
  assert.equal(result.scans[0].storeId, "kisuke-pao");
  assert.equal(result.scans[0].storeName, "スーパーキスケPAO");
  assert.strictEqual(result.scans[0].rows, target.rows);
  assert.strictEqual(result.scans[0].sourceFingerprint, target.sourceFingerprint);
  assert.deepEqual(result.scans[0].contextCorrection, {
    schema: OBSERVED_CONTEXT_CORRECTION_SCHEMA,
    version: 1,
    reason: "known-site7-ocr-alias",
    fromStoreName: "スーバーキスケPA0",
    toStoreName: "スーパーキスケPAO",
    correctedAt,
  });
  assert.strictEqual(result.scans[1], manual);
  assert.strictEqual(result.scans[2], unrelated);
  assert.strictEqual(result.scans[3], invalidFingerprint);
  assert.strictEqual(result.scans[4], alreadyLinked);

  const second = repairTrustedObservedStoreAliases(result.scans, stores, { correctedAt });
  assert.equal(second.repairedCount, 0);
  assert.strictEqual(second.scans, result.scans);
});

test("完全一致しない店舗名は補正しない", () => {
  assert.equal(
    canonicalizeTrustedObservedStoreName("スーバーキスケPA0"),
    "スーパーキスケPAO",
  );
  assert.equal(canonicalizeTrustedObservedStoreName("別店PA0"), "別店PA0");
});
