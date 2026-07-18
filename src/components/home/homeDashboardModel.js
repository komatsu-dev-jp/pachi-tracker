import { getEvAmount } from "../analysis/analysisSelectors.js";
import { getRealPL } from "./homePlanningModel.js";

const pad2 = (value) => String(value).padStart(2, "0");

export function monthKeyFor(date = new Date()) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;
}

export function buildMonthOverview(archives, target, now = new Date()) {
  const list = Array.isArray(archives) ? archives : [];
  const monthKey = monthKeyFor(now);
  const monthRecords = list.filter((item) => String(item?.date || "").startsWith(monthKey));
  const actualRecords = monthRecords.filter((item) => getRealPL(item) != null);
  const expected = monthRecords.reduce((sum, item) => sum + getEvAmount(item), 0);
  const comparableExpected = actualRecords.reduce((sum, item) => sum + getEvAmount(item), 0);
  const actual = actualRecords.reduce((sum, item) => sum + getRealPL(item), 0);
  const safeTarget = Math.max(0, Math.floor(Number(target) || 0));
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const today = Math.min(now.getDate(), daysInMonth);
  const evByDay = new Map();
  const actualByDay = new Map();

  for (const record of monthRecords) {
    const day = Number(String(record?.date || "").slice(8, 10));
    if (!Number.isInteger(day) || day < 1 || day > daysInMonth) continue;
    evByDay.set(day, (evByDay.get(day) || 0) + getEvAmount(record));
    const realPL = getRealPL(record);
    if (realPL != null) actualByDay.set(day, (actualByDay.get(day) || 0) + realPL);
  }

  let cumulative = 0;
  let cumulativeActual = 0;
  let hasCumulativeActual = false;
  const chartData = Array.from({ length: daysInMonth }, (_, index) => {
    const day = index + 1;
    if (day <= today) cumulative += evByDay.get(day) || 0;
    if (day <= today && actualByDay.has(day)) {
      cumulativeActual += actualByDay.get(day) || 0;
      hasCumulativeActual = true;
    }
    return {
      day,
      label: `${day}日`,
      cumulativeEv: day <= today ? Math.round(cumulative) : null,
      cumulativeActual: day <= today && hasCumulativeActual ? Math.round(cumulativeActual) : null,
      targetPace: safeTarget > 0 ? Math.round((safeTarget * day) / daysInMonth) : null,
    };
  });

  const progress = safeTarget > 0 ? Math.max(0, Math.round((expected / safeTarget) * 100)) : 0;
  const wins = actualRecords.filter((item) => getRealPL(item) > 0).length;

  return {
    monthKey,
    monthRecords,
    expected,
    actual,
    hasActual: actualRecords.length > 0,
    variance: actual - comparableExpected,
    actualExpectedGap: actualRecords.length ? actual - comparableExpected : null,
    comparableExpected,
    actualRecordCount: actualRecords.length,
    actualCoverage: monthRecords.length ? Math.round((actualRecords.length / monthRecords.length) * 100) : 0,
    activeDays: new Set(monthRecords.map((item) => item?.date).filter(Boolean)).size,
    winSessionRate: actualRecords.length ? Math.round((wins / actualRecords.length) * 100) : 0,
    target: safeTarget,
    remaining: Math.max(0, safeTarget - expected),
    progress,
    achieved: safeTarget > 0 && expected >= safeTarget,
    chartData,
  };
}

function recordTimestamp(record) {
  const date = String(record?.date || "");
  const time = String(record?.time || "00:00");
  return String(record?.endedAt || record?.createdAt || `${date}T${time}`);
}

export function latestArchive(archives) {
  const list = Array.isArray(archives) ? archives.filter(Boolean) : [];
  return [...list].sort((a, b) => recordTimestamp(b).localeCompare(recordTimestamp(a)))[0] || null;
}

function scanMatchesStore(scan, store) {
  if (!store) return true;
  if (scan?.storeId != null && store?.id != null) return scan.storeId === store.id;
  return Boolean(scan?.storeName && store?.name && scan.storeName === store.name);
}

export function buildDeltaStatus(scans, store, todayStr) {
  const scoped = (Array.isArray(scans) ? scans : []).filter((scan) => scanMatchesStore(scan, store));
  const sorted = [...scoped].sort((a, b) => String(b?.createdAt || "").localeCompare(String(a?.createdAt || "")));
  const latest = sorted[0] || null;
  const uniqueMachines = new Set();

  for (const scan of scoped) {
    for (const row of Array.isArray(scan?.rows) ? scan.rows : []) {
      const machineKey = row?.machineNum ?? row?.num ?? row?.machineName;
      if (machineKey == null || machineKey === "") continue;
      uniqueMachines.add(String(machineKey));
    }
  }

  if (!latest) {
    return {
      hasScans: false,
      hasTodayScan: false,
      lastLabel: "—",
      machineCount: 0,
      stateLabel: "未解析",
      scopeLabel: store?.name || "全店舗",
    };
  }

  const createdAt = String(latest?.createdAt || "");
  const day = String(latest?.date || createdAt.slice(0, 10));
  let lastLabel = "—";
  if (day === todayStr) {
    const parsed = new Date(createdAt);
    lastLabel = createdAt.length >= 16 && !Number.isNaN(parsed.getTime())
      ? `本日 ${parsed.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}`
      : "本日";
  } else if (day.length >= 10) {
    lastLabel = `${Number(day.slice(5, 7))}/${Number(day.slice(8, 10))}`;
  }

  return {
    hasScans: true,
    hasTodayScan: day === todayStr,
    lastLabel,
    machineCount: uniqueMachines.size,
    stateLabel: "解析済み",
    scopeLabel: store?.name || "全店舗",
  };
}

export function getNextAction({ sessionStarted, stores, selectedStore, hasTodayRecord, hasTodayScan }) {
  if (sessionStarted) {
    return {
      kind: "record",
      title: "実戦記録を続ける",
      message: "進行中の実戦データを入力しましょう",
      tag: "実戦中",
      actionLabel: "記録へ戻る",
    };
  }
  if (!Array.isArray(stores) || stores.length === 0 || !selectedStore) {
    return {
      kind: "settings",
      title: "最初の店舗を登録する",
      message: "店舗を登録すると差玉解析や実戦記録をまとめられます",
      tag: "初期設定",
      actionLabel: "店舗を登録",
    };
  }
  if (hasTodayRecord) {
    return {
      kind: "analysis",
      title: "今日の実戦を振り返る",
      message: "期待値と実収支、判断記録を確認しましょう",
      tag: "実戦後",
      actionLabel: "分析を見る",
    };
  }
  if (!hasTodayScan) {
    return {
      kind: "delta",
      title: "今日の差玉を解析する",
      message: `${selectedStore.name || "選択中の店舗"}の候補台を探す準備をします`,
      tag: "実戦前",
      actionLabel: "解析する",
    };
  }
  return {
    kind: "strategy",
    title: "候補台を確認する",
    message: "解析結果から今日の狙い台を比較しましょう",
    tag: "解析済み",
    actionLabel: "台を選ぶ",
  };
}
