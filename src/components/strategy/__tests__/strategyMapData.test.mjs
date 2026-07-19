import assert from "node:assert/strict";
import { applyStrategyPlanEntryContext, buildStrategyMap, resolveStrategyPlanHandoff } from "../strategyMapData.js";

const machine = {
  name: "検証機",
  border1K: 17,
  avgPayoutPerHit: 1400,
  stdDev: 6000,
};
const scans = [
  {
    id: "d1", storeId: "s1", storeName: "検証店", date: "2026-07-01", createdAt: "2026-07-01T12:00:00Z",
    rows: [{ num: "101", machineName: "検証機", island: "1島", normalSpins: 800, totalStarts: 10, val: 2000 }],
  },
  {
    id: "d2", storeId: "s1", storeName: "検証店", date: "2026-07-02", createdAt: "2026-07-02T12:00:00Z",
    rows: [{ num: "101", machineName: "検証機", island: "1島", normalSpins: 900, totalStarts: 12, val: 1000 }],
  },
];

const empty = buildStrategyMap();
assert.equal(empty.total, 0);
assert.equal(empty.top5.length, 0);

const liveDecision = { action: "collecting", actionLabel: "次の判定まで計測", nextCheckpointK: 3 };
const map = buildStrategyMap({ scans, customMachines: [machine], playingNum: 101, liveDecision });
assert.equal(map.source, "delta");
assert.equal(map.total, 1);
assert.equal(map.all[0].num, 101);
assert.equal(map.all[0].isPlaying, true);
assert.equal(map.all[0].liveDecision, liveDecision);
assert.equal(map.all[0].evidence.observationCount, 2);
assert.ok(map.all[0].rot > 0);
assert.ok(map.all[0].confidence >= 0 && map.all[0].confidence <= 100);
assert.equal(map.all[0].history.length, 2);

// 別店舗のスキャンが混ざっていても、解析・推奨は表示中の店舗に限定される
const multiStoreScans = [
  ...scans,
  {
    id: "d3", storeId: "s2", storeName: "別店", date: "2026-06-30", createdAt: "2026-06-30T12:00:00Z",
    rows: [{ num: "101", machineName: "検証機", island: "1島", normalSpins: 900, totalStarts: 12, val: 5000 }],
  },
];
const multiStoreMap = buildStrategyMap({ scans: multiStoreScans, customMachines: [machine] });
assert.equal(multiStoreMap.total, 1, "表示は最新スキャンの店舗のみ");
assert.ok(
  multiStoreMap.analytics.latestRows.every((row) => row.store === "s1"),
  "解析対象に他店舗の台を含めない"
);
assert.ok(
  multiStoreMap.portfolio.plan.every((item) => String(item.number) === "101"),
  "ポートフォリオに他店舗の台を含めない"
);
assert.equal(
  multiStoreMap.all[0].history.length, 2,
  "スパークラインの履歴に他店舗の同番号データを混ぜない"
);

// 選択店舗がある場合は、全店舗の最新日を選んでから絞るのではなく、店舗を絞ってから最新日を選ぶ
const selectedOlderStoreMap = buildStrategyMap({
  scans: multiStoreScans,
  customMachines: [machine],
  selectedStoreId: "s2",
});
assert.equal(selectedOlderStoreMap.total, 1, "選択店舗に最新スキャンがあれば日付が古くても表示する");
assert.ok(
  selectedOlderStoreMap.analytics.latestRows.every((row) => row.store === "s2"),
  "選択店舗以外の新しいスキャンへ切り替わらない"
);

const primaryKey = "s1::候補機::P候補機";
const backupKey = "s1::検証機::P検証機";
const monthlyPlayPlans = {
  "2026-07": {
    version: 2,
    status: "research-ready",
    defaultStoreId: "s1",
    researchPackageId: "balanced",
    minExpectedValuePerHour: 500,
    goalBackcast: { requiredUnitPrice: 2.38, requiredSessionEv: 6000 },
    researchTargets: {
      primaryMachineKey: backupKey,
      backupMachineKeys: [primaryKey],
    },
    candidateSnapshot: {
      candidates: [
        { key: backupKey, name: "検証機", modelName: "P検証機" },
        { key: primaryKey, name: "候補機", modelName: "P候補機" },
      ],
    },
  },
};
const dailyResearchPlans = {
  "2026-07-18": {
    version: 2,
    status: "research-ready",
    date: "2026-07-18",
    researchTargets: {
      primaryMachineKey: backupKey,
      backupMachineKeys: [primaryKey],
    },
  },
  "2026-07-19": {
    version: 2,
    status: "research-ready",
    date: "2026-07-19",
    style: "stable",
    researchTargets: {
      primaryMachineKey: primaryKey,
      backupMachineKeys: [backupKey],
    },
    candidateSnapshot: {
      candidates: [{ key: primaryKey, name: "候補機", modelName: "P候補機" }],
    },
  },
};
const handoff = resolveStrategyPlanHandoff({
  monthlyPlayPlans,
  dailyResearchPlans,
  now: new Date(2026, 6, 18, 12, 0, 0),
});
assert.equal(handoff.source, "daily");
assert.equal(handoff.dateKey, "2026-07-19");
assert.notEqual(handoff.primary.name, "検証機", "Homeの翌日準備導線では当日の古いプランより翌日を優先する");
assert.equal(handoff.defaultStoreId, "s1", "日次に店舗がなければ月間の店舗を引き継ぐ");
assert.equal(handoff.minExpectedValuePerHour, 500, "日次に最低時給期待値がなければ月間設定を引き継ぐ");
assert.equal(handoff.requiredUnitPrice, 2.38, "必要玉単価差を戦略画面へ引き継ぐ");
assert.equal(handoff.requiredSessionEv, 6000, "次回必要期待値を戦略画面へ引き継ぐ");
assert.equal(handoff.canPrioritize, true);
assert.equal(handoff.primary.name, "候補機", "日次の本命を月間より優先する");
assert.deepEqual(handoff.backups.map((target) => target.name), ["検証機"]);
const refreshedHandoff = applyStrategyPlanEntryContext(handoff, {
  minExpectedValuePerHour: 0,
  requiredUnitPrice: null,
  requiredSessionEv: 0,
});
assert.equal(refreshedHandoff.minExpectedValuePerHour, 0, "最新逆算が下がった時は保存時の高い閾値を残さない");
assert.equal(refreshedHandoff.requiredUnitPrice, null, "最新計算で算出不能なら古い玉単価差を表示しない");
assert.equal(refreshedHandoff.requiredSessionEv, 0);
const staleStoreHandoff = resolveStrategyPlanHandoff({
  monthlyPlayPlans,
  dailyResearchPlans,
  now: new Date(2026, 6, 18, 12, 0, 0),
  targetDate: "2026-07-19",
  availableStoreIds: ["s2"],
});
assert.equal(staleStoreHandoff.hasValidStore, false);
assert.equal(staleStoreHandoff.defaultStoreId, null, "削除済み店舗へ戦略画面を強制切替しない");
assert.equal(staleStoreHandoff.status, "needs-review");
assert.equal(staleStoreHandoff.canPrioritize, false, "有効な登録店舗がないプランを戦略順位へ反映しない");
const todayFallbackHandoff = resolveStrategyPlanHandoff({
  monthlyPlayPlans,
  dailyResearchPlans: { "2026-07-18": dailyResearchPlans["2026-07-18"] },
  now: new Date(2026, 6, 18, 12, 0, 0),
});
assert.equal(todayFallbackHandoff.dateKey, "2026-07-18", "翌日プランがなければ当日プランを使う");
assert.equal(todayFallbackHandoff.primary.name, "検証機");
const exactTodayHandoff = resolveStrategyPlanHandoff({
  monthlyPlayPlans,
  dailyResearchPlans,
  now: new Date(2026, 6, 18, 12, 0, 0),
  targetDate: "2026-07-18",
});
assert.equal(exactTodayHandoff.dateKey, "2026-07-18", "指定した日だけを日次プランとして引き継ぐ");
assert.equal(exactTodayHandoff.primary.name, "検証機", "指定日に翌日のプランを混ぜない");
const exactMissingHandoff = resolveStrategyPlanHandoff({
  monthlyPlayPlans,
  dailyResearchPlans,
  now: new Date(2026, 6, 18, 12, 0, 0),
  targetDate: "2026-07-20",
});
assert.equal(exactMissingHandoff.source, "monthly", "指定日に日次プランがなければ同月の月間プランだけを使う");
assert.equal(exactMissingHandoff.dateKey, "", "指定日以外の日次プランへフォールバックしない");
assert.equal(exactMissingHandoff.primary.name, "検証機");
const draftHandoff = resolveStrategyPlanHandoff({
  monthlyPlayPlans: {
    "2026-07": { ...monthlyPlayPlans["2026-07"], status: "draft" },
  },
  targetDate: "2026-07-20",
});
assert.equal(draftHandoff.canPrioritize, false, "下書きプランは戦略順位へ反映しない");
const noPrimaryHandoff = resolveStrategyPlanHandoff({
  monthlyPlayPlans: {
    "2026-07": {
      ...monthlyPlayPlans["2026-07"],
      researchTargets: { primaryMachineKey: "", backupMachineKeys: [primaryKey] },
    },
  },
  targetDate: "2026-07-20",
});
assert.equal(noPrimaryHandoff.canPrioritize, false, "本命未選択のプランは戦略順位へ反映しない");
const skipHandoff = resolveStrategyPlanHandoff({
  monthlyPlayPlans,
  dailyResearchPlans: {
    "2026-07-19": {
      version: 2,
      status: "skip",
      style: "skip",
      defaultStoreId: "s1",
      researchTargets: monthlyPlayPlans["2026-07"].researchTargets,
    },
  },
  now: new Date(2026, 6, 18, 12, 0, 0),
});
assert.equal(skipHandoff.targets.length, 0, "見送り日には月間の本命・予備を戦略順位へ引き継がない");
assert.equal(
  resolveStrategyPlanHandoff({
    monthlyPlayPlans: { "2026-07": { baseStyle: "balanced" } },
    dailyResearchPlans: { "2026-07-19": { style: "stable" } },
    now: new Date(2026, 6, 18, 12, 0, 0),
  }),
  null,
  "System v2の項目がない旧プランでは従来の戦略順位を変えない"
);

const candidateMachine = {
  name: "候補機",
  modelName: "P候補機",
  aliases: ["候補機別名"],
  border1K: 17,
  avgPayoutPerHit: 1400,
  stdDev: 6000,
};
const rankingScans = scans.map((scan) => ({
  ...scan,
  rows: [
    { ...scan.rows[0], normalSpins: 900, totalStarts: 12, val: 5000 },
    { num: "201", machineName: "候補機", island: "2島", normalSpins: 900, totalStarts: 12, val: 5000 },
    { num: "202", machineName: "候補機", island: "2島", normalSpins: 500, totalStarts: 4, val: -2000 },
  ],
}));
const plannedMap = buildStrategyMap({
  scans: rankingScans,
  customMachines: [machine, candidateMachine],
  selectedStoreId: handoff.defaultStoreId,
  planHandoff: handoff,
});
assert.equal(plannedMap.top5[0].machineName, "候補機", "日次の本命機種を戦略確認順の先頭にする");
assert.equal(plannedMap.top5[0].planRole, "primary");
assert.equal(
  plannedMap.top5[0].score,
  Math.max(...plannedMap.all.filter((row) => row.machineName === "候補機").map((row) => row.score)),
  "本命機種に複数台ある場合は機種内で最も評価が高い台を先頭にする"
);
assert.equal(plannedMap.top5.find((row) => row.machineName === "検証機")?.planRole, "backup");
assert.deepEqual(plannedMap.planMatch, { matched: 2, total: 2 });

const unplannedMap = buildStrategyMap({
  scans: rankingScans,
  customMachines: [machine, candidateMachine],
  selectedStoreId: "s1",
});
const highMinimumMap = buildStrategyMap({
  scans: rankingScans,
  customMachines: [machine, candidateMachine],
  selectedStoreId: "s1",
  planHandoff: { ...handoff, minExpectedValuePerHour: Number.MAX_SAFE_INTEGER },
});
assert.ok(highMinimumMap.all.every((row) => row.planRole === null && row.planPriority === null));
assert.equal(highMinimumMap.planMatch.matched, 0, "最低時給期待値を下回る予定機種を優先扱いしない");
assert.deepEqual(
  highMinimumMap.top5.map((row) => row.id),
  unplannedMap.top5.map((row) => row.id),
  "最低時給期待値を満たす候補がなければ通常の判定順を保つ"
);

const needsReviewHandoff = resolveStrategyPlanHandoff({
  monthlyPlayPlans: {
    "2026-07": { ...monthlyPlayPlans["2026-07"], status: "needs-review" },
  },
  targetDate: "2026-07-20",
  now: new Date(2026, 6, 18, 12, 0, 0),
});
assert.equal(needsReviewHandoff.status, "needs-review");
assert.equal(needsReviewHandoff.canPrioritize, false);
assert.equal(needsReviewHandoff.targets.length, 2, "再確認画面に候補名を残す");
const needsReviewMap = buildStrategyMap({
  scans: rankingScans,
  customMachines: [machine, candidateMachine],
  selectedStoreId: "s1",
  planHandoff: needsReviewHandoff,
});
assert.ok(needsReviewMap.all.every((row) => row.planRole === null && row.planPriority === null));
assert.equal(needsReviewMap.planMatch.matched, 0, "再確認待ちの古い候補を戦略順位へ反映しない");
assert.deepEqual(needsReviewMap.top5.map((row) => row.id), unplannedMap.top5.map((row) => row.id));

const aliasScans = rankingScans.map((scan) => ({
  ...scan,
  rows: scan.rows.map((row) => row.machineName === "候補機"
    ? { ...row, machineName: "候補機別名" }
    : row),
}));
const aliasMap = buildStrategyMap({
  scans: aliasScans,
  customMachines: [machine, candidateMachine],
  selectedStoreId: "s1",
  planHandoff: handoff,
});
assert.equal(aliasMap.top5[0].machineName, "候補機別名");
assert.equal(aliasMap.top5[0].planRole, "primary", "機種マスターの別名でも本命へ一致させる");
assert.deepEqual(aliasMap.planMatch, { matched: 2, total: 2 });

const noDataMap = buildStrategyMap({
  scans: [{
    id: "nodata",
    storeId: "s1",
    storeName: "検証店",
    date: "2026-07-02",
    rows: [{ num: "301", machineName: "候補機", island: "3島", normalSpins: 0, totalStarts: 0, val: 0 }],
  }],
  customMachines: [candidateMachine],
  selectedStoreId: "s1",
  planHandoff: { ...handoff, minExpectedValuePerHour: 0 },
});
assert.equal(noDataMap.all[0].verdict, "nodata");
assert.equal(noDataMap.all[0].planRole, null, "データ不足の予定機種を優先扱いしない");
assert.equal(noDataMap.all[0].planEvaluation, "insufficient-data");
assert.equal(noDataMap.all[0].unitPriceAvailable, false, "算出できない玉単価差を0円と表示しない");
assert.equal(noDataMap.top5.length, 0, "データ不足の予定機種をTOP5へ強制表示しない");

const hallMaps = {
  s1: [
    { id: "layout-b", name: "B島", start: 201, end: 206, machineName: "検証機" },
    { id: "layout-a", name: "1島", start: 101, end: 106, machineName: "検証機" },
  ],
};
const mappedLayout = buildStrategyMap({ scans, customMachines: [machine], hallMaps });
assert.equal(mappedLayout.islands.length, 2);
assert.equal(mappedLayout.islands[0].name, "B島");
assert.equal(mappedLayout.islands[0].start, 201);
assert.equal(mappedLayout.islands[0].end, 206);
assert.equal(mappedLayout.islands[0].machines.length, 0);
assert.equal(mappedLayout.islands[1].name, "1島");
assert.equal(mappedLayout.islands[1].machines[0].num, 101);
assert.equal(mappedLayout.islands[1].registeredLayout, true);

console.log("strategyMapData.test.mjs: all tests passed");
