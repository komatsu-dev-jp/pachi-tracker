import test from "node:test";
import assert from "node:assert/strict";
import { deriveFromRows } from "../logic.js";
import {
  PACHINKO_RATE_PRESETS,
  ballsForInvestment,
  rentalYenPerBall,
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
