// 差玉解析：データ整形・台番号割り当て・台データ取り込み（純粋関数）
//
// AI（外部ChatGPT/Claude）が画像から文字起こしした台データ TSV のパース、
// ピクセル解析スロットへの台番号割り当て、台データの結果へのマージ等を担う。
// logic.js とは無関係の独立データ。rotRows は迂回しない。

import { getRank } from "./deltaEngine.js";

// 端末ローカルの "YYYY-MM-DD"（node テストからも使うため本モジュール内に定義）
function toLocalDay(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// 全角数字→半角、カンマ除去をして整数化する。失敗時は null。
function toHalfWidth(str) {
  return String(str ?? "").replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
}

function parseIntLoose(value) {
  const half = toHalfWidth(value).replace(/,/g, "").replace(/，/g, "");
  const cleaned = half.replace(/[^0-9-]/g, "");
  if (!cleaned || cleaned === "-") return null;
  const n = parseInt(cleaned, 10);
  return Number.isNaN(n) ? null : n;
}

// 台番号は数値化できるが、表示は読み取り原文（全角→半角化）を保つ。
function parseNumberToken(value) {
  const half = toHalfWidth(value).replace(/,/g, "").replace(/，/g, "").trim();
  const n = parseIntLoose(half);
  if (n === null) return null;
  return String(n);
}

// AI出力TSVをパースする。
// 新形式の列順: 日付 / 店舗名 / 島名 / 機種名 / 台番号 / 差玉 / 通常回転数 / 総当り回数（8列）。
// 旧形式（差玉なしの7列）も、端末内ピクセル解析の差玉を残すため後方互換で受け付ける。
// タブ区切りを優先し、7/8列にならない行は連続空白区切りで再試行する。
// それでも列数が合わない行・台番号や数値が数値化できない行はスキップして理由を集める。
export function parseTaiDataText(text) {
  const rows = [];
  const skipped = [];
  const lines = String(text || "").split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+$/, "");
    if (!line.trim()) continue; // 空行は静かに無視

    // タブ区切り優先 → 7/8列でなければ連続空白で再試行
    let cols = line.split("\t").map((c) => c.trim());
    if (cols.length !== 7 && cols.length !== 8) {
      const bySpace = line.trim().split(/\s+/);
      if (bySpace.length === 7 || bySpace.length === 8) cols = bySpace;
    }

    if (cols.length !== 7 && cols.length !== 8) {
      skipped.push({ line: line.trim(), reason: "列数不足" });
      continue;
    }

    const hasDelta = cols.length === 8;
    const [date, store, island, machineName, numRaw] = cols;
    const deltaRaw = hasDelta ? cols[5] : null;
    const spinsRaw = cols[hasDelta ? 6 : 5];
    const startsRaw = cols[hasDelta ? 7 : 6];
    const num = parseNumberToken(numRaw);
    if (num === null) {
      skipped.push({ line: line.trim(), reason: "台番号が数値化できない" });
      continue;
    }
    const normalSpins = parseIntLoose(spinsRaw);
    const totalStarts = parseIntLoose(startsRaw);
    const val = hasDelta ? parseIntLoose(deltaRaw) : null;
    if (normalSpins === null || totalStarts === null || (hasDelta && val === null)) {
      skipped.push({ line: line.trim(), reason: "数値が数値化できない" });
      continue;
    }

    const parsedRow = {
      date: date.trim(),
      store: store.trim(),
      island: island.trim(),
      machineName: machineName.trim(),
      num,
      normalSpins,
      totalStarts,
    };
    if (hasDelta) parsedRow.val = val;
    rows.push(parsedRow);
  }

  return { rows, skipped };
}

// AI読み取り用プロンプト全文を返す（固定情報の日付・店舗名のみ動的に埋め込む）。
export function buildOcrPrompt({ dateText = "", storeName = "" } = {}) {
  return `あなたは複数の添付資料から、パチンコ台ごとのデータを正確に統合するアシスタントです。
以下のルールを必ず厳守してください。
【添付資料】
・「台番号と差玉が分かる差玉データ」と「大当たり情報の画像またはPDF」を一緒に読み取る
・台番号をキーに2つの資料を照合し、同じ台を1行にまとめる
・片方の資料にしか存在しない台は推測で補わず、出力しない
【出力形式】
・1行＝1台
・各項目は「タブ区切り」で出力する
・改行以外の空行は入れない
・表に存在するすべての行を省略せず出力する
・推測や補完は一切しない
【出力する列（この順番を厳守）】
1.	日付
2.	店舗名
3.	島名
4.	機種名
5.	台番号
6.	差玉（差玉データの「○○番台 差玉」の数値。プラスは正数、マイナスは負数）
7.	通常回転数（大当たり情報の「通常中スタート」の数値を抽出）
8.	総当り回数（大当たり情報の「大当り回数」の数値を抽出）
【重要ルール】
・列タイトル（見出し）は出力しない
・数値は半角数字で出力する
・日付／店舗名は指定された固定情報をすべての行に同じ内容で出力する
・島名と機種名は画像内の青いセル（機種名表示）を正確に読み取り、その機種に該当する台すべてに同じ島名・機種名を適用する
・機種名が変わるまで、直前の機種名を継続して使用する
・島名は機種グループごとに「機種名+島」の形式で自動生成する（例：「P北斗の拳強敵SSPA島」）
・「確率」「最大持玉」などの不要な列は出力しない
・説明文、補足文、前置きは一切書かない
【出力例（形式のみ）】
2026/02/13	スーパーキスケPAO	P北斗の拳強敵SSPA島	P北斗の拳強敵SSPA	267	-4500	1239	12
2026/02/13	スーパーキスケPAO	P北斗の拳強敵SSPA島	P北斗の拳強敵SSPA	268	8200	204	2
では、添付資料を台番号で照合し、すべてこの形式で出力してください。
【固定情報】
日付：${dateText}
店舗名：${storeName}`;
}

// 解析スロット配列に台番号配列を割り当て、{num,val,px,rank} 行を作る。
// rank はランク名文字列（例: "S+"）。numList が足りない箇所は連番フォールバック（index+1）。
export function assignNumbers(slots, numList) {
  const list = Array.isArray(slots) ? slots : [];
  const nums = Array.isArray(numList) ? numList : [];
  return list.map((slot, i) => {
    const val = Number(slot?.val) || 0;
    return {
      num: nums[i] != null ? String(nums[i]) : String(i + 1),
      val,
      px: Number(slot?.px) || 0,
      rank: getRank(val).rank,
    };
  });
}

// 台番号（文字列化して照合）をキーに台データを結果行へマージする。
// island / machineName / val / normalSpins / totalStarts を上書き付与し、マッチ数を返す。
// val が取り込まれた場合は、その差玉に合わせてランクも再計算する。
export function mergeTaiData(rows, taiRows) {
  const list = Array.isArray(rows) ? rows : [];
  const tai = Array.isArray(taiRows) ? taiRows : [];
  const byNum = new Map();
  for (const t of tai) {
    if (t && t.num != null) byNum.set(String(t.num), t);
  }
  let matched = 0;
  const merged = list.map((row) => {
    const t = byNum.get(String(row.num));
    if (!t) return { ...row };
    matched += 1;
    const hasImportedDelta = t.val != null && Number.isFinite(Number(t.val));
    const mergedVal = hasImportedDelta ? Number(t.val) : row.val;
    return {
      ...row,
      island: t.island ?? row.island ?? "",
      machineName: t.machineName ?? row.machineName ?? "",
      val: mergedVal,
      rank: hasImportedDelta ? getRank(mergedVal).rank : row.rank,
      normalSpins: t.normalSpins ?? row.normalSpins ?? null,
      totalStarts: t.totalStarts ?? row.totalStarts ?? null,
    };
  });
  return { rows: merged, matched };
}

// ホールマップの島（{start,end}）から台番号配列を生成する。
export function islandToNumbers(island) {
  if (!island || typeof island !== "object") return [];
  const start = Number(island.start);
  const end = Number(island.end);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return [];
  const lo = Math.min(start, end);
  const hi = Math.max(start, end);
  const nums = [];
  for (let n = lo; n <= hi; n++) nums.push(String(n));
  return nums;
}

// 手動区間 [{start,count}] から台番号配列を生成する（移植元 generateNums と同等）。
export function buildSegmentsNumbers(segments) {
  const list = Array.isArray(segments) ? segments : [];
  const nums = [];
  for (const seg of list) {
    const start = parseInt(seg?.start, 10);
    const count = parseInt(seg?.count, 10) || 0;
    if (isNaN(start) || count <= 0) continue;
    for (let i = 0; i < count; i++) nums.push(String(start + i));
  }
  return nums;
}

// 保存用スキャンレコードを生成する。
// スキーマ: { id, storeId, storeName, date("YYYY-MM-DD"), machineName, rows, createdAt }
export function makeScan({ id, storeId = null, storeName = "", date, machineName = "", rows = [] } = {}) {
  const now = new Date();
  const createdAt = now.toISOString();
  // 既定日はローカル日付にする（toISOString は UTC のため 0:00〜9:00 JST に前日となる）
  const day = typeof date === "string" && date ? date : toLocalDay(now);
  return {
    id: id != null ? id : `delta-${now.getTime()}-${Math.floor(Math.random() * 100000)}`,
    storeId: storeId ?? null,
    storeName: storeName || "",
    date: day,
    machineName: machineName || "",
    rows: Array.isArray(rows) ? rows : [],
    createdAt,
  };
}

// スキャンの保持ポリシー。localStorage（実質5MB）の肥大化を防ぐため、
// 保存時に古いスキャンを剪定する。90日 or 300件を超えた分は古い順に削除。
export const SCAN_RETENTION = Object.freeze({ maxAgeDays: 90, maxCount: 300 });

// スキャン一覧を保持ポリシーで剪定した新しい配列を返す（元配列は変更しない）。
// date("YYYY-MM-DD") の辞書順比較で期限判定し、件数超過分は古い日付から落とす。
export function pruneScans(list, { maxAgeDays = SCAN_RETENTION.maxAgeDays, maxCount = SCAN_RETENTION.maxCount, now = new Date() } = {}) {
  const scans = Array.isArray(list) ? list.filter(Boolean) : [];
  const cutoff = toLocalDay(new Date(now.getTime() - maxAgeDays * 86400000));
  const kept = scans.filter((scan) => String(scan?.date || "") >= cutoff);
  if (kept.length <= maxCount) return kept;
  return [...kept]
    .sort((a, b) =>
      String(a?.date || "").localeCompare(String(b?.date || "")) ||
      String(a?.createdAt || "").localeCompare(String(b?.createdAt || ""))
    )
    .slice(-maxCount);
}
