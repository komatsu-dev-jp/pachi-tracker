import test from "node:test";
import assert from "node:assert/strict";
import { deriveFromRows } from "../logic.js";
import {
  PACHINKO_RATE_PRESETS,
  ballsForInvestment,
  formatPachinkoRateLabel,
  getPushCorrectionAmounts,
  rentalYenPerBall,
  resolvePachinkoRateContext,
} from "../rateSettings.js";

test("1円パチンコは200円の記録で200玉として換算する", () => {
  assert.equal(rentalYenPerBall(1000), 1);
  assert.equal(ballsForInvestment(200, 1000), 200);
});
test("低貸しプリセットは1回200玉、4円は従来どおり1,000円250玉", () => {
  const quantities = PACHINKO_RATE_PRESETS.map((preset) => ({
    label: preset.label,
    balls: ballsForInvestment(preset.recommendedInvestPace, preset.rentBalls),
  }));
  assert.deepEqual(quantities, [
    { label: "4円", balls: 250 },
    { label: "2円", balls: 200 },
    { label: "1円", balls: 200 },
    { label: "0.5円", balls: 200 },
  ]);
});

test("プッシュ補正額は貸玉レートの記録単位に合わせて切り替わる", () => {
  assert.deepEqual(getPushCorrectionAmounts(250), [500, 1000]);
  assert.deepEqual(getPushCorrectionAmounts(500), [200, 400]);
  assert.deepEqual(getPushCorrectionAmounts(1000), [100, 200]);
  assert.deepEqual(getPushCorrectionAmounts(2000), [50, 100]);
});

test("カスタム貸玉レートは現在の記録単位を補正候補に使う", () => {
  assert.deepEqual(getPushCorrectionAmounts(400, 600), [300, 600]);
});

test("1円で200玉ずつ5回記録すると現金・持ち玉とも正確に1K分になる", () => {
  const cashRows = Array.from({ length: 5 }, (_, index) => ({
    type: "data",
    mode: "cash",
    thisRot: 20,
    invest: (index + 1) * 200,
  }));
  const heldRows = Array.from({ length: 5 }, () => ({
    type: "data",
    mode: "mochi",
    thisRot: 20,
    invest: 0,
    ballsConsumed: 200,
  }));

  const cash = deriveFromRows(cashRows, 0, 1000);
  const held = deriveFromRows(heldRows, 0, 1000);

  assert.equal(cash.rot, 100);
  assert.equal(cash.cashKCount, 1);
  assert.equal(held.rot, 100);
  assert.equal(held.mochiKCount, 1);
});

test("選択店舗の1円貸し・非等価交換を遊タイム計算へ優先する", () => {
  const result = resolvePachinkoRateContext({
    stores: [
      { id: 10, name: "テスト店", rentBalls: 1000, exRate: 1120 },
      { id: 20, name: "別店舗", rentBalls: 250, exRate: 280 },
    ],
    selectedStoreId: "10",
    rentBalls: 250,
    exRate: 250,
  });

  assert.deepEqual(result, {
    rentBalls: 1000,
    exRate: 1120,
    rateLabel: "1円",
    source: "store",
    storeId: 10,
    storeName: "テスト店",
  });
});

test("店舗未選択ならアプリ設定を使い、カスタム貸玉も表示できる", () => {
  const result = resolvePachinkoRateContext({
    stores: [],
    selectedStoreId: null,
    rentBalls: 400,
    exRate: 450,
  });

  assert.equal(result.rentBalls, 400);
  assert.equal(result.exRate, 450);
  assert.equal(result.source, "app");
  assert.equal(formatPachinkoRateLabel(result.rentBalls), "2.5円");
});
