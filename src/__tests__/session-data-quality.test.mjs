import test from "node:test";
import assert from "node:assert/strict";
import {
  DATA_QUALITY_ACTIONS,
  attachDataQualitySnapshot,
  evaluateArchiveDataQuality,
  recordArchiveCorrections,
  recordDataQualityDecision,
  restoreArchiveCorrection,
  shouldUseArchiveForPrediction,
} from "../sessionDataQuality.js";

const base = {
  id: 1,
  date: "2026-07-26",
  storeId: "store-1",
  storeName: "確認店",
  machineName: "確認機種",
  machineNum: "123",
  investYen: 10000,
  recoveryYen: 12000,
  finalMochiBalls: 3000,
  settings: { rentBalls: 250, exRate: 250 },
  stats: { netRot: 300 },
};

test("持ち玉と回収額の不整合を、予測信頼度とは別の品質問題として返す", () => {
  const result = evaluateArchiveDataQuality({ ...base, recoveryYen: 1000 });
  assert.equal(result.predictionConfidence, null);
  assert.ok(result.issues.some((item) => item.ruleId === "settlement-balls"));
  assert.equal(result.adoption.explicitlyExcluded, false);
});

test("invalid store rent balls produces a manual-correction warning without inferring 39", () => {
  const archive = { ...base, settings: { rentBalls: 250, exRate: 250 } };
  const result = evaluateArchiveDataQuality(archive, {
    stores: [{ id: "store-1", rentBalls: 39, exRate: 1000 }],
  });
  const invalid = result.issues.find((item) => item.ruleId === "store-rent-balls-invalid");
  assert.equal(invalid.severity, "warning");
  assert.deepEqual(invalid.inferredValues, {});
  assert.ok(result.issues.every((item) => !Object.values(item.inferredValues).includes(39)));
  const rate = result.issues.find((item) => item.ruleId === "store-rate");
  assert.deepEqual(rate?.inferredValues, { "settings.exRate": 1000 });
  assert.equal(archive.settings.rentBalls, 250);
});

test("検出だけでは自動除外せず、明示操作のときだけ予測から除外する", () => {
  const snap = attachDataQualitySnapshot({ ...base, machineNum: "" });
  assert.equal(shouldUseArchiveForPrediction(snap), true);
  const excluded = recordDataQualityDecision(snap, {
    ruleId: "archive",
    action: DATA_QUALITY_ACTIONS.EXCLUDED,
  });
  assert.equal(shouldUseArchiveForPrediction(excluded), false);
  const included = recordDataQualityDecision(excluded, {
    ruleId: "archive",
    action: DATA_QUALITY_ACTIONS.INCLUDED,
  });
  assert.equal(shouldUseArchiveForPrediction(included), true);
});

test("手動修正は元データ・修正値・履歴を分離し、元に戻せる", () => {
  const corrected = recordArchiveCorrections(base, { ...base, recoveryYen: 11000 });
  assert.equal(corrected.dataQuality.originalValues.recoveryYen, 12000);
  assert.equal(corrected.dataQuality.currentValues.recoveryYen, 11000);
  const entry = corrected.dataQuality.history.find((item) => item.kind === "correction");
  assert.ok(entry);
  const restored = restoreArchiveCorrection(corrected, entry.id);
  assert.equal(restored.recoveryYen, 12000);
  assert.ok(restored.dataQuality.history.some((item) => item.action === DATA_QUALITY_ACTIONS.RESTORED));
});

test("店舗レート差と重複候補を検出するが、自動で値を変えない", () => {
  const archive = { ...base, settings: { rentBalls: 250, exRate: 250 } };
  const result = evaluateArchiveDataQuality(archive, {
    stores: [{ id: "store-1", name: "確認店", rentBalls: 1000, exRate: 1000 }],
    archives: [{ ...base, id: 2 }],
  });
  assert.ok(result.issues.some((item) => item.ruleId === "store-rate"));
  assert.ok(result.issues.some((item) => item.ruleId === "duplicate-record"));
  assert.deepEqual(archive.settings, { rentBalls: 250, exRate: 250 });
});
