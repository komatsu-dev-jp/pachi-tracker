import assert from "node:assert/strict";
import {
  estimateDeltaObservation,
  buildDeltaEvidence,
  collectDeltaRows,
  resolveMachineStats,
  findMachineSpec,
  buildRowDeltaEvidence,
  validateDeltaRowMachineAssignments,
} from "../deltaEvidence.js";
import { machineDB } from "../../../machineDB.js";

const machine = {
  name: "P大海物語5 MTE2",
  border: { "4.00": 16.7 },
  avgPayoutPerHit: 1400,
  payoutStdDevPerHit: 0,
  payoutStdDevPerHitMethod: "allocation-exact-v1",
  stdDev: 13000,
};

// P-EVIDENCE raw_data の実例: 666回転、17回当り、差玉+15,000玉。
const observed = estimateDeltaObservation({ normalSpins: 666, totalStarts: 17, val: 15000 }, machine);
assert.equal(observed.valid, true);
assert.equal(observed.estimatedInputBalls, 8800);
assert.ok(Math.abs(observed.observedRotation - 18.9204545455) < 1e-9);
assert.equal(observed.payoutVariance, 0, "固定10R機は大当り1回ごとの出玉分散を足さない");
assert.equal(observed.payoutStdDevPerHit, 0);
assert.equal(observed.sessionStdDevExcluded, 13000, "実戦収支の荒さは観測誤差から分離する");

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
const partialRows = collectDeltaRows([{
  ...scans[0],
  rows: [
    scans[0].rows[0],
    { ...scans[0].rows[1], num: "481", val: null, status: "failed" },
    { ...scans[0].rows[1], num: "482", val: 0, status: "review", reviewConfirmed: false },
    { ...scans[0].rows[1], num: "483", val: 500, status: "review", reviewConfirmed: true },
  ],
}], { machineName: machine.name });
assert.deepEqual(partialRows.map((row) => row.num), ["479", "483"], "未読取・未確認を分析母数へ入れない");

const result = buildDeltaEvidence(collectDeltaRows(scans, { machineName: machine.name }), machine);
assert.equal(result.hasEstimate, true);
assert.equal(result.observationCount, 2);
assert.ok(result.predictedRotation > 0);
assert.ok(result.confidence >= 0 && result.confidence <= 1);
assert.ok(result.predictedLow <= result.predictedRotation);
assert.ok(result.predictedHigh >= result.predictedRotation);

const lowSd = buildDeltaEvidence(scans[0].rows, { ...machine, stdDev: 3000 });
const highSd = buildDeltaEvidence(scans[0].rows, { ...machine, stdDev: 19000 });
assert.equal(lowSd.confidence, highSd.confidence, "実戦収支の標準偏差は回転率の観測誤差へ流用しない");
assert.equal(lowSd.predictedLow, highSd.predictedLow);
assert.equal(lowSd.predictedHigh, highSd.predictedHigh);

// 信頼区間: SE×信頼度の二重掛けを廃止（ベイズ事後分散へ統一）したため、
// 1回当り出玉のばらつきが大きい場合だけ観測信頼度を下げ、予測レンジを広げる。
const fixedPayout = buildDeltaEvidence(scans[0].rows, { ...machine, payoutStdDevPerHit: 0 });
const variablePayout = buildDeltaEvidence(scans[0].rows, { ...machine, payoutStdDevPerHit: 500 });
const fixedWidth = fixedPayout.predictedHigh - fixedPayout.predictedLow;
const variableWidth = variablePayout.predictedHigh - variablePayout.predictedLow;
assert.ok(fixedPayout.confidence > variablePayout.confidence, "大当り1回ごとの出玉誤差が大きいほど信頼度を下げる");
assert.ok(variableWidth > fixedWidth, "大当り1回ごとの出玉誤差が大きいほど予測レンジを広げる");
assert.ok(variableWidth <= 2 * 1.96 * 2 + 1e-9, "予測レンジは事前分布の幅を超えない");
assert.ok(fixedWidth > 0, "データが少なくても予測レンジが幅0に潰れない");

const legacy = resolveMachineStats({ spec1R: 130, roundDist: "4R:50%, 10R:50%" });
assert.equal(legacy.avgPayout, 910);
assert.equal(legacy.sessionStdDev, 0);
assert.equal(legacy.payoutStdDevPerHit, 390);
assert.equal(legacy.derived, true);
const fallback = resolveMachineStats({ avgPayoutPerHit: 1000, stdDev: 19000 });
assert.equal(fallback.payoutStdDevPerHit, 100, "振分不明の旧データだけは上限付き10%誤差を使う");
assert.equal(fallback.sessionStdDev, 19000);

const oldGhoul = findMachineSpec("e東京喰種", [], machineDB);
const newGhoul = findMachineSpec("e 東京喰種 超デカ超一撃ver.", [], machineDB);
assert.equal(oldGhoul?.name, "e東京喰種W", "販売名だけの旧東京喰種をW型式へ照合する");
assert.equal(
  newGhoul?.name,
  "e 東京喰種 超デカ超一撃ver.",
  "販売名だけの旧東京喰種を超デカ超一撃ver.へ誤照合しない",
);

const lycorisMachine = machineDB.find((item) => item.name === "eリコリス・リコイル");
const lycorisCounterRow = {
  normalSpins: 1000,
  totalStarts: 15,
  firstHitCount: 4,
  val: -2161,
  status: "ok",
};
const lycorisLegacyEstimate = estimateDeltaObservation(
  lycorisCounterRow,
  { ...lycorisMachine, avgPayoutPerHit: 1200, deltaCounterModel: undefined },
);
assert.ok(
  Math.abs(lycorisLegacyEstimate.observedRotation - 12.4001785626) < 1e-9,
  "旧式は5Rの分割当り15回を各1200玉として12.4回/Kへ誤落下する",
);

const lycorisCounterEstimate = estimateDeltaObservation(lycorisCounterRow, lycorisMachine);
assert.equal(lycorisCounterEstimate.valid, true);
assert.equal(lycorisCounterEstimate.payoutEstimateSource, "first-hit-initial-award-mix");
assert.equal(lycorisCounterEstimate.estimatedReducedPayoutCount, 4);
assert.ok(Math.abs(lycorisCounterEstimate.estimatedPayoutBalls - 10363.6) < 1e-9);
assert.ok(
  Math.abs(lycorisCounterEstimate.observedRotation - 19.9607173083) < 1e-9,
  "5R・750玉単位と初当り平均528.4玉へ直すと現実的な約20回/Kへ戻る",
);
assert.ok(
  lycorisCounterEstimate.inputVariance > (500 ** 2) / 12,
  "3R/4R/10Rの初当り振分による出玉幅も観測誤差へ含める",
);

const lycorisFallbackEstimate = estimateDeltaObservation(
  { normalSpins: 700, totalStarts: 10, val: -3000, status: "ok" },
  lycorisMachine,
);
assert.equal(lycorisFallbackEstimate.valid, true);
assert.equal(lycorisFallbackEstimate.payoutEstimateSource, "normal-spins-initial-award-mix");
assert.ok(
  Math.abs(lycorisFallbackEstimate.observedRotation - 17.6719562318) < 1e-9,
  "初当り回数がない旧保存データも通常回転数と1/259.7から安全に補正する",
);

const ghoulFallback = estimateDeltaObservation(
  { normalSpins: 700, totalStarts: 5, val: -3000, status: "ok" },
  oldGhoul,
);
assert.equal(ghoulFallback.valid, true);
assert.ok(Math.abs(ghoulFallback.observedRotation - 20.8346358237) < 1e-9);
assert.equal(ghoulFallback.payoutEstimateSource, "normal-spins-charge-estimate");
assert.ok(ghoulFallback.observedRotation >= 10);

const ghoulWithFirstHits = estimateDeltaObservation(
  { normalSpins: 700, totalStarts: 5, firstHitCount: 3, val: -3000, status: "ok" },
  oldGhoul,
);
assert.equal(ghoulWithFirstHits.valid, true);
assert.equal(ghoulWithFirstHits.estimatedPayoutBalls, 5682);
assert.ok(Math.abs(ghoulWithFirstHits.observedRotation - 20.1566459341) < 1e-9);
assert.equal(ghoulWithFirstHits.payoutEstimateSource, "first-hit-charge-estimate");

const impossibleGhoul = estimateDeltaObservation(
  { normalSpins: 700, totalStarts: 30, val: -3000, status: "ok" },
  oldGhoul,
);
assert.equal(impossibleGhoul.valid, false);
assert.equal(impossibleGhoul.reason, "チャージ内訳または大当り回数を確認");
assert.ok(impossibleGhoul.observedRotation < 10, "10未満を正常値として丸めて表示しない");

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

assert.deepEqual(
  validateDeltaRowMachineAssignments(
    [{ machineName: machine.name }, { machineName: "" }, { machineName: "未登録機種" }],
    [],
    [machine],
  ),
  {
    valid: false,
    total: 3,
    missingCount: 1,
    missingIndices: [1],
    unregisteredCount: 1,
    unregisteredIndices: [2],
  },
  "保存候補に機種名なし・未登録機種があれば保存を止める",
);
assert.equal(
  validateDeltaRowMachineAssignments(
    [{ machineName: "Ｐ大海物語５ MTE2" }],
    [],
    [machine],
  ).valid,
  true,
  "表記ゆれでも機種マスターへ安全に照合できれば保存できる",
);

console.log("deltaEvidence.test.mjs: all tests passed");
