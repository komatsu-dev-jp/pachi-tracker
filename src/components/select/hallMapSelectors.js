// 台選び：ホールマップ編集用セレクタ（純粋関数）
//
// ユーザーが店舗ごとに編集するホール内の島配置データを扱う。
// このデータは台選び用の独立した設定データであり、回転数記録（rotRows）とは
// 無関係に保つ（rotRows を迂回する新データフローではない）。
//
// 永続化キー: pt_hallMaps（既存キーの構造は一切変更しない・新規キーのみ追加）
// スキーマ: { [storeId]: Island[] }
//   Island = { id: string, name: string, start: number, end: number, machineName: string,
//              ranges?: {start,end}[], rows?: number, cols?: number, gaps?: number[] }
//     start/end: 台番号範囲（昇順に正規化）。ranges がある場合は全連番を包む範囲（最小〜最大）
//     ranges: 行ごとの連番範囲一覧（任意）。島を上から見た行の並び順で保持し、
//             各行は { start: 左端の台番号, end: 右端の台番号 }。start > end なら降順の行
//             （例: 1行目 509〜499（降順）/ 2行目 479〜490 / 3行目 546〜574）。
//             行の並び・方向が情報なのでソート・結合はしない。
//             2行以上、または1行でも降順のときのみ保持する（昇順1行は start/end に畳む）
//     machineName: 機種名（任意・空文字可）
//     rows: レイアウト表示の行数（任意・1〜10）。島を上から見た並び数（対面なら2）。
//           台は行方向（横）に増え、列数は台数から自動で決まる
//     cols: レイアウト表示の列数（任意・1〜30）。rows 導入前の旧設定。rows があれば無視
//     gaps: 欠け台番号（任意・start〜end の範囲内）。その番号の台は存在しない扱いで、
//           レイアウト上は同じ位置に「欠」セルが残り、他の台の位置・番号は動かない。
//           台数 islandCount は欠けを除いた実台数（end-start+1 − 欠け数）を返す
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

// 行（連番範囲）一覧を正規化する。各行は 0 以上の整数に丸めるだけで、
// 並び順（＝島を上から見た行の順）と方向（start > end は降順）はそのまま保つ。
function normalizeRanges(ranges) {
  if (!Array.isArray(ranges)) return [];
  return ranges
    .map((r) => {
      if (!r || typeof r !== "object") return null;
      const s = Math.round(num(r.start, NaN));
      const e = Math.round(num(r.end, NaN));
      if (!Number.isFinite(s) || !Number.isFinite(e)) return null;
      return { start: Math.max(0, s), end: Math.max(0, e) };
    })
    .filter(Boolean);
}

// 欠け台番号を昇順・重複なしへ正規化する。いずれかの行の範囲内の番号だけ残す。
function normalizeGaps(gaps, segs) {
  if (!Array.isArray(gaps)) return [];
  return [...new Set(
    gaps
      .map((g) => Math.round(num(g, -1)))
      .filter((g) => segs.some((seg) =>
        g >= Math.min(seg.start, seg.end) && g <= Math.max(seg.start, seg.end)
      ))
  )].sort((a, b) => a - b);
}

function makeId() {
  return `island-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

// 1件の島を正規化する。台番号範囲は 0 以上・start<=end に揃える。
// ranges（複数連番）がある場合はそちらを正とし、start/end は全連番を包む範囲になる。
export function normalizeIsland(island, i = 0) {
  const src = island && typeof island === "object" ? island : {};
  let start = Math.max(0, Math.round(num(src.start, i * 10 + 1)));
  let end = Math.max(0, Math.round(num(src.end, start)));
  if (end < start) {
    const t = start;
    start = end;
    end = t;
  }
  const segs = normalizeRanges(src.ranges);
  if (segs.length > 0) {
    start = Math.min(...segs.map((seg) => Math.min(seg.start, seg.end)));
    end = Math.max(...segs.map((seg) => Math.max(seg.start, seg.end)));
  }
  const out = {
    id: typeof src.id === "string" && src.id ? src.id : makeId(),
    name: typeof src.name === "string" ? src.name : "",
    start,
    end,
    machineName: typeof src.machineName === "string" ? src.machineName : "",
  };
  // 昇順1行だけなら ranges を持たず、従来どおり start/end のみで表す。
  if (segs.length > 1 || (segs.length === 1 && segs[0].start > segs[0].end)) out.ranges = segs;
  // 表示レイアウト設定（任意フィールド）。未設定の島には付与せず既存データの形を保つ。
  const rows = normalizeRows(src.rows);
  if (rows != null) out.rows = rows;
  const cols = normalizeCols(src.cols);
  if (cols != null) out.cols = cols;
  const gaps = normalizeGaps(src.gaps, segs.length > 0 ? segs : [{ start, end }]);
  if (gaps.length > 0) out.gaps = gaps;
  return out;
}

// 島の連番範囲一覧を返す（ranges が無ければ start/end の1範囲）。
export function islandRanges(island) {
  const isl = normalizeIsland(island);
  return isl.ranges ? isl.ranges : [{ start: isl.start, end: isl.end }];
}

// 島の表示列数（横方向のセル数）を返す。
// 行モード（ranges あり）では最長の行の台数。それ以外は rows（行数）指定を優先して
// セル数から算出し、旧 cols 指定があればそれを使う。どちらも無ければ null。
export function islandLayoutColumns(island, totalCells) {
  const isl = normalizeIsland(island);
  if (isl.ranges) {
    return Math.max(1, ...isl.ranges.map((seg) => Math.abs(seg.end - seg.start) + 1));
  }
  const total = Math.max(1, Math.round(num(totalCells, isl.end - isl.start + 1)));
  if (isl.rows != null) return Math.max(1, Math.ceil(total / isl.rows));
  if (isl.cols != null) return isl.cols;
  return null;
}

// 島のレイアウトセル一覧を返す（欠けを含む・maxCells で打ち切り）。
// 要素は { num: 台番号 } または { num: 台番号, gap: true }（その番号の台は存在しない）。
// セル位置は台番号で固定され、欠けにしても他のセルは動かない。
// 複数行の島は行を順につなげて並べ、降順の行は番号が下がる方向にそのまま進む。
export function islandLayoutCells(island, maxCells = Infinity) {
  const rows = islandLayoutRows(island, maxCells);
  return rows.flat();
}

// 島の行ごとのレイアウトセル一覧を返す（欠けを含む・全体で maxCells 打ち切り）。
// 各行は左端→右端の順のセル配列で、降順の行（start > end）は番号が下がっていく。
export function islandLayoutRows(island, maxCells = Infinity) {
  const isl = normalizeIsland(island);
  const segs = isl.ranges ? isl.ranges : [{ start: isl.start, end: isl.end }];
  const gapSet = new Set(isl.gaps || []);
  let used = 0;
  return segs.map((seg) => {
    const dir = seg.start <= seg.end ? 1 : -1;
    const row = [];
    for (let n = seg.start; dir > 0 ? n <= seg.end : n >= seg.end; n += dir) {
      if (used >= maxCells) break;
      used++;
      if (gapSet.has(n)) row.push({ num: n, gap: true });
      else row.push({ num: n });
    }
    return row;
  });
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

// 島1件分の実台数（全行の台数から欠け台番号ぶんを除いた数。範囲が無効なら0）。
export function islandCount(island) {
  const isl = normalizeIsland(island);
  if (isl.end < isl.start) return 0;
  const segs = isl.ranges ? isl.ranges : [{ start: isl.start, end: isl.end }];
  const total = segs.reduce((a, seg) => a + Math.abs(seg.end - seg.start) + 1, 0);
  return total - (isl.gaps?.length || 0);
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
// start/end のみを更新した場合（旧編集画面など）は、複数連番を単一範囲へ戻して整合させる。
export function updateIsland(islands, id, patch) {
  const p = patch && typeof patch === "object" ? patch : {};
  return normalizeIslands(islands).map((isl) => {
    if (isl.id !== id) return isl;
    const next = { ...isl, ...p };
    if (!("ranges" in p) && ("start" in p || "end" in p)) delete next.ranges;
    return normalizeIsland(next);
  });
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
