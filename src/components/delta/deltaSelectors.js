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

// 全角数字・各種マイナスを正規化し、整数だけを受け付ける。失敗時は null。
// 小数点や単位を単純削除すると「12.5→125」「−4500→+4500」の誤変換になるため、
// 許可する記号を明示してから厳密に検証する。
function normalizeIntegerToken(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/[−‐‑‒–—―﹣]/g, "-")
    .replace(/[,，]/g, "")
    .replace(/[\s\u00a0]/g, "")
    .trim();
}

function parseIntLoose(value) {
  const normalized = normalizeIntegerToken(value);
  if (!/^[+-]?\d+$/.test(normalized)) return null;
  const n = Number(normalized);
  return Number.isSafeInteger(n) ? n : null;
}

// 台番号は数値化できるが、表示は読み取り原文（全角→半角化）を保つ。
function parseNumberToken(value) {
  const n = parseIntLoose(value);
  if (n === null) return null;
  return String(n);
}

// 台番号は数値として同じ表記（例: 0810 と 810）を同一番号へ正規化する。
export function normalizeMachineNumber(value) {
  const parsed = parseIntLoose(value);
  return parsed !== null && parsed >= 0 ? String(parsed) : null;
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

function finiteDelta(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

// 取り込み値はユーザー確認後に使うが、桁欠落・列ずれを確定値にしないため
// 日次の1台差玉として明らかに異常な値と小数は拒否する。
export const MAX_IMPORTED_DELTA_ABS = 500000;

function safeImportedDelta(value) {
  const parsed = finiteDelta(value);
  if (parsed === null || !Number.isSafeInteger(parsed) || Math.abs(parsed) > MAX_IMPORTED_DELTA_ABS) return null;
  return parsed;
}

// 解析スロット配列に台番号配列を割り当てる。
// 読み取り失敗（val:null）は0玉へ変換せず、原因・画像位置などの診断情報も保持する。
// 台番号が不足した場合も無関係な連番で埋めず、空欄のまま検証側へ渡す。
export function assignNumbers(slots, numList) {
  const list = Array.isArray(slots) ? slots : [];
  const nums = Array.isArray(numList) ? numList : [];
  return list.map((slot, i) => {
    const val = finiteDelta(slot?.val);
    return {
      ...(slot && typeof slot === "object" ? slot : {}),
      num: normalizeMachineNumber(nums[i]) || "",
      val,
      px: Number(slot?.px) || 0,
      rank: val === null ? null : getRank(val).rank,
      status: val === null ? (slot?.status || "failed") : (slot?.status || "ok"),
    };
  });
}

// 台番号と検出枠が1対1で対応しているかを、確定前に検証する。
export function validateNumberAssignment(slots, numList) {
  const list = Array.isArray(slots) ? slots : [];
  const rawNumbers = Array.isArray(numList) ? numList : [];
  const nums = rawNumbers.map(normalizeMachineNumber);
  const blankIndices = [];
  const invalidNumberIndices = [];
  const seen = new Map();

  rawNumbers.forEach((rawNumber, index) => {
    const raw = String(rawNumber ?? "").trim();
    const num = nums[index];
    if (!raw) {
      blankIndices.push(index);
      return;
    }
    if (num === null) {
      invalidNumberIndices.push(index);
      return;
    }
    const indices = seen.get(num) || [];
    indices.push(index);
    seen.set(num, indices);
  });

  const duplicateNumbers = Array.from(seen.entries())
    .filter(([, indices]) => indices.length > 1)
    .map(([num]) => num);
  const errors = [];
  if (nums.length !== list.length) errors.push("count-mismatch");
  if (blankIndices.length) errors.push("blank-number");
  if (invalidNumberIndices.length) errors.push("invalid-number");
  if (duplicateNumbers.length) errors.push("duplicate-number");

  return {
    valid: errors.length === 0,
    slotCount: list.length,
    numberCount: nums.length,
    normalizedNumbers: nums,
    blankIndices,
    invalidNumberIndices,
    duplicateNumbers,
    errors,
  };
}

// ページ全体のOCRが不合格でも、各枠で合格した候補だけは信頼済みとして保護する。
// OCR不合格枠は手修正を許すが、合格済み候補と異なる番号への上書きは拒否する。
export function validateReviewedNumberAssignment(slots, numList) {
  const list = Array.isArray(slots) ? slots : [];
  const base = validateNumberAssignment(list, numList);
  const trustedCandidates = list.map((slot) => (
    slot?.machineNumberOcr?.accepted === true
      ? normalizeMachineNumber(
        slot?.machineNumberOcr?.candidate
        ?? slot?.machineNumberCandidate
        ?? slot?.machineNumber,
      )
      : null
  ));
  const mismatches = [];

  trustedCandidates.forEach((candidate, index) => {
    if (candidate === null) return;
    const actual = base.normalizedNumbers[index] ?? null;
    if (actual !== candidate) mismatches.push({ index, expected: candidate, actual });
  });
  const mismatchIndices = mismatches.map(({ index }) => index);

  const errors = [...base.errors];
  if (mismatchIndices.length) errors.push("ocr-candidate-mismatch");

  return {
    ...base,
    valid: errors.length === 0,
    errors,
    trustedCandidates,
    mismatchIndices,
    mismatches,
  };
}

// 台番号（文字列化して照合）をキーに台データを結果行へマージする。
// island / machineName / val / normalSpins / totalStarts を上書き付与し、マッチ数を返す。
// val が取り込まれた場合は、その差玉に合わせてランクも再計算する。
export function mergeTaiData(rows, taiRows) {
  const list = Array.isArray(rows) ? rows : [];
  const tai = Array.isArray(taiRows) ? taiRows : [];
  const groupedByNum = new Map();
  for (const t of tai) {
    const normalized = normalizeMachineNumber(t?.num);
    if (!t || normalized === null) continue;
    const entries = groupedByNum.get(normalized) || [];
    entries.push(t);
    groupedByNum.set(normalized, entries);
  }
  const duplicateNumbers = [...groupedByNum.entries()]
    .filter(([, entries]) => entries.length > 1)
    .map(([number]) => number);
  const byNum = new Map(
    [...groupedByNum.entries()].filter(([, entries]) => entries.length === 1)
      .map(([number, entries]) => [number, entries[0]]),
  );
  const invalidDeltaNumbers = new Set();
  const conflictNumbers = new Set();
  const unverifiedDeltaNumbers = new Set();
  let matched = 0;
  const merged = list.map((row) => {
    const t = byNum.get(normalizeMachineNumber(row?.num));
    if (!t) return { ...row };
    matched += 1;
    const importedDelta = t.val != null ? safeImportedDelta(t.val) : null;
    const existingDelta = finiteDelta(row?.val);
    const hasTrustedDelta = row?.status === "ok" && existingDelta !== null;
    // AI/TSVの差玉は折れ線の代用品として自動確定しない。回転数などだけ統合し、
    // missing/review は元画像を撮り直すまでその状態を維持する。
    const hasImportedDelta = false;
    if (t.val != null && importedDelta === null) invalidDeltaNumbers.add(normalizeMachineNumber(row?.num));
    if (!hasTrustedDelta && importedDelta !== null) unverifiedDeltaNumbers.add(normalizeMachineNumber(row?.num));
    if (hasTrustedDelta && importedDelta !== null && importedDelta !== existingDelta) {
      conflictNumbers.add(normalizeMachineNumber(row?.num));
    }
    const mergedVal = hasImportedDelta ? importedDelta : row.val;
    return {
      ...row,
      island: t.island ?? row.island ?? "",
      machineName: t.machineName ?? row.machineName ?? "",
      val: mergedVal,
      rank: hasImportedDelta ? getRank(mergedVal).rank : row.rank,
      status: hasImportedDelta ? "ok" : row.status,
      valueSource: hasImportedDelta ? "import" : row.valueSource,
      confidence: hasImportedDelta ? 1 : row.confidence,
      reasonCodes: hasImportedDelta ? [] : row.reasonCodes,
      normalSpins: t.normalSpins ?? row.normalSpins ?? null,
      totalStarts: t.totalStarts ?? row.totalStarts ?? null,
    };
  });
  return {
    rows: merged,
    matched,
    duplicateNumbers,
    invalidDeltaNumbers: [...invalidDeltaNumbers],
    conflictNumbers: [...conflictNumbers],
    unverifiedDeltaNumbers: [...unverifiedDeltaNumbers],
  };
}

// グラフ上端・下端で終点が切れた場合は、画像から分かる下限／上限も満たす必要がある。
export function isDeltaValueWithinConstraint(row, candidateValue = row?.val) {
  const value = finiteDelta(candidateValue);
  if (value === null) return false;
  const constraint = row?.valueConstraint;
  if (!constraint) return true;
  const boundaryValue = finiteDelta(constraint.value);
  if (boundaryValue === null) return false;
  if (constraint.kind === "lower-bound") return value >= boundaryValue;
  if (constraint.kind === "upper-bound") return value <= boundaryValue;
  return false;
}

// 通常の解析成功、または有限値を利用者が明示確認した review だけを確定値とする。
// reviewConfirmed は文字列等を許容せず boolean の true だけを受け付ける。
export function isResolvedDeltaRow(row) {
  const value = finiteDelta(row?.val);
  return value !== null && isDeltaValueWithinConstraint(row, value) && (
    row?.status === "ok"
    || (row?.status === "review" && row?.reviewConfirmed === true)
  );
}

// 要確認行の候補値と確認状態を不変更新する。
// 候補値を変更した場合、同じ呼び出しで再確認しない限り以前の確認を解除する。
// reviewedAt は呼び出し側で生成した時刻を渡し、テスト可能な純粋関数に保つ。
export function updateDeltaReview(row, { value: nextValue, confirmed, reviewedAt } = {}) {
  const source = row && typeof row === "object" ? row : {};
  const hasValueUpdate = nextValue !== undefined;
  const previousValue = finiteDelta(source.val);
  const value = finiteDelta(hasValueUpdate ? nextValue : source.val);
  const valueChanged = hasValueUpdate && value !== previousValue;
  const hasConfirmationUpdate = confirmed !== undefined;
  const requestedConfirmation = hasConfirmationUpdate
    ? confirmed === true
    : (!valueChanged && source.reviewConfirmed === true);
  const reviewConfirmed = value !== null
    && isDeltaValueWithinConstraint(source, value)
    && requestedConfirmation;
  const auditTime = reviewConfirmed
    ? String(reviewedAt ?? source.reviewedAt ?? "").trim() || null
    : null;
  const valueSource = reviewConfirmed
    ? "manual-review"
    : valueChanged
      ? "manual-review-candidate"
      : source.valueSource;

  return {
    ...source,
    val: value,
    rank: value === null ? null : getRank(value).rank,
    status: value === null ? "failed" : "review",
    reviewConfirmed,
    reviewedAt: auditTime,
    valueSource,
  };
}

// 保存対象の全行に、一意な台番号と確定済みの差玉があるかを検証する。
// 未確認review・欠損値・不正statusを区別して、UIが確認待ちだけを案内できるようにする。
export function validateDeltaRows(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const rawNumbers = list.map((row) => String(row?.num ?? "").trim());
  const numbers = rawNumbers.map(normalizeMachineNumber);
  const blankNumberIndices = [];
  const invalidNumberIndices = [];
  const unresolvedIndices = [];
  const pendingReviewIndices = [];
  const confirmedReviewIndices = [];
  const missingIndices = [];
  const invalidStatusIndices = [];
  const seen = new Map();

  list.forEach((row, index) => {
    const num = numbers[index];
    if (!rawNumbers[index]) blankNumberIndices.push(index);
    else if (num === null) invalidNumberIndices.push(index);
    else {
      const indices = seen.get(num) || [];
      indices.push(index);
      seen.set(num, indices);
    }

    const value = finiteDelta(row?.val);
    if (isResolvedDeltaRow(row)) {
      if (row?.status === "review") confirmedReviewIndices.push(index);
      return;
    }

    unresolvedIndices.push(index);
    if (row?.status === "review" && value !== null) pendingReviewIndices.push(index);
    else if (value === null || row?.status === "failed") missingIndices.push(index);
    else invalidStatusIndices.push(index);
  });

  const duplicateNumbers = Array.from(seen.entries())
    .filter(([, indices]) => indices.length > 1)
    .map(([num]) => num);
  const errors = [];
  if (!list.length) errors.push("empty");
  if (blankNumberIndices.length) errors.push("blank-number");
  if (invalidNumberIndices.length) errors.push("invalid-number");
  if (duplicateNumbers.length) errors.push("duplicate-number");
  if (unresolvedIndices.length) errors.push("unresolved-delta");

  return {
    valid: errors.length === 0,
    total: list.length,
    resolvedCount: list.length - unresolvedIndices.length,
    unresolvedCount: unresolvedIndices.length,
    unresolvedIndices,
    pendingReviewIndices,
    confirmedReviewIndices,
    missingIndices,
    invalidStatusIndices,
    blankNumberIndices,
    invalidNumberIndices,
    duplicateNumbers,
    errors,
  };
}

// ホールマップの島から台番号配列を生成する。
// 複数行（ranges）・欠け（gaps）を考慮した実在の台番号だけを昇順で返す。
export function islandToNumbers(island) {
  if (!island || typeof island !== "object") return [];
  const hasRanges = Array.isArray(island.ranges) && island.ranges.length > 0;
  if (!hasRanges && (!Number.isFinite(Number(island.start)) || !Number.isFinite(Number(island.end)))) {
    return [];
  }
  const ranges = hasRanges ? island.ranges : [{ start: island.start, end: island.end }];
  const gaps = new Set((Array.isArray(island.gaps) ? island.gaps : [])
    .map(Number)
    .filter(Number.isFinite));
  const nums = [];
  for (const range of ranges) {
    const start = Number(range?.start);
    const end = Number(range?.end);
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
    const low = Math.min(start, end);
    const high = Math.max(start, end);
    for (let number = low; number <= high; number += 1) {
      if (!gaps.has(number)) nums.push(number);
    }
  }
  return [...new Set(nums)].sort((a, b) => a - b).map(String);
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

// OCRの閾値ごとの全試行や文字ごとの距離は、その場の判定にだけ必要な診断情報。
// localStorageへは結論・票数・試行数だけ残し、1スキャンごとの容量肥大を防ぐ。
function compactMachineNumberOcrForStorage(machineNumberOcr) {
  if (!machineNumberOcr || typeof machineNumberOcr !== "object") return machineNumberOcr;
  const { digits: _digits, ensemble, ...rest } = machineNumberOcr;
  if (!ensemble || typeof ensemble !== "object") return rest;
  const attemptCount = Array.isArray(ensemble.attempts)
    ? ensemble.attempts.length
    : Math.max(0, Number(ensemble.attemptCount) || 0);
  return {
    ...rest,
    ensemble: {
      candidate: ensemble.candidate ?? null,
      votes: Math.max(0, Number(ensemble.votes) || 0),
      attemptCount,
    },
  };
}

function compactDeltaRowForStorage(row) {
  if (!row || typeof row !== "object") return row;
  if (!("machineNumberOcr" in row)) return { ...row };
  return {
    ...row,
    machineNumberOcr: compactMachineNumberOcrForStorage(row.machineNumberOcr),
  };
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
    rows: Array.isArray(rows) ? rows.map(compactDeltaRowForStorage) : [],
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
