// 偵察モード用の集計セレクタ（純粋関数）
//
// 入力: archives 配列（analysisSelectors.js と同じ archive 構造を想定）
// 主に「店舗別実績」タブで使う。
//
// 主要フィールド:
//   - storeName: 文字列（空文字なら "店舗未登録" 扱い）
//   - investYen / recoveryYen: 実損益判定用
//   - 期待値: 通常期待値（effectiveWorkAmount、旧データは workAmount）+ 有効な遊タイム判断EV
//   - date: "YYYY-MM-DD"
//
// hasActual の判定は analysisSelectors と揃える（投資 or 回収のどちらかが 0 より大きい）。

import { getEvAmount } from "../analysis/analysisSelectors.js";

const UNREGISTERED = "店舗未登録";

const hasActualMoney = (a) =>
  (Number(a?.investYen) || 0) > 0 || (Number(a?.recoveryYen) || 0) > 0;

function getActualPL(a) {
  if (!hasActualMoney(a)) return null;
  return (Number(a.recoveryYen) || 0) - (Number(a.investYen) || 0);
}

function normalizeStoreName(name) {
  const s = typeof name === "string" ? name.trim() : "";
  return s.length > 0 ? s : UNREGISTERED;
}

// 直近 N 日に絞り込み
function withinRecentDays(archive, days, refDate) {
  if (!days || days <= 0) return true;
  if (typeof archive?.date !== "string") return false;
  const a = new Date(archive.date + "T00:00:00");
  const ref = refDate ? new Date(refDate + "T00:00:00") : new Date();
  const diffMs = ref.getTime() - a.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  return diffDays >= 0 && diffDays <= days;
}

// 店舗別実績ランキング
//   options:
//     - recentDays: 直近 N 日に絞る（省略時は全件）
//     - refDate: 基準日 "YYYY-MM-DD"（省略時は今日）
//     - limit: 返す件数（省略時 5）
//   返却: [{
//     storeName, sessions, days,
//     totalPL, totalInvest, totalRecovery, recoverRate,
//     winRate, winSessions,
//     evAmount, hasActual,
//     verdict: "strong" | "neutral" | "weak",
//     source: "real",
//   }, ...]
//
//   並び順: 実損益が記録された店舗を優先（収支降順）→ 期待値降順。
export function getStoreRanking(archives, { recentDays, refDate, limit = 5 } = {}) {
  if (!Array.isArray(archives) || archives.length === 0) return [];

  const map = {};
  for (const a of archives) {
    if (!a) continue;
    if (recentDays && !withinRecentDays(a, recentDays, refDate)) continue;

    const name = normalizeStoreName(a.storeName);
    if (!map[name]) {
      map[name] = {
        storeName: name,
        sessions: 0,
        _days: new Set(),
        totalPL: 0,
        totalInvest: 0,
        totalRecovery: 0,
        winSessions: 0,
        realSessions: 0,
        evAmount: 0,
        hasActual: false,
      };
    }
    const row = map[name];
    row.sessions += 1;
    if (a.date) row._days.add(a.date);

    const pl = getActualPL(a);
    if (pl != null) {
      row.hasActual = true;
      row.realSessions += 1;
      row.totalPL += pl;
      row.totalInvest += Number(a.investYen) || 0;
      row.totalRecovery += Number(a.recoveryYen) || 0;
      if (pl > 0) row.winSessions += 1;
    }
    row.evAmount += getEvAmount(a);
  }

  const list = Object.values(map).map(({ _days, ...rest }) => {
    const recoverRate = rest.totalInvest > 0
      ? (rest.totalRecovery / rest.totalInvest) * 100
      : null;
    const winRate = rest.realSessions > 0
      ? (rest.winSessions / rest.realSessions) * 100
      : null;
    let verdict = "neutral";
    if (rest.hasActual) {
      if (rest.totalPL >= 10000 || (recoverRate != null && recoverRate >= 110)) {
        verdict = "strong";
      } else if (rest.totalPL <= -10000 || (recoverRate != null && recoverRate < 90)) {
        verdict = "weak";
      }
    } else if (rest.evAmount >= 10000) {
      verdict = "strong";
    } else if (rest.evAmount <= -5000) {
      verdict = "weak";
    }
    return {
      ...rest,
      days: _days.size,
      recoverRate,
      winRate,
      verdict,
      source: "real",
    };
  });

  // 並び: 実損益あり優先（収支降順）→ 期待値降順
  list.sort((a, b) => {
    if (a.hasActual && !b.hasActual) return -1;
    if (!a.hasActual && b.hasActual) return 1;
    if (a.hasActual && b.hasActual) return b.totalPL - a.totalPL;
    return b.evAmount - a.evAmount;
  });

  return list.slice(0, limit).map((r, i) => ({ rank: i + 1, ...r }));
}

// 過去アーカイブから店舗名一覧（登録ありのみ、出現回数降順）
export function listKnownStores(archives) {
  if (!Array.isArray(archives)) return [];
  const map = {};
  for (const a of archives) {
    const name = typeof a?.storeName === "string" ? a.storeName.trim() : "";
    if (!name) continue;
    map[name] = (map[name] || 0) + 1;
  }
  return Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .map(([name]) => name);
}
