// パチ analyzer（詳細分析）用の集計セレクタ（純粋関数）
//
// 既存 analysisSelectors.js の関数は一切変更せず、読み取り専用の追加集計のみを行う。
// 入力 archives の構造・フィールドは analysisSelectors.js の冒頭コメントを参照。
//
// 本ファイルで参照するアーカイブのフィールド（すべて読み取りのみ）:
//   - date       : "YYYY-MM-DD"（時系列・曜日の算出元）
//   - time        : "HH:MM"（同日内のセッション並び順に使用、無ければ id で代替）
//   - id          : number（time が無い旧アーカイブの並び順フォールバック）
//   - storeName   : 店舗名
//   - machineName : 機種名
//   - stats       : logic.js の calc 結果から数値/文字列フィールドのみ保存したもの
//       回転率/K   = stats.start1K（投入玉ベースの物理的な回転率）
//       ボーダー差 = stats.bDiff（物理回転率 − 理論ボーダー）
//     持ち玉の交換価値で補正した値は期待値にのみ使い、台性能の推移には混ぜない。
//   - 期待値(EV)  = stats.effectiveWorkAmount ?? stats.workAmount（getEvAmount と同方針）
//   - investYen / recoveryYen : 実損益（recoveryYen - investYen、両方ゼロなら実損益なし）
//
// データ不足判定の閾値:
//   - 回転率推移グラフ : 折れ線描画には 2 点以上（既存チャートと同基準）。1 点はテキスト表示
//   - ボーダー差ヒスト : 有効サンプル 3 件未満は「データ不足」（分布として意味を成さない最小数）
//   - 店舗別/曜日別     : 集計表は 1 件から表示。0 件は「データ不足」

import { filterArchives, getEvAmount } from "./analysisSelectors.js";

// 数値として有効か（NaN / Infinity を除外）
function isNum(v) {
  return typeof v === "number" && isFinite(v);
}

// 回転率/K の取得。生の物理回転率を優先する。
//   有効な数値が一つも無ければ null（=未記録）を返す
export function getSpinRate(a) {
  const s = a?.stats || {};
  if (isNum(s.start1K)) return s.start1K;
  if (isNum(s.effectiveStart1K)) return s.effectiveStart1K;
  if (isNum(s.start1KCorrected)) return s.start1KCorrected;
  return null;
}

// ボーダー差（回転率 − ボーダー）の取得（既存 Tabs.jsx:457 と同一のフォールバック順）
//   有効な数値が一つも無ければ null を返す
export function getBorderDiff(a) {
  const s = a?.stats || {};
  if (isNum(s.bDiff)) return s.bDiff;
  if (isNum(s.effectiveBDiff)) return s.effectiveBDiff;
  if (isNum(s.bDiffCorrected)) return s.bDiffCorrected;
  return null;
}

// 同一機種内のセッションを時系列（古い順）に並べるための比較キー
//   日付 → 時刻（HH:MM）→ id の順で安定ソート
function chronoKey(a) {
  const date = typeof a?.date === "string" ? a.date : "";
  const time = typeof a?.time === "string" ? a.time : "";
  const id = isNum(a?.id) ? a.id : 0;
  return { date, time, id };
}
function compareChrono(a, b) {
  const ka = chronoKey(a);
  const kb = chronoKey(b);
  if (ka.date !== kb.date) return ka.date.localeCompare(kb.date);
  if (ka.time !== kb.time) return ka.time.localeCompare(kb.time);
  return ka.id - kb.id;
}

// ──────────────────────────────────────────────────────────────────────────────
// 1. 機種ごとの回転率/K 推移（時系列）
// ──────────────────────────────────────────────────────────────────────────────
//   指定機種（machineName 完全一致）の各セッションを時系列で並べ、回転率/K を点列にする。
//   回転率が未記録（getSpinRate=null）のセッションは点に含めない。
//   返却: [{ label: "5/12", value: number(回転率/K), bDiff: number|null, date, time }, ...]
export function buildSpinRateTrend(archives, machineName, extraFilters = {}) {
  if (!machineName) return [];
  const filtered = filterArchives(archives, { ...extraFilters, machineName });
  return filtered
    .slice()
    .sort(compareChrono)
    .map((a) => {
      const rate = getSpinRate(a);
      if (rate == null) return null;
      const parts = (a.date || "").split("-");
      const m = parts[1] ? Number(parts[1]) : 0;
      const d = parts[2] ? Number(parts[2]) : 0;
      return {
        label: `${m}/${d}`,
        value: rate,
        bDiff: getBorderDiff(a),
        date: a.date || "",
        time: typeof a.time === "string" ? a.time : "",
      };
    })
    .filter(Boolean);
}

// ──────────────────────────────────────────────────────────────────────────────
// 2. ボーダー差の分布ヒストグラム
// ──────────────────────────────────────────────────────────────────────────────
//   各セッションの「回転率 − ボーダー」を一定幅のビンに集計する。
//   binSize: ビン幅（回/K、既定 1.0）。
//   返却: {
//     bins: [{ lo, hi, mid, count, label }],  // lo<=x<hi。負・正で色分けできるよう mid を保持
//     total,         // 有効サンプル数
//     min, max, avg, // 有効サンプルの統計
//     plusRate,      // x>=0 の割合（%）。total=0 なら null
//     enough,        // データ充足フラグ（total >= MIN_SAMPLE）
//   }
export const HISTOGRAM_MIN_SAMPLE = 3;

export function buildBorderDiffHistogram(archives, opts = {}) {
  const { binSize = 1, ...filters } = opts;
  const size = isNum(binSize) && binSize > 0 ? binSize : 1;
  const filtered = filterArchives(archives, filters);

  const values = [];
  for (const a of filtered) {
    const v = getBorderDiff(a);
    if (v != null) values.push(v);
  }
  const total = values.length;
  if (total === 0) {
    return { bins: [], total: 0, min: null, max: null, avg: null, plusRate: null, enough: false };
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const sum = values.reduce((s, v) => s + v, 0);
  const avg = sum / total;
  const plusCount = values.filter((v) => v >= 0).length;
  const plusRate = (plusCount / total) * 100;

  // ビン境界: size の倍数で min/max を含む範囲をカバー
  const loEdge = Math.floor(min / size) * size;
  const hiEdge = Math.ceil((max + 1e-9) / size) * size;
  const binCount = Math.max(1, Math.round((hiEdge - loEdge) / size));
  const bins = [];
  for (let i = 0; i < binCount; i++) {
    const lo = loEdge + i * size;
    const hi = lo + size;
    const mid = (lo + hi) / 2;
    bins.push({ lo, hi, mid, count: 0, label: formatBinLabel(lo, hi, size) });
  }
  for (const v of values) {
    let idx = Math.floor((v - loEdge) / size);
    if (idx < 0) idx = 0;
    if (idx >= binCount) idx = binCount - 1;
    bins[idx].count += 1;
  }

  return {
    bins,
    total,
    min,
    max,
    avg,
    plusRate,
    enough: total >= HISTOGRAM_MIN_SAMPLE,
  };
}

function formatBinLabel(lo, hi, size) {
  // 幅 1 以上は整数で、それ未満は小数1桁で表示
  const d = size >= 1 ? 0 : 1;
  const fmt = (n) => {
    const r = n.toFixed(d);
    // -0 を 0 に
    return r === `-${(0).toFixed(d)}` ? (0).toFixed(d) : r;
  };
  return `${fmt(lo)}〜${fmt(hi)}`;
}

// ──────────────────────────────────────────────────────────────────────────────
// 3. 店舗別・曜日別の期待値傾向
// ──────────────────────────────────────────────────────────────────────────────
//   グループ（店舗名 or 曜日）ごとに、件数・EV 合計・実損益合計を集計する。
//   EV = getEvAmount（effectiveWorkAmount ?? workAmount）。
//   実損益 = Σ(recoveryYen - investYen)（実損益記録のあるセッションのみ加算）。
//   返却: [{ key, label, sessions, evAmount, evAvg, actualPL, hasActual, realSessions }, ...]

function makeGroupRow(key, label) {
  return {
    key,
    label,
    sessions: 0,
    evAmount: 0,
    actualPL: 0,
    hasActual: false,
    realSessions: 0,
  };
}
function pushIntoGroup(row, a) {
  row.sessions += 1;
  row.evAmount += getEvAmount(a);
  const inv = Number(a?.investYen) || 0;
  const rec = Number(a?.recoveryYen) || 0;
  if (inv > 0 || rec > 0) {
    row.hasActual = true;
    row.actualPL += rec - inv;
    row.realSessions += 1;
  }
}
function finalizeGroups(map) {
  return Object.values(map).map((r) => ({
    ...r,
    evAvg: r.sessions > 0 ? r.evAmount / r.sessions : 0,
  }));
}

// 店舗別集計（EV 合計の降順）。店舗名が空のセッションは「未設定」にまとめる。
export function aggregateByStore(archives, opts = {}) {
  const filtered = filterArchives(archives, opts);
  const map = {};
  for (const a of filtered) {
    const name = String(a?.storeName || "").trim() || "未設定";
    const key = name;
    if (!map[key]) map[key] = makeGroupRow(key, name);
    pushIntoGroup(map[key], a);
  }
  return finalizeGroups(map).sort((a, b) => {
    if (a.hasActual && !b.hasActual) return -1;
    if (!a.hasActual && b.hasActual) return 1;
    if (a.hasActual && b.hasActual) return b.actualPL - a.actualPL;
    return b.evAmount - a.evAmount;
  });
}

const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

// YYYY-MM-DD → 0..6（既存 analysisSelectors の toWeekday と同一仕様）
function weekdayOf(date) {
  if (typeof date !== "string" || date.length < 10) return null;
  const y = Number(date.slice(0, 4));
  const m = Number(date.slice(5, 7));
  const d = Number(date.slice(8, 10));
  if (!isFinite(y) || !isFinite(m) || !isFinite(d)) return null;
  const dt = new Date(y, m - 1, d);
  if (isNaN(dt.getTime())) return null;
  return dt.getDay();
}

// 曜日別集計（日→土の固定順で、記録のある曜日のみ返す）
export function aggregateByWeekday(archives, opts = {}) {
  const filtered = filterArchives(archives, opts);
  const map = {};
  for (const a of filtered) {
    const wd = weekdayOf(a?.date);
    if (wd == null) continue;
    const key = String(wd);
    if (!map[key]) map[key] = makeGroupRow(key, `${WEEKDAY_LABELS[wd]}曜`);
    pushIntoGroup(map[key], a);
  }
  return finalizeGroups(map).sort((a, b) => Number(a.key) - Number(b.key));
}
