// 差玉解析：ピクセル解析エンジン＋ランク定義（純粋関数）
//
// 移植元: pachinko-rank-analyzer の App.jsx。
// RANKS / getRank / runAnalysis は移植元のロジック・数式・閾値を一切変更せず移植している。
// （logic.js とは無関係の独立した解析データ。rotRows は迂回しない。）
//
// 出玉推移グラフのスクリーンショットをピクセル解析し、各台の差玉を推定する。

// ── ランク定義（21段階・移植元の min 値と rank 名は変更禁止） ──
export const RANKS = [
  { rank: "SS",  min: 25000 },
  { rank: "S+",  min: 22500 },
  { rank: "S",   min: 20000 },
  { rank: "A+",  min: 17500 },
  { rank: "A",   min: 15000 },
  { rank: "A-",  min: 12500 },
  { rank: "B++", min: 10000 },
  { rank: "B+",  min: 7500 },
  { rank: "B",   min: 5000 },
  { rank: "C+",  min: 2500 },
  { rank: "C",   min: 0 },
  { rank: "C-",  min: -2500 },
  { rank: "D",   min: -5000 },
  { rank: "D-",  min: -7500 },
  { rank: "E++", min: -10000 },
  { rank: "E+",  min: -12500 },
  { rank: "E",   min: -15000 },
  { rank: "E-",  min: -17500 },
  { rank: "F",   min: -20000 },
  { rank: "F-",  min: -22500 },
  { rank: "G",   min: -Infinity },
];

// 差玉値からランク定義を引く（移植元と同一ロジック）。
export const getRank = (v) => RANKS.find((r) => v >= r.min) || RANKS[RANKS.length - 1];

// ランク名 → アプリのパレット（CSS変数）へのトーン割り当て。
// 移植元の固定HEX色は使わず、アプリのダークテーマ変数に寄せる。
// S/SS系=red、A系=orange、B系=yellow、C系=green、D系=blue、E系=sub灰、F/G=purple。
const RANK_GROUP_TONE = {
  red:    { color: "var(--red)",    bg: "color-mix(in srgb, var(--red) 14%, transparent)" },
  orange: { color: "var(--orange)", bg: "color-mix(in srgb, var(--orange) 14%, transparent)" },
  yellow: { color: "var(--yellow)", bg: "color-mix(in srgb, var(--yellow) 14%, transparent)" },
  green:  { color: "var(--green)",  bg: "color-mix(in srgb, var(--green) 14%, transparent)" },
  blue:   { color: "var(--blue)",   bg: "color-mix(in srgb, var(--blue) 14%, transparent)" },
  sub:    { color: "var(--sub)",    bg: "color-mix(in srgb, var(--sub) 16%, transparent)" },
  purple: { color: "var(--purple)", bg: "color-mix(in srgb, var(--purple) 14%, transparent)" },
};

function rankGroup(rank) {
  const head = String(rank || "").charAt(0);
  if (head === "S") return "red";
  if (head === "A") return "orange";
  if (head === "B") return "yellow";
  if (head === "C") return "green";
  if (head === "D") return "blue";
  if (head === "E") return "sub";
  return "purple"; // F / G
}

// ランク名から { color, bg } を返す（UI 表示用）。
export function getRankTone(rank) {
  return RANK_GROUP_TONE[rankGroup(rank)] || RANK_GROUP_TONE.sub;
}

// ============ ピクセル解析（OCRなし・生スロットを返す） ============
//
// サイトセブンのグラフは通常2列だが、片側だけの行や線のない枠もある。
// そのため「暗い行を見つけたら必ず2台」とはせず、左右の半分を別々に走査する。

const clamp01 = (value) => Math.max(0, Math.min(1, value));

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function pixelLuminance(data, index) {
  return data[index] * 0.2126 + data[index + 1] * 0.7152 + data[index + 2] * 0.0722;
}

function isDarkPixel(data, index) {
  const max = Math.max(data[index], data[index + 1], data[index + 2]);
  return max <= 135 && pixelLuminance(data, index) <= 105;
}

function mergeRuns(runs, maxGap) {
  const merged = [];
  for (const [start, end] of runs) {
    const previous = merged[merged.length - 1];
    if (previous && start - previous[1] - 1 <= maxGap) previous[1] = end;
    else merged.push([start, end]);
  }
  return merged;
}

function findPanelsInHalf(data, width, height, xStart, xEnd, column) {
  const halfWidth = xEnd - xStart;
  const minPanelHeight = Math.max(24, Math.round(halfWidth * 0.22));
  const rowThreshold = 0.3;
  const rawRuns = [];
  let runStart = -1;

  for (let y = 0; y < height; y++) {
    let darkCount = 0;
    const rowBase = y * width * 4;
    for (let x = xStart; x < xEnd; x++) {
      if (isDarkPixel(data, rowBase + x * 4)) darkCount += 1;
    }
    const isPanelRow = darkCount / halfWidth >= rowThreshold;
    if (isPanelRow && runStart < 0) runStart = y;
    if (!isPanelRow && runStart >= 0) {
      rawRuns.push([runStart, y - 1]);
      runStart = -1;
    }
  }
  if (runStart >= 0) rawRuns.push([runStart, height - 1]);

  // 明るい0線で暗帯が分断されても同じパネルへ戻す。
  const maxGridGap = Math.max(3, Math.round(halfWidth * 0.03));
  const verticalRuns = mergeRuns(rawRuns, maxGridGap);
  const panels = [];

  for (const [top, bottom] of verticalRuns) {
    const panelHeight = bottom - top + 1;
    if (panelHeight < minPanelHeight) continue;

    const darkColumns = [];
    for (let x = xStart; x < xEnd; x++) {
      let darkCount = 0;
      for (let y = top; y <= bottom; y++) {
        if (isDarkPixel(data, (y * width + x) * 4)) darkCount += 1;
      }
      if (darkCount / panelHeight >= 0.25) darkColumns.push(x);
    }
    if (!darkColumns.length) continue;

    const left = darkColumns[0];
    const right = darkColumns[darkColumns.length - 1];
    const panelWidth = right - left + 1;
    if (panelWidth < Math.max(30, Math.round(halfWidth * 0.35))) continue;
    if (panelHeight / panelWidth < 0.22 || panelHeight / panelWidth > 2.5) continue;

    let darkInside = 0;
    const sampleStep = Math.max(1, Math.floor(Math.min(panelWidth, panelHeight) / 90));
    let sampled = 0;
    for (let y = top; y <= bottom; y += sampleStep) {
      for (let x = left; x <= right; x += sampleStep) {
        sampled += 1;
        if (isDarkPixel(data, (y * width + x) * 4)) darkInside += 1;
      }
    }
    if (!sampled || darkInside / sampled < 0.35) continue;

    panels.push({
      column,
      bbox: {
        x: left,
        y: top,
        width: panelWidth,
        height: panelHeight,
      },
    });
  }
  return panels;
}

function assignPanelRows(panels) {
  const groups = [];
  const byTop = [...panels].sort((a, b) => (
    a.bbox.y - b.bbox.y || a.column - b.column
  ));

  for (const panel of byTop) {
    const top = panel.bbox.y;
    const bottom = top + panel.bbox.height - 1;
    const center = (top + bottom) / 2;
    let bestGroup = null;
    let bestDistance = Infinity;

    for (const group of groups) {
      const overlap = Math.max(0, Math.min(bottom, group.bottom) - Math.max(top, group.top) + 1);
      const overlapRatio = overlap / Math.min(panel.bbox.height, group.height);
      const centerDistance = Math.abs(center - group.center);
      if (overlapRatio >= 0.35 || centerDistance <= Math.max(panel.bbox.height, group.height) * 0.3) {
        if (centerDistance < bestDistance) {
          bestDistance = centerDistance;
          bestGroup = group;
        }
      }
    }

    if (!bestGroup) {
      bestGroup = { panels: [], top, bottom, center, height: panel.bbox.height };
      groups.push(bestGroup);
    }
    bestGroup.panels.push(panel);
    bestGroup.top = Math.min(bestGroup.top, top);
    bestGroup.bottom = Math.max(bestGroup.bottom, bottom);
    bestGroup.center = (bestGroup.top + bestGroup.bottom) / 2;
    bestGroup.height = bestGroup.bottom - bestGroup.top + 1;
  }

  groups.sort((a, b) => a.top - b.top);
  for (let row = 0; row < groups.length; row++) {
    groups[row].panels.sort((a, b) => a.column - b.column);
    for (const panel of groups[row].panels) panel.row = row;
  }
  return groups.flatMap((group) => group.panels);
}

function isNeutralLinePixel(data, index) {
  const r = data[index];
  const g = data[index + 1];
  const b = data[index + 2];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max >= 32 && (max - min) / Math.max(max, 1) <= 0.24;
}

function calibratePanel(data, imageWidth, panel) {
  const { x, y, width, height } = panel.bbox;
  const xMargin = Math.max(2, Math.round(width * 0.045));
  const scanLeft = x + xMargin;
  const scanRight = x + width - xMargin - 1;
  const scanWidth = Math.max(1, scanRight - scanLeft + 1);
  const lineRows = [];

  for (let localY = 2; localY < height - 2; localY++) {
    let count = 0;
    let valueSum = 0;
    for (let absoluteX = scanLeft; absoluteX <= scanRight; absoluteX++) {
      const index = ((y + localY) * imageWidth + absoluteX) * 4;
      if (isNeutralLinePixel(data, index)) {
        count += 1;
        valueSum += Math.max(data[index], data[index + 1], data[index + 2]);
      }
    }
    const coverage = count / scanWidth;
    if (coverage >= 0.48) {
      lineRows.push({
        y: localY,
        coverage,
        brightness: count ? valueSum / count : 0,
      });
    }
  }

  const clusters = [];
  for (const line of lineRows) {
    const current = clusters[clusters.length - 1];
    if (current && line.y - current[current.length - 1].y <= 2) current.push(line);
    else clusters.push([line]);
  }
  const candidates = clusters.map((cluster) => cluster.reduce((best, row) => (
    row.coverage * row.brightness > best.coverage * best.brightness ? row : best
  ))).sort((a, b) => a.y - b.y);

  if (candidates.length < 3) {
    return { valid: false, reason: "missing-grid", gridLines: candidates.map((line) => line.y) };
  }

  const minimumSpacing = Math.max(4, height * 0.04);
  const maximumSpacing = height * 0.35;
  const spacings = [];
  for (let index = 1; index < candidates.length; index++) {
    const spacing = candidates[index].y - candidates[index - 1].y;
    if (spacing >= minimumSpacing && spacing <= maximumSpacing) spacings.push(spacing);
  }
  const gridSpacing = median(spacings);
  if (!Number.isFinite(gridSpacing) || gridSpacing < 2) {
    return { valid: false, reason: "missing-grid-spacing", gridLines: candidates.map((line) => line.y) };
  }

  const brightnesses = candidates.map((line) => line.brightness);
  const middleBrightness = median(brightnesses) || 1;
  const zeroLine = candidates.reduce((best, line) => (
    line.brightness > best.brightness ? line : best
  ));
  const zeroContrast = zeroLine.brightness / middleBrightness;
  if (zeroContrast < 1.15) {
    return { valid: false, reason: "missing-zero-line", gridLines: candidates.map((line) => line.y) };
  }

  const spacingDeviation = median(spacings.map((spacing) => Math.abs(spacing - gridSpacing))) || 0;
  const spacingQuality = clamp01(1 - (spacingDeviation / gridSpacing) * 5);
  const lineCountQuality = clamp01((candidates.length - 2) / 4);
  const contrastQuality = clamp01((zeroContrast - 1) / 1.5);
  const quality = clamp01(lineCountQuality * 0.4 + spacingQuality * 0.35 + contrastQuality * 0.25);

  return {
    valid: true,
    source: "panel",
    zeroY: zeroLine.y,
    absoluteZeroY: y + zeroLine.y,
    gridSpacing,
    gridLines: candidates.map((line) => line.y),
    plotTopY: candidates[0].y,
    plotBottomY: candidates[candidates.length - 1].y,
    quality,
  };
}

function hueDegrees(r, g, b, max, delta) {
  if (delta === 0) return 0;
  let hue;
  if (max === r) hue = ((g - b) / delta) % 6;
  else if (max === g) hue = (b - r) / delta + 2;
  else hue = (r - g) / delta + 4;
  hue *= 60;
  return hue < 0 ? hue + 360 : hue;
}

function isYellowPixel(data, index) {
  const r = data[index];
  const g = data[index + 1];
  const b = data[index + 2];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  if (max < 75 || delta / Math.max(max, 1) < 0.38) return false;
  const hue = hueDegrees(r, g, b, max, delta);
  return hue >= 38 && hue <= 76;
}

function findYellowComponents(data, imageWidth, panel) {
  const { x, y, width, height } = panel.bbox;
  const size = width * height;
  const mask = new Uint8Array(size);
  const visited = new Uint8Array(size);
  const bridgeRadius = Math.max(2, Math.min(6, Math.round(Math.min(width, height) * 0.015)));

  for (let localY = 0; localY < height; localY++) {
    for (let localX = 0; localX < width; localX++) {
      const imageIndex = ((y + localY) * imageWidth + x + localX) * 4;
      if (isYellowPixel(data, imageIndex)) mask[localY * width + localX] = 1;
    }
  }

  const components = [];
  for (let start = 0; start < size; start++) {
    if (!mask[start] || visited[start]) continue;
    const queue = [start];
    visited[start] = 1;
    const points = [];
    let minX = width;
    let maxX = -1;
    let minY = height;
    let maxY = -1;

    for (let queueIndex = 0; queueIndex < queue.length; queueIndex++) {
      const point = queue[queueIndex];
      const pointY = Math.floor(point / width);
      const pointX = point - pointY * width;
      points.push({ x: pointX, y: pointY });
      minX = Math.min(minX, pointX);
      maxX = Math.max(maxX, pointX);
      minY = Math.min(minY, pointY);
      maxY = Math.max(maxY, pointY);

      // スクリーンショット縮小で折れ点に数pxの隙間ができるため、表示寸法に
      // 比例した近傍でつなぐ（右下の文字は左端に接続しないため候補外になる）。
      for (let offsetY = -bridgeRadius; offsetY <= bridgeRadius; offsetY++) {
        const nextY = pointY + offsetY;
        if (nextY < 0 || nextY >= height) continue;
        for (let offsetX = -bridgeRadius; offsetX <= bridgeRadius; offsetX++) {
          if (offsetX === 0 && offsetY === 0) continue;
          const nextX = pointX + offsetX;
          if (nextX < 0 || nextX >= width) continue;
          const next = nextY * width + nextX;
          if (mask[next] && !visited[next]) {
            visited[next] = 1;
            queue.push(next);
          }
        }
      }
    }
    components.push({ points, minX, maxX, minY, maxY, px: points.length });
  }
  return components;
}

function extractSeries(data, imageWidth, panel) {
  const { width, height, x: panelX, y: panelY } = panel.bbox;
  const components = findYellowComponents(data, imageWidth, panel);
  const leftAnchor = Math.max(8, Math.round(width * 0.18));
  const minimumSpan = Math.max(4, Math.round(width * 0.04));
  const candidates = components.filter((component) => (
    component.minX <= leftAnchor
    && component.maxX - component.minX >= minimumSpan
    && component.px >= 5
    && component.minY < height * 0.9
  ));

  candidates.sort((a, b) => {
    const scoreA = (a.maxX - a.minX) * 4 + a.px * 0.15 - a.minX;
    const scoreB = (b.maxX - b.minX) * 4 + b.px * 0.15 - b.minX;
    return scoreB - scoreA;
  });
  const selected = candidates[0];
  if (!selected) return null;

  // 通常は最も右の2列だけを使い、斜線の手前側へ終点がずれるのを防ぐ。
  const endpointBandWidth = 1;
  const terminal = selected.points.filter((point) => point.x >= selected.maxX - endpointBandWidth);
  const terminalYs = terminal.map((point) => point.y);
  let endpointY = median(terminalYs);

  // 最後が縦線なら、直前の位置から遠い側が時系列上の終点になる。
  const verticalTailWidth = Math.max(2, Math.round(width * 0.012));
  const verticalTerminal = selected.points.filter((point) => (
    point.x >= selected.maxX - verticalTailWidth
  ));
  const verticalYs = verticalTerminal.map((point) => point.y);
  const terminalMin = Math.min(...verticalYs);
  const terminalMax = Math.max(...verticalYs);
  if (terminalMax - terminalMin >= Math.max(8, height * 0.04)) {
    const previous = selected.points.filter((point) => (
      point.x >= selected.maxX - verticalTailWidth * 4
      && point.x < selected.maxX - verticalTailWidth
    ));
    const previousY = median(previous.map((point) => point.y));
    if (Number.isFinite(previousY)) {
      endpointY = Math.abs(terminalMin - previousY) > Math.abs(terminalMax - previousY)
        ? terminalMin
        : terminalMax;
    }
  }

  const span = selected.maxX - selected.minX + 1;
  const anchorQuality = clamp01(1 - selected.minX / (leftAnchor + 1));
  const spanQuality = clamp01(span / (width * 0.15));
  const densityQuality = clamp01(selected.px / Math.max(1, span * 1.5));
  const quality = clamp01(anchorQuality * 0.35 + spanQuality * 0.4 + densityQuality * 0.25);

  return {
    px: selected.px,
    quality,
    span,
    bounds: {
      minX: selected.minX,
      maxX: selected.maxX,
      minY: selected.minY,
      maxY: selected.maxY,
    },
    endpoint: {
      x: panelX + selected.maxX,
      y: panelY + endpointY,
      localX: selected.maxX,
      localY: endpointY,
    },
  };
}

function publicCalibration(calibration) {
  if (!calibration) return null;
  const {
    source,
    zeroY,
    absoluteZeroY,
    gridSpacing,
    gridLines = [],
    plotTopY,
    plotBottomY,
    quality = 0,
  } = calibration;
  return {
    source,
    zeroY,
    absoluteZeroY,
    gridSpacing,
    gridLines,
    plotTopY,
    plotBottomY,
    quality,
  };
}

function classifySeriesBoundaryContact(series, calibration) {
  if (!series || !calibration) {
    return { endpointBoundary: null, historicalBoundaries: [] };
  }
  const { plotTopY, plotBottomY, gridSpacing } = calibration;
  if (!Number.isFinite(plotTopY) || !Number.isFinite(plotBottomY)
    || !Number.isFinite(gridSpacing)) {
    return { endpointBoundary: null, historicalBoundaries: [] };
  }

  // A trace is several pixels thick after screenshots and JPEG compression. The
  // endpoint uses its robust median, so keep the same narrow tolerance as the path:
  // a nearby historical pixel must not turn an otherwise visible endpoint into a
  // clipped value.
  const pathTolerance = Math.max(1.5, gridSpacing * 0.05);
  const endpointTolerance = pathTolerance;
  const endpointTopDistance = series.endpoint.localY - plotTopY;
  const endpointBottomDistance = plotBottomY - series.endpoint.localY;
  const endpointNearTop = endpointTopDistance <= endpointTolerance;
  const endpointNearBottom = endpointBottomDistance <= endpointTolerance;
  let endpointBoundary = null;
  if (endpointNearTop || endpointNearBottom) {
    endpointBoundary = endpointTopDistance <= endpointBottomDistance ? "top" : "bottom";
  }

  const touchedTop = series.bounds.minY <= plotTopY + pathTolerance;
  const touchedBottom = series.bounds.maxY >= plotBottomY - pathTolerance;
  const historicalBoundaries = [];
  if (touchedTop && endpointBoundary !== "top") historicalBoundaries.push("top");
  if (touchedBottom && endpointBoundary !== "bottom") historicalBoundaries.push("bottom");
  return { endpointBoundary, historicalBoundaries };
}

function clippedValueConstraint(calibration, boundary) {
  if (boundary !== "top" && boundary !== "bottom") return null;
  const boundaryY = boundary === "top" ? calibration.plotTopY : calibration.plotBottomY;
  if (!Number.isFinite(boundaryY) || !Number.isFinite(calibration.zeroY)
    || !Number.isFinite(calibration.gridSpacing) || calibration.gridSpacing <= 0) {
    return null;
  }
  const rawBoundaryValue = ((calibration.zeroY - boundaryY) / calibration.gridSpacing) * 10000;
  const roundedBoundaryValue = Math.round(rawBoundaryValue / 500) * 500;
  return {
    kind: boundary === "top" ? "lower-bound" : "upper-bound",
    boundary,
    value: Object.is(roundedBoundaryValue, -0) ? 0 : roundedBoundaryValue,
  };
}

function failedSeriesResult(panel, calibration) {
  return {
    val: null,
    status: "failed",
    confidence: 0,
    reasonCodes: ["missing-series"],
    calibration: publicCalibration(calibration),
    endpoint: null,
    valueConstraint: null,
    px: 0,
    bbox: { ...panel.bbox },
    row: panel.row,
    column: panel.column,
  };
}

// 各パネルは上→下・左→右の順に返す。値を読めない枠も削除しないため、
// 後続の台番号割り当てが途中から1台ずれることを防げる。
export function runAnalysis(data, w, h) {
  const logs = [];
  const log = (message) => logs.push(message);
  const diagnostics = {
    image: { width: w, height: h },
    detection: { left: 0, right: 0, panels: 0, rows: 0 },
    calibration: { panel: 0, fallback: 0, unavailable: 0 },
    analysis: { ok: 0, review: 0, failed: 0, missingSeries: 0 },
    panels: [],
  };
  log(`画像: ${w}x${h}`);

  if (!data || !Number.isInteger(w) || !Number.isInteger(h) || w < 2 || h < 2 || data.length < w * h * 4) {
    return { results: [], logs, diagnostics, error: "画像データ不正" };
  }

  const midX = Math.floor(w / 2);
  const leftPanels = findPanelsInHalf(data, w, h, 0, midX, 0);
  const rightPanels = findPanelsInHalf(data, w, h, midX, w, 1);
  const panels = assignPanelRows([...leftPanels, ...rightPanels]).sort((a, b) => (
    a.row - b.row || a.column - b.column || a.bbox.x - b.bbox.x
  ));
  diagnostics.detection.left = leftPanels.length;
  diagnostics.detection.right = rightPanels.length;
  diagnostics.detection.panels = panels.length;
  diagnostics.detection.rows = panels.length ? Math.max(...panels.map((panel) => panel.row)) + 1 : 0;
  log(`${diagnostics.detection.rows}行 (${panels.length}台、左${leftPanels.length}/右${rightPanels.length})`);

  if (!panels.length) return { results: [], logs, diagnostics, error: "グラフ枠なし" };

  const calibrations = panels.map((panel) => calibratePanel(data, w, panel));
  const goodCalibrationEntries = calibrations
    .map((calibration, index) => ({ calibration, panel: panels[index] }))
    .filter(({ calibration }) => calibration.valid && calibration.quality >= 0.55);
  const medianZeroRatio = median(goodCalibrationEntries.map(({ calibration, panel }) => (
    calibration.zeroY / panel.bbox.height
  )));
  const medianSpacingRatio = median(goodCalibrationEntries.map(({ calibration, panel }) => (
    calibration.gridSpacing / panel.bbox.height
  )));
  const medianTopRatio = median(goodCalibrationEntries.map(({ calibration, panel }) => (
    calibration.plotTopY / panel.bbox.height
  )));
  const medianBottomRatio = median(goodCalibrationEntries.map(({ calibration, panel }) => (
    calibration.plotBottomY / panel.bbox.height
  )));

  const resolvedCalibrations = calibrations.map((calibration, index) => {
    if (calibration.valid) {
      diagnostics.calibration.panel += 1;
      return calibration;
    }
    const panel = panels[index];
    if (Number.isFinite(medianZeroRatio) && Number.isFinite(medianSpacingRatio)) {
      const zeroY = medianZeroRatio * panel.bbox.height;
      diagnostics.calibration.fallback += 1;
      return {
        valid: true,
        source: "image-median",
        zeroY,
        absoluteZeroY: panel.bbox.y + zeroY,
        gridSpacing: medianSpacingRatio * panel.bbox.height,
        gridLines: [],
        plotTopY: Number.isFinite(medianTopRatio) ? medianTopRatio * panel.bbox.height : undefined,
        plotBottomY: Number.isFinite(medianBottomRatio) ? medianBottomRatio * panel.bbox.height : undefined,
        quality: Math.min(0.62, median(goodCalibrationEntries.map(({ calibration: item }) => item.quality)) || 0.55),
      };
    }
    diagnostics.calibration.unavailable += 1;
    return null;
  });

  const results = panels.map((panel, index) => {
    const calibration = resolvedCalibrations[index];
    const series = extractSeries(data, w, panel);
    if (!series) {
      diagnostics.analysis.failed += 1;
      diagnostics.analysis.missingSeries += 1;
      return failedSeriesResult(panel, calibration);
    }

    if (!calibration || !Number.isFinite(calibration.zeroY) || !Number.isFinite(calibration.gridSpacing)) {
      diagnostics.analysis.failed += 1;
      return {
        val: null,
        status: "failed",
        confidence: 0,
        reasonCodes: ["missing-calibration"],
        calibration: null,
        endpoint: series.endpoint,
        valueConstraint: null,
        px: series.px,
        bbox: { ...panel.bbox },
        row: panel.row,
        column: panel.column,
      };
    }

    const rawValue = ((calibration.zeroY - series.endpoint.localY) / calibration.gridSpacing) * 10000;
    const rounded = Math.round(rawValue / 500) * 500;
    const val = Object.is(rounded, -0) ? 0 : rounded;
    let confidence = clamp01(calibration.quality * 0.55 + series.quality * 0.45);
    if (calibration.source === "image-median") confidence = Math.max(0, confidence - 0.12);
    confidence = Math.round(confidence * 1000) / 1000;
    const reasonCodes = [];
    if (calibration.source === "image-median") reasonCodes.push("fallback-calibration");
    const isShortSeries = series.span < panel.bbox.width * 0.12;
    const boundaryContact = classifySeriesBoundaryContact(series, calibration);
    const isEndpointClipped = Boolean(boundaryContact.endpointBoundary);
    const valueConstraint = clippedValueConstraint(calibration, boundaryContact.endpointBoundary);
    if (isShortSeries) reasonCodes.push("short-series");
    if (boundaryContact.historicalBoundaries.length) {
      reasonCodes.push("historical-boundary-contact");
    }
    if (isEndpointClipped) {
      reasonCodes.push(`endpoint-clipped-${boundaryContact.endpointBoundary}`);
      // Keep the former reason for callers that have not learned the more precise
      // top/bottom reason yet.
      reasonCodes.push("clipped-series");
    }
    if (confidence < 0.7) reasonCodes.push("low-confidence");
    const status = confidence >= 0.7
      && calibration.source === "panel"
      && !isShortSeries
      && !isEndpointClipped
      ? "ok"
      : "review";
    diagnostics.analysis[status] += 1;

    return {
      val,
      status,
      confidence,
      reasonCodes,
      calibration: publicCalibration(calibration),
      endpoint: series.endpoint,
      valueConstraint,
      px: series.px,
      bbox: { ...panel.bbox },
      row: panel.row,
      column: panel.column,
    };
  });

  diagnostics.panels = results.map((result) => ({
    row: result.row,
    column: result.column,
    bbox: result.bbox,
    status: result.status,
    reasonCodes: result.reasonCodes,
    calibrationSource: result.calibration?.source || null,
  }));
  log(`${results.length}台解析完了 (ok=${diagnostics.analysis.ok}, review=${diagnostics.analysis.review}, failed=${diagnostics.analysis.failed})`);
  return { results, logs, diagnostics };
}
