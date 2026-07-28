import assert from "node:assert/strict";
import {
  applyStrategyPlanEntryContext,
  buildStrategyMap,
  buildStrategyPlanContext,
  buildStrategyViewScope,
  pairStrategyIslands,
  revenueLowerBoundPendingReason,
  resolveStrategyPlanHandoff,
} from "../strategyMapData.js";
import {
  P_EVIDENCE_DEMO_HALL_MAPS,
  P_EVIDENCE_DEMO_MACHINE,
  P_EVIDENCE_DEMO_SCANS,
} from "../../evidence/pevidenceDemoData.js";

const machine = {
  name: "検証機",
  modelName: "P検証機TEST",
  modelVerified: true,
  border1K: 17,
  prob: "1/319.6",
  synthProb: 319.6,
  avgPayoutPerHit: 1400,
  hesoAvgPayout: 450,
  rushAvgPayout: 1500,
  rushEntryRate: 60,
  rushContinueRate: 81,
  allocationVerified: true,
  stdDev: 6000,
  stdDevMethod: "p-evidence-branching-v2",
};
const scans = [
  {
    id: "d1", storeId: "s1", storeName: "検証店", date: "2026-07-01", createdAt: "2026-07-01T12:00:00Z",
    rows: [{ num: "101", machineName: "検証機", island: "1島", normalSpins: 800, totalStarts: 10, val: 2000 }],
  },
  {
    id: "d2", storeId: "s1", storeName: "検証店", date: "2026-07-02", createdAt: "2026-07-02T12:00:00Z",
    rows: [{ num: "101", machineName: "検証機", island: "1島", normalSpins: 900, totalStarts: 12, val: 3300 }],
  },
];

const empty = buildStrategyMap();
assert.equal(empty.total, 0);
assert.equal(empty.top5.length, 0);

const liveDecision = { action: "collecting", actionLabel: "次の判定まで計測", nextCheckpointK: 3 };
const plan = buildStrategyPlanContext({
  date: "2026-07-02",
  dailyResearchPlans: { "2026-07-02": { style: "stable", standardHours: 3, cashLimit: 50000 } },
  spinsPerHour: 250,
  ballValueYen: 4,
});
const map = buildStrategyMap({ scans, customMachines: [machine], playingNum: 101, liveDecision, plan });
assert.equal(map.source, "delta");
assert.equal(map.total, 1);
assert.equal(map.all[0].num, 101);
assert.equal(map.all[0].isPlaying, true);
assert.equal(map.all[0].liveDecision, liveDecision);
assert.equal(map.all[0].evidence.observationCount, 2);
assert.ok(map.all[0].rot > 0);
assert.ok(map.all[0].confidence >= 0 && map.all[0].confidence <= 100);
assert.ok(map.all[0].decisionLowerRotation <= map.all[0].predictedRotation);
assert.equal(map.all[0].seatThreshold, map.all[0].effectiveBorder + 0.5);
assert.ok(map.all[0].seatThresholdProbability >= 0 && map.all[0].seatThresholdProbability <= 1);
assert.ok(["candidate", "trial", "skip"].includes(map.all[0].seatDecisionStatus));
assert.equal(map.all[0].decisionLowerTargetCoverage, 0.8);
assert.equal(map.all[0].decisionCalibrationStatus, "awaiting-samples");
assert.equal(
  map.candidates.length,
  map.all.filter((item) => item.seatDecisionStatus === "candidate").length,
  "候補数は良台スコアではなく判断用下限で決める",
);
assert.equal(map.all[0].history.length, 2);
assert.equal(map.all[0].historyDayCount, 2);
assert.deepEqual(map.all[0].dataCoverage, {
  effectiveDays: 2,
  fromDate: "2026-07-01",
  toDate: "2026-07-02",
  inputBalls: map.all[0].rotationEstimate.inputBalls,
  recentRegimeOnly: false,
});
assert.equal(map.plan.source, "daily");
assert.equal(map.plan.plannedHours, 3);
assert.equal(map.plan.sessionSpins, 750);
assert.equal(map.all[0].jackpotLabel, "1/319.6");
assert.equal(map.all[0].initialAvgPayout, 450);
assert.ok(map.all[0].atLeastOneHitRate > 0.9 && map.all[0].atLeastOneHitRate < 0.91);
assert.equal(map.all[0].profitChanceStatus, "ready");
assert.ok(map.all[0].profitChanceLow <= map.all[0].profitChanceHigh);
assert.ok(Number.isFinite(map.all[0].dailyLow), "統一した事後推定区間から収支下限を計算する");

const mapWithBoundedHistory = buildStrategyMap({
  scans: [
    {
      id: "bounded-history", storeId: "s1", storeName: "検証店", date: "2026-06-30",
      createdAt: "2026-06-30T12:00:00Z",
      rows: [{
        num: "101", machineName: "検証機", island: "1島", normalSpins: 600, totalStarts: 8,
        val: null, status: "bounded", valueSource: "bounded-range",
      }],
    },
    ...scans,
  ],
  customMachines: [machine],
});
assert.equal(mapWithBoundedHistory.all[0].history.length, 2, "範囲だけの日を架空のボーダー履歴にしない");
assert.ok(map.all[0].rotationEstimate.low <= map.all[0].rot && map.all[0].rot <= map.all[0].rotationEstimate.high);
assert.ok(map.all[0].dailyLow <= map.all[0].daily && map.all[0].daily <= map.all[0].dailyHigh);
assert.ok(map.all[0].profitChanceLow <= map.all[0].winRate && map.all[0].winRate <= map.all[0].profitChanceHigh);

const demoDate = P_EVIDENCE_DEMO_SCANS.at(-1).date;
const demoPlan = buildStrategyPlanContext({ date: demoDate, spinsPerHour: 250, defaultHours: 3 });
const lowerPendingMap = buildStrategyMap({
  scans: P_EVIDENCE_DEMO_SCANS,
  customMachines: [P_EVIDENCE_DEMO_MACHINE],
  hallMaps: P_EVIDENCE_DEMO_HALL_MAPS,
  plan: demoPlan,
  targetDate: demoDate,
});
assert.ok(
  lowerPendingMap.all.every((item) => item.revenueRangeStatus === "ready"),
  "収支標準偏差を回転率誤差へ混ぜず、十分なデモ履歴の予測下限を不自然に0へ落とさない",
);
assert.ok(lowerPendingMap.all.every((item) => Number.isFinite(item.hourlyLow)));
assert.equal(
  revenueLowerBoundPendingReason({
    lowRotation: 0,
    predictedRotation: 18,
    border: 17,
    variance: 4,
    confidence: 0.5,
    rawDailyLow: -10000,
  }),
  "non-positive",
  "本当に下限が0以下なら金額を算定待ちにする防御は残す",
);

const allocationMap = buildStrategyMap({
  scans,
  customMachines: [{ ...machine, border1K: 5 }],
  plan: { ...plan, cashLimit: 0 },
});
assert.ok(allocationMap.portfolio.plan.length > 0);
assert.equal(allocationMap.portfolio.totalHours, allocationMap.plan.plannedHours, "優先配分の丸め後も予定時間の合計を保つ");
assert.ok(allocationMap.candidates.length > 0);
assert.ok(allocationMap.candidates.every((item) => item.seatDecisionStatus === "candidate"));
assert.ok(allocationMap.candidates.every((item) => item.isStar), "★も判断用下限を満たす候補だけに付ける");

const preparedMap = buildStrategyMap({ scans, customMachines: [machine], plan, targetDate: "2026-07-03" });
assert.equal(preparedMap.freshness.status, "prepared");
assert.equal(preparedMap.freshness.ageDays, 1);
assert.equal(preparedMap.actionable, true);
assert.equal(preparedMap.all[0].recommendationStatus, "actionable");
assert.equal(preparedMap.all[0].predictionDayLabel, "本日");
assert.equal(preparedMap.all[0].profitChanceStatus, "ready");
assert.notEqual(preparedMap.all[0].daily, null);
assert.notEqual(preparedMap.all[0].tomorrowTight, null);

const staleMap = buildStrategyMap({ scans, customMachines: [machine], plan, targetDate: "2026-07-04" });
assert.equal(staleMap.freshness.status, "stale");
assert.equal(staleMap.freshness.ageDays, 2);
assert.equal(staleMap.actionable, false);
assert.equal(staleMap.candidates.length, 0);
assert.equal(staleMap.all[0].profitChanceStatus, "stale-scan");
assert.equal(staleMap.all[0].daily, null);
assert.equal(staleMap.all[0].tomorrowTight, null);

const duplicateMap = buildStrategyMap({
  scans: [...scans, {
    ...scans[1],
    id: "d2-new",
    createdAt: "2026-07-02T13:00:00Z",
    rows: [{ ...scans[1].rows[0], normalSpins: 950 }],
  }],
  customMachines: [machine],
  plan,
});
assert.equal(duplicateMap.all[0].evidence.observationCount, 2, "同日の再取込を二重計上しない");
assert.equal(duplicateMap.all[0].history.length, 2);

const liveMap = buildStrategyMap({
  scans,
  customMachines: [machine],
  playingNum: 101,
  plan,
  liveSession: {
    storeId: "s1",
    machineName: "検証機",
    machineNum: "101",
    date: "2026-07-02",
    ev: { start1K: 24, cashKCount: 5, netRot: 120 },
    settings: { rentBalls: 250 },
  },
});
assert.ok(liveMap.all[0].rot > map.all[0].rot, "現在実戦を同じ台の予測へ統合する");
assert.deepEqual(liveMap.all[0].evidenceSources, ["delta", "live"]);
assert.equal(liveMap.all[0].dataCoverage.effectiveDays, 2, "同じ日の現在実戦は日数を二重計上しない");
assert.ok(liveMap.all[0].dataCoverage.inputBalls > map.all[0].dataCoverage.inputBalls);
assert.ok(
  liveMap.all[0].confidence
    <= Math.round(liveMap.all[0].pevidence.processReliability * 100),
  "実戦実測を足しても、一晩の日次変動による翌日信頼度の上限を超えない",
);
assert.ok(
  liveMap.all[0].rotationEstimate.variance
    >= liveMap.all[0].pevidence.processVariance + liveMap.all[0].pevidence.transitionVariance,
  "実戦実測を足しても、日次変動と締め遷移の分散を消さない",
);

const archiveMap = buildStrategyMap({
  scans,
  customMachines: [machine],
  plan,
  targetDate: "2026-07-03",
  archives: [{
    storeId: "s1",
    machineName: "検証機",
    machineNum: "101",
    date: "2026-07-03",
    stats: { start1K: 22, cashKCount: 3, netRot: 66 },
    settings: { rentBalls: 250 },
  }],
});
assert.equal(archiveMap.all[0].dataCoverage.effectiveDays, 3, "後日の完了実戦は有効日数へ加える");
assert.equal(archiveMap.all[0].dataCoverage.toDate, "2026-07-03");
assert.deepEqual(archiveMap.all[0].evidenceSources, ["delta", "archive"]);

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
const selectedOtherStoreMap = buildStrategyMap({ scans: multiStoreScans, customMachines: [machine], selectedStoreId: "s2", plan });
assert.equal(selectedOtherStoreMap.total, 1, "選択店舗に古いスキャンしかなくても、その店舗だけを表示する");
assert.ok(selectedOtherStoreMap.analytics.latestRows.every((row) => row.store === "s2"));

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

// 別機種に新しい解析があっても、東京喰種の直近保存を未計測へ戻さない。
const ghoulRows26 = Array.from({ length: 56 }, (_, index) => ({
  num: String(758 + index),
  machineName: "e東京喰種",
  island: "東京喰種",
  normalSpins: 800,
  totalStarts: 10,
  val: 2000,
  status: "ok",
}));
const mixedDateScans = [
  {
    id: "other-machine-28",
    storeId: "s1",
    storeName: "検証店",
    date: "2026-07-28",
    createdAt: "2026-07-28T00:30:00Z",
    rows: [{
      num: "479",
      machineName: "検証機",
      island: "大海物語",
      normalSpins: 800,
      totalStarts: 10,
      val: 2000,
      status: "ok",
    }],
  },
  {
    id: "tokyo-ghoul-26",
    storeId: "s1",
    storeName: "検証店",
    date: "2026-07-26",
    createdAt: "2026-07-28T00:40:00Z",
    rows: ghoulRows26,
  },
];
const mixedDateHallMaps = {
  s1: [
    { id: "sea", name: "大海物語", machineName: "検証機", start: 479, end: 484 },
    { id: "tokyo-ghoul", name: "東京喰種", machineName: "e東京喰種", start: 758, end: 813 },
  ],
};
const mixedDateMap = buildStrategyMap({
  scans: mixedDateScans,
  customMachines: [machine],
  hallMaps: mixedDateHallMaps,
  selectedStoreId: "s1",
  targetDate: "2026-07-28",
  stores: [{ id: "s1", name: "検証店" }],
});
const mixedDateGhoul = mixedDateMap.islands.find((island) => island.name === "東京喰種");
assert.equal(mixedDateMap.freshness.sourceDate, "2026-07-28", "店舗全体の最新解析日は維持する");
assert.equal(mixedDateGhoul.machines.length, 56, "東京喰種の26日分56台も表示対象へ残す");
assert.ok(mixedDateGhoul.machines.every((item) => item.rot > 0), "26日分も未計測ではなく予測回転率を表示する");
assert.ok(mixedDateGhoul.machines.every((item) => item.freshness.sourceDate === "2026-07-26"));
assert.ok(mixedDateGhoul.machines.every((item) => item.freshness.status === "stale"));
assert.ok(
  mixedDateGhoul.machines.every((item) => item.recommendationStatus === "reference"),
  "2日前のデータは表示しても候補判定には使わない",
);

// 同じ機種を一部だけ再解析した場合も、未再解析50台の過去保存を消さない。
const partialRefreshMap = buildStrategyMap({
  scans: [
    ...mixedDateScans,
    {
      id: "tokyo-ghoul-partial-28",
      storeId: "s1",
      storeName: "検証店",
      date: "2026-07-28",
      createdAt: "2026-07-28T00:50:00Z",
      rows: ghoulRows26.slice(0, 6).map((row) => ({ ...row, val: 2500 })),
    },
  ],
  customMachines: [machine],
  hallMaps: mixedDateHallMaps,
  selectedStoreId: "s1",
  targetDate: "2026-07-28",
  stores: [{ id: "s1", name: "検証店" }],
});
const partialRefreshGhoul = partialRefreshMap.islands.find((island) => island.name === "東京喰種").machines;
assert.equal(partialRefreshGhoul.length, 56);
assert.equal(
  partialRefreshGhoul.filter((item) => item.freshness.sourceDate === "2026-07-28").length,
  6,
  "再解析した6台だけ28日分へ更新する",
);
assert.equal(
  partialRefreshGhoul.filter((item) => item.freshness.sourceDate === "2026-07-26").length,
  50,
  "未再解析50台は26日分の回転率を保持する",
);
assert.ok(partialRefreshGhoul.every((item) => item.rot > 0));

// 画像再現: 前日の東京喰種56台は計算可能だが、当日に差玉だけの保存が追加された状態。
// 当日の不完全行は履歴へ残しつつ、前日の正常値によるヒートマップ色と判断を消さない。
const preparedGhoulFallbackMap = buildStrategyMap({
  scans: [
    {
      id: "tokyo-ghoul-complete-27",
      storeId: "s1",
      storeName: "検証店",
      date: "2026-07-27",
      createdAt: "2026-07-27T12:00:00Z",
      rows: ghoulRows26,
    },
    {
      id: "tokyo-ghoul-delta-only-28",
      storeId: "s1",
      storeName: "検証店",
      date: "2026-07-28",
      createdAt: "2026-07-28T01:30:00Z",
      rows: ghoulRows26.map(({ num, machineName, island }) => ({
        num,
        machineName,
        island,
        val: -4000,
        status: "ok",
      })),
    },
  ],
  hallMaps: mixedDateHallMaps,
  selectedStoreId: "s1",
  targetDate: "2026-07-28",
  stores: [{ id: "s1", name: "検証店" }],
});
const preparedGhoulFallback = preparedGhoulFallbackMap.islands.find(
  (island) => island.name === "東京喰種",
).machines;
assert.equal(preparedGhoulFallback.length, 56);
assert.ok(preparedGhoulFallback.every((item) => item.freshness.sourceDate === "2026-07-27"));
assert.ok(preparedGhoulFallback.every((item) => item.recommendationStatus === "actionable"));
assert.ok(preparedGhoulFallback.every((item) => Number.isFinite(item.borderDiff)));
assert.ok(preparedGhoulFallback.every((item) => item.confidence > 0));
assert.ok(preparedGhoulFallback.every((item) => item.referenceFallback?.usedForDecision === true));
assert.ok(preparedGhoulFallback.every((item) => item.calculationPendingReasons.length === 0));
assert.equal(preparedGhoulFallbackMap.actionable, true);
assert.equal(
  preparedGhoulFallbackMap.islandActivityHistory.find(
    (entry) => entry.date === "2026-07-28" && entry.island === "東京喰種",
  )?.invalidMachines,
  56,
  "当日の不完全保存は履歴上の除外56台として残す",
);

// 新しい差玉だけの保存があっても、26日の最新「計算可能」データを参考表示する。
// 最新の不完全行を今日の候補として復活させず、過去値の数値だけを残す。
const ghoulRows70 = Array.from({ length: 70 }, (_, index) => ({
  num: String(758 + index),
  machineName: "e東京喰種",
  island: "東京喰種",
  normalSpins: 800,
  totalStarts: 10,
  val: 2000,
  status: "ok",
}));
const incompleteRefreshMap = buildStrategyMap({
  scans: [
    {
      id: "tokyo-ghoul-complete-26",
      storeId: "s1",
      storeName: "検証店",
      date: "2026-07-26",
      createdAt: "2026-07-26T12:00:00Z",
      rows: ghoulRows70,
    },
    {
      id: "tokyo-ghoul-incomplete-28",
      storeId: "s1",
      storeName: "検証店",
      date: "2026-07-28",
      createdAt: "2026-07-28T01:30:00Z",
      rows: ghoulRows70.map(({ num, machineName, island }) => ({
        num,
        machineName,
        island,
        val: -4000,
        status: "ok",
      })),
    },
  ],
  customMachines: [machine],
  hallMaps: {
    s1: [
      { id: "tokyo-ghoul", name: "東京喰種", machineName: "e東京喰種", start: 758, end: 827 },
    ],
  },
  selectedStoreId: "s1",
  targetDate: "2026-07-28",
  stores: [{ id: "s1", name: "検証店" }],
});
const incompleteRefreshGhoul = incompleteRefreshMap.islands.find(
  (island) => island.name === "東京喰種",
).machines;
assert.equal(incompleteRefreshGhoul.length, 70);
assert.ok(
  incompleteRefreshGhoul.every((item) => Number.isFinite(item.rot) && item.rot > 0),
  "不完全な28日分に隠されていた26日分70台の回転率を数値表示する",
);
assert.ok(incompleteRefreshGhoul.every((item) => item.freshness.sourceDate === "2026-07-26"));
assert.ok(incompleteRefreshGhoul.every((item) => item.referenceFallback?.latestSourceDate === "2026-07-28"));
assert.ok(incompleteRefreshGhoul.every((item) => item.recommendationStatus === "reference"));
assert.ok(incompleteRefreshGhoul.every((item) => item.calculationPendingReasons[0].includes("通常回転数なし")));
assert.equal(incompleteRefreshMap.candidates.length, 0, "過去参考値を28日の候補へ昇格させない");
assert.ok(incompleteRefreshMap.islandAvgRot("東京喰種") > 0, "過去参考同士の島平均との差を0基準にしない");

// 旧版の店舗IDなし行と、現在の店舗ID付き行も同じ70台の履歴として結合する。
const legacyStoreIdentityMap = buildStrategyMap({
  scans: [
    {
      id: "tokyo-ghoul-legacy-store-name-only-26",
      storeName: "検証店",
      date: "2026-07-26",
      createdAt: "2026-07-26T12:00:00Z",
      rows: ghoulRows70,
    },
    {
      id: "tokyo-ghoul-current-store-id-28",
      storeId: "s1",
      storeName: "検証店",
      date: "2026-07-28",
      createdAt: "2026-07-28T01:30:00Z",
      rows: ghoulRows70.map(({ num, machineName, island }) => ({
        num,
        machineName,
        island,
        val: -4000,
        status: "ok",
      })),
    },
  ],
  customMachines: [machine],
  hallMaps: {
    s1: [
      { id: "tokyo-ghoul", name: "東京喰種", machineName: "e東京喰種", start: 758, end: 827 },
    ],
  },
  selectedStoreId: "s1",
  targetDate: "2026-07-28",
  stores: [{ id: "s1", name: "検証店" }],
});
const legacyStoreIdentityGhoul = legacyStoreIdentityMap.islands.find(
  (island) => island.name === "東京喰種",
).machines;
assert.equal(legacyStoreIdentityGhoul.length, 70, "店舗IDの有無で同じ70台を二重表示しない");
assert.ok(legacyStoreIdentityGhoul.every((item) => Number.isFinite(item.rot) && item.rot > 0));
assert.ok(legacyStoreIdentityGhoul.every((item) => item.referenceFallback?.sourceDate === "2026-07-26"));
assert.equal(legacyStoreIdentityMap.candidates.length, 0);

// 店舗選択が未設定で、古い正常行だけに店舗IDがある逆向きの混在も統合する。
const inferredStoreIdentityMap = buildStrategyMap({
  scans: [
    {
      id: "tokyo-ghoul-store-id-only-26",
      storeId: "s1",
      storeName: "検証店",
      date: "2026-07-26",
      createdAt: "2026-07-26T12:00:00Z",
      rows: ghoulRows70,
    },
    {
      id: "tokyo-ghoul-latest-name-only-28",
      storeName: "検証店",
      date: "2026-07-28",
      createdAt: "2026-07-28T01:30:00Z",
      rows: ghoulRows70.map(({ num, machineName, island }) => ({
        num,
        machineName,
        island,
        val: -4000,
        status: "ok",
      })),
    },
  ],
  customMachines: [machine],
  hallMaps: {
    s1: [
      { id: "tokyo-ghoul", name: "東京喰種", machineName: "e東京喰種", start: 758, end: 827 },
    ],
  },
  selectedStoreId: null,
  targetDate: "2026-07-28",
  stores: [{ id: "s1", name: "検証店" }],
});
const inferredStoreIdentityGhoul = inferredStoreIdentityMap.islands.find(
  (island) => island.name === "東京喰種",
).machines;
assert.equal(inferredStoreIdentityGhoul.length, 70, "店舗未選択でも同じ70台を二重表示しない");
assert.ok(inferredStoreIdentityGhoul.every((item) => Number.isFinite(item.rot) && item.rot > 0));
assert.ok(inferredStoreIdentityGhoul.every((item) => item.referenceFallback?.sourceDate === "2026-07-26"));
assert.equal(inferredStoreIdentityMap.candidates.length, 0);

// 対象日より未来の解析は、過去参考の数値にも予測にも混ぜない。
const futureOnlyMap = buildStrategyMap({
  scans: [
    {
      id: "tokyo-ghoul-future-valid-29",
      storeId: "s1",
      storeName: "検証店",
      date: "2026-07-29",
      createdAt: "2026-07-29T12:00:00Z",
      rows: ghoulRows70,
    },
    {
      id: "tokyo-ghoul-future-invalid-30",
      storeId: "s1",
      storeName: "検証店",
      date: "2026-07-30",
      createdAt: "2026-07-30T12:00:00Z",
      rows: ghoulRows70.map(({ num, machineName, island }) => ({
        num,
        machineName,
        island,
        val: -4000,
        status: "ok",
      })),
    },
  ],
  customMachines: [machine],
  hallMaps: {
    s1: [
      { id: "tokyo-ghoul", name: "東京喰種", machineName: "e東京喰種", start: 758, end: 827 },
    ],
  },
  selectedStoreId: "s1",
  targetDate: "2026-07-28",
  stores: [{ id: "s1", name: "検証店" }],
});
assert.equal(futureOnlyMap.total, 0, "対象日より未来の回転率を表示しない");
assert.equal(futureOnlyMap.freshness.status, "future");
assert.equal(futureOnlyMap.freshness.sourceDate, "2026-07-30");

// 更新前のアプリで機種名なし保存になっていても、台番号が1島だけに一致すれば復旧する。
const missingMachineNameRows = Array.from({ length: 70 }, (_, index) => ({
  num: String(758 + index),
  machineName: "",
  island: "",
  normalSpins: 800,
  totalStarts: 10,
  val: 2000,
  status: "ok",
}));
const missingMachineNameMap = buildStrategyMap({
  scans: [
    {
      id: "other-machine-28-for-missing-name",
      storeId: "s1",
      storeName: "検証店",
      date: "2026-07-28",
      createdAt: "2026-07-28T01:00:00Z",
      rows: [{
        num: "479",
        machineName: "検証機",
        island: "大海物語",
        normalSpins: 800,
        totalStarts: 10,
        val: 2000,
        status: "ok",
      }],
    },
    {
      id: "tokyo-ghoul-26-missing-name",
      storeId: "s1",
      storeName: "検証店",
      date: "2026-07-26",
      createdAt: "2026-07-28T00:50:00Z",
      rows: missingMachineNameRows,
    },
  ],
  customMachines: [machine],
  hallMaps: {
    s1: [
      { id: "sea", name: "大海物語", machineName: "検証機", start: 479, end: 484 },
      { id: "tokyo-ghoul", name: "東京喰種", machineName: "e東京喰種", start: 758, end: 827 },
    ],
  },
  selectedStoreId: "s1",
  targetDate: "2026-07-28",
  stores: [{ id: "s1", name: "検証店" }],
});
const recoveredMissingNameGhoul = missingMachineNameMap.islands.find(
  (island) => island.name === "東京喰種",
).machines;
assert.equal(recoveredMissingNameGhoul.length, 70, "機種名なしの東京喰種70台を表示対象へ復旧する");
assert.ok(
  recoveredMissingNameGhoul.every((item) => item.rot > 0),
  "復旧した全70台へ予測回転率を表示する",
);
assert.ok(recoveredMissingNameGhoul.every((item) => item.machineName === "e東京喰種"));
assert.ok(recoveredMissingNameGhoul.every((item) => item.freshness.sourceDate === "2026-07-26"));

// 同じ台番号を含む島が複数ある場合は、機種名なし行を推測で関連付けない。
const overlappingLayoutMap = buildStrategyMap({
  scans: [{
    id: "ambiguous-missing-name",
    storeId: "s1",
    storeName: "検証店",
    date: "2026-07-28",
    createdAt: "2026-07-28T01:10:00Z",
    rows: [{
      num: "101",
      machineName: "",
      normalSpins: 800,
      totalStarts: 10,
      val: 2000,
      status: "ok",
    }],
  }],
  customMachines: [
    machine,
    { ...machine, name: "別の検証機", modelName: "P別の検証機TEST" },
  ],
  hallMaps: {
    s1: [
      { id: "overlap-a", name: "重複A", machineName: "検証機", start: 101, end: 101 },
      { id: "overlap-b", name: "重複B", machineName: "別の検証機", start: 101, end: 101 },
    ],
  },
  selectedStoreId: "s1",
  targetDate: "2026-07-28",
  stores: [{ id: "s1", name: "検証店" }],
});
assert.equal(overlappingLayoutMap.total, 0, "複数島に重なる機種名なし行は推測で復旧しない");

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
    { id: "layout-b", name: "B島", start: 201, end: 206, machineName: "検証機", facingIslandId: "layout-a" },
    { id: "layout-a", name: "1島", start: 101, end: 106, machineName: "検証機", facingIslandId: "layout-b" },
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
assert.equal(mappedLayout.islands[0].facingIslandId, "layout-a");

const unconfiguredPairs = pairStrategyIslands([
  { id: "unconfigured-a", name: "未設定A" },
  { id: "unconfigured-b", name: "未設定B" },
]);
assert.deepEqual(
  unconfiguredPairs.map((pair) => pair.map((island) => island.id)),
  [["unconfigured-a"], ["unconfigured-b"]],
  "対面未設定の島を表示順だけで仮ペアにしない",
);

const oneSidedPairs = pairStrategyIslands([
  { id: "one-a", name: "片側A", facingIslandId: "one-b" },
  { id: "one-b", name: "片側B" },
]);
assert.deepEqual(
  oneSidedPairs.map((pair) => pair.map((island) => island.id)),
  [["one-a"], ["one-b"]],
  "片側参照だけの旧データを対面表示しない",
);

const confirmedPairs = pairStrategyIslands([
  { layoutId: "same-a", id: "data-a", name: "同一機種A", machineName: "同一機種", facingIslandId: "same-b" },
  { layoutId: "same-b", id: "data-b", name: "同一機種B", machineName: "同一機種", facingIslandId: "same-a" },
]);
assert.deepEqual(
  confirmedPairs.map((pair) => pair.map((island) => island.layoutId)),
  [["same-a", "same-b"]],
  "相互参照が保存された同一機種の別島は対面表示する",
);
assert.equal(confirmedPairs[0].confirmed, true);

const scopedIslands = [
  {
    layoutId: "scope-a",
    id: "scope-data-a",
    name: "A島",
    machineName: "機種A",
    start: 101,
    end: 103,
    facingIslandId: "scope-b",
    machines: [
      {
        id: "a-101",
        machineName: "機種A",
        score: 30,
        recommendationStatus: "actionable",
        seatDecisionStatus: "candidate",
        nailAlert: "",
      },
    ],
  },
  {
    layoutId: "scope-b",
    id: "scope-data-b",
    name: "B島",
    machineName: "機種B",
    start: 201,
    end: 202,
    facingIslandId: "scope-a",
    machines: [
      {
        id: "b-201",
        machineName: "機種B",
        score: 80,
        recommendationStatus: "actionable",
        seatDecisionStatus: "candidate",
        nailAlert: "締め傾向",
      },
    ],
  },
  {
    id: "scope-single",
    name: "C島",
    machineName: "機種C",
    machines: [
      {
        id: "c-301",
        machineName: "機種C",
        score: 50,
        recommendationStatus: "actionable",
        seatDecisionStatus: "candidate",
        nailAlert: "",
      },
    ],
  },
];
const pairedScope = buildStrategyViewScope({
  islands: scopedIslands,
  activeIslandId: "scope-data-b",
  actionable: true,
});
assert.deepEqual(
  pairedScope,
  {
    label: "A島・B島",
    machineName: "機種A・機種B",
    total: 5,
    candidates: 1,
    leadId: "b-201",
  },
  "表示中の対面2島だけを集計し、締め傾向の台を候補へ含めない",
);

const singleScope = buildStrategyViewScope({
  islands: scopedIslands,
  activeIslandId: "scope-single",
  actionable: true,
});
assert.deepEqual(
  singleScope,
  {
    label: "C島",
    machineName: "機種C",
    total: 1,
    candidates: 1,
    leadId: "c-301",
  },
  "下の島選択を変えると、ヘッダーとカードが参照する機種・台数・候補も切り替わる",
);

assert.equal(
  buildStrategyViewScope({
    islands: scopedIslands,
    activeIslandId: "scope-single",
    actionable: false,
  }).candidates,
  0,
  "古い解析日は表示中の島でも候補0台として安全停止する",
);

console.log("strategyMapData.test.mjs: all tests passed");
