import { MOCK_STORE_DETAIL } from "../../data/mockStoreDetail.js";

const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];
const TIME_SLOT_DEFINITIONS = [
  { id: "morning", label: "午前", range: "〜11:59" },
  { id: "noon", label: "昼", range: "12:00〜15:59" },
  { id: "evening", label: "夕方", range: "16:00〜19:59" },
  { id: "night", label: "夜", range: "20:00〜" },
];

const normalizeMemberCard = (memberCard) => ({
  created: false,
  number: "",
  deposit: 0,
  ...(memberCard || {}),
});

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeBars = (values) => {
  const max = Math.max(0, ...values);
  return values.map((value) => (max > 0 ? value / max : 0));
};

const recordMatchesStore = (record, store) => (
  (record?.storeId != null && record.storeId === store?.id)
  || (record?.storeName && record.storeName === store?.name)
);

const sortKey = (item) => `${item?.date || ""}T${item?.time || item?.recordedAt || ""}`;

const formatShortDate = (date) => {
  const [, month, day] = String(date || "").split("-").map(Number);
  return month && day ? `${month}月${day}日` : "未記録";
};

const actualProfit = (record) => (
  toNumber(record?.recoveryYen) - toNumber(record?.investYen) - toNumber(record?.chodamaYen)
);

const expectedValue = (record) => toNumber(
  record?.stats?.effectiveWorkAmount ?? record?.stats?.workAmount ?? record?.expectedValue
);

const decorateSnapshot = (snapshot, record) => ({
  id: snapshot?.id || `${record?.id || "record"}-${snapshot?.recordedAt || snapshot?.checkpointK || "decision"}`,
  action: snapshot?.action || "",
  reason: snapshot?.reason || "理由の記録なし",
  checkpointK: snapshot?.checkpointK == null ? null : toNumber(snapshot.checkpointK),
  recordedAt: snapshot?.recordedAt || record?.time || "",
  date: record?.date || "",
  machineName: record?.machineName || "機種未設定",
  machineNum: record?.machineNum || "",
});

export function buildStoreAnalytics(archives, store) {
  const records = (Array.isArray(archives) ? archives : [])
    .filter((record) => recordMatchesStore(record, store))
    .sort((a, b) => sortKey(b).localeCompare(sortKey(a), "ja"));
  const weekdayCounts = Array(7).fill(0);
  const timeSlotCounts = Array(4).fill(0);
  const machineMap = new Map();

  for (const record of records) {
    const date = String(record?.date || "");
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      const weekday = new Date(`${date}T12:00:00`).getDay();
      if (Number.isInteger(weekday)) weekdayCounts[weekday] += 1;
    }

    const hour = Number.parseInt(String(record?.time || "").slice(0, 2), 10);
    if (Number.isFinite(hour)) {
      const slot = hour < 12 ? 0 : hour < 16 ? 1 : hour < 20 ? 2 : 3;
      timeSlotCounts[slot] += 1;
    }

    const machineName = String(record?.machineName || "").trim();
    if (machineName) {
      const previous = machineMap.get(machineName) || { count: 0, latestDate: "" };
      machineMap.set(machineName, {
        count: previous.count + 1,
        latestDate: [previous.latestDate, date].sort().at(-1) || "",
      });
    }
  }

  const weekdayCovered = weekdayCounts.filter(Boolean).length;
  const timeSlotCovered = timeSlotCounts.filter(Boolean).length;
  const knownMachines = machineMap.size;
  const latestDate = records.map((record) => String(record?.date || "")).filter(Boolean).sort().at(-1) || "";
  const freshnessLabel = formatShortDate(latestDate);
  const machines = [...machineMap.entries()]
    .map(([name, value]) => ({ name, ...value }))
    .sort((a, b) => b.count - a.count || b.latestDate.localeCompare(a.latestDate, "ja"));
  const machineBars = machines.slice(0, 5).map((machine) => machine.count);

  const judgmentDetails = { good: [], review: [], withdrawal: [] };
  const goodActions = new Set(["continue", "continue_strong"]);
  const reviewActions = new Set(["stop_candidate", "compare", "stop"]);
  for (const record of records) {
    for (const snapshot of Array.isArray(record?.decisionSnapshots) ? record.decisionSnapshots : []) {
      const detail = decorateSnapshot(snapshot, record);
      if (goodActions.has(snapshot?.action)) judgmentDetails.good.push(detail);
      if (reviewActions.has(snapshot?.action)) judgmentDetails.review.push(detail);
      if (snapshot?.action === "stop") judgmentDetails.withdrawal.push(detail);
    }
  }

  const coverageBreakdown = [
    { id: "records", label: "記録", value: records.length, target: 12 },
    { id: "weekdays", label: "曜日", value: weekdayCovered, target: 7 },
    { id: "timeSlots", label: "時間帯", value: timeSlotCovered, target: 4 },
    { id: "machines", label: "機種", value: knownMachines, target: 8 },
  ].map((item) => ({
    ...item,
    percent: Math.round(Math.min(1, item.value / item.target) * 100),
  }));
  const analysisScore = Math.round(
    coverageBreakdown.reduce((sum, item) => sum + item.percent, 0) / coverageBreakdown.length
  );

  let nextToCheck;
  if (records.length === 0) {
    nextToCheck = {
      title: "実戦記録がまだありません",
      body: "この店舗で実戦を保存すると、分析内容が表示されます",
      recommended: "まず1件、実戦記録を追加",
    };
  } else if (timeSlotCovered < 4) {
    const missing = TIME_SLOT_DEFINITIONS.filter((_, index) => timeSlotCounts[index] === 0);
    nextToCheck = {
      title: `${missing.map((item) => item.label).join("・")}の記録が不足`,
      body: "別の時間帯の記録を追加すると、比較できる範囲が広がります",
      recommended: `${missing[0].label}（${missing[0].range}）の実戦を追加`,
    };
  } else if (weekdayCovered < 7) {
    const missing = WEEKDAY_LABELS.filter((_, index) => weekdayCounts[index] === 0);
    nextToCheck = {
      title: `${missing.join("・")}曜日の記録が不足`,
      body: "曜日が少ない実戦を追加すると、曜日別の比較ができます",
      recommended: `${missing[0]}曜日の実戦を追加`,
    };
  } else if (knownMachines < 8) {
    nextToCheck = {
      title: "把握している機種が不足",
      body: "別機種の実戦を追加すると、機種別の傾向が安定します",
      recommended: "未記録の機種で実戦を追加",
    };
  } else if (records.length < 12) {
    nextToCheck = {
      title: `あと${12 - records.length}件で記録目標を達成`,
      body: "12件を目安に記録すると、比較のばらつきを抑えやすくなります",
      recommended: "直近の実戦記録を追加",
    };
  } else {
    nextToCheck = {
      title: "主要な記録が揃っています",
      body: "引き続き実戦を保存すると、集計の安定性が高まります",
      recommended: "新しい実戦を記録",
    };
  }

  const reliability = records.length >= 10 ? "高" : records.length >= 3 ? "中" : records.length > 0 ? "低" : "未記録";

  return {
    analysisScore,
    dataReliability: reliability,
    analysisStatus: records.length > 0 ? "実績集計" : "未記録",
    lastUpdatedLabel: freshnessLabel,
    dataSufficiency: {
      validRecords: records.length,
      knownMachines,
      dayOfWeekCovered: weekdayCovered,
      dayOfWeekTotal: 7,
      timeSlotCovered,
      timeSlotTotal: 4,
      freshnessLabel,
    },
    nextToCheck,
    trends: records.length ? [
      { id: "dayOfWeek", label: "曜日別", color: "purple", spark: normalizeBars(weekdayCounts) },
      { id: "timeSlot", label: "時間帯別", color: "teal", spark: normalizeBars(timeSlotCounts) },
      { id: "machine", label: "機種別", color: "blue", spark: normalizeBars(machineBars.length ? machineBars : [0]) },
    ] : [],
    judgmentLog: {
      good: judgmentDetails.good.length,
      review: judgmentDetails.review.length,
      withdrawal: judgmentDetails.withdrawal.length,
    },
    analyticsDetail: {
      coverageBreakdown,
      weekdays: WEEKDAY_LABELS.map((label, index) => ({ label: `${label}曜日`, count: weekdayCounts[index], covered: weekdayCounts[index] > 0 })),
      timeSlots: TIME_SLOT_DEFINITIONS.map((slot, index) => ({ ...slot, count: timeSlotCounts[index], covered: timeSlotCounts[index] > 0 })),
      machines,
      recentRecords: records.slice(0, 5).map((record) => ({
        id: record?.id || `${record?.date || ""}-${record?.time || ""}`,
        date: record?.date || "",
        time: record?.time || "",
        machineName: record?.machineName || "機種未設定",
        machineNum: record?.machineNum || "",
        investYen: toNumber(record?.investYen),
        recoveryYen: toNumber(record?.recoveryYen),
        actualProfitYen: actualProfit(record),
        expectedValueYen: expectedValue(record),
      })),
      judgments: judgmentDetails,
      missingWeekdays: WEEKDAY_LABELS.filter((_, index) => weekdayCounts[index] === 0).map((label) => `${label}曜日`),
      missingTimeSlots: TIME_SLOT_DEFINITIONS.filter((_, index) => timeSlotCounts[index] === 0).map((slot) => `${slot.label}（${slot.range}）`),
    },
  };
}

export function resolveStoreDetail(stores, storeId, opts = {}) {
  const {
    chodamaReplayLimit = 0,
    currentRentBalls,
    currentExRate,
    archives = [],
    chodamaLog = [],
  } = opts;
  const list = Array.isArray(stores) ? stores : [];
  if (storeId === MOCK_STORE_DETAIL.id) return { ...MOCK_STORE_DETAIL, isRealStore: false };
  const store = list.find((item) => item && item.id === storeId) || list[0] || null;
  if (!store) return { ...MOCK_STORE_DETAIL, isRealStore: false };

  const faceRent = toNumber(store.rentBalls || 250) / 10;
  const faceEx = toNumber(store.exRate || 250) / 10;
  const yenPerBall = faceRent > 0 ? 100 / faceRent : 0;
  const exYenPerBall = faceEx > 0 ? 100 / faceEx : 0;
  const rentalYenPer100 = Number.isInteger(yenPerBall) ? yenPerBall : Math.round(yenPerBall * 10) / 10;
  const chodamaBalls = toNumber(store.chodama);
  const replayBalls = toNumber(store.replayBalls);
  const todaySettle = toNumber(store.todaySettle);
  const memberCard = normalizeMemberCard(store.memberCard);
  const replayCapBalls = toNumber(chodamaReplayLimit);
  const analytics = buildStoreAnalytics(archives, store);
  const balanceHistory = (Array.isArray(chodamaLog) ? chodamaLog : [])
    .filter((entry) => recordMatchesStore(entry, store))
    .sort((a, b) => sortKey(b).localeCompare(sortKey(a), "ja"))
    .slice(0, 10)
    .map((entry) => ({
      id: entry?.id || `${entry?.date || ""}-${entry?.type || "balance"}`,
      date: entry?.date || "",
      type: entry?.type || "adjust",
      balls: toNumber(entry?.balls),
      balanceBefore: toNumber(entry?.balanceBefore),
      balanceAfter: toNumber(entry?.balanceAfter),
      memo: entry?.memo || "",
    }));

  const appliedToCurrentSession = (
    currentRentBalls != null
    && currentExRate != null
    && toNumber(store.rentBalls || 250) === toNumber(currentRentBalls)
    && toNumber(store.exRate || 250) === toNumber(currentExRate)
  );

  return {
    ...MOCK_STORE_DETAIL,
    ...analytics,
    id: store.id,
    name: store.name || "",
    address: store.address || "",
    logoUrl: null,
    logoInitial: (store.name || "?").trim().charAt(0) || "?",
    currentSettings: {
      appliedToCurrentSession,
      rentalYenPer100,
      exchangeBallsPer100: faceEx,
      hasChodama: chodamaBalls > 0 || memberCard.created,
      replayCapBalls,
    },
    chodama: {
      storeBalls: chodamaBalls,
      storeBallsYen: Math.round(chodamaBalls * exYenPerBall),
      storeReplayBalls: replayBalls,
      storeReplayYen: Math.round(replayBalls * exYenPerBall),
      todaySettlementBalls: todaySettle,
      todaySettlementYen: Math.round(todaySettle * exYenPerBall),
      balanceHistory,
    },
    basicInfo: {
      name: store.name || "",
      address: store.address || "",
      lastVisitLabel: store.lastVisit || "",
      memo: store.memo || "",
      closingTime: store.closingTime || "",
    },
    memberCard: {
      created: !!memberCard.created,
      number: memberCard.number || "",
      lastBalanceBalls: chodamaBalls,
      lastBalanceYen: Math.round(chodamaBalls * exYenPerBall),
      depositBalanceYen: toNumber(memberCard.deposit),
    },
    exchangeInfo: {
      rentalYenPer100,
      rentalBallsPer100: faceRent,
      exchangeBallsPer100: faceEx,
      ballUnitYen: exYenPerBall,
      replayCapBalls,
    },
    isRealStore: true,
  };
}
