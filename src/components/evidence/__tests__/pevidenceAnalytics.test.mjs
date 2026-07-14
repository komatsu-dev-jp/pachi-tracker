import assert from "node:assert/strict";
import { buildPEvidenceAnalytics, pevidenceInternals } from "../pevidenceAnalytics.js";

const machine = {
  name: "テスト機",
  border1K: 18,
  avgPayoutPerHit: 1400,
  stdDev: 4000,
  muraCoef: 50000,
};

function rowForRate(num, rate, date, island = "A島", event = "") {
  const spins = 720;
  const hits = 10;
  const input = spins / rate * 250;
  return {
    date,
    island,
    machineName: "テスト機",
    num: String(num),
    normalSpins: spins,
    totalStarts: hits,
    val: hits * machine.avgPayoutPerHit - input,
    event,
  };
}

const scans = [];
for (let day = 1; day <= 14; day++) {
  const date = `2026-06-${String(day).padStart(2, "0")}`;
  const rate1 = day <= 7 ? 21 : 14;
  const rate2 = day <= 7 ? 20.5 : 14.5;
  scans.push({
    id: `s-${day}`,
    storeId: "store-a",
    storeName: "テスト店",
    date,
    createdAt: `${date}T12:00:00.000Z`,
    rows: [rowForRate(101, rate1, date), rowForRate(102, rate2, date)],
  });
}

// 同じ台番号でも別店舗のデータは混ざらない。
scans.push({
  id: "other-store",
  storeId: "store-b",
  storeName: "別店舗",
  date: "2026-06-14",
  createdAt: "2026-06-14T13:00:00.000Z",
  rows: [rowForRate(101, 30, "2026-06-14")],
});

const result = buildPEvidenceAnalytics({
  scans,
  customMachines: [machine],
  islands: [
    { id: "a", name: "A島", start: 101, end: 102 },
    { id: "b", name: "B島", start: 201, end: 202 },
  ],
  params: { markovMinTransitions: 3 },
});

assert.equal(result.rawRowCount, 29, "店舗をまたいだ同番号も別レコードとして保持する");
assert.equal(result.latestRows.length, 3);

const history101 = result.historyRows.filter((row) => row.store === "store-a" && row.num === "101");
assert.equal(history101.length, 14);
assert.ok(history101.some((row) => row.changePoint === "tight"), "持続する低下をCUSUMが検知する");
assert.ok(new Set(history101.map((row) => row.regimeStart)).size >= 2, "変化点でレジームを切り替える");
assert.equal(history101.at(-1).regimeDirection, "tight", "最新行にも現在の状態方向を引き継ぐ");
assert.ok(history101.at(-1).ema < history101[0].ema, "EMAは最近の低下を反映する");

assert.ok(result.storeProfiles.length >= 1, "店舗×機種×曜日の締め率を作る");
assert.ok(result.markovProfiles.length >= 1, "マルコフ遷移表を作る");
assert.ok(result.aiProfile.profiles.some((p) => p.type === "weekday"), "曜日プロファイルを作る");
assert.ok(result.islandStats.some((p) => p.island === "A島"), "島平均を作る");

for (const row of result.latestRows) {
  if (!row.valid) continue;
  assert.ok(row.winRate >= 0 && row.winRate <= 1);
  assert.ok(row.tightProbability >= 0 && row.tightProbability <= 1);
  assert.ok(Number.isFinite(row.hourly));
  assert.ok(Number.isFinite(row.hourlyLow));
  assert.ok(Number.isFinite(row.hourlyHigh));
  assert.ok(Number.isFinite(row.dailyLow));
  assert.ok(Number.isFinite(row.dailyHigh));
  assert.ok(Number.isFinite(row.hourlyRisk));
  assert.ok(Number.isFinite(row.dailyRisk));
  assert.ok(row.hourlyLow <= row.hourlyHigh);
  assert.ok(row.dailyLow <= row.dailyHigh);
}

if (result.portfolio.plan.length) {
  assert.ok(result.portfolio.totalHours <= 8.1, "時間配分は1日の8時間を超えない");
}

// strong 判定の台に「回収寄り」の翌日予測を出さない（矛盾ラベルの禁止）
for (const row of result.latestRows) {
  if (!row.valid || row.verdict !== "strong") continue;
  const next = result.nextMap.find((item) =>
    item.number === row.num && item.machineName === row.machineName && item.store === row.store
  );
  assert.notEqual(next?.prediction, "回収寄り");
}

// 平均出玉を導出できない機種は、大当りがある日を有効データにしない
const unknownPayoutMachine = { name: "出玉不明機", border1K: 18 };
const unknownResult = buildPEvidenceAnalytics({
  scans: [{
    id: "u1",
    storeId: "store-a",
    storeName: "テスト店",
    date: "2026-06-14",
    createdAt: "2026-06-14T12:00:00.000Z",
    rows: [{
      date: "2026-06-14",
      island: "C島",
      machineName: "出玉不明機",
      num: "301",
      normalSpins: 720,
      totalStarts: 10,
      val: -3000,
    }],
  }],
  customMachines: [unknownPayoutMachine],
});
assert.equal(unknownResult.latestRows.length, 1);
assert.equal(unknownResult.latestRows[0].valid, false, "平均出玉なし+大当りありは無効データ");
assert.equal(unknownResult.portfolio.plan.length, 0);

// ポートフォリオと翌日予測は、最新スキャン日にデータがある台だけを対象にする
const staleScans = [];
for (let day = 1; day <= 3; day++) {
  const date = `2026-06-${String(day).padStart(2, "0")}`;
  const rows = [rowForRate(101, 22, date)];
  if (day <= 2) rows.push(rowForRate(103, 23, date));
  staleScans.push({
    id: `stale-${day}`,
    storeId: "store-a",
    storeName: "テスト店",
    date,
    createdAt: `${date}T12:00:00.000Z`,
    rows,
  });
}
const staleResult = buildPEvidenceAnalytics({ scans: staleScans, customMachines: [machine] });
assert.equal(staleResult.latestRows.length, 2, "古い台も一覧データには残す");
assert.ok(!staleResult.nextMap.some((item) => item.number === "103"), "最新日にデータがない台は翌日予測へ出さない");
assert.ok(!staleResult.portfolio.plan.some((item) => item.number === "103"), "最新日にデータがない台は時間配分へ出さない");

// ポートフォリオに nodata / weak 判定の台を入れない
for (const item of result.portfolio.plan) {
  const row = result.latestRows.find((r) => r.num === item.number && r.machineName === item.machineName);
  assert.ok(row && (row.verdict === "strong" || row.verdict === "watch"));
}

const pairs = pevidenceInternals.buildOppositePairs([
  { start: 101, end: 103 },
  { start: 201, end: 203 },
]);
assert.equal(pairs.get("101"), "203", "向かい合う島は鏡向きに対応する");
assert.equal(pairs.get("103"), "201");

console.log("pevidenceAnalytics.test.mjs: all tests passed");
