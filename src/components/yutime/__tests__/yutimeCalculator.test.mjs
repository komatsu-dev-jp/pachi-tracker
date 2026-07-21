import assert from "node:assert/strict";
import {
  calculateYutimeEV,
  createYutimeSessionFromMachine,
  deriveCurrentLowProbabilitySpins,
  deriveNormalExpectedNetBalls,
  isYutimeTargetingSession,
  normalizeYutimeSpec,
  resolveYutimeStartAction,
} from "../yutimeCalculator.js";
import { deriveSpecForMachine, getYutimeSelectionMachines } from "../../../machineDB.js";

let passed = 0;
const test = (name, fn) => {
  fn();
  passed += 1;
  console.log(`PASS ${name}`);
};
const close = (actual, expected, tolerance = 1e-9) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
};

const base = {
  probabilityDenom: 319.6,
  triggerLowSpins: 950,
  currentLowSpins: 750,
  start1K: 18,
  normalExpectedNetBalls: 4800,
  yutimeExpectedNetBalls: 7000,
  rentBalls: 250,
  exRate: 250,
  playMode: "cash",
};

test("到達率と平均消化回転を幾何分布で計算", () => {
  const result = calculateYutimeEV(base);
  const p = 1 / 319.6;
  const expectedReach = Math.pow(1 - p, 200);
  close(result.reachProbability, expectedReach);
  close(result.expectedSpins, (1 - expectedReach) / p);
});

test("通常当たりと遊タイム回収を確率加重", () => {
  const result = calculateYutimeEV(base);
  const expectedBalls = (1 - result.reachProbability) * 4800 + result.reachProbability * 7000;
  close(result.expectedGrossBalls, expectedBalls);
  close(result.expectedReturnYen, expectedBalls * 4);
});

test("現金と持ち玉のコストを非等価で分離", () => {
  const result = calculateYutimeEV({ ...base, exRate: 280, playMode: "mochi" });
  close(result.cashCostPerSpin, 1000 / 18);
  close(result.heldCostPerSpin, (250 * (1000 / 280)) / 18);
  assert.equal(result.selectedEV, result.heldEV);
  assert.ok(result.heldEV > result.cashEV);
  close(result.arrivalInvestmentCash, 200 * (1000 / 18));
  close(result.arrivalInvestmentHeld, 200 * ((250 * (1000 / 280)) / 18));
});

test("当たらず遊タイムまで回す必要資金を逆算", () => {
  const result = calculateYutimeEV({ ...base, budgetYen: 5000 });
  close(result.selectedArrivalInvestment, 200 * (1000 / 18));
  assert.equal(result.affordableSpins, 90);
  assert.equal(result.budgetCoveredSpins, 90);
  close(result.budgetShortfallYen, result.selectedArrivalInvestment - 5000);
  assert.equal(result.budgetCanReach, false);
});

test("予算が十分なら不足0円・残額を返す", () => {
  const result = calculateYutimeEV({ ...base, budgetYen: 12000 });
  assert.equal(result.budgetShortfallYen, 0);
  close(result.budgetSurplusYen, 12000 - result.selectedArrivalInvestment);
  assert.equal(result.budgetCanReach, true);
});

test("1円パチンコの持ち玉コスト", () => {
  const result = calculateYutimeEV({ ...base, rentBalls: 1000, exRate: 1120, playMode: "chodama" });
  close(result.heldCostPerSpin, (1000 * (1000 / 1120)) / 18);
  assert.equal(result.playMode, "chodama");
});

test("発動到達済みは残り投資0", () => {
  const result = calculateYutimeEV({ ...base, currentLowSpins: 999 });
  assert.equal(result.remainingSpins, 0);
  assert.equal(result.reachProbability, 1);
  assert.equal(result.expectedSpins, 0);
  assert.equal(result.expectedInvestmentCash, 0);
  assert.equal(result.selectedArrivalInvestment, 0);
  assert.equal(result.cashEV, 7000 * 4);
});

test("スルー込み期待出玉0も有効", () => {
  const result = calculateYutimeEV({ ...base, yutimeExpectedNetBalls: 0 });
  assert.equal(result.valid, true);
  assert.ok(Number.isFinite(result.cashEV));
});

test("入力不足を0円と誤表示しない", () => {
  const result = calculateYutimeEV({ ...base, yutimeExpectedNetBalls: null });
  assert.equal(result.valid, false);
  assert.ok(result.missing.includes("yutimeExpectedNetBalls"));
  assert.equal(result.arrivalReady, true);
  close(result.selectedArrivalInvestment, 200 * (1000 / 18));
});

test("平均獲得玉が未確認でも遊タイム到達必要資金を表示できる", () => {
  const result = calculateYutimeEV({
    ...base,
    probabilityDenom: null,
    normalExpectedNetBalls: 0,
    yutimeExpectedNetBalls: null,
    triggerLowSpins: 260,
    currentLowSpins: 140,
    start1K: 15,
    budgetYen: 20000,
  });
  assert.equal(result.valid, false);
  assert.equal(result.arrivalReady, true);
  assert.equal(result.remainingSpins, 120);
  close(result.selectedArrivalInvestment, 8000);
  assert.equal(result.budgetCanReach, true);
  close(result.budgetSurplusYen, 12000);
});

test("花の慶次87ver.は確認済み平均獲得玉で自動計算できる", () => {
  const machine = getYutimeSelectionMachines().find((item) => item.name === "PA花の慶次～傾奇一転 87ver.");
  assert.ok(machine);
  assert.equal(machine.modelName, "PA花の慶次～傾奇一転N");
  assert.equal(machine.synthProb, 87.84);
  assert.equal(machine.yutime.expectedNetBalls, 1329.5);
  assert.equal(machine.normalExpectedNetBallsMethod, "published-simulation");
  const spec = deriveSpecForMachine(machine);
  close(deriveNormalExpectedNetBalls(spec), 1178.64);
  const result = calculateYutimeEV({
    probabilityDenom: machine.synthProb,
    triggerLowSpins: machine.yutime.triggerLowSpins,
    currentLowSpins: 140,
    start1K: 15,
    normalExpectedNetBalls: deriveNormalExpectedNetBalls(spec),
    yutimeExpectedNetBalls: machine.yutime.expectedNetBalls,
    rentBalls: 250,
    exRate: 250,
    playMode: "cash",
    budgetYen: 20000,
  });
  assert.equal(result.valid, true);
  assert.equal(result.remainingSpins, 120);
  close(result.selectedArrivalInvestment, 8000);
});

test("登録済みの全遊タイム搭載スペックは追加入力なしで期待値を算出できる", () => {
  const equippedMachines = getYutimeSelectionMachines().filter((machine) => machine.yutimeAudit?.status === "equipped");
  assert.equal(equippedMachines.length, 34);

  for (const machine of equippedMachines) {
    const spec = deriveSpecForMachine(machine);
    const result = calculateYutimeEV({
      probabilityDenom: machine.synthProb,
      triggerLowSpins: machine.yutime.triggerLowSpins,
      currentLowSpins: Math.max(0, machine.yutime.triggerLowSpins - 1),
      start1K: machine.border1K || machine.border?.["4.00"],
      normalExpectedNetBalls: deriveNormalExpectedNetBalls(spec),
      yutimeExpectedNetBalls: machine.yutime.expectedNetBalls,
      rentBalls: 250,
      exRate: 250,
      playMode: "cash",
      budgetYen: 20000,
    });
    assert.equal(result.valid, true, `${machine.name}: ${result.missing?.join(", ") || "不明な入力不足"}`);
  }
});

test("期待値入力不足時も持ち玉・非等価の到達資金を分離", () => {
  const result = calculateYutimeEV({
    ...base,
    yutimeExpectedNetBalls: null,
    triggerLowSpins: 260,
    currentLowSpins: 140,
    start1K: 15,
    exRate: 280,
    playMode: "mochi",
  });
  assert.equal(result.valid, false);
  assert.equal(result.arrivalReady, true);
  close(result.selectedArrivalInvestment, 120 * ((250 * (1000 / 280)) / 15));
});

test("1K回転率が未入力なら到達資金を推測しない", () => {
  const result = calculateYutimeEV({ ...base, start1K: null, yutimeExpectedNetBalls: null });
  assert.equal(result.valid, false);
  assert.equal(result.arrivalReady, false);
  assert.equal(result.selectedArrivalInvestment, undefined);
});

test("負数と異常確率を拒否", () => {
  const result = calculateYutimeEV({ ...base, probabilityDenom: 1, currentLowSpins: -1, yutimeExpectedNetBalls: -1 });
  assert.equal(result.valid, false);
  assert.ok(result.missing.includes("probabilityDenom"));
  assert.ok(result.missing.includes("currentLowSpins"));
  assert.ok(result.missing.includes("yutimeExpectedNetBalls"));
});

test("期待値0円以上になる開始回転を探索", () => {
  const result = calculateYutimeEV(base);
  assert.ok(Number.isInteger(result.breakEvenLowSpinsCash));
  const at = calculateYutimeEV({ ...base, currentLowSpins: result.breakEvenLowSpinsCash });
  assert.ok(at.cashEV >= 0);
  if (result.breakEvenLowSpinsCash > 0) {
    const before = calculateYutimeEV({ ...base, currentLowSpins: result.breakEvenLowSpinsCash - 1 });
    assert.ok(before.cashEV < 0);
  }
});

test("400回転着席から20回転で420回転", () => {
  const rows = [
    { type: "start", cumRot: 400, yutimeLowSpins: 400 },
    { type: "data", cumRot: 420, thisRot: 20 },
  ];
  assert.equal(deriveCurrentLowProbabilitySpins(rows), 420);
});

test("大当たり後0回転から20回転", () => {
  const rows = [
    { type: "start", cumRot: 400, yutimeLowSpins: 400 },
    { type: "data", cumRot: 430, thisRot: 30 },
    { type: "hit", cumRot: 430 },
    { type: "start", cumRot: 0, yutimeLowSpins: 0, isPostJackpotStart: true },
    { type: "data", cumRot: 20, thisRot: 20 },
  ];
  assert.equal(deriveCurrentLowProbabilitySpins(rows), 20);
});

test("旧rotRowsは最新cumRotへフォールバック", () => {
  assert.equal(deriveCurrentLowProbabilitySpins([
    { type: "start", cumRot: 400 },
    { type: "data", cumRot: 420, thisRot: 20 },
  ]), 420);
});

test("通常平均純増は既存式と同じ", () => {
  assert.equal(deriveNormalExpectedNetBalls({ spec1R: 140, specAvgRounds: 34.17, specSapo: -20 }), 4763.8);
  assert.equal(deriveNormalExpectedNetBalls({ spec1R: 140, specAvgRounds: 0, specSapo: 0 }), 4200);
});

test("機種遊タイム設定を正規化", () => {
  assert.deepEqual(normalizeYutimeSpec({
    triggerLowSpins: "950",
    durationSpins: "1200",
    expectedNetBalls: "7000",
    sourceUrl: " https://example.com ",
    verifiedAt: "2026-07-14",
  }), {
    triggerLowSpins: 950,
    durationSpins: 1200,
    expectedNetBalls: 7000,
    durationLabel: "",
    benefit: "",
    sourceUrl: "https://example.com",
    verifiedAt: "2026-07-14",
    source: "master",
  });
});

test("機種変更時は遊タイム設定を機種単位で作成またはクリア", () => {
  const session = createYutimeSessionFromMachine({
    name: "テスト機",
    border1K: 18,
    yutime: { triggerLowSpins: 800, durationSpins: 1000, expectedNetBalls: 5000 },
  });
  assert.equal(session.machineName, "テスト機");
  assert.equal(session.assumedStart1K, 18);
  assert.equal(session.triggerLowSpins, 800);
  assert.equal(session.durationSpins, 1000);
  assert.equal(session.expectedNetBalls, 5000);
  assert.equal(session.targetingEnabled, false);
  assert.equal(isYutimeTargetingSession(session), false);
  assert.equal(isYutimeTargetingSession({ ...session, targetingEnabled: true }), true);
  assert.equal(isYutimeTargetingSession({ targetingEnabled: true, triggerLowSpins: 0 }), false);
  assert.equal(createYutimeSessionFromMachine({ name: "非搭載機" }), null);
});

test("開始済みでも記録が空なら選択機種で置き換える", () => {
  assert.equal(resolveYutimeStartAction({
    sessionStarted: true,
    currentMachineName: "eライザのアトリエ",
    nextMachineName: "PAコマコマ倶楽部",
    rotRows: [{ type: "start", cumRot: 0 }],
    jpLog: [],
  }), "replace");
});

test("別機種の回転記録があれば台移動として扱う", () => {
  assert.equal(resolveYutimeStartAction({
    sessionStarted: true,
    currentMachineName: "eライザのアトリエ",
    nextMachineName: "PAコマコマ倶楽部",
    rotRows: [
      { type: "start", cumRot: 0 },
      { type: "data", cumRot: 20, thisRot: 20 },
    ],
    jpLog: [],
  }), "move");
});

test("同じ機種の記録中は遊タイム条件だけを更新する", () => {
  assert.equal(resolveYutimeStartAction({
    sessionStarted: true,
    currentMachineName: "PAコマコマ倶楽部",
    nextMachineName: "PAコマコマ倶楽部",
    rotRows: [{ type: "data", cumRot: 20, thisRot: 20 }],
  }), "update");
});

console.log(`\n${passed} tests passed`);
