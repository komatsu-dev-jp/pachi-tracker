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

function readDataLine(line) {
  const tokens = line.items.map((item) => ({ ...item, value: parseStrictInteger(item.str) }));
  if (tokens.length !== 6 || tokens.some((token) => token.value === null)) return null;

  const [num, cumulativeStarts, normalSpins, firstHitCount, maxPayout, totalStarts] = tokens;
  // 台番号の列は通常2〜5桁。見出しや機種名中の数字をデータ行と誤認しないための安全策。
  if (num.value < 10 || num.value > 99999) return null;

  return {
    num: String(num.value),
    cumulativeStarts: cumulativeStarts.value,
    normalSpins: normalSpins.value,
    firstHitCount: firstHitCount.value,
    maxPayout: maxPayout.value,
    totalStarts: totalStarts.value,
  };
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

function looksLikeBrokenDataLine(line) {
  const tokens = line.items.map((item) => parseStrictInteger(item.str));
  return tokens.length > 0 && tokens[0] !== null && tokens[0] >= 10 && tokens[0] <= 99999;
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

  for (const page of Array.isArray(pages) ? pages : []) {
    const pageNumber = Number(page?.pageNumber) || 1;
    const lines = groupPdfTextItems(page?.items);
    let machineName = "";

    for (const line of lines) {
      const data = readDataLine(line);
      if (data) {
        const row = {
          date: String(dateText || ""),
          store: String(storeName || ""),
          island: machineName ? `${machineName}島` : "",
          machineName,
          ...data,
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
      } else if (looksLikeBrokenDataLine(line)) {
        skipped.push({
          pageNumber,
          text: line.items.map((item) => item.str.trim()).join(" "),
          reason: "6列の数値として読み取れない",
        });
      }
    }
  }

  return {
    rows,
    skipped,
    duplicates,
    pageCount: Array.isArray(pages) ? pages.length : 0,
  };
}

