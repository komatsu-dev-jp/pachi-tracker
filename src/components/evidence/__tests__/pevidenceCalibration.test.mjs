import assert from "node:assert/strict";
import {
  applyCalibrationCandidate,
  priorBallsForEvidenceDate,
} from "../pevidenceCalibration.js";

const sourceMachine = {
  id: 7001,
  name: "P校正テスト機",
  aliases: ["校正テスト"],
  modelName: "PTEST-01",
  modelVerified: true,
  modelSourceUrl: "https://example.test/model",
  maker: "テストメーカー",
  type: "ミドル",
  prob: "1/319.6",
  synthProb: 319.6,
  border1K: 18.2,
  border: { "4.00": 18.2, "1.00": 19.4 },
  prize: 3,
  avgPayoutPerHit: 1400,
  stdDev: 12000,
  muraCoef: 60000,
  allocationVerified: true,
  hesoModes: [{
    name: "特図1",
    rows: [
      { rounds: 10, payout: 1500, rate: 50, destination: "RUSH" },
      { rounds: 2, payout: 300, rate: 50, destination: "通常" },
    ],
  }],
  rushModes: [{
    name: "特図2",
    rows: [{ rounds: 10, payout: 1500, rate: 100 }],
  }],
  roundDist: "10R:50%, 2R:50%",
  rushDist: "10R:100%",
  yutime: {
    triggerLowSpins: 950,
    durationSpins: 1200,
    expectedNetBalls: 2200,
    source: "master",
  },
  auditTrail: { source: "fixture", verified: true },
  pevidenceCalibrationHistory: [{
    id: "first-calibration",
    approvedAt: "2026-05-02T09:00:00.000Z",
    effectiveFrom: "2026-05-01",
    evidenceThroughDate: "2026-05-01",
    sampleCount: 20,
    previousPriorBalls: 50000,
    appliedPriorBalls: 60000,
    method: "coverage-and-border-benchmark-v1",
    stores: ["store-a"],
  }],
};

const unrelatedMachine = {
  id: 7002,
  name: "P別機種",
  modelName: "POTHER-01",
  muraCoef: 40000,
};

const candidate = {
  machineName: "P校正テスト機",
  machineRecordName: "P校正テスト機",
  machineModelName: "PTEST-01",
  eligible: true,
  currentPriorBalls: 60000,
  recommendedPriorBalls: 75000,
  evidenceThroughDate: "2026-06-30",
  n: 44,
  method: "coverage-and-border-benchmark-v1",
  stores: ["store-a", "store-b", "store-a"],
};

const customMachines = [structuredClone(sourceMachine), structuredClone(unrelatedMachine)];
const originalCustomMachines = structuredClone(customMachines);
const approved = applyCalibrationCandidate(customMachines, candidate, {
  builtInMachines: [],
  approvedAt: "2026-07-01T10:11:12.000Z",
  recordId: 9999,
});

assert.equal(approved.ok, true);
assert.equal(approved.reason, null);
assert.deepEqual(customMachines, originalCustomMachines, "承認処理は入力配列を直接書き換えない");
assert.equal(approved.customMachines.length, 2, "同一機種は追加ではなく置換する");
assert.deepEqual(approved.customMachines[1], unrelatedMachine, "対象外の機種は変更しない");
assert.equal(approved.record.id, sourceMachine.id, "既存レコードのIDを維持する");
assert.equal(approved.record.name, sourceMachine.name);
assert.equal(approved.record.isCustom, true);
assert.equal(approved.record.muraCoef, 75000);
assert.equal(approved.record.dataUpdatedAt, "2026-07-01");

// 係数だけの部分レコードにせず、機種スペック一式を上書きレコードへ保持する。
for (const key of [
  "aliases",
  "modelName",
  "modelSourceUrl",
  "border",
  "hesoModes",
  "rushModes",
  "yutime",
  "auditTrail",
]) {
  assert.deepEqual(approved.record[key], sourceMachine[key], `${key} を完全な機種上書きに保持する`);
}

assert.equal(approved.record.pevidenceCalibrationHistory.length, 2);
assert.deepEqual(approved.record.pevidenceCalibrationHistory[0], sourceMachine.pevidenceCalibrationHistory[0]);
assert.deepEqual(approved.historyEntry, {
  id: "2026-07-01T10:11:12.000Z:coverage-and-border-benchmark-v1",
  approvedAt: "2026-07-01T10:11:12.000Z",
  effectiveFrom: "2026-07-01",
  evidenceThroughDate: "2026-06-30",
  sampleCount: 44,
  previousPriorBalls: 60000,
  appliedPriorBalls: 75000,
  method: "coverage-and-border-benchmark-v1",
  stores: ["store-a", "store-b"],
});

assert.equal(priorBallsForEvidenceDate(approved.record, "2026-04-30"), 50000);
assert.equal(priorBallsForEvidenceDate(approved.record, "2026-05-01"), 60000);
assert.equal(priorBallsForEvidenceDate(approved.record, "2026-06-29"), 60000);
assert.equal(priorBallsForEvidenceDate(approved.record, "2026-06-30"), 60000);
assert.equal(priorBallsForEvidenceDate(approved.record, "2026-07-01"), 75000);
assert.equal(priorBallsForEvidenceDate(approved.record, "2026-07-20"), 75000);

const secondApproval = applyCalibrationCandidate(approved.customMachines, {
  ...candidate,
  currentPriorBalls: 75000,
  recommendedPriorBalls: 90000,
  evidenceThroughDate: "2026-07-15",
  n: 70,
}, {
  builtInMachines: [],
  approvedAt: "2026-07-20T08:00:00.000Z",
});
assert.equal(secondApproval.ok, true);
assert.equal(secondApproval.record.pevidenceCalibrationHistory.length, 3);
assert.equal(priorBallsForEvidenceDate(secondApproval.record, "2026-07-14"), 75000);
assert.equal(priorBallsForEvidenceDate(secondApproval.record, "2026-07-15"), 75000);
assert.equal(priorBallsForEvidenceDate(secondApproval.record, "2026-07-16"), 75000);
assert.equal(priorBallsForEvidenceDate(secondApproval.record, "2026-07-20"), 90000);

const staleApproval = applyCalibrationCandidate(approved.customMachines, candidate, {
  builtInMachines: [],
  approvedAt: "2026-07-01T10:11:13.000Z",
});
assert.equal(staleApproval.ok, false, "同じ候補の二重承認を拒否する");
assert.equal(staleApproval.reason, "candidate-not-applicable");

const rejectedInput = structuredClone(approved.customMachines);
const rejected = applyCalibrationCandidate(rejectedInput, {
  ...candidate,
  currentPriorBalls: 75000,
  recommendedPriorBalls: 75000,
}, { builtInMachines: [] });
assert.deepEqual(rejected, {
  ok: false,
  reason: "candidate-not-applicable",
  customMachines: rejectedInput,
});
assert.deepEqual(rejectedInput, approved.customMachines);

console.log("pevidenceCalibration.test.mjs: all tests passed");
