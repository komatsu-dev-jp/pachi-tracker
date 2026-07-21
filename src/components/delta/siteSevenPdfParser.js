// サイトセブンの出玉情報PDFから取得した文字座標を、台ごとのデータへ整形する純粋関数。
// PDF.js 自体には依存させず、Node テストでも表の判定を確認できるようにする。

const HEADER_WORDS = [
  "台番",
  "累計スタート",
  "通常中スタート",
  "初当り回数",
  "最高出玉",
  "大当り回数",
];

const DATA_FIELD_NAMES = [
  "num",
  "cumulativeStarts",
  "normalSpins",
  "firstHitCount",
  "maxPayout",
  "totalStarts",
];

function normalizeDigits(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/[，,]/g, "")
    .trim();
}

function parseStrictInteger(value) {
  const normalized = normalizeDigits(value);
  if (!/^[+-]?\d+$/.test(normalized)) return null;
  const parsed = Number.parseInt(normalized, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function itemPosition(item) {
  const transform = Array.isArray(item?.transform) ? item.transform : [];
  return {
    str: String(item?.str ?? ""),
    x: Number.isFinite(Number(item?.x)) ? Number(item.x) : Number(transform[4]) || 0,
    y: Number.isFinite(Number(item?.y)) ? Number(item.y) : Number(transform[5]) || 0,
  };
}

// PDFでは同じ行でも文字ごとに縦位置が少しずれるため、近いY座標を1行に束ねる。
export function groupPdfTextItems(items, { yTolerance = 1.5 } = {}) {
  const positioned = (Array.isArray(items) ? items : [])
    .map(itemPosition)
    .filter((item) => item.str.trim())
    .sort((a, b) => b.y - a.y || a.x - b.x);

  const lines = [];
  for (const item of positioned) {
    let line = lines.find((candidate) => Math.abs(candidate.y - item.y) <= yTolerance);
    if (!line) {
      line = { y: item.y, items: [] };
      lines.push(line);
    }
    line.items.push(item);
    line.y = line.items.reduce((sum, current) => sum + current.y, 0) / line.items.length;
  }

  return lines
    .map((line) => ({
      ...line,
      items: line.items.sort((a, b) => a.x - b.x),
    }))
    .sort((a, b) => b.y - a.y);
}

function normalizeHeaderText(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/\s+/gu, "")
    .trim();
}

// 6列の見出しそのものをrelation schemaとして使う。単に数値が6個並んだだけの
// PDF本文やグラフ目盛りを、台データと誤認しないための固定点でもある。
function readHeaderLayout(line) {
  const pieces = line.items.map((entry) => ({
    x: entry.x,
    text: normalizeHeaderText(entry.str),
  })).filter((entry) => entry.text);
  let joined = "";
  const offsets = [];
  for (const piece of pieces) {
    offsets.push({ start: joined.length, end: joined.length + piece.text.length, x: piece.x });
    joined += piece.text;
  }

  const xPositions = [];
  for (const word of HEADER_WORDS) {
    const start = joined.indexOf(normalizeHeaderText(word));
    if (start < 0) return null;
    const source = offsets.find((entry) => start >= entry.start && start < entry.end);
    if (!source) return null;
    xPositions.push(source.x);
  }
  const hasOrderedColumns = xPositions.every((value, index) => (
    Number.isFinite(value) && (index === 0 || value > xPositions[index - 1])
  ));
  return {
    xPositions: hasOrderedColumns ? xPositions : null,
  };
}

function flatNumericParts(line) {
  return line.items.flatMap((entry) => String(entry.str ?? "")
    .trim()
    .split(/\s+/gu)
    .filter(Boolean));
}

function valuesFromColumnLayout(line, xPositions) {
  if (!Array.isArray(xPositions) || xPositions.length !== DATA_FIELD_NAMES.length) return null;
  const boundaries = xPositions.slice(0, -1)
    .map((value, index) => (value + xPositions[index + 1]) / 2);
  const cells = Array.from({ length: DATA_FIELD_NAMES.length }, () => []);

  for (const entry of line.items) {
    const fragment = String(entry.str ?? "").trim();
    // 数字を1文字ずつ返すPDF.jsの出力を想定し、符号・カンマ・数字だけを連結する。
    if (!fragment || !/^[+\-−‐‑‒–—―﹣\d０-９，,]+$/u.test(fragment)) return null;
    const columnIndex = boundaries.findIndex((boundary) => entry.x < boundary);
    cells[columnIndex < 0 ? cells.length - 1 : columnIndex].push(entry);
  }
  if (cells.some((cell) => cell.length === 0)) return null;
  return cells.map((cell) => cell
    .sort((left, right) => left.x - right.x)
    .map((entry) => entry.str)
    .join(""));
}

function validateDataValues(values) {
  if (!Array.isArray(values) || values.length !== DATA_FIELD_NAMES.length) {
    return { data: null, reason: "shape" };
  }
  const parsed = values.map(parseStrictInteger);
  if (parsed.some((value) => value === null)) return { data: null, reason: "shape" };

  const [num, cumulativeStarts, normalSpins, firstHitCount, maxPayout, totalStarts] = parsed;
  // 台番号の列は通常2〜5桁。加えて、サイトセブンの各件数は負数にならず、
  // 通常中スタートは累計スタート以下、初当りは大当り回数以下になる。
  // ここを満たさない場合は列ずれの可能性があるので、自動確定しない。
  const consistent = num >= 10 && num <= 99999
    && cumulativeStarts >= 0
    && normalSpins >= 0
    && firstHitCount >= 0
    && maxPayout >= 0
    && totalStarts >= 0
    && normalSpins <= cumulativeStarts
    && firstHitCount <= totalStarts;
  if (!consistent) return { data: null, reason: "integrity" };

  return {
    data: {
      num: String(num),
      cumulativeStarts,
      normalSpins,
      firstHitCount,
      maxPayout,
      totalStarts,
    },
    reason: null,
  };
}

function readDataLine(line, xPositions) {
  // Once the six-column header has supplied reliable X positions, column
  // membership is authoritative. Falling back to token order here could shift
  // a missing cell left and accidentally consume an unrelated trailing number.
  if (Array.isArray(xPositions) && xPositions.length === DATA_FIELD_NAMES.length) {
    return validateDataValues(valuesFromColumnLayout(line, xPositions));
  }
  const parts = flatNumericParts(line);
  // 多くのテキストPDFは1セルを1 itemで返す。まず位置に依存しない完全6列を採る。
  if (parts.length === DATA_FIELD_NAMES.length) return validateDataValues(parts);
  // 数字が1文字ずつ分割された時だけ、確認済み見出しのX座標で6セルへ戻す。
  return validateDataValues(valuesFromColumnLayout(line, xPositions));
}

function readMachineName(line) {
  const parts = line.items.filter((item) => {
    const value = parseStrictInteger(item.str);
    // 左端の「4」は貸玉レートなので機種名から除外する。
    if (item.x < 90 && value !== null && value >= 1 && value <= 10) return false;
    return true;
  });
  const text = parts.map((item) => item.str.trim()).join("").replace(/\s+/g, " ").trim();
  if (!text) return "";
  if (HEADER_WORDS.some((word) => text.includes(word))) return "";
  if (!/[A-Za-z\u3040-\u30ff\u3400-\u9fff]/.test(text)) return "";
  return text;
}

function looksLikeBrokenDataLine(line, xPositions = null) {
  const tokens = line.items.map((item) => parseStrictInteger(item.str));
  if (tokens.length > 0 && tokens[0] !== null && tokens[0] >= 10 && tokens[0] <= 99999) {
    return true;
  }
  if (!Array.isArray(xPositions) || xPositions.length < 2) return false;
  const firstBoundary = (xPositions[0] + xPositions[1]) / 2;
  const splitMachineNumber = line.items
    .filter((entry) => entry.x < firstBoundary)
    .sort((left, right) => left.x - right.x)
    .map((entry) => entry.str)
    .join("");
  const value = parseStrictInteger(splitMachineNumber);
  return value !== null && value >= 10 && value <= 99999;
}

/**
 * PDF.js の getTextContent() で得たページ配列をサイトセブンの台データへ変換する。
 * pages: [{ pageNumber, items: [{ str, transform }]}]
 */
export function parseSiteSevenTextPages(pages, { dateText = "", storeName = "" } = {}) {
  const rows = [];
  const skipped = [];
  const duplicates = [];
  const byNumber = new Map();
  let machineName = "";
  let schemaDetected = false;
  let headerCount = 0;
  let columnXPositions = null;
  let textItemCount = 0;

  for (const page of Array.isArray(pages) ? pages : []) {
    const pageNumber = Number(page?.pageNumber) || 1;
    const lines = groupPdfTextItems(page?.items);
    textItemCount += (Array.isArray(page?.items) ? page.items : [])
      .filter((entry) => String(entry?.str ?? "").trim()).length;

    for (const line of lines) {
      const headerLayout = readHeaderLayout(line);
      if (headerLayout) {
        schemaDetected = true;
        headerCount += 1;
        if (headerLayout.xPositions) columnXPositions = headerLayout.xPositions;
        continue;
      }

      const parsedLine = schemaDetected
        ? readDataLine(line, columnXPositions)
        : { data: null, reason: "schema" };
      if (parsedLine.data) {
        const row = {
          date: String(dateText || ""),
          store: String(storeName || ""),
          island: machineName ? `${machineName}島` : "",
          machineName,
          ...parsedLine.data,
          sourcePage: pageNumber,
        };

        if (byNumber.has(row.num)) {
          duplicates.push({ num: row.num, pageNumber });
          const index = rows.findIndex((current) => current.num === row.num);
          if (index >= 0) rows[index] = row;
        } else {
          rows.push(row);
        }
        byNumber.set(row.num, row);
        continue;
      }

      const title = readMachineName(line);
      if (title) {
        machineName = title;
      } else if (looksLikeBrokenDataLine(line, columnXPositions)) {
        skipped.push({
          pageNumber,
          text: line.items.map((item) => item.str.trim()).join(" "),
          reason: !schemaDetected
            ? "サイトセブン6列見出しを確認できない"
            : parsedLine.reason === "integrity"
              ? "6列の値の整合性を確認できない"
              : "6列の数値として読み取れない",
        });
      }
    }
  }

  const extractionMode = textItemCount === 0
    ? "image-only"
    : schemaDetected
      ? "text-table"
      : "unrecognized-text";
  return {
    rows,
    skipped,
    duplicates,
    pageCount: Array.isArray(pages) ? pages.length : 0,
    textItemCount,
    schemaDetected,
    headerCount,
    extractionMode,
    autoAcceptable: extractionMode === "text-table"
      && rows.length > 0
      && skipped.length === 0
      && duplicates.length === 0,
  };
}

