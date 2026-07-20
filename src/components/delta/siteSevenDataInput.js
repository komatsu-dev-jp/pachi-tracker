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

export function classifySiteSevenFile(file) {
  const name = String(file?.name || "").toLowerCase();
  const type = String(file?.type || "").toLowerCase();
  if (type === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  if (type.startsWith("image/") || /\.(?:jpe?g|png|webp)$/u.test(name)) return "image";
  if (["text/csv", "text/tab-separated-values", "application/vnd.ms-excel"].includes(type)
    || /\.(?:csv|tsv)$/u.test(name)) return "csv";
  return null;
}

export function buildSiteSevenImageOcrPrompt({ dateText = "", storeName = "", expectedNumbers = [] } = {}) {
  const numbers = (Array.isArray(expectedNumbers) ? expectedNumbers : [])
    .map((value) => String(value ?? "").trim())
    .filter((value) => /^\d+$/u.test(value));
  const numberHint = numbers.length
    ? `\n【照合対象の台番号】\n${numbers.join(", ")}\nこの一覧は照合だけに使い、画像にない行を作らないでください。`
    : "";
  return `添付画像はサイトセブンの台データ表です。画像に実際に表示されている各台を正確に読み取ってください。
【出力形式】
・1行につき1台、タブ区切り7列
・列順は 日付 / 店舗名 / 島名 / 機種名 / 台番号 / 通常回転数 / 総当り回数
・見出し、説明、Markdown、コードブロックは出力しない
・日付は「${dateText}」、店舗名は「${storeName}」を全行に入れる
・通常回転数は「通常中スタート」の列を使う
・総当り回数は「大当り回数」の列を使い、「初当り回数」と取り違えない
・機種名が画像にない場合、島名と機種名は空欄のままタブ2つで表す
・平均行とチェックボックス列は出力しない
・読めない数字を推測しない。1項目でも確実に読めない行は出力しない
・全角数字やカンマは使わず半角整数にする${numberHint}`;
}
