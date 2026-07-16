// 店舗詳細画面: 実店舗データ（App.jsx の S.stores）から表示用データを組み立てる純粋関数。
//
// 概要/設定タブのうち「店舗基本情報・貯玉・会員カード・交換率」は実データに接続する。
// 一方、分析タブ関連（店舗分析度・データ充足状況・傾向・判断ログ・次に確認すること）は
// 対応する実集計ロジックがまだ存在しないため、引き続き mockStoreDetail.js のダミー値を使う
// （TODO: archives ベースの店舗別集計は別ステップで実装）。
//
// 交換率・貸玉単価の計算式は src/components/Tabs.jsx の SettingsTab 内「Store detail view」
// （faceRent / yenPerBall / faceEx / exYenPerBall / chodamaYen の導出）と同一のものを使用し、
// 独自の新しい計算式は導入しない。logic.js には依存しない・触れない。

import { MOCK_STORE_DETAIL } from "../../data/mockStoreDetail.js";

const normalizeMemberCard = (mc) => ({ created: false, number: "", deposit: 0, ...(mc || {}) });

const normalizeBars = (values) => {
  const max = Math.max(0, ...values);
  return values.map((value) => max > 0 ? value / max : 0);
};

const recordMatchesStore = (record, store) => (
  (record?.storeId != null && record.storeId === store?.id)
  || (record?.storeName && record.storeName === store?.name)
);

export function buildStoreAnalytics(archives, store) {
  const records = (Array.isArray(archives) ? archives : []).filter((record) => recordMatchesStore(record, store));
  const weekdays = Array(7).fill(0);
  const timeSlots = Array(4).fill(0);
  const machineCounts = new Map();

  for (const record of records) {
    const date = String(record?.date || "");
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      const weekday = new Date(`${date}T12:00:00`).getDay();
      if (Number.isInteger(weekday)) weekdays[weekday] += 1;
    }
    const hour = Number.parseInt(String(record?.time || "").slice(0, 2), 10);
    if (Number.isFinite(hour)) {
      const slot = hour < 12 ? 0 : hour < 16 ? 1 : hour < 20 ? 2 : 3;
      timeSlots[slot] += 1;
    }
    const machineName = String(record?.machineName || "").trim();
    if (machineName) machineCounts.set(machineName, (machineCounts.get(machineName) || 0) + 1);
  }

  const weekdayCovered = weekdays.filter(Boolean).length;
  const timeSlotCovered = timeSlots.filter(Boolean).length;
  const knownMachines = machineCounts.size;
  const latestDate = records.map((record) => String(record?.date || "")).filter(Boolean).sort().at(-1) || "";
  const [, latestMonth, latestDay] = latestDate.split("-").map(Number);
  const freshnessLabel = latestMonth && latestDay ? `${latestMonth}月${latestDay}日` : "未記録";
  const machineBars = [...machineCounts.values()].sort((a, b) => b - a).slice(0, 5);

  const snapshots = records.flatMap((record) => (
    Array.isArray(record?.decisionSnapshots) ? record.decisionSnapshots : []
  ));
  const goodActions = new Set(["continue", "continue_strong"]);
  const reviewActions = new Set(["stop_candidate", "compare", "stop"]);

  const coverageParts = [
    Math.min(1, records.length / 12),
    weekdayCovered / 7,
    timeSlotCovered / 4,
    Math.min(1, knownMachines / 8),
  ];
  const analysisScore = Math.round(coverageParts.reduce((sum, value) => sum + value, 0) / coverageParts.length * 100);

  let nextToCheck;
  if (records.length === 0) {
    nextToCheck = { title: "実戦記録がまだありません", body: "この店舗で実戦を保存すると、分析内容が表示されます" };
  } else if (timeSlotCovered < 4) {
    const labels = ["午前", "昼", "夕方", "夜"];
    nextToCheck = { title: `${labels[timeSlots.findIndex((count) => count === 0)]}の記録が不足`, body: "別の時間帯の記録を追加すると、比較できる範囲が広がります" };
  } else if (weekdayCovered < 7) {
    nextToCheck = { title: "未記録の曜日があります", body: "曜日が異なる実戦を追加すると、曜日別の比較ができます" };
  } else {
    nextToCheck = { title: "主要な記録が揃っています", body: "引き続き実戦を保存すると、集計の安定性が高まります" };
  }

  return {
    analysisScore,
    dataReliability: records.length >= 10 ? "高" : records.length >= 3 ? "中" : records.length > 0 ? "低" : "未記録",
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
      { id: "dayOfWeek", label: "曜日別", color: "purple", spark: normalizeBars(weekdays) },
      { id: "timeSlot", label: "時間帯別", color: "teal", spark: normalizeBars(timeSlots) },
      { id: "machine", label: "機種別", color: "blue", spark: normalizeBars(machineBars.length ? machineBars : [0]) },
    ] : [],
    judgmentLog: {
      good: snapshots.filter((item) => goodActions.has(item?.action)).length,
      review: snapshots.filter((item) => reviewActions.has(item?.action)).length,
      withdrawal: snapshots.filter((item) => item?.action === "stop").length,
    },
  };
}

export function resolveStoreDetail(stores, storeId, opts = {}) {
  const { chodamaReplayLimit = 0, currentRentBalls, currentExRate, archives = [] } = opts;
  const list = Array.isArray(stores) ? stores : [];
  if (storeId === MOCK_STORE_DETAIL.id) {
    return { ...MOCK_STORE_DETAIL, isRealStore: false };
  }
  const store = list.find((st) => st && st.id === storeId) || list[0] || null;

  if (!store) {
    // 登録店舗がまだ無い場合はダミー1店舗をそのまま表示（見た目確認用のフォールバック）
    return { ...MOCK_STORE_DETAIL, isRealStore: false };
  }

  // Tabs.jsx の Store detail view と同一の導出式（faceRent/faceEx は 玉/100円 の面値）
  const faceRent = Number(store.rentBalls || 250) / 10;
  const faceEx = Number(store.exRate || 250) / 10;
  const yenPerBall = faceRent > 0 ? 100 / faceRent : 0; // 貸玉単価（円/1玉）
  const exYenPerBall = faceEx > 0 ? 100 / faceEx : 0; // 玉単価（円/1玉、交換時）
  const rentalYenPer100 = Number.isInteger(yenPerBall) ? yenPerBall : Math.round(yenPerBall * 10) / 10;

  const chodamaBalls = store.chodama || 0;
  const replayBalls = store.replayBalls || 0;
  const todaySettle = store.todaySettle || 0;
  const mc = normalizeMemberCard(store.memberCard);
  const replayCapBalls = Number(chodamaReplayLimit) || 0;
  const analytics = buildStoreAnalytics(archives, store);

  const appliedToCurrentSession =
    currentRentBalls != null &&
    currentExRate != null &&
    Number(store.rentBalls || 250) === Number(currentRentBalls) &&
    Number(store.exRate || 250) === Number(currentExRate);

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
      hasChodama: chodamaBalls > 0 || !!mc.created,
      replayCapBalls,
    },
    chodama: {
      storeBalls: chodamaBalls,
      storeBallsYen: Math.round(chodamaBalls * exYenPerBall),
      storeReplayBalls: replayBalls,
      storeReplayYen: Math.round(replayBalls * exYenPerBall),
      todaySettlementBalls: todaySettle,
      todaySettlementYen: Math.round(todaySettle * exYenPerBall),
    },
    basicInfo: {
      name: store.name || "",
      address: store.address || "",
      lastVisitLabel: store.lastVisit || "",
      memo: store.memo || "",
    },
    memberCard: {
      created: !!mc.created,
      lastBalanceBalls: chodamaBalls,
      lastBalanceYen: Math.round(chodamaBalls * exYenPerBall),
      depositBalanceYen: mc.deposit || 0,
    },
    exchangeInfo: {
      rentalYenPer100,
      exchangeBallsPer100: faceEx,
      ballUnitYen: exYenPerBall,
      replayCapBalls,
    },
    isRealStore: true,
  };
}
