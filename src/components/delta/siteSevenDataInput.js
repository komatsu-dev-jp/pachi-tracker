// サイトセブンの台データを、PDF以外の入力形式からも共通行へ整形する。
// CSVは端末内だけで解析し、写真は既存のAI補助へ渡すための専用プロンプトを生成する。

const HEADER_ALIASES = Object.freeze({
  num: ["台番", "台番号", "台no", "台no."],
  cumulativeStarts: ["累計スタート", "累計回転", "累計回転数"],
  normalSpins: ["通常中スタート", "通常スタート", "通常回転", "通常回転数"],
  firstHitCount: ["初当り回数", "初当たり回数", "初当り", "初当たり"],
  maxPayout: ["最高出玉", "最大出玉", "最高持玉", "最大持玉"],
  totalStarts: ["大当り回数", "大当たり回数", "総当り回数", "総当たり回数", "総大当り"],
  machineName: ["機種名", "機種"],
});

function normalizeCell(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/^\uFEFF/u, "")
    .trim();
}

function normalizeHeader(value) {
  return normalizeCell(value)
    .toLowerCase()
    .replace(/[\s_‐‑‒–—―/／()（）【】［］[\]-]/gu, "");
}

function parseStrictInteger(value) {
  const normalized = normalizeCell(value)
    .replace(/[，,]/gu, "")
    .replace(/[−‐‑‒–—―﹣]/gu, "-");
  if (!/^[+-]?\d+$/u.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function delimiterScore(text, delimiter) {
  const rows = parseDelimitedRows(text, delimiter).slice(0, 30);
  if (!rows.length) return 0;
  const widths = rows.map((row) => row.length).filter((width) => width > 1);
  if (!widths.length) return 0;
  const frequency = new Map();
  for (const width of widths) frequency.set(width, (frequency.get(width) || 0) + 1);
  const [modeWidth, modeCount] = [...frequency.entries()]
    .sort((left, right) => right[1] - left[1] || right[0] - left[0])[0];
  return modeCount * Math.min(modeWidth, 12);
}

export function detectSiteSevenDelimiter(text) {
  const candidates = [",", "\t", ";"];
  return [...candidates]
    .map((delimiter) => ({ delimiter, score: delimiterScore(text, delimiter) }))
    .sort((left, right) => right.score - left.score)[0]?.delimiter || ",";
}

// RFC 4180相当の引用符・引用符内改行・二重引用符を扱う小さなCSVパーサー。
export function parseDelimitedRows(text, delimiter = ",") {
  const source = String(text ?? "").replace(/^\uFEFF/u, "");
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quoted) {
      if (char === '"' && source[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"' && cell === "") {
      quoted = true;
    } else if (char === delimiter) {
      row.push(cell);
      cell = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && source[index + 1] === "\n") index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function headerKey(value) {
  const normalized = normalizeHeader(value);
  for (const [key, aliases] of Object.entries(HEADER_ALIASES)) {
    if (aliases.some((alias) => normalized === normalizeHeader(alias))) return key;
  }
  return null;
}

function headerMap(row) {
  const mapped = {};
  row.forEach((cell, index) => {
    const key = headerKey(cell);
    if (key && mapped[key] === undefined) mapped[key] = index;
  });
  return mapped;
}

function isUsableHeader(mapped) {
  return Number.isInteger(mapped.num)
    && Number.isInteger(mapped.normalSpins)
    && Number.isInteger(mapped.totalStarts);
}

function cellAt(row, index) {
  return Number.isInteger(index) ? row[index] : "";
}

export function parseSiteSevenCsvText(text, { dateText = "", storeName = "", fileName = "" } = {}) {
  const delimiter = detectSiteSevenDelimiter(text);
  const records = parseDelimitedRows(text, delimiter);
  const rows = [];
  const skipped = [];
  const duplicates = [];
  const byNumber = new Map();
  let columns = null;

  records.forEach((record, recordIndex) => {
    const mapped = headerMap(record);
    if (isUsableHeader(mapped)) {
      columns = mapped;
      return;
    }
    if (!columns || record.every((cell) => !normalizeCell(cell))) return;

    const rawNum = normalizeCell(cellAt(record, columns.num));
    if (["平均", "合計", "総計"].includes(rawNum)) return;
    const num = parseStrictInteger(rawNum);
    const normalSpins = parseStrictInteger(cellAt(record, columns.normalSpins));
    const totalStarts = parseStrictInteger(cellAt(record, columns.totalStarts));
    if (num === null && normalSpins === null && totalStarts === null) return;
    if (num === null || num < 0 || normalSpins === null || totalStarts === null) {
      skipped.push({
        lineNumber: recordIndex + 1,
        text: record.map(normalizeCell).join(delimiter),
        reason: "台番号・通常中スタート・大当り回数を数値として読み取れない",
      });
      return;
    }

    const machineName = normalizeCell(cellAt(record, columns.machineName));
    const row = {
      date: String(dateText || ""),
      store: String(storeName || ""),
      island: machineName ? `${machineName}島` : "",
      machineName,
      num: String(num),
      normalSpins,
      totalStarts,
      sourceFile: String(fileName || ""),
      sourceLine: recordIndex + 1,
    };
    const optionalIntegers = [
      ["cumulativeStarts", columns.cumulativeStarts],
      ["firstHitCount", columns.firstHitCount],
      ["maxPayout", columns.maxPayout],
    ];
    for (const [key, index] of optionalIntegers) {
      const value = parseStrictInteger(cellAt(record, index));
      if (value !== null) row[key] = value;
    }

    if (byNumber.has(row.num)) {
      duplicates.push({ num: row.num, lineNumber: recordIndex + 1 });
      const previousIndex = rows.findIndex((current) => current.num === row.num);
      if (previousIndex >= 0) rows[previousIndex] = row;
    } else {
      rows.push(row);
    }
    byNumber.set(row.num, row);
  });

  if (!columns) {
    throw new Error("CSVの見出しを確認できません。『台番』『通常中スタート』『大当り回数』の列が必要です");
  }
  if (!rows.length) {
    throw new Error("CSVから台データを見つけられませんでした");
  }

  return { rows, skipped, duplicates, delimiter, rowCount: records.length };
}

export function decodeSiteSevenCsvBytes(bytes) {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  try {
    return {
      text: new TextDecoder("utf-8", { fatal: true }).decode(data),
      encoding: "UTF-8",
    };
  } catch {
    try {
      return {
        text: new TextDecoder("shift_jis", { fatal: true }).decode(data),
        encoding: "Shift_JIS",
      };
    } catch {
      throw new Error("CSVの文字コードを読み取れません。UTF-8またはShift_JISで保存してください");
    }
  }
}

export async function readSiteSevenCsv(file, options = {}) {
  if (!file || typeof file.arrayBuffer !== "function") {
    throw new Error("CSVファイルを選んでください");
  }
  const decoded = decodeSiteSevenCsvBytes(new Uint8Array(await file.arrayBuffer()));
  return {
    ...parseSiteSevenCsvText(decoded.text, { ...options, fileName: file.name || "" }),
    encoding: decoded.encoding,
  };
}

export function parseSiteSevenEditableInteger(value) {
  const normalized = normalizeCell(value).replace(/[，,]/gu, "");
  if (!/^-?\d+$/u.test(normalized)) return null;
  const parsed = Number.parseInt(normalized, 10);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export function prepareSiteSevenImportedRows(rows, { expectedNumbers = [] } = {}) {
  const candidates = [];
  let invalidCount = 0;
  let reviewPendingCount = 0;
  for (const row of Array.isArray(rows) ? rows : []) {
    if (row?.reviewRequired && !row?.reviewConfirmed) {
      reviewPendingCount += 1;
      continue;
    }
    const num = parseSiteSevenEditableInteger(row?.num);
    const normalSpins = parseSiteSevenEditableInteger(row?.normalSpins);
    const totalStarts = parseSiteSevenEditableInteger(row?.totalStarts);
    if (num === null || num <= 0 || normalSpins === null || normalSpins < 0
      || totalStarts === null || totalStarts < 0) {
      invalidCount += 1;
      continue;
    }
    const machineName = String(row?.machineName || "").trim();
    candidates.push({
      ...row,
      num: String(num),
      machineName,
      island: machineName ? `${machineName}島` : "",
      normalSpins,
      totalStarts,
    });
  }
  const expectedSet = new Set((Array.isArray(expectedNumbers) ? expectedNumbers : [])
    .map((value) => parseSiteSevenEditableInteger(value))
    .filter((value) => value !== null && value > 0)
    .map(String));
  const counts = new Map();
  for (const row of candidates) counts.set(row.num, (counts.get(row.num) || 0) + 1);
  const duplicateNumbers = new Set([...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([num]) => num));
  const unexpectedNumbers = new Set(candidates
    .map((row) => row.num)
    .filter((num) => expectedSet.size > 0 && !expectedSet.has(num)));
  const valid = candidates.filter((row) => (
    !duplicateNumbers.has(row.num) && !unexpectedNumbers.has(row.num)
  ));
  return {
    rows: valid,
    invalidCount,
    reviewPendingCount,
    duplicateCount: duplicateNumbers.size,
    duplicateNumbers: [...duplicateNumbers],
    unexpectedCount: unexpectedNumbers.size,
    unexpectedNumbers: [...unexpectedNumbers],
  };
}

const SITE_SEVEN_SOURCE_PRIORITY = Object.freeze({ pdf: 3, csv: 3, image: 1 });

function sameImportedValues(left, right) {
  return String(left?.normalSpins ?? "") === String(right?.normalSpins ?? "")
    && String(left?.totalStarts ?? "") === String(right?.totalStarts ?? "")
    && (left?.maxPayout == null || right?.maxPayout == null
      || String(left.maxPayout) === String(right.maxPayout));
}

function appendReviewReason(row, reason, { rejectJointEvidence = false } = {}) {
  const reasons = [row?.reviewReason, reason].filter(Boolean);
  return {
    ...row,
    reviewRequired: true,
    reviewConfirmed: false,
    reviewReason: [...new Set(reasons)].join("。"),
    ...(rejectJointEvidence ? { jointEvidenceRejected: true } : {}),
  };
}

export function mergeSiteSevenParsedResults(resultEntries, { expectedNumbers = [] } = {}) {
  const entries = (Array.isArray(resultEntries) ? resultEntries : [])
    .map((entry, index) => ({ ...entry, index }))
    .sort((left, right) => (
      (SITE_SEVEN_SOURCE_PRIORITY[right.kind] || 0)
      - (SITE_SEVEN_SOURCE_PRIORITY[left.kind] || 0)
      || left.index - right.index
    ));
  const rows = [];
  const firstIndexByNumber = new Map();
  let duplicateOccurrenceCount = 0;
  const duplicateNumbers = new Set();
  let sourceSkippedCount = 0;

  for (const { result, kind } of entries) {
    const sourceDuplicates = Array.isArray(result?.duplicates) ? result.duplicates : [];
    const sourceDuplicateNumbers = new Set(sourceDuplicates
      .map((duplicate) => parseSiteSevenEditableInteger(duplicate?.num))
      .filter((num) => num !== null && num >= 0)
      .map(String));
    for (const num of sourceDuplicateNumbers) duplicateNumbers.add(num);
    sourceSkippedCount += Array.isArray(result?.skipped) ? result.skipped.length : 0;
    duplicateOccurrenceCount += sourceDuplicates.length;
    for (const rawRow of result?.rows || []) {
      const parsedNum = parseSiteSevenEditableInteger(rawRow?.num);
      let candidate = {
        ...rawRow,
        num: parsedNum === null ? String(rawRow?.num ?? "") : String(parsedNum),
        importKind: kind,
        reviewConfirmed: rawRow?.reviewConfirmed === true,
      };
      if (parsedNum !== null && sourceDuplicateNumbers.has(String(parsedNum))) {
        candidate = appendReviewReason(
          candidate,
          `元資料内で台${parsedNum}が重複しています。採用する数値を確認してください`,
          { rejectJointEvidence: true },
        );
      }
      if (parsedNum === null || parsedNum < 0) {
        rows.push(candidate);
        continue;
      }

      const key = String(parsedNum);
      const existingIndex = firstIndexByNumber.get(key);
      if (existingIndex === undefined) {
        firstIndexByNumber.set(key, rows.length);
        rows.push(candidate);
        continue;
      }

      duplicateOccurrenceCount += 1;
      duplicateNumbers.add(key);
      const existing = rows[existingIndex];
      if (sameImportedValues(existing, candidate)) {
        if (!existing.machineName && candidate.machineName) {
          rows[existingIndex] = { ...existing, machineName: candidate.machineName };
        }
        continue;
      }

      // 同じ写真内で台番号が重複した要確認行は両方を残し、利用者が正しい台番号へ直せるようにする。
      if (existing.importKind === "image" && candidate.importKind === "image"
        && existing.reviewRequired && candidate.reviewRequired) {
        rows.push(candidate);
        continue;
      }

      const conflictReason = `台${key}の数値が${existing.importKind.toUpperCase()}と${String(kind).toUpperCase()}で一致しません。元資料を確認してください`;
      rows[existingIndex] = appendReviewReason(existing, conflictReason, {
        rejectJointEvidence: true,
      });
    }
  }

  const expected = [...new Set((Array.isArray(expectedNumbers) ? expectedNumbers : [])
    .map((value) => parseSiteSevenEditableInteger(value))
    .filter((value) => value !== null && value >= 0)
    .map(String))];
  const recognizedCount = rows.length;
  const missingNumbers = expected.filter((num) => !rows.some((row) => String(row.num) === num));
  // 誤読した余分な行が1件あると rows.length 自体は期待件数と同じになる。
  // 件数差だけで補完数を決めると、本当に欠けた台の修正欄が作られないため、
  // 期待番号ごとの不足をすべて独立した確認行として残す。
  for (const num of missingNumbers) {
    rows.push({
      num,
      normalSpins: "",
      totalStarts: "",
      machineName: "",
      island: "",
      sourceType: "missing-placeholder",
      importKind: "image",
      reviewRequired: true,
      reviewConfirmed: false,
      reviewReason: `選択した資料から台${num}の行を確認できませんでした。元資料を見て数値を入力してください`,
    });
  }

  return {
    rows,
    duplicateCount: duplicateNumbers.size,
    duplicateOccurrenceCount,
    duplicateNumbers: [...duplicateNumbers].sort((left, right) => Number(left) - Number(right)),
    sourceSkippedCount,
    recognizedCount,
    reviewCount: rows.filter((row) => row.reviewRequired && !row.reviewConfirmed).length,
    missingNumbers,
  };
}

export function classifySiteSevenFile(file) {
  const name = String(file?.name || "").toLowerCase();
  const type = String(file?.type || "").toLowerCase();
  if (type === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  if (type.startsWith("image/") || /\.(?:jpe?g|png|webp)$/u.test(name)) return "image";
  if (["text/csv", "text/tab-separated-values", "application/vnd.ms-excel"].includes(type)
    || /\.(?:csv|tsv)$/u.test(name)) return "csv";
  return null;
}
