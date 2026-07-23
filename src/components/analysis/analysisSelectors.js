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
// 期待値(evAmount) = 通常期待値（effectiveWorkAmount、旧データは workAmount）+ 有効な遊タイム判断EV

const hasActualMoney = (a) =>
  (Number(a?.investYen) || 0) > 0 || (Number(a?.recoveryYen) || 0) > 0;

export function getArchiveGameType(a) {
  return a?.gameType === "slot" ? "slot" : "pachinko";
}

export function getActualPL(a) {
  if (!hasActualMoney(a)) return null;
  return (Number(a.recoveryYen) || 0) - (Number(a.investYen) || 0);
}

export function getNormalEvAmount(a) {
  // スロットは現状、パチンコ用の仕事量・期待値を計算しない。
  // 種別変更前の stats が古い保存データに残っていても集計へ混ぜない。
  if (getArchiveGameType(a) === "slot") return 0;
  const ew = a?.stats?.effectiveWorkAmount;
  if (typeof ew === "number" && isFinite(ew)) return ew;
  const w = a?.stats?.workAmount;
  return typeof w === "number" && isFinite(w) ? w : 0;
}

export function getYutimeEvAmount(a) {
  if (getArchiveGameType(a) === "slot") return 0;
  const result = a?.yutimeDecision?.result;
  if (!result?.valid) return 0;
  const value = result.selectedEV;
  return typeof value === "number" && isFinite(value) ? value : 0;
}

export function getEvBreakdown(a) {
  const normal = getNormalEvAmount(a);
  const yutime = getYutimeEvAmount(a);
  return { normal, yutime, total: normal + yutime };
}

export function getEvAmount(a) {
  return getEvBreakdown(a).total;
}

// 稼働時間（分）: 実践記録（回転数）があれば netRot ÷ rotPerHour × 60 を優先。
//   回転数データが無い記録（手動追加など）は手入力の遊技時間 playMinutes をフォールバックに使う。
//   これにより時間・時給の集計が手動記録でも成立する（既存の実践記録の値は不変）。
export function archiveWorkMinutes(a) {
  const manual = Number(a?.playMinutes) || 0;
  // スロットの総ゲーム数はパチンコの netRot / rotPerHour と計算単位が異なるため、
  // 保存された遊技時間だけを使用する。古いパチンコ回転データの混入も防げる。
  if (getArchiveGameType(a) === "slot") return manual > 0 ? manual : 0;
  const netRot = Number(a?.stats?.netRot) || 0;
  const rph = Number(a?.settings?.rotPerHour) || 0;
  if (netRot > 0 && rph > 0) return (netRot / rph) * 60;
  return manual > 0 ? manual : 0;
}

// 貯玉消費分の収支（円）
//   archive.chodamaYen は確定時に「消費貯玉数 × 交換レート」で円換算済み（App.jsx / Tabs.jsx）。
//   貯玉を消費すると資産（貯玉）が目減りするため、収支上は現金投資と同じ「コスト」= マイナスで扱う。
//   （既存の大当たり履歴表示でも「合計投資 = investYen + chodamaYen」として加算済みの値）
//   貯玉を消費していない archive は 0 を返す（従来計算と完全に同じ）。
export function getChodamaPL(a) {
  // 貯玉はパチンコ専用。種別変更前の値が残る旧データでもスロット収支から除外する。
  if (getArchiveGameType(a) === "slot") return 0;
  const yen = Number(a?.chodamaYen) || 0;
  if (yen <= 0) return 0;
  return -yen;
}

// YYYY-MM-DD → "YYYY-MM"
function toMonthKey(date) {
  return typeof date === "string" && date.length >= 7 ? date.slice(0, 7) : "";
}
// YYYY-MM-DD → "YYYY"
function toYearKey(date) {
  return typeof date === "string" && date.length >= 4 ? date.slice(0, 4) : "";
}
// YYYY-MM-DD → 曜日（0=日, 1=月, ..., 6=土）
//   無効な日付なら null
function toWeekday(date) {
  if (typeof date !== "string" || date.length < 10) return null;
  const y = Number(date.slice(0, 4));
  const m = Number(date.slice(5, 7));
  const d = Number(date.slice(8, 10));
  if (!isFinite(y) || !isFinite(m) || !isFinite(d)) return null;
  const dt = new Date(y, m - 1, d);
  if (isNaN(dt.getTime())) return null;
  return dt.getDay();
}

// 期間／属性で絞り込む（AND 条件）
//   month     : "YYYY-MM"      （指定月の archive のみ）
//   year      : "YYYY"         （指定年の archive のみ）
//   storeName : string         （完全一致、"" / 未指定 = 全店舗）
//   machineName: string        （完全一致、"" / 未指定 = 全機種）
//   dateStart : "YYYY-MM-DD"   （開始日含む、"" / 未指定 = 制限なし）
//   dateEnd   : "YYYY-MM-DD"   （終了日含む、"" / 未指定 = 制限なし）
//   weekdays  : number[]       （0=日..6=土、空配列 / 未指定 = 全曜日）
//   gameType  : "pachinko" | "slot" | "all" （空文字 / 未指定も全種別）
export function filterArchives(archives, opts = {}) {
  if (!Array.isArray(archives)) return [];
  const { month, year, storeName, machineName, dateStart, dateEnd, weekdays, gameType } = opts;
  const selectedGameType = gameType === "pachinko" || gameType === "slot" ? gameType : "";
  const wdSet = Array.isArray(weekdays) && weekdays.length > 0 ? new Set(weekdays) : null;
  return archives.filter((a) => {
    if (!a || typeof a.date !== "string") return false;
    if (month && !a.date.startsWith(month)) return false;
    if (year && !a.date.startsWith(year)) return false;
    if (dateStart && a.date < dateStart) return false;
    if (dateEnd && a.date > dateEnd) return false;
    if (storeName && String(a.storeName || "") !== storeName) return false;
    if (machineName && String(a.machineName || "") !== machineName) return false;
    if (selectedGameType && getArchiveGameType(a) !== selectedGameType) return false;
    if (wdSet) {
      const wd = toWeekday(a.date);
      if (wd == null || !wdSet.has(wd)) return false;
    }
    return true;
  });
}

// 日別集計（指定月内）
//   返却: [{ date: "YYYY-MM-DD", actualPL, realPL, evAmount, sessions, hasActual }, ...]（昇順）
export function aggregateByDay(archives, month, extraFilters = {}) {
  const filtered = filterArchives(archives, { ...extraFilters, month });
  const map = {};
  for (const a of filtered) {
    const d = a.date;
    if (!map[d]) map[d] = { date: d, actualPL: 0, realPL: 0, evAmount: 0, sessions: 0, hasActual: false, workMinutes: 0 };
    const pl = getActualPL(a);
    if (pl != null) {
      map[d].actualPL += pl;
      map[d].realPL += pl;
      map[d].hasActual = true;
    }
    const chodamaPL = getChodamaPL(a);
    map[d].realPL += chodamaPL;
    if (chodamaPL !== 0) map[d].hasActual = true;
    map[d].evAmount += getEvAmount(a);
    map[d].workMinutes += archiveWorkMinutes(a);
    map[d].sessions += 1;
  }
  return Object.values(map).sort((a, b) => a.date.localeCompare(b.date));
}

// 月別集計（指定年内）
//   返却: [{ month: "YYYY-MM", actualPL, realPL, evAmount, sessions, days, hasActual }, ...]（昇順）
export function aggregateByMonth(archives, year, extraFilters = {}) {
  const filtered = filterArchives(archives, { ...extraFilters, year });
  const map = {};
  for (const a of filtered) {
    const m = toMonthKey(a.date);
    if (!m) continue;
    if (!map[m]) {
      map[m] = { month: m, actualPL: 0, realPL: 0, evAmount: 0, sessions: 0, hasActual: false, _days: new Set() };
    }
    const pl = getActualPL(a);
    if (pl != null) {
      map[m].actualPL += pl;
      map[m].realPL += pl;
      map[m].hasActual = true;
    }
    const chodamaPL = getChodamaPL(a);
    map[m].realPL += chodamaPL;
    if (chodamaPL !== 0) map[m].hasActual = true;
    map[m].evAmount += getEvAmount(a);
    map[m].sessions += 1;
    map[m]._days.add(a.date);
  }
  return Object.values(map)
    .map(({ _days, ...rest }) => ({ ...rest, days: _days.size }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

// 年別集計（全件対象）
//   返却: [{ year: "YYYY", actualPL, realPL, evAmount, sessions, days, hasActual }, ...]（昇順）
export function aggregateByYear(archives, extraFilters = {}) {
  const filtered = filterArchives(archives, extraFilters);
  const map = {};
  for (const a of filtered) {
    const y = toYearKey(a.date);
    if (!y) continue;
    if (!map[y]) {
      map[y] = { year: y, actualPL: 0, realPL: 0, evAmount: 0, sessions: 0, hasActual: false, _days: new Set() };
    }
    const pl = getActualPL(a);
    if (pl != null) {
      map[y].actualPL += pl;
      map[y].realPL += pl;
      map[y].hasActual = true;
    }
    const chodamaPL = getChodamaPL(a);
    map[y].realPL += chodamaPL;
    if (chodamaPL !== 0) map[y].hasActual = true;
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
export function summarize(archives, opts = {}) {
  const filtered = filterArchives(archives, opts);
  let totalPL = 0;
  let totalInvest = 0;
  let totalRecovery = 0;
  let winCount = 0;
  let realCount = 0;
  let hasActual = false;
  let evAmount = 0;
  let workMinutes = 0;
  let totalChodamaPL = 0; // 貯玉消費分の収支（コスト = マイナス）
  let hasChodama = false; // 期間内に貯玉消費があったか
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
    // 貯玉消費分（現金収支とは別経路で集計）
    const chodamaPL = getChodamaPL(a);
    if (chodamaPL !== 0) {
      totalChodamaPL += chodamaPL;
      hasChodama = true;
    }
    evAmount += getEvAmount(a);

    // 稼働時間: 実践記録は netRot / rotPerHour、手動記録は遊技時間（playMinutes）
    workMinutes += archiveWorkMinutes(a);
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
    // 貯玉消費分の収支と、現金収支との合算（実質総収支）
    totalChodamaPL,
    hasChodama,
    totalRealPL: totalPL + totalChodamaPL,
  };
}

// 機種別 TOP5（指定期間内）
//   並び順は「実損益 (actualPL) の降順」
//   返却: [{ key, machineName, synthDenom, sessions, actualPL, invest, recovery, recoverRate, evAmount }, ...]
export function machineRanking(archives, opts = {}) {
  const { limit = 5, ...filters } = opts;
  const filtered = filterArchives(archives, filters);
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
export function buildDailyChartPoints(archives, month, extraFilters = {}) {
  const days = aggregateByDay(archives, month, extraFilters);
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
export function buildMonthlyChartPoints(archives, year, extraFilters = {}) {
  const months = aggregateByMonth(archives, year, extraFilters);
  return months
    .filter((m) => m.hasActual)
    .map((m) => {
      const mm = m.month.split("-")[1] || "";
      return { label: `${Number(mm)}月`, value: Math.round(m.actualPL), date: m.month };
    });
}

// 年別収支推移グラフ用データ
export function buildYearlyChartPoints(archives, extraFilters = {}) {
  const years = aggregateByYear(archives, extraFilters);
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

// アーカイブ内に存在する店舗名の一覧（空文字除外、五十音昇順）
export function listAvailableStores(archives) {
  const set = new Set();
  for (const a of archives || []) {
    const s = String(a?.storeName || "").trim();
    if (s) set.add(s);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, "ja"));
}

// アーカイブ内に存在する機種名の一覧（空文字除外、五十音昇順）
export function listAvailableMachines(archives) {
  const set = new Set();
  for (const a of archives || []) {
    const m = String(a?.machineName || "").trim();
    if (m) set.add(m);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, "ja"));
}

// 現在のフィルタが「有効（1つでも絞り込みが入っている）」かを判定
//   AnalysisDashboard でフィルタチップやリセットボタンの活性判定に使用
export function isFilterActive(filters = {}) {
  if (!filters || typeof filters !== "object") return false;
  if (filters.storeName) return true;
  if (filters.machineName) return true;
  if (filters.dateStart) return true;
  if (filters.dateEnd) return true;
  if (Array.isArray(filters.weekdays) && filters.weekdays.length > 0) return true;
  return false;
}

// ──────────────────────────────────────────────────────────────────────────────
// 機種別ハマり回転数統計
// ──────────────────────────────────────────────────────────────────────────────

// アーカイブの rotRows から最後のジャックポット終了後の回転数を取得
// （currentHamari の計算式と同一: 最後の "start" 行の cumRot から最終 cumRot までの差分）
function _getPostLastJPRot(archive) {
  const rows = archive.rotRows || [];
  if (rows.length === 0) return 0;
  let finalCumRot = 0;
  for (let i = rows.length - 1; i >= 0; i--) {
    if (rows[i].cumRot != null) { finalCumRot = Number(rows[i].cumRot) || 0; break; }
  }
  let lastStartCumRot = null;
  for (let i = rows.length - 1; i >= 0; i--) {
    if (rows[i].type === "start") { lastStartCumRot = Number(rows[i].cumRot) || 0; break; }
  }
  if (lastStartCumRot === null) return 0;
  return Math.max(0, finalCumRot - lastStartCumRot);
}

// 最後の大当たりからの通算ハマり回転数（セッション横断）
function _computeSinceLastJP(sortedArchives) {
  // 完了チェーンを持つ最後のアーカイブを探す
  let lastJPIdx = -1;
  for (let i = sortedArchives.length - 1; i >= 0; i--) {
    if ((sortedArchives[i].jpLog || []).some((c) => c.completed)) { lastJPIdx = i; break; }
  }
  if (lastJPIdx < 0) {
    // 大当たり記録なし: 全セッションの total rotations を合算
    return sortedArchives.reduce((s, a) => s + (Number(a.stats?.netRot) || 0), 0);
  }
  // 最後の大当たりセッションのジャックポット後の回転数
  let total = _getPostLastJPRot(sortedArchives[lastJPIdx]);
  // 以降のセッション（大当たりなし）の全回転数を加算
  for (let i = lastJPIdx + 1; i < sortedArchives.length; i++) {
    total += Number(sortedArchives[i].stats?.netRot) || 0;
  }
  return total;
}

// 機種別ハマり回転数一覧
//   opts: filterArchives と同じ絞り込みオプション
//   返却: [{ key, machineName, sessions, recentCount, totalHamariRot, recentHamariRot,
//            sinceLastJPRot, totalJPCount, hasData }, ...] (sinceLastJPRot 降順)
export function getMachineHamariList(archives, opts = {}) {
  const filtered = filterArchives(archives, opts);
  if (!filtered.length) return [];

  const machineMap = {};
  for (const a of filtered) {
    const denom = a?.settings?.synthDenom ?? "";
    const fallbackName = denom ? `1/${denom}` : "未設定";
    const name =
      a?.machineName && a.machineName !== `1/${denom}`
        ? a.machineName
        : a?.machineName || fallbackName;
    const key = `${denom}|${name}`;
    if (!machineMap[key]) machineMap[key] = { key, machineName: name, list: [] };
    machineMap[key].list.push(a);
  }

  const RECENT_N = 5;
  return Object.values(machineMap)
    .map(({ key, machineName, list }) => {
      const sorted = [...list].sort((a, b) => (a.date || "").localeCompare(b.date || ""));
      let totalHamariRot = 0;
      let totalJPCount = 0;
      for (const a of sorted) {
        const chains = (a.jpLog || []).filter((c) => c.completed);
        totalJPCount += chains.length;
        totalHamariRot += chains.reduce((s, c) => s + (Number(c.hitThisRot) || 0), 0);
      }
      const recent = sorted.slice(-RECENT_N);
      const recentHamariRot = recent.reduce((s, a) => {
        const chains = (a.jpLog || []).filter((c) => c.completed);
        return s + chains.reduce((cs, c) => cs + (Number(c.hitThisRot) || 0), 0);
      }, 0);
      const sinceLastJPRot = _computeSinceLastJP(sorted);
      return {
        key,
        machineName,
        sessions: sorted.length,
        recentCount: recent.length,
        totalHamariRot,
        recentHamariRot,
        sinceLastJPRot,
        totalJPCount,
        hasData: totalJPCount > 0,
      };
    })
    .sort((a, b) => b.sinceLastJPRot - a.sinceLastJPRot);
}
