// 分析ページ刷新（金融端末風）用の表示専用セレクタ（純粋関数・読み取りのみ）
//
// 重要:
//   - logic.js / 既存 analysisSelectors.js / analyzerSelectors.js の関数は一切変更しない。
//   - ここで行うのは「既存の確定済み数値の再集計・正規化・表示用整形」のみ。
//     期待値(EV)や実損益などの“数式そのもの”は既存セレクタの値をそのまま使う。
//   - 評価グレード／AIコメントは UI 表示の「目安」であり、金銭計算には影響しない。
//
// 参照する既存セレクタ:
//   - filterArchives, getEvAmount, getActualPL, summarize, aggregateByDay/Month/Year
//   - getSpinRate, getBorderDiff（回転率/ボーダー差。Tabs.jsx と同一フォールバック）

import {
  filterArchives,
  getEvAmount,
  getActualPL,
  aggregateByDay,
  aggregateByMonth,
  aggregateByYear,
} from "./analysisSelectors.js";
import { getSpinRate, getBorderDiff } from "./analyzerSelectors.js";

const isNum = (v) => typeof v === "number" && isFinite(v);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// 1セッションの稼働時間（時間）。summarize と同一式（netRot / rotPerHour）。
function sessionHours(a) {
  const netRot = Number(a?.stats?.netRot) || 0;
  const rph = Number(a?.settings?.rotPerHour) || 0;
  if (netRot > 0 && rph > 0) return (netRot / rph);
  return 0;
}

// ──────────────────────────────────────────────────────────────────────────────
// 平均回転率（回/K）。回転率が記録されたセッションのみで平均。未記録なら null。
// ──────────────────────────────────────────────────────────────────────────────
export function avgSpinRate(archives, opts = {}) {
  const filtered = filterArchives(archives, opts);
  let sum = 0;
  let n = 0;
  for (const a of filtered) {
    const r = getSpinRate(a);
    if (r != null) { sum += r; n += 1; }
  }
  return n > 0 ? sum / n : null;
}

// 平均ボーダー差（回/K）。記録されたセッションのみ。未記録なら null。
export function avgBorderDiff(archives, opts = {}) {
  const filtered = filterArchives(archives, opts);
  let sum = 0;
  let n = 0;
  for (const a of filtered) {
    const v = getBorderDiff(a);
    if (v != null) { sum += v; n += 1; }
  }
  return n > 0 ? sum / n : null;
}

// プラス率（ボーダー差 >= 0 のセッション割合 %）。記録なしなら null。
export function plusRateBorder(archives, opts = {}) {
  const filtered = filterArchives(archives, opts);
  let plus = 0;
  let n = 0;
  for (const a of filtered) {
    const v = getBorderDiff(a);
    if (v != null) { n += 1; if (v >= 0) plus += 1; }
  }
  return n > 0 ? (plus / n) * 100 : null;
}

// ──────────────────────────────────────────────────────────────────────────────
// 累積収支推移（実収支・期待値・差異の3本）
//   period: "month"（日別）/ "year"（月別）/ "all"（年別）
//   返却: { points: [{ label, actual, ev, diff }], hasActual }
//     - actual: 実収支の累積（実損益記録のあるセッションのみ加算。無い日は据え置き）
//     - ev: 期待値の累積
//     - diff: actual - ev
// ──────────────────────────────────────────────────────────────────────────────
export function buildCumulativeTrend(archives, period, viewMonth, viewYear, extraFilters = {}) {
  let rows;
  if (period === "all") {
    rows = aggregateByYear(archives, extraFilters).map((r) => ({
      label: `${r.year}年`, actualPL: r.actualPL, evAmount: r.evAmount, hasActual: r.hasActual,
    }));
  } else if (period === "year") {
    rows = aggregateByMonth(archives, viewYear, extraFilters).map((r) => ({
      label: `${Number(r.month.split("-")[1])}月`, actualPL: r.actualPL, evAmount: r.evAmount, hasActual: r.hasActual,
    }));
  } else {
    rows = aggregateByDay(archives, viewMonth, extraFilters).map((r) => {
      const p = r.date.split("-");
      return { label: `${Number(p[1])}/${Number(p[2])}`, actualPL: r.actualPL, evAmount: r.evAmount, hasActual: r.hasActual };
    });
  }
  let cumA = 0;
  let cumE = 0;
  let anyActual = false;
  const points = rows.map((r) => {
    cumE += r.evAmount || 0;
    if (r.hasActual) { cumA += r.actualPL || 0; anyActual = true; }
    return {
      label: r.label,
      actual: Math.round(cumA),
      ev: Math.round(cumE),
      diff: Math.round(cumA - cumE),
      hasActual: r.hasActual,
    };
  });
  return { points, hasActual: anyActual };
}

// セッション単位の累積推移（分析+ の全期間ビュー用。日付→時刻→idで時系列ソート）
//   返却: { points: [{ label, actual, ev, diff }], hasActual }
export function buildSessionCumulative(archives, opts = {}) {
  const filtered = filterArchives(archives, opts).slice().sort((a, b) => {
    const da = String(a?.date || "");
    const db = String(b?.date || "");
    if (da !== db) return da.localeCompare(db);
    const ta = String(a?.time || "");
    const tb = String(b?.time || "");
    if (ta !== tb) return ta.localeCompare(tb);
    return (Number(a?.id) || 0) - (Number(b?.id) || 0);
  });
  let cumA = 0;
  let cumE = 0;
  let anyActual = false;
  const points = filtered.map((a) => {
    cumE += getEvAmount(a);
    const pl = getActualPL(a);
    if (pl != null) { cumA += pl; anyActual = true; }
    const p = String(a?.date || "").split("-");
    const label = p.length >= 3 ? `${Number(p[1])}/${Number(p[2])}` : "";
    return { label, actual: Math.round(cumA), ev: Math.round(cumE), diff: Math.round(cumA - cumE) };
  });
  return { points, hasActual: anyActual };
}

// ──────────────────────────────────────────────────────────────────────────────
// 期待値分析サマリー（EV/実収支/差/収束率/日あたり/時間あたり）
// ──────────────────────────────────────────────────────────────────────────────
export function buildEvAnalysis(archives, opts = {}) {
  const filtered = filterArchives(archives, opts);
  let ev = 0;
  let actual = 0;
  let hasActual = false;
  let hours = 0;
  const dateSet = new Set();
  for (const a of filtered) {
    ev += getEvAmount(a);
    const pl = getActualPL(a);
    if (pl != null) { actual += pl; hasActual = true; }
    hours += sessionHours(a);
    if (a?.date) dateSet.add(a.date);
  }
  const days = dateSet.size;
  const diff = actual - ev;
  // 収束率 = 実収支 / 期待値 × 100（期待値が正のときのみ意味を持つ）
  const convergence = ev > 0 && hasActual ? (actual / ev) * 100 : null;
  return {
    ev,
    actual,
    diff,
    hasActual,
    convergence,
    days,
    hours,
    evPerDay: days > 0 ? ev / days : null,
    actualPerDay: days > 0 && hasActual ? actual / days : null,
    evPerHour: hours > 0 ? ev / hours : null,
    actualPerHour: hours > 0 && hasActual ? actual / hours : null,
    sessions: filtered.length,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// 店舗分析（ランキング）
//   返却: [{ key, storeName, sessions, days, spinRate, evAmount, actualPL, hasActual, strength }]
//     strength: 0〜1 の正規化スコア（ヒートマップ用。EV/h を基準に相対評価）
// ──────────────────────────────────────────────────────────────────────────────
export function storeAnalysis(archives, opts = {}) {
  const filtered = filterArchives(archives, opts);
  const map = {};
  for (const a of filtered) {
    const name = String(a?.storeName || "").trim() || "未設定";
    if (!map[name]) {
      map[name] = {
        key: name, storeName: name, sessions: 0, _days: new Set(),
        _spinSum: 0, _spinN: 0, evAmount: 0, actualPL: 0, hasActual: false, _hours: 0,
      };
    }
    const row = map[name];
    row.sessions += 1;
    if (a?.date) row._days.add(a.date);
    const sr = getSpinRate(a);
    if (sr != null) { row._spinSum += sr; row._spinN += 1; }
    row.evAmount += getEvAmount(a);
    row._hours += sessionHours(a);
    const pl = getActualPL(a);
    if (pl != null) { row.actualPL += pl; row.hasActual = true; }
  }
  const list = Object.values(map).map((r) => ({
    key: r.key,
    storeName: r.storeName,
    sessions: r.sessions,
    days: r._days.size,
    spinRate: r._spinN > 0 ? r._spinSum / r._spinN : null,
    evAmount: r.evAmount,
    actualPL: r.actualPL,
    hasActual: r.hasActual,
    evPerHour: r._hours > 0 ? r.evAmount / r._hours : null,
  }));
  // 並び: 実損益あり優先 → 実損益降順、無ければ EV 降順
  list.sort((a, b) => {
    if (a.hasActual && !b.hasActual) return -1;
    if (!a.hasActual && b.hasActual) return 1;
    if (a.hasActual && b.hasActual) return b.actualPL - a.actualPL;
    return b.evAmount - a.evAmount;
  });
  // ヒートマップ用 strength（EV/h を 0〜1 に相対正規化。基準が無ければ EV 合計）
  const metric = (r) => (r.evPerHour != null ? r.evPerHour : r.evAmount);
  const vals = list.map(metric).filter(isNum);
  const lo = vals.length ? Math.min(...vals) : 0;
  const hi = vals.length ? Math.max(...vals) : 1;
  const span = hi - lo || 1;
  for (const r of list) {
    r.strength = clamp((metric(r) - lo) / span, 0, 1);
  }
  return list;
}

// ──────────────────────────────────────────────────────────────────────────────
// 機種分析（ランキング・並べ替え対応）
//   sortKey: "actual" | "ev" | "spin" | "hours"
//   返却: [{ key, machineName, sessions, hours, spinRate, evAmount, actualPL, winRate, hasActual }]
// ──────────────────────────────────────────────────────────────────────────────
export function machineAnalysis(archives, opts = {}) {
  const { sortKey = "actual", ...filters } = opts;
  const filtered = filterArchives(archives, filters);
  const map = {};
  for (const a of filtered) {
    const denom = a?.settings?.synthDenom ?? "";
    const fallbackName = denom ? `1/${denom}` : "未設定";
    const name = a?.machineName && a.machineName !== `1/${denom}` ? a.machineName : (a?.machineName || fallbackName);
    const key = `${denom}|${name}`;
    if (!map[key]) {
      map[key] = {
        key, machineName: name, sessions: 0, _hours: 0,
        _spinSum: 0, _spinN: 0, evAmount: 0, actualPL: 0,
        hasActual: false, _win: 0, _real: 0,
      };
    }
    const row = map[key];
    row.sessions += 1;
    row._hours += sessionHours(a);
    const sr = getSpinRate(a);
    if (sr != null) { row._spinSum += sr; row._spinN += 1; }
    row.evAmount += getEvAmount(a);
    const pl = getActualPL(a);
    if (pl != null) {
      row.actualPL += pl;
      row.hasActual = true;
      row._real += 1;
      if (pl > 0) row._win += 1;
    }
  }
  const list = Object.values(map).map((r) => ({
    key: r.key,
    machineName: r.machineName,
    sessions: r.sessions,
    hours: r._hours,
    spinRate: r._spinN > 0 ? r._spinSum / r._spinN : null,
    evAmount: r.evAmount,
    actualPL: r.actualPL,
    hasActual: r.hasActual,
    winRate: r._real > 0 ? (r._win / r._real) * 100 : null,
  }));
  const cmp = {
    actual: (a, b) => {
      if (a.hasActual && !b.hasActual) return -1;
      if (!a.hasActual && b.hasActual) return 1;
      if (a.hasActual && b.hasActual) return b.actualPL - a.actualPL;
      return b.evAmount - a.evAmount;
    },
    ev: (a, b) => b.evAmount - a.evAmount,
    spin: (a, b) => (b.spinRate ?? -Infinity) - (a.spinRate ?? -Infinity),
    hours: (a, b) => b.hours - a.hours,
  };
  list.sort(cmp[sortKey] || cmp.actual);
  return list;
}

// ──────────────────────────────────────────────────────────────────────────────
// 評価グレード（表示用の「目安」。金銭計算には一切影響しない）
//   各軸を 0〜100 のスコアに正規化し、A+〜D の文字グレードに変換する。
//   - 期待値    : 期待値時給（EV/h）。無ければ EV/日 で代替
//   - 回転率    : 平均ボーダー差（回/K）
//   - 店舗選択  : ボーダー差プラス率（良台/良店を選べているか）
//   - 収支      : 収束率（実収支 / 期待値）。実損益が無ければ「—」
//   - 総合評価  : 上記の平均
// ──────────────────────────────────────────────────────────────────────────────
function scoreToGrade(score) {
  if (score == null || !isFinite(score)) return "—";
  if (score >= 93) return "A+";
  if (score >= 87) return "A";
  if (score >= 82) return "A-";
  if (score >= 76) return "B+";
  if (score >= 70) return "B";
  if (score >= 64) return "B-";
  if (score >= 57) return "C+";
  if (score >= 50) return "C";
  if (score >= 40) return "C-";
  return "D";
}

export function buildGrades(archives, opts = {}) {
  const ev = buildEvAnalysis(archives, opts);
  const bDiff = avgBorderDiff(archives, opts);
  const plusRate = plusRateBorder(archives, opts);

  // 期待値スコア: EV/h 2000円で満点付近、0で50、マイナスで低下
  const evBase = ev.evPerHour != null ? ev.evPerHour : (ev.evPerDay != null ? ev.evPerDay / 8 : null);
  const evScore = evBase != null ? clamp(50 + evBase / 40, 0, 100) : null;

  // 回転率スコア: ボーダー差 +4 で満点付近、0で58、マイナスで低下
  const spinScore = bDiff != null ? clamp(58 + bDiff * 10.5, 0, 100) : null;

  // 店舗選択スコア: プラス率そのもの（0〜100）
  const storeScore = plusRate != null ? clamp(plusRate, 0, 100) : null;

  // 収支スコア: 収束率 100% で 90、0% で 40、それ以上は加点
  let plScore = null;
  if (ev.convergence != null) {
    plScore = clamp(40 + ev.convergence * 0.5, 0, 100);
  } else if (ev.hasActual) {
    plScore = ev.actual > 0 ? 80 : ev.actual < 0 ? 45 : 60;
  }

  const parts = [evScore, spinScore, storeScore, plScore].filter(isNum);
  const totalScore = parts.length ? parts.reduce((s, v) => s + v, 0) / parts.length : null;

  return {
    ev: scoreToGrade(evScore),
    spin: scoreToGrade(spinScore),
    store: scoreToGrade(storeScore),
    pl: scoreToGrade(plScore),
    total: scoreToGrade(totalScore),
    _scores: { evScore, spinScore, storeScore, plScore, totalScore },
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// AIコメント（自動文章生成）。期待値の積み上げ・収束・台選びの3観点で短評。
//   文章は固定ルールベース（外部APIは使わない）。
// ──────────────────────────────────────────────────────────────────────────────
export function buildAiComment(archives, opts = {}) {
  const ev = buildEvAnalysis(archives, opts);
  const bDiff = avgBorderDiff(archives, opts);
  const lines = [];

  if (ev.sessions === 0) {
    return ["この期間の記録がありません。"];
  }

  // 1. 期待値の積み上げ
  if (ev.evPerHour != null && ev.evPerHour >= 1500) {
    lines.push("期待値は十分に積めています。");
  } else if (ev.evPerHour != null && ev.evPerHour >= 600) {
    lines.push("期待値はおおむね確保できています。");
  } else if (ev.ev > 0) {
    lines.push("期待値の積み上げがやや不足しています。");
  } else {
    lines.push("期待値がマイナス域です。台選びの見直しが必要です。");
  }

  // 2. 収支の収束
  if (ev.hasActual && ev.convergence != null) {
    if (ev.convergence >= 90) {
      lines.push("収支は期待値に沿って推移しています。");
    } else if (ev.convergence >= 40) {
      lines.push("収支は下振れ傾向です。試行を重ねれば収束が見込めます。");
    } else if (ev.convergence >= 0) {
      lines.push("収支は大きく下振れしています。短期の分散の範囲内かを確認してください。");
    } else {
      lines.push("期待値プラスに対し収支はマイナスです。下振れが続いています。");
    }
  } else if (!ev.hasActual) {
    lines.push("実収支が未記録です。投資・回収を入力すると収束率を判定できます。");
  }

  // 3. 立ち回りの助言
  if (bDiff != null) {
    if (bDiff >= 1.5) {
      lines.push("回転率は良好です。現時点で立ち回りの変更は不要です。");
    } else if (bDiff >= 0) {
      lines.push("回転率はボーダー前後です。より回る台の選別を意識しましょう。");
    } else {
      lines.push("回転率がボーダーを下回っています。台選びの基準を引き上げましょう。");
    }
  }

  return lines;
}
