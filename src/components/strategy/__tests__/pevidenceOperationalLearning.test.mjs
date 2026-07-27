import test from "node:test";
import assert from "node:assert/strict";

import { buildPEvidenceAnalytics } from "../../evidence/pevidenceAnalytics.js";
import { makeScan } from "../../delta/deltaSelectors.js";
import { buildPayoutCorrectionProfiles } from "../strategyMapData.js";

const machine = {
  name: "出玉補正テスト機",
  modelName: "P出玉補正TEST",
  modelVerified: true,
  allocationVerified: true,
  border1K: 18,
  avgPayoutPerHit: 1000,
  stdDev: 4000,
  stdDevMethod: "p-evidence-branching-v2",
  synthProb: 319.6,
  muraCoef: 50000,
};

function pairedScan(date, num = "101") {
  const normalSpins = 200;
  const totalStarts = 5;
  const actualRate = 20;
  const actualInputBalls = 250 * normalSpins / actualRate;
  const truePayout = 900;
  return {
    id: `scan-${date}`,
    storeId: "store-a",
    storeName: "出玉補正店",
    date,
    createdAt: `${date}T12:00:00.000Z`,
    rows: [{
      date,
      num,
      machineName: machine.name,
      island: "A島",
      normalSpins,
      totalStarts,
      val: totalStarts * truePayout - actualInputBalls,
    }],
  };
}

function pairedArchive(date, num = "101") {
  return {
    id: `archive-${date}`,
    date,
    createdAt: `${date}T20:00:00.000Z`,
    storeId: "store-a",
    storeName: "出玉補正店",
    machineName: machine.name,
    machineNum: num,
    settings: { rentBalls: 250 },
    stats: {
      start1K: 20,
      cashKCount: 3,
      netRot: 60,
    },
  };
}

test("実戦実測10ペアで店舗×機種の出玉係数を学び、証拠の翌日からだけ反映する", () => {
  const learningDates = Array.from(
    { length: 10 },
    (_, index) => `2026-07-${String(index + 1).padStart(2, "0")}`,
  );
  const scans = [
    ...learningDates.map((date) => pairedScan(date)),
    pairedScan("2026-07-11"),
  ];
  const archives = learningDates.map((date) => pairedArchive(date));
  const profiles = buildPayoutCorrectionProfiles({
    scans,
    archives,
    customMachines: [machine],
    evidenceBeforeDate: "2026-07-11",
  });
  const profile = profiles[0];

  assert.equal(profile.n, 10);
  assert.equal(profile.eligible, true);
  assert.ok(Math.abs(profile.appliedFactor - 0.9) < 1e-9);
  assert.ok(Math.abs(profile.correctedAvgPayout - 900) < 1e-9);
  assert.equal(profile.effectiveFrom, "2026-07-11");

  const analytics = buildPEvidenceAnalytics({
    scans,
    customMachines: [machine],
    payoutCorrections: profiles,
  });
  const historical = analytics.historyRows.find((row) => row.date === "2026-07-10");
  const current = analytics.currentRows[0];

  assert.equal(historical.payoutCorrection, null);
  assert.ok(Math.abs(historical.dailyRate - (200 / 12)) < 1e-9);
  assert.equal(current.payoutCorrection?.method, profile.method);
  assert.ok(Math.abs(current.dailyRate - 20) < 1e-9);
});

test("差玉保存時のイベント種別はスキャン本体へ残り、P-EVIDENCEが読める", () => {
  const saved = makeScan({
    id: "event-scan",
    storeId: "store-a",
    storeName: "出玉補正店",
    date: "2026-07-20",
    event: "old-event",
    machineName: machine.name,
    rows: pairedScan("2026-07-20").rows,
  });
  assert.equal(saved.event, "old-event");

  const analytics = buildPEvidenceAnalytics({
    scans: [saved],
    customMachines: [machine],
  });
  assert.equal(analytics.currentRows[0].event, "old-event");
});
