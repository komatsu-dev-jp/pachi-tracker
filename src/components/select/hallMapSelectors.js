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
//     ranges: 連番が途中で切れる島用の連番範囲一覧（任意・2件以上のときのみ保持）。
//             例: 479〜490 / 499〜509 / 546〜574 を1つの島として扱う。
//             昇順に整列し、重複・隣接する範囲は1つへまとめる
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

// 連番範囲一覧を正規化する。各範囲を 0 以上・昇順に揃え、開始順に整列し、
// 重複・隣接（end+1 == 次の start）する範囲は1つの連番へまとめる。
function normalizeRanges(ranges) {
  if (!Array.isArray(ranges)) return [];
  const segs = ranges
    .map((r) => {
      if (!r || typeof r !== "object") return null;
      let s = Math.round(num(r.start, NaN));
      let e = Math.round(num(r.end, NaN));
      if (!Number.isFinite(s) || !Number.isFinite(e)) return null;
      s = Math.max(0, s);
      e = Math.max(0, e);
      if (e < s) {
        const t = s;
        s = e;
        e = t;
      }
      return { start: s, end: e };
    })
    .filter(Boolean)
    .sort((a, b) => a.start - b.start);
  const merged = [];
  for (const seg of segs) {
    const last = merged[merged.length - 1];
    if (last && seg.start <= last.end + 1) last.end = Math.max(last.end, seg.end);
    else merged.push({ ...seg });
  }
  return merged;
}

// 欠け台番号を昇順・重複なしへ正規化する。いずれかの連番範囲内の番号だけ残す。
function normalizeGaps(gaps, segs) {
  if (!Array.isArray(gaps)) return [];
  return [...new Set(
    gaps
      .map((g) => Math.round(num(g, -1)))
      .filter((g) => segs.some((seg) => g >= seg.start && g <= seg.end))
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
    start = segs[0].start;
    end = segs[segs.length - 1].end;
  }
  const out = {
    id: typeof src.id === "string" && src.id ? src.id : makeId(),
    name: typeof src.name === "string" ? src.name : "",
    start,
    end,
    machineName: typeof src.machineName === "string" ? src.machineName : "",
  };
  // 連番が1つにまとまる場合は ranges を持たず、従来どおり start/end のみで表す。
  if (segs.length > 1) out.ranges = segs;
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

// 島の表示列数（横方向のセル数）を返す。rows（行数）指定を優先してセル数から算出し、
// 旧 cols 指定があればそれを使う。どちらも無ければ null（表示側の既定に任せる）。
// セル数は欠けを含む全連番範囲の台数。
export function islandLayoutColumns(island, totalCells) {
  const isl = normalizeIsland(island);
  const segs = isl.ranges ? isl.ranges : [{ start: isl.start, end: isl.end }];
  const segTotal = segs.reduce((a, seg) => a + (seg.end - seg.start + 1), 0);
  const total = Math.max(1, Math.round(num(totalCells, segTotal)));
  if (isl.rows != null) return Math.max(1, Math.ceil(total / isl.rows));
  if (isl.cols != null) return isl.cols;
  return null;
}

// 島のレイアウトセル一覧を返す（欠けを含む・maxCells で打ち切り）。
// 要素は { num: 台番号 } または { num: 台番号, gap: true }（その番号の台は存在しない）。
// セル位置は台番号で固定され、欠けにしても他のセルは動かない。
// 複数連番の島は範囲を順につなげて並べる（番号は切れ目で飛ぶ）。
export function islandLayoutCells(island, maxCells = Infinity) {
  const isl = normalizeIsland(island);
  const segs = isl.ranges ? isl.ranges : [{ start: isl.start, end: isl.end }];
  const gapSet = new Set(isl.gaps || []);
  const cells = [];
  for (const seg of segs) {
    for (let n = seg.start; n <= seg.end; n++) {
      if (cells.length >= maxCells) return cells;
      if (gapSet.has(n)) cells.push({ num: n, gap: true });
      else cells.push({ num: n });
    }
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

// 島1件分の実台数（全連番範囲の台数から欠け台番号ぶんを除いた数。範囲が無効なら0）。
export function islandCount(island) {
  const isl = normalizeIsland(island);
  if (isl.end < isl.start) return 0;
  const segs = isl.ranges ? isl.ranges : [{ start: isl.start, end: isl.end }];
  const total = segs.reduce((a, seg) => a + (seg.end - seg.start + 1), 0);
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
