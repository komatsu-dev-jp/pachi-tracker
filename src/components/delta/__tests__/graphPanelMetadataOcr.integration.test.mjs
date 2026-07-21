import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

import { createCanvas, loadImage } from "@napi-rs/canvas";

import { runAnalysis } from "../deltaEngine.js";
import {
  attachGraphPanelMetadata,
  createGraphMaxPayoutDigitTemplateFixture,
  recognizeGraphPanelMaxPayout,
} from "../graphPanelMetadataOcr.js";

const FIXTURE_ROOT = fileURLToPath(new URL("./fixtures/p-analysis-review-52/", import.meta.url));

const FIXTURES = Object.freeze([
  Object.freeze({
    file: "02.jpg",
    values: Object.freeze([
      17370, 13330, 30100, 8600, 11710, 17330, 25120, 20, 10950, 2720,
      21490, 14970, 38140, 8750, 1380, 10830, 10, 15280, 14580, 5380,
    ]),
  }),
  Object.freeze({
    file: "03.jpg",
    values: Object.freeze([
      13200, 20, 13890, 11730, 2740, 49190, 15210, 4720, 5400, 6640,
      20, 5390, 27910, 5560, 2740, 1500, 18190, 38480, 26520, 25480,
    ]),
  }),
  Object.freeze({
    file: "04.jpg",
    values: Object.freeze([
      6880, 29920, 5420, 25820, 8310, 15110,
      28290, 10830, 4150, 29130, 2840, 57350,
    ]),
  }),
]);

async function loadFixture(file) {
  const source = await loadImage(new URL(file, `file:///${FIXTURE_ROOT.replaceAll("\\", "/")}/`));
  const canvas = createCanvas(source.width, source.height);
  const context = canvas.getContext("2d");
  context.drawImage(source, 0, 0);
  return {
    canvas,
    imageData: context.getImageData(0, 0, source.width, source.height),
  };
}

function assertSafeMetadata(row, expected, message) {
  assert.equal(row.maxPayout, expected, `${message}: 最大出玉の値`);
  assert.equal(row.maxPayoutAccepted, true, `${message}: 自動確定`);
  assert.equal(row.graphMaxPayout.value, expected, `${message}: 詳細値`);
  assert.equal(row.graphMaxPayout.accepted, true, `${message}: 詳細の自動確定`);
  assert.deepEqual(row.graphMaxPayout.reasons, [], `${message}: 要確認理由`);
  assert.equal(row.graphMaxPayout.candidates[0]?.value, expected, `${message}: 第一候補`);
  assert.ok(row.graphMaxPayout.confidence > 0 && row.graphMaxPayout.confidence <= 1);
  assert.ok(row.graphMaxPayout.bbox?.width > 0 && row.graphMaxPayout.bbox?.height > 0);
}

test("2月13日のグラフ52台から黄色の最大出玉を全件正確に読み取る", async () => {
  let total = 0;
  for (const fixture of FIXTURES) {
    const { imageData } = await loadFixture(fixture.file);
    const analysis = runAnalysis(imageData.data, imageData.width, imageData.height);
    assert.equal(analysis.error, undefined, `${fixture.file}: グラフ解析`);
    assert.equal(analysis.results.length, fixture.values.length, `${fixture.file}: パネル数`);
    assert.equal(Object.hasOwn(analysis.results[0], "maxPayout"), false, "入力を直接変更しない");

    const rows = attachGraphPanelMetadata(
      imageData.data,
      imageData.width,
      imageData.height,
      analysis.results,
    );
    rows.forEach((row, index) => {
      assertSafeMetadata(row, fixture.values[index], `${fixture.file} ${index + 1}台目`);
      total += 1;
    });
    assert.equal(Object.hasOwn(analysis.results[0], "maxPayout"), false, "処理後も入力を変更しない");
  }
  assert.equal(total, 52);
});

test("再圧縮で劣化した画像を誤った値のまま自動確定しない", async () => {
  let reviewCount = 0;
  let wrongAutoPassCount = 0;

  for (const fixture of FIXTURES) {
    const { canvas, imageData } = await loadFixture(fixture.file);
    const slots = runAnalysis(imageData.data, imageData.width, imageData.height).results;
    const recompressed = await loadImage(canvas.toBuffer("image/jpeg", 0.65));
    const degradedCanvas = createCanvas(recompressed.width, recompressed.height);
    const degradedContext = degradedCanvas.getContext("2d");
    degradedContext.drawImage(recompressed, 0, 0);
    const degraded = degradedContext.getImageData(0, 0, recompressed.width, recompressed.height);
    const rows = attachGraphPanelMetadata(degraded.data, degraded.width, degraded.height, slots);

    rows.forEach((row, index) => {
      if (!row.maxPayoutAccepted) reviewCount += 1;
      if (row.maxPayoutAccepted && row.maxPayout !== fixture.values[index]) wrongAutoPassCount += 1;
    });
  }

  assert.ok(reviewCount > 0, "劣化検査が実際に要確認経路を通る");
  assert.equal(wrongAutoPassCount, 0, "誤読を自動確定しない");
});

test("数字領域が欠けたパネルと不正入力は安全に要確認へ回す", async () => {
  const { imageData } = await loadFixture(FIXTURES[0].file);
  const slot = runAnalysis(imageData.data, imageData.width, imageData.height).results[0];
  const original = recognizeGraphPanelMaxPayout(
    imageData.data,
    imageData.width,
    imageData.height,
    slot,
  );
  assert.equal(original.accepted, true);

  const damaged = new Uint8ClampedArray(imageData.data);
  const left = Math.max(0, Math.floor(original.bbox.x));
  const top = Math.max(0, Math.floor(original.bbox.y));
  const right = Math.min(imageData.width, Math.ceil(original.bbox.x + original.bbox.width));
  const bottom = Math.min(imageData.height, Math.ceil(original.bbox.y + original.bbox.height));
  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) {
      const offset = (y * imageData.width + x) * 4;
      damaged[offset] = 14;
      damaged[offset + 1] = 20;
      damaged[offset + 2] = 15;
      damaged[offset + 3] = 255;
    }
  }

  const missingLabel = recognizeGraphPanelMaxPayout(
    damaged,
    imageData.width,
    imageData.height,
    slot,
  );
  assert.equal(missingLabel.accepted, false);
  assert.equal(missingLabel.value, null);
  assert.ok(missingLabel.reasons.includes("max-payout-not-found"));

  assert.deepEqual(
    recognizeGraphPanelMaxPayout(new Uint8ClampedArray(), 0, 0, slot).reasons,
    ["invalid-image-data"],
  );
  assert.deepEqual(
    recognizeGraphPanelMaxPayout(imageData.data, imageData.width, imageData.height, null).reasons,
    ["invalid-panel-bbox"],
  );
});

test("テンプレート採取は全パネル分の明示した正解値を必須にする", async () => {
  const { imageData } = await loadFixture(FIXTURES[0].file);
  const slots = runAnalysis(imageData.data, imageData.width, imageData.height).results;
  assert.throws(
    () => createGraphMaxPayoutDigitTemplateFixture(
      imageData.data,
      imageData.width,
      imageData.height,
      slots,
    ),
    /groundTruthValues/u,
  );
});
