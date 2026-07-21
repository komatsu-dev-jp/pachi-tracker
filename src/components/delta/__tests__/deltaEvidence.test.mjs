import assert from "node:assert/strict";
import {
  estimateDeltaObservation,
  buildDeltaEvidence,
  collectDeltaRows,
  resolveMachineStats,
  findMachineSpec,
  buildRowDeltaEvidence,
} from "../deltaEvidence.js";

const machine = {
  name: "P大海物語5 MTE2",
  border: { "4.00": 16.7 },
  avgPayoutPerHit: 1350,
  stdDev: 13000,
};

// P-EVIDENCE raw_data の実例: 666回転、17回当り、差玉+15,000玉。
const observed = estimateDeltaObservation({ normalSpins: 666, totalStarts: 17, val: 15000 }, machine);
assert.equal(observed.valid, true);
assert.equal(observed.estimatedInputBalls, 7950);
assert.ok(Math.abs(observed.observedRotation - 20.9433962264) < 1e-9);

assert.equal(estimateDeltaObservation({ normalSpins: 100, totalStarts: 1, val: 5000 }, machine).valid, false);
assert.equal(estimateDeltaObservation({ normalSpins: 0, totalStarts: 0, val: -5000 }, machine).valid, false);
assert.deepEqual(
  estimateDeltaObservation({ normalSpins: 631, totalStarts: 40, val: null, status: "bounded" }, machine),
  { valid: false, reason: "差玉は境界到達記録" },
  "範囲記録を差玉0として予測へ混ぜない",
);
assert.equal(
  estimateDeltaObservation({ normalSpins: 631, totalStarts: 40, val: null }, machine).reason,
  "確定差玉なし",
);

const scans = [{
  storeId: "s1", storeName: "店", date: "2026-01-22", createdAt: "2026-01-22T12:00:00Z",
  rows: [
    { num: "479", machineName: machine.name, normalSpins: 666, totalStarts: 17, val: 15000 },
    { num: "480", machineName: machine.name, normalSpins: 500, totalStarts: 4, val: -5000 },
  ],
}];
assert.equal(collectDeltaRows(scans, { storeId: "s1", machineName: machine.name, num: "479" }).length, 1);

const result = buildDeltaEvidence(collectDeltaRows(scans, { machineName: machine.name }), machine);
assert.equal(result.hasEstimate, true);
assert.equal(result.observationCount, 2);
assert.ok(result.predictedRotation > 0);
assert.ok(result.confidence >= 0 && result.confidence <= 1);
assert.ok(result.predictedLow <= result.predictedRotation);
assert.ok(result.predictedHigh >= result.predictedRotation);

const lowSd = buildDeltaEvidence(scans[0].rows, { ...machine, stdDev: 3000 });
const highSd = buildDeltaEvidence(scans[0].rows, { ...machine, stdDev: 19000 });
assert.ok(lowSd.confidence > highSd.confidence, "標準偏差が大きい機種ほど信頼度を下げる");

// 信頼区間: SE×信頼度の二重掛けを廃止（ベイズ事後分散へ統一）したため、
// ブレが大きい機種ほど予測レンジが広く、かつ事前分布の幅（±1.96×2回/K）を超えない
const lowSdWidth = lowSd.predictedHigh - lowSd.predictedLow;
const highSdWidth = highSd.predictedHigh - highSd.predictedLow;
assert.ok(highSdWidth > lowSdWidth, "標準偏差が大きい機種ほど予測レンジを広げる");
assert.ok(highSdWidth <= 2 * 1.96 * 2 + 1e-9, "予測レンジは事前分布の幅を超えない");
assert.ok(lowSdWidth > 0, "データが少なくても予測レンジが幅0に潰れない");

const legacy = resolveMachineStats({ spec1R: 130, roundDist: "4R:50%, 10R:50%" });
assert.equal(legacy.avgPayout, 910);
assert.ok(legacy.stdDev >= 3000);
assert.equal(legacy.derived, true);

const correctedMaster = {
  name: "エヴァンゲリオン15",
  dataUpdatedAt: "2026-07-13",
  border1K: 17,
  avgPayoutPerHit: 481.5,
};
const staleOverride = {
  ...correctedMaster,
  dataUpdatedAt: "2026/06/02 18:42",
  border1K: 22,
  avgPayoutPerHit: 1350,
};
assert.equal(
  findMachineSpec(correctedMaster.name, [staleOverride], [correctedMaster]),
  correctedMaster,
  "差玉解析でも古い保存値より更新版マスタを優先する",
);

const aliasedMachine = {
  ...machine,
  name: "P北斗の拳 暴凶星",
  aliases: ["P北斗の拳暴凶星SFPA"],
};
assert.equal(
  findMachineSpec("Ｐ北斗の拳暴凶星ＳＦＰＡ", [], [aliasedMachine]),
  aliasedMachine,
  "全角型式名でもaliasesを使って機種マスタへ照合する",
);

const rowPrediction = buildRowDeltaEvidence(
  { machineName: machine.name, normalSpins: 666, totalStarts: 17, val: 15000 },
  [],
  [machine],
);
assert.equal(rowPrediction.hasEstimate, true);
assert.ok(rowPrediction.evidence.predictedRotation > 0);
assert.equal(
  buildRowDeltaEvidence({ machineName: "未登録機種", normalSpins: 100, totalStarts: 1, val: -1000 }, [], [machine]).reason,
  "機種マスタ未登録",
);

console.log("deltaEvidence.test.mjs: all tests passed");
