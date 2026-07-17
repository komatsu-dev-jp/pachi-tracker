// 台選び：ホールマップ編集用セレクタ（純粋関数）
//
// ユーザーが店舗ごとに編集するホール内の島配置データを扱う。
// このデータは台選び用の独立した設定データであり、回転数記録（rotRows）とは
// 無関係に保つ（rotRows を迂回する新データフローではない）。
//
// 永続化キー: pt_hallMaps（既存キーの構造は一切変更しない・新規キーのみ追加）
// スキーマ: { [storeId]: Island[] }
//   Island = { id: string, name: string, start: number, end: number, machineName: string,
//              rows?: number, cols?: number, gaps?: number[] }
//     start/end: 台番号範囲（昇順に正規化）
//     machineName: 機種名（任意・空文字可）
//     rows: レイアウト表示の行数（任意・1〜10）。島を上から見た並び数（対面なら2）。
//           台は行方向（横）に増え、列数は台数から自動で決まる
//     cols: レイアウト表示の列数（任意・1〜30）。rows 導入前の旧設定。rows があれば無視
//     gaps: レイアウト上の欠け位置（任意・0始まりのセル位置）。台番号は消費しない
//           （欠けがあっても台数 islandCount は start/end のみで決まる）
//   rows / cols / gaps は表示レイアウト専用の追加フィールドで、既存フィールドの意味は変えない。

export const LAYOUT_COLS_MIN = 1;
export const LAYOUT_COLS_MAX = 30;
export const LAYOUT_ROWS_MIN = 1;
export const LAYOUT_ROWS_MAX = 10;

function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

// 列数を 1〜30 の整数へ丸める。無効値は null（未設定扱い）。
function normalizeCols(v) {
  if (v == null || v === "") return null;
  const n = Math.round(num(v, NaN));
  if (!Number.isFinite(n)) return null;
  return Math.max(LAYOUT_COLS_MIN, Math.min(LAYOUT_COLS_MAX, n));
}

// 行数を 1〜10 の整数へ丸める。無効値は null（未設定扱い）。
function normalizeRows(v) {
  if (v == null || v === "") return null;
  const n = Math.round(num(v, NaN));
  if (!Number.isFinite(n)) return null;
  return Math.max(LAYOUT_ROWS_MIN, Math.min(LAYOUT_ROWS_MAX, n));
}

// 欠け位置を昇順・重複なしへ正規化する。台数 count に対して
// セル総数（count + 採用済み欠け数）の範囲内に収まる位置だけ残す。
function normalizeGaps(gaps, count) {
  if (!Array.isArray(gaps)) return [];
  const sorted = [...new Set(
    gaps.map((g) => Math.round(num(g, -1))).filter((g) => g >= 0)
  )].sort((a, b) => a - b);
  const kept = [];
  for (const g of sorted) {
    if (g < count + kept.length) kept.push(g);
  }
  return kept;
}

function makeId() {
  return `island-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

// 1件の島を正規化する。台番号範囲は 0 以上・start<=end に揃える。
export function normalizeIsland(island, i = 0) {
  const src = island && typeof island === "object" ? island : {};
  let start = Math.max(0, Math.round(num(src.start, i * 10 + 1)));
  let end = Math.max(0, Math.round(num(src.end, start)));
  if (end < start) {
    const t = start;
    start = end;
    end = t;
  }
  const out = {
    id: typeof src.id === "string" && src.id ? src.id : makeId(),
    name: typeof src.name === "string" ? src.name : "",
    start,
    end,
    machineName: typeof src.machineName === "string" ? src.machineName : "",
  };
  // 表示レイアウト設定（任意フィールド）。未設定の島には付与せず既存データの形を保つ。
  const rows = normalizeRows(src.rows);
  if (rows != null) out.rows = rows;
  const cols = normalizeCols(src.cols);
  if (cols != null) out.cols = cols;
  const gaps = normalizeGaps(src.gaps, end - start + 1);
  if (gaps.length > 0) out.gaps = gaps;
  return out;
}

// 島の表示列数（横方向のセル数）を返す。rows（行数）指定を優先して台数から算出し、
// 旧 cols 指定があればそれを使う。どちらも無ければ null（表示側の既定に任せる）。
export function islandLayoutColumns(island, totalCells) {
  const isl = normalizeIsland(island);
  const total = Math.max(1, Math.round(num(totalCells, (isl.end - isl.start + 1) + (isl.gaps?.length || 0))));
  if (isl.rows != null) return Math.max(1, Math.ceil(total / isl.rows));
  if (isl.cols != null) return isl.cols;
  return null;
}

// 島のレイアウトセル一覧を返す（欠けを含む・maxCells で打ち切り）。
// 要素は { num: 台番号 } または { gap: true }。台番号は欠けを飛ばして連番のまま進む。
export function islandLayoutCells(island, maxCells = Infinity) {
  const isl = normalizeIsland(island);
  const count = isl.end - isl.start + 1;
  const gapSet = new Set(isl.gaps || []);
  const total = Math.min(count + gapSet.size, maxCells);
  const cells = [];
  let n = isl.start;
  for (let p = 0; p < total; p++) {
    if (gapSet.has(p)) cells.push({ gap: true });
    else cells.push({ num: n++ });
  }
  return cells;
}

// 店舗1件分の島配列を正規化する。
export function normalizeIslands(islands) {
  if (!Array.isArray(islands)) return [];
  return islands.filter(Boolean).map((isl, i) => normalizeIsland(isl, i));
}

// マップ全体（{ [storeId]: Island[] }）から特定店舗の島配列を取り出す。
// storeId は number/string どちらでも引けるよう文字列化して照合する。
export function getStoreIslands(hallMaps, storeId) {
  if (!hallMaps || typeof hallMaps !== "object" || storeId == null) return [];
  const direct = hallMaps[storeId];
  if (Array.isArray(direct)) return normalizeIslands(direct);
  const key = String(storeId);
  if (Array.isArray(hallMaps[key])) return normalizeIslands(hallMaps[key]);
  return [];
}

// マップ全体に特定店舗の島配列を書き戻した新しいオブジェクトを返す（不変更新）。
// 空配列になった店舗はキーごと削除して肥大化を防ぐ。
export function setStoreIslands(hallMaps, storeId, islands) {
  const base = hallMaps && typeof hallMaps === "object" ? hallMaps : {};
  const key = String(storeId);
  const next = { ...base };
  // 既存の number/string 両キーの取りこぼしを避けるため、両方を掃除してから書く。
  delete next[storeId];
  delete next[key];
  const normalized = normalizeIslands(islands);
  if (normalized.length > 0) {
    next[key] = normalized;
  }
  return next;
}

// 島1件分の台数（範囲が有効なら end-start+1、無効なら0）。
export function islandCount(island) {
  const isl = normalizeIsland(island);
  if (isl.end < isl.start) return 0;
  return isl.end - isl.start + 1;
}

// 末尾に新しい島を追加した配列を返す。既存末尾の続き番号を初期値にする。
export function addIsland(islands, partial = {}) {
  const list = normalizeIslands(islands);
  const last = list[list.length - 1];
  const defStart = last ? last.end + 1 : 1;
  const island = normalizeIsland({
    name: `${list.length + 1}島`,
    start: defStart,
    end: defStart + 9,
    machineName: "",
    ...partial,
  });
  return [...list, island];
}

// id 指定で島を削除した配列を返す。
export function removeIsland(islands, id) {
  return normalizeIslands(islands).filter((isl) => isl.id !== id);
}

// id 指定で島のフィールドを部分更新した配列を返す。
export function updateIsland(islands, id, patch) {
  return normalizeIslands(islands).map((isl) =>
    isl.id === id ? normalizeIsland({ ...isl, ...patch }) : isl
  );
}

// 島を1つ上へ移動した配列を返す（先頭なら変化なし）。
export function moveIslandUp(islands, id) {
  const list = normalizeIslands(islands);
  const i = list.findIndex((isl) => isl.id === id);
  if (i <= 0) return list;
  const next = [...list];
  [next[i - 1], next[i]] = [next[i], next[i - 1]];
  return next;
}

// 島を1つ下へ移動した配列を返す（末尾なら変化なし）。
export function moveIslandDown(islands, id) {
  const list = normalizeIslands(islands);
  const i = list.findIndex((isl) => isl.id === id);
  if (i < 0 || i >= list.length - 1) return list;
  const next = [...list];
  [next[i], next[i + 1]] = [next[i + 1], next[i]];
  return next;
}
