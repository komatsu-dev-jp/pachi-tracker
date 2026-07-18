import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMonthProjection,
  buildDailyResearchSelection,
  buildResearchAllocation,
  buildResearchPackageCandidates,
  buildRiskSnapshot,
  buildStyleCandidates,
  buildVolatilityReference,
  classifyMachineVolatility,
  findExactMachine,
  getResearchTargetRole,
  getRealPL,
  normalizeResearchTargets,
  PLAY_STYLES,
  updateResearchTargets,
} from "../homePlanningModel.js";

const verifiedMachine = (name, stdDev, modelName = `${name}-MODEL`) => ({
  name,
  modelName,
  stdDev,
  stdDevMethod: "p-evidence-branching-v2",
});

test("実収支は現金収支と貯玉消費を合わせ、実データなしはnullにする", () => {
  assert.equal(getRealPL({ investYen: 10000, recoveryYen: 16000, chodamaYen: 1000 }), 5000);
  assert.equal(getRealPL({ chodamaYen: 2500 }), -2500);
  assert.equal(getRealPL({}), null);
});

test("検証済み標準偏差をセッション時点の円換算付きで固定保存する", () => {
  const snapshot = buildRiskSnapshot({
    machine: { ...verifiedMachine("対象機", 12000, "P対象機ABC"), stdDevLabel: "P-EVIDENCE推定", dataUpdatedAt: "2026-07-18" },
    ballValueYen: 3.57,
    capturedAt: "2026-07-18T10:00:00.000Z",
  });
  assert.equal(snapshot.stdDevBalls, 12000);
  assert.equal(snapshot.referenceSpins, 2200);
  assert.equal(snapshot.ballValueYen, 3.57);
  assert.equal(snapshot.sourceDate, "2026-07-18");
  assert.equal(buildRiskSnapshot({ machine: { name: "未検証", stdDev: 12000 }, ballValueYen: 4 }), null);
});

test("標準偏差の固定保存では部分一致の別型式を採用しない", () => {
  const machines = [
    { ...verifiedMachine("e新世紀エヴァンゲリオン17", 21000), aliases: ["エヴァ17"] },
    { ...verifiedMachine("エヴァンゲリオン15", 17000), aliases: ["エヴァ15"] },
  ];
  assert.equal(findExactMachine(machines, "エヴァ"), null);
  assert.equal(findExactMachine(machines, "エヴァ17")?.name, "e新世紀エヴァンゲリオン17");
});

test("標準偏差の参照母集団は検証済みP-EVIDENCEだけで作る", () => {
  const reference = buildVolatilityReference([
    verifiedMachine("A", 10000),
    verifiedMachine("B", 20000),
    { name: "旧値", stdDev: 5000 },
    { name: "欠損", stdDevMethod: "p-evidence-branching-v2" },
  ]);
  assert.deepEqual(reference.values, [10000, 20000]);
  assert.equal(reference.sampleSize, 2);
});

test("同順位を中間順位で安定・標準・高変動に分類する", () => {
  const machines = Array.from({ length: 9 }, (_, index) => verifiedMachine(String(index + 1), (index + 1) * 1000));
  const reference = buildVolatilityReference(machines);
  assert.equal(classifyMachineVolatility(1000, reference).tier, "stable");
  assert.equal(classifyMachineVolatility(4000, reference).tier, "balanced");
  assert.equal(classifyMachineVolatility(8000, reference).tier, "high");
  assert.equal(classifyMachineVolatility(null, reference).tier, "unknown");
});

test("稼働スタイルごとに標準偏差の対象範囲を変える", () => {
  const machines = [
    verifiedMachine("PA海物語 安定", 1000),
    verifiedMachine("低変動B", 2000),
    verifiedMachine("標準A", 4000),
    verifiedMachine("標準B", 5000),
    verifiedMachine("e牙狼 高変動", 8000),
    verifiedMachine("エヴァンゲリオン 高変動", 9000),
  ];
  assert.equal(buildStyleCandidates(machines, "stable", 2)[0].name, "PA海物語 安定");
  assert.ok(buildStyleCandidates(machines, "balanced", 3).every((row) => row.riskTier !== "high"));
  const evCandidates = buildStyleCandidates(machines, "ev", 3);
  assert.equal(evCandidates[0].riskTier, "high");
  assert.ok(new Set(evCandidates.map((row) => row.riskTier)).size >= 2);
});

test("リサーチ配分は資金ではなく調査時間として合計が一致する", () => {
  for (const researchPackage of Object.values(PLAY_STYLES)) {
    assert.equal(Object.values(researchPackage.allocation).reduce((sum, value) => sum + value, 0), 100);
  }
  const result = buildResearchAllocation("balanced", ["2026-07-20", "2026-07-22", "2026-07-25"], 3);
  assert.equal(result.totalMinutes, 540);
  assert.equal(Object.values(result.minutesByTier).reduce((sum, value) => sum + value, 0), result.totalMinutes);
  assert.deepEqual(result.minutesByTier, { stable: 216, balanced: 216, high: 108 });
  assert.equal(buildResearchAllocation("stable", [], 3).totalMinutes, 0);
});

test("A＋Cパッケージは選択直後に変動帯の異なる機種候補を返す", () => {
  const machines = Array.from({ length: 15 }, (_, index) => verifiedMachine(`機種${index + 1}`, (index + 1) * 1000));
  assert.deepEqual(
    buildResearchPackageCandidates(machines, "stable", 5, { storeId: "store-1" }).map((row) => row.riskTier),
    ["stable", "stable", "stable", "balanced", "balanced"]
  );
  assert.deepEqual(
    buildResearchPackageCandidates(machines, "balanced", 5, { storeId: "store-1" }).map((row) => row.riskTier),
    ["stable", "balanced", "stable", "balanced", "high"]
  );
  assert.deepEqual(
    buildResearchPackageCandidates(machines, "ev", 5, { storeId: "store-1" }).map((row) => row.riskTier),
    ["high", "balanced", "high", "stable", "high"]
  );
  assert.ok(buildResearchPackageCandidates(machines, "balanced", 1, { storeId: "store-1" })[0].key.startsWith("store-1::"));
  assert.equal(PLAY_STYLES.ev.label, "変動許容");
});

test("日別スタイルを変えた時は月間の本命を流用せず、そのスタイル用に選び直す", () => {
  const machines = Array.from({ length: 15 }, (_, index) => verifiedMachine(`機種${index + 1}`, (index + 1) * 1000));
  const stableCandidates = buildResearchPackageCandidates(machines, "stable", 5, { storeId: "store-1" });
  const basePlan = {
    status: "research-ready",
    researchPackageId: "stable",
    defaultStoreId: "store-1",
    researchTargets: {
      primaryMachineKey: stableCandidates[0].key,
      backupMachineKeys: [stableCandidates[1].key],
    },
    candidateSnapshot: { candidates: stableCandidates },
  };

  const inherited = buildDailyResearchSelection(machines, "stable", basePlan, { storeId: "store-1" });
  assert.equal(inherited.status, "research-ready");
  assert.equal(inherited.inherited, true);
  assert.equal(inherited.researchTargets.primaryMachineKey, stableCandidates[0].key);

  const changed = buildDailyResearchSelection(machines, "ev", basePlan, { storeId: "store-1" });
  assert.equal(changed.status, "needs-review");
  assert.equal(changed.inherited, false);
  assert.equal(changed.researchTargets.primaryMachineKey, "");
  assert.equal(changed.candidates[0].riskTier, "high");
  assert.ok(changed.candidates.some((candidate) => candidate.riskTier === "balanced"));

  const noStore = buildDailyResearchSelection(machines, "stable", basePlan, { storeId: null });
  assert.equal(noStore.status, "needs-review", "有効な店舗がなければ月間の本命を引き継いで準備完了にしない");
  assert.equal(noStore.researchTargets.primaryMachineKey, "");

  const skipped = buildDailyResearchSelection(machines, "skip", basePlan, { storeId: "store-1" });
  assert.equal(skipped.status, "skip");
  assert.equal(skipped.candidates.length, 0);
});

test("本命1件・予備2件・除外は重複せず、3件目の予備を黙って入れ替えない", () => {
  let targets = normalizeResearchTargets();
  targets = updateResearchTargets(targets, "A", "primary");
  targets = updateResearchTargets(targets, "B", "backup");
  targets = updateResearchTargets(targets, "C", "backup");
  targets = updateResearchTargets(targets, "D", "backup");
  assert.equal(targets.primaryMachineKey, "A");
  assert.deepEqual(targets.backupMachineKeys, ["B", "C"]);
  assert.equal(getResearchTargetRole(targets, "D"), "candidate");

  targets = updateResearchTargets(targets, "B", "primary");
  assert.equal(targets.primaryMachineKey, "B");
  assert.deepEqual(targets.backupMachineKeys, ["C"]);
  targets = updateResearchTargets(targets, "B", "excluded");
  assert.equal(targets.primaryMachineKey, "");
  assert.equal(getResearchTargetRole(targets, "B"), "excluded");
});

test("月末収支は現在収支に残り期待値を足し、中央80%幅を標準偏差から出す", () => {
  const machines = [verifiedMachine("対象機", 1000)];
  const archives = [
    {
      date: "2026-07-02",
      machineName: "対象機",
      investYen: 10000,
      recoveryYen: 7000,
      chodamaYen: 1000,
      settings: { ballVal: 4 },
      stats: { netRot: 2200, workAmount: 2500 },
    },
    {
      date: "2026-07-05",
      machineName: "対象機",
      investYen: 10000,
      recoveryYen: 18000,
      settings: { ballVal: 4 },
      stats: { netRot: 2200, effectiveWorkAmount: 3500 },
    },
  ];
  const result = buildMonthProjection({ archives, machines, now: new Date(2026, 6, 10, 12) });

  assert.equal(result.currentActual, 4000);
  assert.equal(result.currentExpected, 6000);
  assert.equal(result.actualExpectedGap, -2000);
  assert.equal(result.center, 16600);
  assert.equal(result.status, "ready");
  assert.equal(result.riskCoverage, 100);
  assert.ok(result.low < result.center);
  assert.ok(result.high > result.center);
  assert.deepEqual(result.projectionByDay.get(10), { center: 4000, low: 4000, high: 4000 });
});

test("標準偏差が確認できない場合は見込み幅を0扱いにしない", () => {
  const result = buildMonthProjection({
    archives: [{ date: "2026-07-02", investYen: 1000, recoveryYen: 2000, stats: { workAmount: 500 } }],
    machines: [],
    now: new Date(2026, 6, 10),
  });
  assert.equal(result.status, "insufficient");
  assert.equal(result.low, null);
  assert.equal(result.high, null);
});

test("実収支未入力の記録は欠損差から除外し、月末収支を断定しない", () => {
  const machines = [verifiedMachine("対象機", 1000)];
  const result = buildMonthProjection({
    archives: [
      { date: "2026-07-02", machineName: "対象機", investYen: 1000, recoveryYen: 2000, settings: { ballVal: 4 }, stats: { netRot: 2200, workAmount: 300 } },
      { date: "2026-07-04", machineName: "対象機", settings: { ballVal: 4 }, stats: { netRot: 2200, workAmount: 5000 } },
    ],
    machines,
    now: new Date(2026, 6, 10),
  });
  assert.equal(result.currentActual, 1000);
  assert.equal(result.comparableExpected, 300);
  assert.equal(result.actualExpectedGap, 700);
  assert.equal(result.actualCoverage, 50);
  assert.equal(result.status, "incomplete-actual");
  assert.equal(result.center, null);
  assert.equal(result.low, null);
});
