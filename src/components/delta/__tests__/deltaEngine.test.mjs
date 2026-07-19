import test from "node:test";
import assert from "node:assert/strict";

import { getRank, getRankTone, RANKS, runAnalysis } from "../deltaEngine.js";

const WHITE = [245, 245, 245, 255];
const PANEL = [14, 20, 15, 255];
const GRID = [68, 72, 70, 255];
const ZERO = [205, 205, 205, 255];
const YELLOW = [238, 232, 0, 255];

function createRgba(width, height, color = WHITE) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < data.length; index += 4) data.set(color, index);
  return { data, width, height };
}

function setPixel(image, x, y, color) {
  if (x < 0 || y < 0 || x >= image.width || y >= image.height) return;
  image.data.set(color, (y * image.width + x) * 4);
}

function fillRect(image, x, y, width, height, color) {
  for (let py = y; py < y + height; py++) {
    for (let px = x; px < x + width; px++) setPixel(image, px, py, color);
  }
}

function drawLine(image, x0, y0, x1, y1, color) {
  let x = x0;
  let y = y0;
  const dx = Math.abs(x1 - x0);
  const sx = x0 < x1 ? 1 : -1;
  const dy = -Math.abs(y1 - y0);
  const sy = y0 < y1 ? 1 : -1;
  let error = dx + dy;

  for (;;) {
    setPixel(image, x, y, color);
    if (x === x1 && y === y1) break;
    const twiceError = 2 * error;
    if (twiceError >= dy) {
      error += dy;
      x += sx;
    }
    if (twiceError <= dx) {
      error += dx;
      y += sy;
    }
  }
}

function drawPanel(image, { x, y, width = 110, height = 96, zeroY, spacing, series }) {
  fillRect(image, x, y, width, height, PANEL);
  if (Number.isFinite(zeroY) && Number.isFinite(spacing)) {
    for (let gridY = zeroY; gridY > 4; gridY -= spacing) {
      drawLine(image, x + 4, y + gridY, x + width - 5, y + gridY, gridY === zeroY ? ZERO : GRID);
    }
    for (let gridY = zeroY + spacing; gridY < height - 4; gridY += spacing) {
      drawLine(image, x + 4, y + gridY, x + width - 5, y + gridY, GRID);
    }
  }
  if (series?.length >= 2) {
    for (let index = 1; index < series.length; index++) {
      drawLine(
        image,
        x + series[index - 1][0],
        y + series[index - 1][1],
        x + series[index][0],
        y + series[index][1],
        YELLOW,
      );
    }
  }
}

test("左右を独立走査し、片側行と空枠を含む3枠を上→下・左→右で返す", () => {
  const image = createRgba(260, 260);
  drawPanel(image, {
    x: 10,
    y: 10,
    zeroY: 50,
    spacing: 12,
    series: [[6, 50], [35, 57], [55, 43], [80, 34]],
  });
  drawPanel(image, {
    x: 10,
    y: 145,
    zeroY: 48,
    spacing: 18,
    series: [[6, 48], [30, 54], [52, 39], [80, 28]],
  });
  drawPanel(image, { x: 140, y: 145, zeroY: 48, spacing: 18 });

  // 空枠の右下にある黄色い「最大持玉」風の文字。折れ線として採用してはいけない。
  fillRect(image, 218, 220, 8, 6, YELLOW);
  fillRect(image, 229, 220, 7, 6, YELLOW);
  fillRect(image, 239, 220, 6, 6, YELLOW);

  const analysis = runAnalysis(image.data, image.width, image.height);
  assert.equal(analysis.error, undefined);
  assert.equal(analysis.results.length, 3, "存在しない右上枠を作らない");
  assert.deepEqual(
    analysis.results.map(({ row, column }) => [row, column]),
    [[0, 0], [1, 0], [1, 1]],
  );
  assert.deepEqual(analysis.diagnostics.detection, {
    left: 2,
    right: 1,
    panels: 3,
    rows: 2,
  });

  const [first, second, empty] = analysis.results;
  assert.equal(first.val, 13500);
  assert.equal(second.val, 11000);
  assert.equal(first.val % 500, 0);
  assert.equal(second.val % 500, 0);
  assert.equal(first.calibration.source, "panel");
  assert.equal(second.calibration.source, "panel");
  assert.equal(first.calibration.gridSpacing, 12);
  assert.equal(second.calibration.gridSpacing, 18, "最初の枠の目盛りを流用しない");
  assert.equal(first.status, "ok");
  assert.equal(second.status, "ok");
  assert.ok(first.confidence > 0.7);
  assert.ok(first.endpoint && Number.isFinite(first.endpoint.x));
  assert.ok(first.px > 0);
  assert.ok(first.bbox.width > 0 && first.bbox.height > 0);

  assert.equal(empty.val, null);
  assert.equal(empty.status, "failed");
  assert.deepEqual(empty.reasonCodes, ["missing-series"]);
  assert.equal(empty.endpoint, null);
  assert.equal(empty.px, 0, "右下の黄色文字を折れ線に数えない");
});

test("目盛りを読めない枠だけ、同一画像の良好枠中央値で校正する", () => {
  const image = createRgba(260, 120);
  drawPanel(image, {
    x: 10,
    y: 10,
    zeroY: 50,
    spacing: 12,
    series: [[6, 50], [80, 38]],
  });
  drawPanel(image, {
    x: 140,
    y: 10,
    series: [[6, 50], [80, 38]],
  });

  const { results, diagnostics } = runAnalysis(image.data, image.width, image.height);
  assert.equal(results.length, 2);
  assert.equal(results[0].calibration.source, "panel");
  assert.equal(results[1].calibration.source, "image-median");
  assert.equal(results[1].status, "review");
  assert.ok(results[1].reasonCodes.includes("fallback-calibration"));
  assert.equal(results[1].val, 10000);
  assert.equal(diagnostics.calibration.fallback, 1);
});

test("画像内に良好な校正元がなければ固定位置を推測しない", () => {
  const image = createRgba(260, 120);
  drawPanel(image, {
    x: 10,
    y: 10,
    series: [[6, 50], [80, 38]],
  });

  const { results, diagnostics } = runAnalysis(image.data, image.width, image.height);
  assert.equal(results.length, 1);
  assert.equal(results[0].val, null);
  assert.equal(results[0].status, "failed");
  assert.deepEqual(results[0].reasonCodes, ["missing-calibration"]);
  assert.equal(results[0].calibration, null);
  assert.equal(diagnostics.calibration.unavailable, 1);
});

test("短い折れ線と表示上下限へ接触した折れ線は参考値を残してreviewにする", () => {
  const image = createRgba(260, 260);
  drawPanel(image, {
    x: 10,
    y: 10,
    zeroY: 50,
    spacing: 12,
    series: [[6, 50], [15, 46]],
  });
  drawPanel(image, {
    x: 140,
    y: 10,
    zeroY: 50,
    spacing: 12,
    // 途中で上端へ触れてから内側へ戻る。終点だけでなく成分全体を確認する。
    series: [[6, 50], [45, 14], [80, 26]],
  });
  drawPanel(image, {
    x: 10,
    y: 145,
    zeroY: 50,
    spacing: 12,
    series: [[6, 50], [45, 67], [80, 86]],
  });

  const { results, diagnostics } = runAnalysis(image.data, image.width, image.height);
  assert.equal(results.length, 3);
  assert.equal(results[0].status, "review");
  assert.ok(results[0].reasonCodes.includes("short-series"));
  assert.ok(Number.isFinite(results[0].val), "短線でも参考値は保持する");

  assert.equal(results[1].status, "review");
  assert.ok(results[1].reasonCodes.includes("clipped-series"));
  assert.ok(results[1].val >= 19500 && results[1].val <= 20500);

  assert.equal(results[2].status, "review");
  assert.ok(results[2].reasonCodes.includes("clipped-series"));
  assert.ok(results[2].val <= -29500);
  assert.deepEqual(diagnostics.analysis, {
    ok: 0,
    review: 3,
    failed: 0,
    missingSeries: 0,
  });
});

test("既存のランクAPIを維持する", () => {
  assert.equal(RANKS.length, 21);
  assert.equal(getRank(25000).rank, "SS");
  assert.equal(getRank(-25000).rank, "G");
  assert.deepEqual(getRankTone("A+"), {
    color: "var(--orange)",
    bg: "color-mix(in srgb, var(--orange) 14%, transparent)",
  });
});
