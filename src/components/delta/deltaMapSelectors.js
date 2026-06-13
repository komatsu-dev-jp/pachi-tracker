// 差玉解析「マップで見る」用セレクタ（純粋関数）
//
// 保存済みの差玉解析スキャン（pt_deltaScans）を、店舗のホールマップ（島）に
// 重ねて表示するための整形を担う。すべて入力を変更しない純粋関数。
// logic.js・rotRows とは無関係の独立した読み取りデータ。
//
// Scan スキーマ: { id, storeId, storeName, date("YYYY-MM-DD"), machineName, rows, createdAt }
//   rows[] = { num, val, px, rank, island?, machineName?, normalSpins?, totalStarts? }
// Island スキーマ: { id, name, start, end, machineName }

import { getRank } from "./deltaEngine.js";

// 指定店舗のスキャンが持つ日付（"YYYY-MM-DD"）を降順ユニーク配列で返す。
// storeId は文字列化して厳密照合する（storeId が null のスキャンは storeName 一致では拾わない）。
export function listScanDates(scans, storeId) {
  const list = Array.isArray(scans) ? scans : [];
  const key = String(storeId);
  const seen = new Set();
  for (const s of list) {
    if (!s || s.storeId == null) continue;
    if (String(s.storeId) !== key) continue;
    if (typeof s.date === "string" && s.date) seen.add(s.date);
  }
  return Array.from(seen).sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
}

// 指定店舗・日付のスキャン行を Map<numString, row> に統合して返す。
// 同一台番号が複数スキャンにある場合は createdAt が新しい方を優先する。
export function buildScanIndex(scans, storeId, date) {
  const list = Array.isArray(scans) ? scans : [];
  const key = String(storeId);
  const index = new Map();
  // createdAt の新旧を比較できるよう、採用元スキャンの createdAt を控えておく。
  const pickedAt = new Map();
  for (const s of list) {
    if (!s || s.storeId == null) continue;
    if (String(s.storeId) !== key) continue;
    if (s.date !== date) continue;
    const rows = Array.isArray(s.rows) ? s.rows : [];
    const createdAt = typeof s.createdAt === "string" ? s.createdAt : "";
    for (const row of rows) {
      if (!row || row.num == null) continue;
      const numKey = String(row.num);
      const prevAt = pickedAt.get(numKey);
      // 未登録、または今回の createdAt がより新しいなら上書き。
      if (prevAt === undefined || createdAt >= prevAt) {
        index.set(numKey, row);
        pickedAt.set(numKey, createdAt);
      }
    }
  }
  return index;
}

// 島の台番号範囲を走査し、各台のセル配列を返す。
// セル: { num: "816", short: "16", row: row|null }
//   short = 台番号の下2桁（3桁未満はそのまま）。row が無い台は null（データなし）。
export function buildIslandOverlay(island, scanIndex) {
  const idx = scanIndex instanceof Map ? scanIndex : new Map();
  if (!island || typeof island !== "object") return [];
  const start = Number(island.start);
  const end = Number(island.end);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return [];
  const lo = Math.min(start, end);
  const hi = Math.max(start, end);
  const cells = [];
  for (let n = lo; n <= hi; n++) {
    const numStr = String(n);
    const short = numStr.length > 2 ? numStr.slice(-2) : numStr;
    cells.push({ num: numStr, short, row: idx.get(numStr) || null });
  }
  return cells;
}

// 指定店舗・指定台番号の、日付ごとの差玉推移を昇順（日付古い順）で返す。
// 戻り値: [{ date("YYYY-MM-DD"), val, rank(ランク名文字列) }]
//   - storeId は厳密一致（文字列化照合）。num は文字列化して照合する。
//   - 同一日付に複数スキャンがある場合は createdAt が新しい方を優先（buildScanIndex と同方針）。
//   - val が数値でない行は除外する。
//   - rank は行の保存値を優先し、無ければ getRank(val).rank で導出する。
export function buildNumTrend(scans, storeId, num) {
  const list = Array.isArray(scans) ? scans : [];
  const key = String(storeId);
  const numKey = String(num);
  // 日付ごとに { val, rank, createdAt } を保持し、createdAt が新しい行を採用する。
  const byDate = new Map();
  for (const s of list) {
    if (!s || s.storeId == null) continue;
    if (String(s.storeId) !== key) continue;
    if (typeof s.date !== "string" || !s.date) continue;
    const rows = Array.isArray(s.rows) ? s.rows : [];
    const createdAt = typeof s.createdAt === "string" ? s.createdAt : "";
    for (const row of rows) {
      if (!row || row.num == null) continue;
      if (String(row.num) !== numKey) continue;
      const val = Number(row.val);
      if (!Number.isFinite(val)) continue;
      const rank = (typeof row.rank === "string" && row.rank)
        ? row.rank
        : getRank(val).rank;
      const prev = byDate.get(s.date);
      // 未登録、または今回の createdAt がより新しいなら上書き。
      if (prev === undefined || createdAt >= prev.createdAt) {
        byDate.set(s.date, { val, rank, createdAt });
      }
    }
  }
  return Array.from(byDate.entries())
    .map(([date, v]) => ({ date, val: v.val, rank: v.rank }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

// 全島中で row が付いたセル数と総セル数 { hit, total } を返す（ヘッダー表示用）。
export function coverageOf(islands, scanIndex) {
  const list = Array.isArray(islands) ? islands : [];
  let hit = 0;
  let total = 0;
  for (const isl of list) {
    const cells = buildIslandOverlay(isl, scanIndex);
    total += cells.length;
    for (const cell of cells) {
      if (cell.row) hit += 1;
    }
  }
  return { hit, total };
}
