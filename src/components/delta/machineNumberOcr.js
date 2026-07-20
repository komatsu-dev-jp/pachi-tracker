// SiteSeven のグラフ枠直上にある「[台番号]」専用の軽量 OCR。
// 外部 OCR や AI を使わず、deltaEngine が検出した各グラフ枠を基準に
// 文字領域を切り出し、連結成分とビットマップテンプレートで3桁を読む。

const LABEL_WIDTH = 394;
const LABEL_HEIGHT = 48;
const REFERENCE_PANEL_WIDTH = 366;
const LABEL_LEFT_FROM_PANEL_CENTER = 197;
const LABEL_TOP_FROM_PANEL = 55;
const DARK_THRESHOLD = 120;
const NORMALIZED_DIGIT_WIDTH = 24;
const NORMALIZED_DIGIT_HEIGHT = 32;
const NORMALIZED_DIGIT_PIXELS = NORMALIZED_DIGIT_WIDTH * NORMALIZED_DIGIT_HEIGHT;

export const MACHINE_NUMBER_OCR_CONFIG = Object.freeze({
  maximumDistance: 0.25,
  minimumMargin: 0.015,
  darkThreshold: DARK_THRESHOLD,
  darkThresholds: Object.freeze([100, 115, 120, 130, 145, 160]),
});

// 804px幅のSiteSeven画像から採取した数字フォントの二値テンプレート。
// a: 元グリフの幅/高さ、b: 24x32bitをMSB先頭で詰めたBase64。
// 同じ数字に2種類あるものは、文字のサブピクセル位置による描画差を保持している。
const PACKED_DIGIT_TEMPLATES = [
  [
    { a: 0.65, b: "A//AA//AD//wPgHwPgHwPAB8/AA8/AA88AA88AA88AA88AA88AA88AA88AA/8AA/8AA/8AA/8AA88AA88AA88AA88AA88AA8PAA8PAA8PAB8P4HwP4HwD//AAf+AAf+A" },
    { a: 0.65, b: "A//AA//AD//wD4B8D4B8PgA8PAA8PAA8PAAPPAAPPAAP/AAP/AAP/AAPPAAPPAAP/AAP/AAP/AAPPAAPPAAPPAAPPAA/PAA/PAA8PAA8PgA8D4H8D4H8A//wAf+AAf+A" },
  ],
  [
    { a: 0.333333, b: "AAAHAAAHAAB/AAB/AAB/AD//Af//Af///////8B//8B/4AB/AAB/AAB/AAB/AAB/AAB/AAB/AAB/AAB/AAB/AAB/AAB/AAB/AAB/AAB/AAB/AAB/AAB/AAB/AAB/AAB/" },
    { a: 0.35, b: "AAB/AAB/AAP/AD//AD//H////////////8B//8B/4AB/AAB/AAB/AAB/AAB/AAB/AAB/AAB/AAB/AAB/AAB/AAB/AAB/AAB/AAB/AAB/AAB/AAB/AAB/AAB/AAB/AAB/AAB/" },
  ],
  [
    { a: 0.6, b: "A//wA//wP//8PwA/PwA//AAP8AAP8AAPMAAPMAAPAAAPAAA/AAA/AAA8AAD8AAD8AAPwAAPwAD/AAP8AAP8AA/wAD/AAD/AAPwAAPwAAPAAA////////////////////" },
    { a: 0.65, b: "A//wA//wD//8PgB8PgB8PAA/PAAPPAAPPAAPPAAPAAA/AAA/AAA/AAB8AAHwAAHwAAfAAAfAAB+AAH4AAH4AAfgAA+AAA+AAD4AAD4AAPgAA////////////////////" },
  ],
  [
    { a: 0.65, b: "A/+AA/+AP//wPgHwPgHw/ABw8AB88AB8AAB8AAB8AABwAAHwAAHwAH/AAH/wAH/wAAH8AAH8AAA8AAA/AAA/AAA/8AA/8AA/8AA88AA8/AB8PgH8PgH8D//wA/+AA/+A" },
  ],
  [
    { a: 0.7, b: "AAHgAAHgAAPgAA/gAA/gAD/gAD/gAD/gAHHgAHHgAfHgAcHgAcHgB4HgHgHgHgHgPgHgPgHgOAHg+AHg+AHg////////////AAHgAAHgAAHgAAHgAAHgAAHgAAHgAAHg" },
  ],
  [
    { a: 0.65, b: "D//8D//8D//8DgAADgAADgAAPAAAPAAAPAAAPAAAPH4AP//AP//AP//w/AB8/AB8AAA/AAA/AAA/AAAPAAAPAAAP8AA/8AA//AA8/AA8/AB8PgHwPgHwD//wA/+AA/+A" },
    { a: 0.6, b: "D//8D//8P//8PwAAPwAAPAAAPAAAPAAAPAAAPAAAPD8A///w///w///8/AD//AD/MAA/MAA/AAAPAAAPAAAPAAAP8AAP8AAP8AAP8AAP/AA//wD8/wD8P//wA//AA//A" },
  ],
  [
    { a: 0.65, b: "A//AA//AD//wPgB8PgB8PAA8PAA8PAA88AAA8AAA8AAA8f/A8f/A///w/gH8/gH8/AA8/AA8/AA88AA/8AA/8AA/8AA/8AA//AA8/AA8PAB8P4HwP4HwD//wAf+AAf+A" },
    { a: 0.65, b: "Af/wAf/wA//8D4B8D4B8PgA/PAAPPAAPPAAAPAAAPAAA8f/A8f/A///8/4B8/4B8/gA//gA//AAP/AAP/AAP/AAPPAAPPAAPPAAPPAAPPgA8D4B8D4B8A//wAf/AAf/A" },
  ],
  [
    { a: 0.65, b: "////////////AAB8AAB8AABwAAHwAAHwAAfAAAfAAAeAAB+AAB+AAB4AAH4AAH4AAHgAAHgAAHgAAfgAAfgAAeAAAeAAAeAAA+AAA+AAA4AAA4AAA4AAA4AAA4AAA4AA" },
    { a: 0.6, b: "////////////AAD/AAD/AAD8AADwAADwAAPwAAPwAA/AAA8AAA8AAD8AADwAADwAAPwAAPwAAPAAAPAAAPAAA/AAA8AAA8AAA8AAA8AAA8AAA8AAA8AAD8AAA8AAA8AA" },
  ],
  [
    { a: 0.65, b: "A//AA//AD//wPgBwPgBwPAB8PAA8PAA8PAA8PAA8PAB8P4HwP4HwD//AD//wD//wPgH8PgH8/AA88AA/8AA/8AA/8AA/8AA/8AA/8AA//AA8PgH8PgH8D//wA/+AA/+A" },
    { a: 0.65, b: "A//AA//AD//wDgB8DgB8PgA8PgA8PgA8PAA8PAA8PgA8D4H8D4H8A//wD//wD//wP4B8P4B8PAA//AAP/AAP/AAP/AAP/AAPPAAPPAAPPgA/P4B8P4B8D//wAf/AAf/A" },
  ],
  [
    { a: 0.65, b: "A/+AA/+AP//wPgBwPgBw/AA88AA88AA88AA88AA88AA/8AA/8AA//AA//AB//AB/P4H/P4H/D///A/4PA/4PAAA8AAA8AAA88AA88AA8PABwPgHwPgHwD//AA/+AA/+A" },
  ],
];

function decodePackedBits(value) {
  if (typeof globalThis.atob !== "function") {
    throw new Error("Base64 decoder is unavailable");
  }
  const packed = globalThis.atob(value);
  const bits = new Uint8Array(NORMALIZED_DIGIT_PIXELS);
  for (let index = 0; index < bits.length; index += 1) {
    bits[index] = (packed.charCodeAt(index >> 3) >> (7 - (index & 7))) & 1;
  }
  return bits;
}

const DIGIT_TEMPLATES = PACKED_DIGIT_TEMPLATES.map((templates) => (
  templates.map((template) => ({
    aspect: template.a,
    bits: decodePackedBits(template.b),
  }))
));

const clamp01 = (value) => Math.max(0, Math.min(1, value));

function finiteBox(panel) {
  const source = panel?.bbox && typeof panel.bbox === "object" ? panel.bbox : panel;
  const x = Number(source?.x);
  const y = Number(source?.y);
  const width = Number(source?.width);
  const height = Number(source?.height);
  if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return null;
  return { x, y, width, height };
}

function sampleChannel(data, width, height, x, y, channel) {
  // 先頭行では台番号ラベルが画像上端ぎりぎりに置かれ、理論上の切り出し枠が
  // 数pxだけ画像外へ出ることがある。画像外を端の画素で引き延ばすと黒文字が
  // 増殖するため、白背景として補完する。
  if (x < 0 || y < 0 || x > width - 1 || y > height - 1) return 255;
  const x0 = Math.max(0, Math.min(width - 1, Math.floor(x)));
  const y0 = Math.max(0, Math.min(height - 1, Math.floor(y)));
  const x1 = Math.min(width - 1, x0 + 1);
  const y1 = Math.min(height - 1, y0 + 1);
  const xWeight = Math.max(0, Math.min(1, x - Math.floor(x)));
  const yWeight = Math.max(0, Math.min(1, y - Math.floor(y)));
  const topLeft = data[(y0 * width + x0) * 4 + channel];
  const topRight = data[(y0 * width + x1) * 4 + channel];
  const bottomLeft = data[(y1 * width + x0) * 4 + channel];
  const bottomRight = data[(y1 * width + x1) * 4 + channel];
  const top = topLeft + (topRight - topLeft) * xWeight;
  const bottom = bottomLeft + (bottomRight - bottomLeft) * xWeight;
  return top + (bottom - top) * yWeight;
}

function createLabelMask(data, imageWidth, imageHeight, bbox, threshold) {
  const scale = bbox.width / REFERENCE_PANEL_WIDTH;
  const cropWidth = LABEL_WIDTH * scale;
  const cropHeight = LABEL_HEIGHT * scale;
  const cropX = bbox.x + bbox.width / 2 - LABEL_LEFT_FROM_PANEL_CENTER * scale;
  const cropY = bbox.y - LABEL_TOP_FROM_PANEL * scale;
  const cropRight = cropX + cropWidth;
  const cropBottom = cropY + cropHeight;
  const horizontalPadding = cropWidth * 0.2;
  const verticalPadding = cropHeight * 0.45;
  const hasIntersection = cropRight > 0 && cropBottom > 0
    && cropX < imageWidth && cropY < imageHeight;
  if (scale < 0.2 || scale > 4 || !hasIntersection
    || cropX < -horizontalPadding || cropY < -verticalPadding
    || cropRight > imageWidth + horizontalPadding
    || cropBottom > imageHeight + verticalPadding) {
    return { mask: null, bbox: { x: cropX, y: cropY, width: cropWidth, height: cropHeight } };
  }

  const mask = new Uint8Array(LABEL_WIDTH * LABEL_HEIGHT);
  for (let targetY = 0; targetY < LABEL_HEIGHT; targetY += 1) {
    const sourceY = cropY + (targetY + 0.5) * scale - 0.5;
    for (let targetX = 0; targetX < LABEL_WIDTH; targetX += 1) {
      const sourceX = cropX + (targetX + 0.5) * scale - 0.5;
      const r = sampleChannel(data, imageWidth, imageHeight, sourceX, sourceY, 0);
      const g = sampleChannel(data, imageWidth, imageHeight, sourceX, sourceY, 1);
      const b = sampleChannel(data, imageWidth, imageHeight, sourceX, sourceY, 2);
      if (r < threshold && g < threshold && b < threshold) {
        mask[targetY * LABEL_WIDTH + targetX] = 1;
      }
    }
  }
  return { mask, bbox: { x: cropX, y: cropY, width: cropWidth, height: cropHeight } };
}

function connectedComponents(mask) {
  const visited = new Uint8Array(mask.length);
  const components = [];
  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || visited[start]) continue;
    const queue = [start];
    visited[start] = 1;
    const pixels = [];
    let minX = LABEL_WIDTH;
    let maxX = -1;
    let minY = LABEL_HEIGHT;
    let maxY = -1;

    for (let queueIndex = 0; queueIndex < queue.length; queueIndex += 1) {
      const point = queue[queueIndex];
      const y = Math.floor(point / LABEL_WIDTH);
      const x = point - y * LABEL_WIDTH;
      pixels.push([x, y]);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);

      for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
        const nextY = y + offsetY;
        if (nextY < 0 || nextY >= LABEL_HEIGHT) continue;
        for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
          if (offsetX === 0 && offsetY === 0) continue;
          const nextX = x + offsetX;
          if (nextX < 0 || nextX >= LABEL_WIDTH) continue;
          const next = nextY * LABEL_WIDTH + nextX;
          if (mask[next] && !visited[next]) {
            visited[next] = 1;
            queue.push(next);
          }
        }
      }
    }

    const width = maxX - minX + 1;
    const height = maxY - minY + 1;
    if (pixels.length >= 8 && height >= 7 && height <= 35 && width <= 24
      && maxX >= 130 && minX <= 264) {
      components.push({
        x: minX,
        y: minY,
        width,
        height,
        pixels: pixels.map(([x, y]) => [x - minX, y - minY]),
      });
    }
  }
  return components.sort((left, right) => left.x - right.x);
}

function validLabelGeometry(components) {
  if (components.length !== 5) return { valid: false, reason: "label-component-count" };
  const [openBracket, ...rest] = components;
  const closeBracket = rest[rest.length - 1];
  const digits = rest.slice(0, 3);
  const bracketValid = [openBracket, closeBracket].every((component) => (
    component.width >= 2 && component.width <= 8
    && component.height >= 23 && component.height <= 31
  ));
  if (!bracketValid) return { valid: false, reason: "invalid-brackets" };

  const digitsValid = digits.every((component) => (
    component.width >= 4 && component.width <= 15
    && component.height >= 17 && component.height <= 24
  ));
  if (!digitsValid) return { valid: false, reason: "invalid-digit-geometry" };

  const groupLeft = openBracket.x;
  const groupRight = closeBracket.x + closeBracket.width;
  const center = (groupLeft + groupRight) / 2;
  const digitTop = Math.min(...digits.map((component) => component.y));
  const digitBottom = Math.max(...digits.map((component) => component.y + component.height - 1));
  if (Math.abs(center - LABEL_WIDTH / 2) > 10
    || openBracket.y > digitTop + 1 || closeBracket.y > digitTop + 1
    || openBracket.y + openBracket.height - 1 < digitBottom + 3
    || closeBracket.y + closeBracket.height - 1 < digitBottom + 3) {
    return { valid: false, reason: "invalid-label-layout" };
  }
  return { valid: true, digits };
}

function normalizeDigit(component) {
  const source = new Uint8Array(component.width * component.height);
  for (const [x, y] of component.pixels) source[y * component.width + x] = 1;
  const bits = new Uint8Array(NORMALIZED_DIGIT_PIXELS);
  for (let targetY = 0; targetY < NORMALIZED_DIGIT_HEIGHT; targetY += 1) {
    const sourceY = Math.min(component.height - 1, Math.max(0, Math.round(
      (targetY + 0.5) * component.height / NORMALIZED_DIGIT_HEIGHT - 0.5,
    )));
    for (let targetX = 0; targetX < NORMALIZED_DIGIT_WIDTH; targetX += 1) {
      const sourceX = Math.min(component.width - 1, Math.max(0, Math.round(
        (targetX + 0.5) * component.width / NORMALIZED_DIGIT_WIDTH - 0.5,
      )));
      bits[targetY * NORMALIZED_DIGIT_WIDTH + targetX] = source[sourceY * component.width + sourceX];
    }
  }
  return { bits, aspect: component.width / component.height };
}

function templateDistance(candidate, template) {
  let differentPixels = 0;
  for (let index = 0; index < candidate.bits.length; index += 1) {
    differentPixels += candidate.bits[index] ^ template.bits[index];
  }
  const shapeDistance = differentPixels / candidate.bits.length;
  const aspectDistance = Math.abs(Math.log(candidate.aspect / template.aspect));
  return shapeDistance + aspectDistance * 0.35;
}

function classifyDigit(component) {
  const normalized = normalizeDigit(component);
  const distances = DIGIT_TEMPLATES.map((templates, digit) => ({
    digit,
    distance: Math.min(...templates.map((template) => templateDistance(normalized, template))),
  })).sort((left, right) => left.distance - right.distance);
  const best = distances[0];
  const second = distances[1];
  return {
    candidate: String(best.digit),
    bestDistance: best.distance,
    secondDistance: second.distance,
    margin: second.distance - best.distance,
  };
}

function failedPanel(reasonCodes, labelBbox = null, extra = {}) {
  return {
    accepted: false,
    status: "failed",
    reasonCodes: [...new Set(reasonCodes)],
    candidate: null,
    confidence: 0,
    bestDistance: null,
    margin: null,
    digits: [],
    labelBbox,
    ...extra,
  };
}

function readPanelMachineNumberAtThreshold(data, width, height, panel, options = {}) {
  if (!data || !Number.isInteger(width) || !Number.isInteger(height)
    || width < 2 || height < 2 || data.length < width * height * 4) {
    return failedPanel(["invalid-image"]);
  }
  const bbox = finiteBox(panel);
  if (!bbox) return failedPanel(["invalid-panel"]);

  const maximumDistance = Number.isFinite(options.maximumDistance)
    ? options.maximumDistance : MACHINE_NUMBER_OCR_CONFIG.maximumDistance;
  const minimumMargin = Number.isFinite(options.minimumMargin)
    ? options.minimumMargin : MACHINE_NUMBER_OCR_CONFIG.minimumMargin;
  const threshold = Number.isFinite(options.darkThreshold)
    ? options.darkThreshold : MACHINE_NUMBER_OCR_CONFIG.darkThreshold;
  const sampled = createLabelMask(data, width, height, bbox, threshold);
  if (!sampled.mask) return failedPanel(["label-out-of-bounds"], sampled.bbox);
  const components = connectedComponents(sampled.mask);
  const geometry = validLabelGeometry(components);
  if (!geometry.valid) {
    return failedPanel([geometry.reason], sampled.bbox, { componentCount: components.length });
  }

  const digits = geometry.digits.map(classifyDigit);
  const candidate = digits.map((digit) => digit.candidate).join("");
  const bestDistance = Math.max(...digits.map((digit) => digit.bestDistance));
  const margin = Math.min(...digits.map((digit) => digit.margin));
  const reasonCodes = [];
  if (bestDistance > maximumDistance) reasonCodes.push("low-template-score");
  if (margin < minimumMargin) reasonCodes.push("ambiguous-digit");
  const accepted = reasonCodes.length === 0;
  const distanceQuality = clamp01(1 - bestDistance / maximumDistance);
  const marginQuality = clamp01(margin / Math.max(minimumMargin * 5, 0.075));
  const confidence = Math.round((distanceQuality * 0.65 + marginQuality * 0.35) * 1000) / 1000;

  return {
    accepted,
    status: accepted ? "ok" : "review",
    reasonCodes,
    candidate,
    confidence,
    bestDistance,
    margin,
    digits,
    componentCount: components.length,
    labelBbox: sampled.bbox,
  };
}

function compactAttempt(attempt, darkThreshold) {
  return {
    darkThreshold,
    accepted: attempt.accepted,
    candidate: attempt.candidate,
    confidence: attempt.confidence,
    bestDistance: attempt.bestDistance,
    margin: attempt.margin,
    reasonCodes: attempt.reasonCodes,
    componentCount: attempt.componentCount,
  };
}

function mostFrequentCandidate(attempts) {
  const counts = new Map();
  for (const attempt of attempts) {
    if (!/^\d{3}$/.test(String(attempt?.candidate || ""))) continue;
    counts.set(attempt.candidate, (counts.get(attempt.candidate) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0] || null;
}

// JPEG縮小画像では1つの閾値だけだと「5」と「8」の穴が潰れるなど、同じ数字が
// 二値化条件だけで入れ替わる。複数閾値で同じ候補が再現した場合だけ自動確定し、
// 合意しない候補は手動照合用に残す。
export function readPanelMachineNumber(data, width, height, panel, options = {}) {
  if (Number.isFinite(options.darkThreshold)) {
    return readPanelMachineNumberAtThreshold(data, width, height, panel, options);
  }

  const bbox = finiteBox(panel);
  if (!bbox || !data || !Number.isInteger(width) || !Number.isInteger(height)
    || width < 2 || height < 2 || data.length < width * height * 4) {
    return readPanelMachineNumberAtThreshold(data, width, height, panel, {
      ...options,
      darkThreshold: MACHINE_NUMBER_OCR_CONFIG.darkThreshold,
    });
  }

  const thresholds = Array.isArray(options.darkThresholds) && options.darkThresholds.length
    ? options.darkThresholds.filter(Number.isFinite)
    : MACHINE_NUMBER_OCR_CONFIG.darkThresholds;
  const attempts = thresholds.map((darkThreshold) => ({
    darkThreshold,
    result: readPanelMachineNumberAtThreshold(data, width, height, panel, {
      ...options,
      darkThreshold,
    }),
  }));
  const acceptedAttempts = attempts.filter((attempt) => attempt.result.accepted);
  const acceptedCandidates = new Set(acceptedAttempts.map((attempt) => attempt.result.candidate));
  const preferredCandidate = mostFrequentCandidate(acceptedAttempts.map((attempt) => attempt.result));
  const preferredVotes = acceptedAttempts.filter((attempt) => (
    attempt.result.candidate === preferredCandidate
  ));
  const scale = bbox.width / REFERENCE_PANEL_WIDTH;
  const minimumVotes = scale < 0.75 ? 2 : 1;

  if (preferredCandidate && acceptedCandidates.size === 1 && preferredVotes.length >= minimumVotes) {
    const best = [...preferredVotes].sort((left, right) => (
      right.result.confidence - left.result.confidence
      || left.result.bestDistance - right.result.bestDistance
    ))[0].result;
    return {
      ...best,
      accepted: true,
      status: "ok",
      reasonCodes: [],
      ensemble: {
        candidate: preferredCandidate,
        votes: preferredVotes.length,
        attempts: attempts.map((attempt) => compactAttempt(attempt.result, attempt.darkThreshold)),
      },
    };
  }

  const allResults = attempts.map((attempt) => attempt.result);
  const fallbackCandidate = preferredCandidate || mostFrequentCandidate(allResults);
  const fallbackPool = allResults.filter((result) => (
    fallbackCandidate ? result.candidate === fallbackCandidate : true
  ));
  const fallback = [...fallbackPool].sort((left, right) => (
    Number(right.accepted) - Number(left.accepted)
    || (Number.isFinite(left.bestDistance) ? left.bestDistance : Infinity)
      - (Number.isFinite(right.bestDistance) ? right.bestDistance : Infinity)
    || right.confidence - left.confidence
  ))[0] || failedPanel(["threshold-ensemble-unresolved"]);
  const reasonCodes = [...fallback.reasonCodes];
  if (acceptedCandidates.size > 1) reasonCodes.push("threshold-disagreement");
  else if (preferredCandidate && preferredVotes.length < minimumVotes) {
    reasonCodes.push("insufficient-threshold-consensus");
  } else reasonCodes.push("threshold-ensemble-unresolved");

  return {
    ...fallback,
    accepted: false,
    status: fallbackCandidate ? "review" : "failed",
    candidate: fallbackCandidate,
    reasonCodes: [...new Set(reasonCodes)],
    ensemble: {
      candidate: fallbackCandidate,
      votes: preferredVotes.length,
      attempts: attempts.map((attempt) => compactAttempt(attempt.result, attempt.darkThreshold)),
    },
  };
}

function duplicateValues(values) {
  const counts = new Map();
  for (const value of values) {
    if (!value) continue;
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  return [...counts.entries()].filter(([, count]) => count > 1).map(([value]) => value);
}

export function recognizeMachineNumberPage(data, width, height, panels, options = {}) {
  const sourcePanels = Array.isArray(panels) ? panels : [];
  if (!sourcePanels.length) {
    return {
      accepted: false,
      status: "failed",
      reasonCodes: ["empty-page"],
      candidates: [],
      numbers: [],
      duplicateNumbers: [],
      recognizedCount: 0,
      slots: [],
    };
  }

  let slots = sourcePanels.map((panel) => readPanelMachineNumber(data, width, height, panel, options));
  const candidates = slots.map((slot) => slot.candidate);
  const duplicateNumbers = duplicateValues(slots.map((slot) => (
    slot.accepted ? slot.candidate : null
  )));
  if (duplicateNumbers.length) {
    slots = slots.map((slot) => (
      duplicateNumbers.includes(slot.candidate)
        ? { ...slot, accepted: false, status: "review", reasonCodes: [...new Set([...slot.reasonCodes, "duplicate-number"])] }
        : slot
    ));
  }
  const reasonCodes = [];
  if (slots.some((slot) => !slot.accepted)) reasonCodes.push("unresolved-number");
  if (duplicateNumbers.length) reasonCodes.push("duplicate-number");
  const accepted = reasonCodes.length === 0;
  return {
    accepted,
    status: accepted ? "ok" : "review",
    reasonCodes,
    candidates,
    recognizedCount: slots.filter((slot) => slot.accepted).length,
    // ページ全件合格前の候補を保存処理が誤用しないよう、numbers は合格時だけ返す。
    numbers: accepted ? candidates : [],
    duplicateNumbers,
    slots,
  };
}

export function attachMachineNumbersToSlots(data, width, height, slots, options = {}) {
  const sourceSlots = Array.isArray(slots) ? slots : [];
  const page = recognizeMachineNumberPage(data, width, height, sourceSlots, options);
  return {
    ...page,
    slots: sourceSlots.map((slot, index) => ({
      ...(slot && typeof slot === "object" ? slot : {}),
      machineNumber: page.accepted ? page.slots[index]?.candidate || null : null,
      machineNumberCandidate: page.slots[index]?.candidate || null,
      machineNumberOcr: page.slots[index] || failedPanel(["missing-ocr-result"]),
    })),
  };
}

// 複数画像のページOCRを1つへまとめる。アップロード順は信用せず、全ページが
// 合格した時だけ台番号で並べ替える。同じ画像を別名で二重追加した場合も、
// ページをまたぐ台番号重複として全スロットを未確定へ戻す。
export function combineMachineNumberPages(pages) {
  const sourcePages = Array.isArray(pages) ? pages : [];
  if (!sourcePages.length) {
    return {
      accepted: false,
      status: "failed",
      reasonCodes: ["empty-pages"],
      pageCount: 0,
      slotCount: 0,
      failedPageIndices: [],
      unresolvedIndices: [],
      duplicateNumbers: [],
      duplicateMachineNumbers: [],
      recognizedCount: 0,
      candidates: [],
      numbers: [],
      slots: [],
    };
  }

  const failedPageIndices = [];
  const entries = [];
  sourcePages.forEach((page, pageIndex) => {
    const pageSlots = Array.isArray(page?.slots) ? page.slots : [];
    if (!page?.accepted || !pageSlots.length) failedPageIndices.push(pageIndex);
    pageSlots.forEach((slot, pageSlotIndex) => {
      const candidate = normalizedNumber(
        slot?.machineNumberCandidate
        ?? slot?.machineNumberOcr?.candidate
        ?? slot?.machineNumber,
      );
      const trustedCandidate = (page?.accepted || slot?.machineNumberOcr?.accepted)
        ? candidate
        : "";
      entries.push({
        slot,
        candidate,
        trustedCandidate,
        pageIndex,
        pageSlotIndex,
        originalIndex: entries.length,
      });
    });
  });

  const duplicateNumbers = duplicateValues(entries.map((entry) => entry.trustedCandidate));
  const unresolvedIndices = entries
    .filter((entry) => !entry.trustedCandidate)
    .map((entry) => entry.originalIndex);
  const reasonCodes = [];
  if (failedPageIndices.length) reasonCodes.push("unresolved-page");
  if (unresolvedIndices.length) reasonCodes.push("unresolved-number");
  if (duplicateNumbers.length) reasonCodes.push("duplicate-number");
  const accepted = entries.length > 0 && reasonCodes.length === 0;
  if (!entries.length) reasonCodes.push("empty-slots");

  const ordered = accepted
    ? [...entries].sort((left, right) => (
      Number(left.candidate) - Number(right.candidate)
      || left.pageIndex - right.pageIndex
      || left.pageSlotIndex - right.pageSlotIndex
    ))
    : entries;
  const slots = ordered.map(({ slot, candidate }) => ({
    ...(slot && typeof slot === "object" ? slot : {}),
    machineNumber: accepted ? candidate : null,
    machineNumberCandidate: candidate || slot?.machineNumberCandidate || null,
  }));
  const candidates = ordered.map((entry) => entry.candidate || null);

  return {
    accepted,
    status: accepted ? "ok" : "review",
    reasonCodes: [...new Set(reasonCodes)],
    pageCount: sourcePages.length,
    slotCount: slots.length,
    failedPageIndices,
    unresolvedIndices,
    duplicateNumbers,
    duplicateMachineNumbers: duplicateNumbers,
    recognizedCount: entries.filter((entry) => entry.trustedCandidate).length,
    candidates,
    numbers: accepted ? candidates : [],
    slots,
  };
}

function normalizedNumber(value) {
  const text = String(value ?? "").trim();
  return /^\d{3}$/.test(text) ? text : "";
}

// UIで入力・選択された台番号集合との完全一致を確認する。
// 特定日や店舗の番号はこのモジュールへ埋め込まない。
export function compareMachineNumberSet(pageOcr, expectedNumbers) {
  const expected = Array.isArray(expectedNumbers)
    ? expectedNumbers.map(normalizedNumber)
    : [];
  const actual = Array.isArray(pageOcr?.candidates)
    ? pageOcr.candidates.map(normalizedNumber)
    : [];
  const duplicateExpected = duplicateValues(expected);
  const invalidExpectedIndices = expected
    .map((value, index) => (value ? -1 : index))
    .filter((index) => index >= 0);
  const expectedSet = new Set(expected.filter(Boolean));
  const actualSet = new Set(actual.filter(Boolean));
  const missingNumbers = [...expectedSet].filter((number) => !actualSet.has(number));
  const unexpectedNumbers = [...actualSet].filter((number) => !expectedSet.has(number));
  const reasonCodes = [];
  if (!pageOcr?.accepted) reasonCodes.push("ocr-page-rejected");
  if (!expected.length) reasonCodes.push("empty-expected-set");
  if (invalidExpectedIndices.length) reasonCodes.push("invalid-expected-number");
  if (duplicateExpected.length) reasonCodes.push("duplicate-expected-number");
  if (actual.length !== expected.length) reasonCodes.push("count-mismatch");
  if (missingNumbers.length) reasonCodes.push("missing-number");
  if (unexpectedNumbers.length) reasonCodes.push("unexpected-number");
  return {
    matched: reasonCodes.length === 0,
    reasonCodes,
    expectedCount: expected.length,
    actualCount: actual.length,
    missingNumbers,
    unexpectedNumbers,
    duplicateExpected,
    invalidExpectedIndices,
    orderMatches: expected.length === actual.length
      && expected.every((number, index) => number === actual[index]),
  };
}
