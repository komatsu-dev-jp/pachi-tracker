// 分析モード用の集計セレクタ（純粋関数）
//
// 入力: archives 配列（各要素は makeArchive() / handleMoveTable() で生成される構造）
// 主要フィールド:
//   - date: "YYYY-MM-DD"
//   - investYen, recoveryYen
//   - machineName, machineNum, storeName
//   - stats: { workAmount, netRot, ev1K, wage, ... }
//   - settings: { synthDenom, ... }
//   - chodamaYen, chodamaNetBalls
//
// 実損益(actualPL) = recoveryYen - investYen （投資 or 回収が記録されている archive のみ）
// 期待値(evAmount) = stats.workAmount

const hasActualMoney = (a) =>
  (Number(a?.investYen) || 0) > 0 || (Number(a?.recoveryYen) || 0) > 0;

export function getActualPL(a) {
  if (!hasActualMoney(a)) return null;
  return (Number(a.recoveryYen) || 0) - (Number(a.investYen) || 0);
}

export function getEvAmount(a) {
  const w = a?.stats?.workAmount;
  return typeof w === "number" && isFinite(w) ? w : 0;
}

// YYYY-MM-DD → "YYYY-MM"
function toMonthKey(date) {
  return typeof date === "string" && date.length >= 7 ? date.slice(0, 7) : "";
}
// YYYY-MM-DD → "YYYY"
function toYearKey(date) {
  return typeof date === "string" && date.length >= 4 ? date.slice(0, 4) : "";
}

// 期間内に絞り込む（month: "YYYY-MM" / year: "YYYY" / null = 全件）
export function filterArchives(archives, { month, year } = {}) {
  if (!Array.isArray(archives)) return [];
  return archives.filter((a) => {
    if (!a || typeof a.date !== "string") return false;
    if (month) return a.date.startsWith(month);
    if (year) return a.date.startsWith(year);
    return true;
  });
}

// 日別集計（指定月内）
//   返却: [{ date: "YYYY-MM-DD", actualPL, evAmount, sessions, hasActual }, ...]（昇順）
export function aggregateByDay(archives, month) {
  const filtered = filterArchives(archives, { month });
  const map = {};
  for (const a of filtered) {
    const d = a.date;
    if (!map[d]) map[d] = { date: d, actualPL: 0, evAmount: 0, sessions: 0, hasActual: false };
    const pl = getActualPL(a);
    if (pl != null) {
      map[d].actualPL += pl;
      map[d].hasActual = true;
    }
    map[d].evAmount += getEvAmount(a);
    map[d].sessions += 1;
  }
  return Object.values(map).sort((a, b) => a.date.localeCompare(b.date));
}

// 月別集計（指定年内）
//   返却: [{ month: "YYYY-MM", actualPL, evAmount, sessions, days, hasActual }, ...]（昇順）
export function aggregateByMonth(archives, year) {
  const filtered = filterArchives(archives, { year });
  const map = {};
  for (const a of filtered) {
    const m = toMonthKey(a.date);
    if (!m) continue;
    if (!map[m]) {
      map[m] = { month: m, actualPL: 0, evAmount: 0, sessions: 0, hasActual: false, _days: new Set() };
    }
    const pl = getActualPL(a);
    if (pl != null) {
      map[m].actualPL += pl;
      map[m].hasActual = true;
    }
    map[m].evAmount += getEvAmount(a);
    map[m].sessions += 1;
    map[m]._days.add(a.date);
  }
  return Object.values(map)
    .map(({ _days, ...rest }) => ({ ...rest, days: _days.size }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

// 年別集計（全件対象）
//   返却: [{ year: "YYYY", actualPL, evAmount, sessions, days, hasActual }, ...]（昇順）
export function aggregateByYear(archives) {
  const filtered = filterArchives(archives, {});
  const map = {};
  for (const a of filtered) {
    const y = toYearKey(a.date);
    if (!y) continue;
    if (!map[y]) {
      map[y] = { year: y, actualPL: 0, evAmount: 0, sessions: 0, hasActual: false, _days: new Set() };
    }
    const pl = getActualPL(a);
    if (pl != null) {
      map[y].actualPL += pl;
      map[y].hasActual = true;
    }
    map[y].evAmount += getEvAmount(a);
    map[y].sessions += 1;
    map[y]._days.add(a.date);
  }
  return Object.values(map)
    .map(({ _days, ...rest }) => ({ ...rest, days: _days.size }))
    .sort((a, b) => a.year.localeCompare(b.year));
}

// 期間サマリー集計
//   返却: { totalPL, totalInvest, totalRecovery, recoverRate, days, sessions, winRate, hasActual, evAmount, workHours, wage }
export function summarize(archives, { month, year } = {}) {
  const filtered = filterArchives(archives, { month, year });
  let totalPL = 0;
  let totalInvest = 0;
  let totalRecovery = 0;
  let winCount = 0;
  let realCount = 0;
  let hasActual = false;
  let evAmount = 0;
  let workMinutes = 0;
  const dateSet = new Set();

  for (const a of filtered) {
    if (!a) continue;
    if (a.date) dateSet.add(a.date);
    const inv = Number(a.investYen) || 0;
    const rec = Number(a.recoveryYen) || 0;
    if (inv > 0 || rec > 0) {
      hasActual = true;
      const pl = rec - inv;
      totalPL += pl;
      totalInvest += inv;
      totalRecovery += rec;
      realCount += 1;
      if (pl > 0) winCount += 1;
    }
    evAmount += getEvAmount(a);

    // 稼働時間: netRot / rotPerHour（時間単位）
    const netRot = Number(a?.stats?.netRot) || 0;
    const rph = Number(a?.settings?.rotPerHour) || 0;
    if (netRot > 0 && rph > 0) {
      workMinutes += (netRot / rph) * 60;
    }
  }

  const recoverRate = totalInvest > 0 ? (totalRecovery / totalInvest) * 100 : null;
  const winRate = realCount > 0 ? (winCount / realCount) * 100 : null;
  const workHours = workMinutes / 60;
  const wage = workHours > 0 && hasActual ? Math.round(totalPL / workHours) : null;

  return {
    totalPL,
    totalInvest,
    totalRecovery,
    recoverRate,
    days: dateSet.size,
    sessions: filtered.length,
    realSessions: realCount,
    winCount,
    winRate,
    hasActual,
    evAmount,
    workHours,
    wage,
  };
}

// 機種別 TOP5（指定期間内）
//   並び順は「実損益 (actualPL) の降順」
//   返却: [{ key, machineName, synthDenom, sessions, actualPL, invest, recovery, recoverRate, evAmount }, ...]
export function machineRanking(archives, { month, year, limit = 5 } = {}) {
  const filtered = filterArchives(archives, { month, year });
  const map = {};
  for (const a of filtered) {
    const denom = a?.settings?.synthDenom ?? "";
    const fallbackName = denom ? `1/${denom}` : "未設定";
    const name = a?.machineName && a.machineName !== `1/${denom}` ? a.machineName : (a?.machineName || fallbackName);
    const key = `${denom}|${name}`;
    if (!map[key]) {
      map[key] = {
        key,
        machineName: name,
        synthDenom: denom || null,
        sessions: 0,
        actualPL: 0,
        invest: 0,
        recovery: 0,
        evAmount: 0,
        hasActual: false,
      };
    }
    const row = map[key];
    row.sessions += 1;
    const inv = Number(a.investYen) || 0;
    const rec = Number(a.recoveryYen) || 0;
    if (inv > 0 || rec > 0) {
      row.hasActual = true;
      row.invest += inv;
      row.recovery += rec;
      row.actualPL += rec - inv;
    }
    row.evAmount += getEvAmount(a);
  }
  const list = Object.values(map).map((r) => ({
    ...r,
    recoverRate: r.invest > 0 ? (r.recovery / r.invest) * 100 : null,
  }));
  // 実損益が記録されている行を優先、次点で期待値で並べる
  list.sort((a, b) => {
    if (a.hasActual && !b.hasActual) return -1;
    if (!a.hasActual && b.hasActual) return 1;
    if (a.hasActual && b.hasActual) return b.actualPL - a.actualPL;
    return b.evAmount - a.evAmount;
  });
  return list.slice(0, limit);
}

// 日別収支推移グラフ用データ（指定月内、欠日は埋めずに記録のある日のみ）
//   返却: [{ label: "5/12", value: number, date: "YYYY-MM-DD" }, ...]
export function buildDailyChartPoints(archives, month) {
  const days = aggregateByDay(archives, month);
  return days
    .filter((d) => d.hasActual) // 実損益のある日のみ
    .map((d) => {
      const parts = d.date.split("-");
      const m = parts[1] ? Number(parts[1]) : 0;
      const dd = parts[2] ? Number(parts[2]) : 0;
      return { label: `${m}/${dd}`, value: Math.round(d.actualPL), date: d.date };
    });
}

// 月別収支推移グラフ用データ（指定年内、欠月は埋めずに記録のある月のみ）
export function buildMonthlyChartPoints(archives, year) {
  const months = aggregateByMonth(archives, year);
  return months
    .filter((m) => m.hasActual)
    .map((m) => {
      const mm = m.month.split("-")[1] || "";
      return { label: `${Number(mm)}月`, value: Math.round(m.actualPL), date: m.month };
    });
}

// 年別収支推移グラフ用データ
export function buildYearlyChartPoints(archives) {
  const years = aggregateByYear(archives);
  return years
    .filter((y) => y.hasActual)
    .map((y) => ({ label: `${y.year}年`, value: Math.round(y.actualPL), date: y.year }));
}

// アーカイブ内に存在する月の一覧（"YYYY-MM"、昇順）
export function listAvailableMonths(archives) {
  const set = new Set();
  for (const a of archives || []) {
    const m = toMonthKey(a?.date || "");
    if (m) set.add(m);
  }
  return Array.from(set).sort();
}

// アーカイブ内に存在する年の一覧（"YYYY"、昇順）
export function listAvailableYears(archives) {
  const set = new Set();
  for (const a of archives || []) {
    const y = toYearKey(a?.date || "");
    if (y) set.add(y);
  }
  return Array.from(set).sort();
}
