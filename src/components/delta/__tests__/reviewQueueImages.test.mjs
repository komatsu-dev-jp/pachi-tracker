import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

import { runAnalysis } from "../deltaEngine.js";
import { attachMachineNumbersToSlots } from "../machineNumberOcr.js";
import {
  assignNumbers,
  validateNumberAssignment,
  validateReviewedNumberAssignment,
} from "../deltaSelectors.js";

const FIXTURE_DIR = path.resolve(
  "src/components/delta/__tests__/fixtures/p-analysis-review-52",
);

function inclusiveRange(start, end) {
  return Array.from({ length: end - start + 1 }, (_, index) => String(start + index));
}

// 画像内の実際の並び。連番で補完すると 490→499 と 509→546 で台ずれする。
const FIXTURES = [
  {
    file: "02.jpg",
    numbers: [...inclusiveRange(479, 490), ...inclusiveRange(499, 506)],
  },
  {
    file: "03.jpg",
    numbers: [...inclusiveRange(507, 509), ...inclusiveRange(546, 562)],
  },
  {
    file: "04.jpg",
    numbers: inclusiveRange(563, 574),
  },
];

const EXPECTED_NUMBERS = FIXTURES.flatMap(({ numbers }) => numbers);

async function loadFixture(file) {
  const { createCanvas, loadImage } = await import("@napi-rs/canvas");
  const image = await loadImage(path.join(FIXTURE_DIR, file));
  const canvas = createCanvas(image.width, image.height);
  const context = canvas.getContext("2d");
  context.drawImage(image, 0, 0);
  return {
    data: context.getImageData(0, 0, image.width, image.height).data,
    width: image.width,
    height: image.height,
  };
}

async function analyzeAllFixtures() {
  const pages = [];
  for (const fixture of FIXTURES) {
    const image = await loadFixture(fixture.file);
    const analysis = runAnalysis(image.data, image.width, image.height);
    assert.equal(analysis.error, undefined, `${fixture.file}: 解析エラーなし`);
    assert.equal(
      analysis.results.length,
      fixture.numbers.length,
      `${fixture.file}: グラフ枠を過不足なく検出する`,
    );
    pages.push(analysis.results.map((slot, pageSlotIndex) => ({
      ...slot,
      sourceFile: fixture.file,
      pageSlotIndex,
    })));
  }
  return pages;
}

test("実画像3枚から52台を検出し、番号飛びを含む手動台番号を画像順のslotへ一意に固定する", async () => {
  assert.deepEqual(FIXTURES.map(({ numbers }) => numbers.length), [20, 20, 12]);
  assert.equal(EXPECTED_NUMBERS.length, 52);
  assert.equal(new Set(EXPECTED_NUMBERS).size, 52);

  const pages = await analyzeAllFixtures();
  const slots = pages.flat();
  const validation = validateNumberAssignment(slots, EXPECTED_NUMBERS);
  assert.equal(validation.valid, true);
  assert.equal(validation.slotCount, 52);
  assert.equal(validation.numberCount, 52);
  assert.deepEqual(validation.duplicateNumbers, []);

  const assigned = assignNumbers(slots, EXPECTED_NUMBERS);
  assert.equal(assigned.length, 52);
  assert.deepEqual(assigned.map(({ num }) => num), EXPECTED_NUMBERS);
  assert.equal(new Set(assigned.map(({ num }) => num)).size, 52);

  let cursor = 0;
  for (const fixture of FIXTURES) {
    const pageRows = assigned.slice(cursor, cursor + fixture.numbers.length);
    assert.deepEqual(pageRows.map(({ num }) => num), fixture.numbers);
    assert.ok(pageRows.every(({ sourceFile }) => sourceFile === fixture.file));
    assert.deepEqual(
      pageRows.map(({ pageSlotIndex }) => pageSlotIndex),
      fixture.numbers.map((_, index) => index),
    );
    cursor += fixture.numbers.length;
  }
});

test("実画像52台のうち元の要確認5台を、終点と過去経路を区別して判定する", async () => {
  const pages = await analyzeAllFixtures();
  const assigned = assignNumbers(pages.flat(), EXPECTED_NUMBERS);
  const byNumber = new Map(assigned.map((slot) => [slot.num, slot]));

  assert.equal(byNumber.size, 52);
  assert.ok(assigned.every(({ val }) => Number.isFinite(val)));

  const expected = new Map([
    ["499", { val: 28000, status: "ok", reasonCodes: ["historical-boundary-contact"] }],
    ["503", { val: -2000, status: "review", reasonCodes: ["short-series"] }],
    ["508", { val: -3500, status: "review", reasonCodes: ["short-series"] }],
    ["548", { val: 28500, status: "ok", reasonCodes: ["historical-boundary-contact"] }],
    ["574", {
      val: 29500,
      status: "review",
      reasonCodes: ["endpoint-clipped-top", "clipped-series"],
    }],
  ]);

  for (const [machineNumber, golden] of expected) {
    const slot = byNumber.get(machineNumber);
    assert.ok(slot, `台${machineNumber}: 対応slotがある`);
    assert.equal(slot.val, golden.val, `台${machineNumber}: 候補差玉`);
    assert.equal(slot.status, golden.status, `台${machineNumber}: 判定`);
    assert.deepEqual(slot.reasonCodes, golden.reasonCodes, `台${machineNumber}: 判定理由`);
  }

  const endpointClipped = byNumber.get("574");
  assert.deepEqual(endpointClipped.valueConstraint, {
    kind: "lower-bound",
    boundary: "top",
    value: 30000,
  }, "台574: 上限クリップの値制約を保持する");

  const specialNumbers = new Set(expected.keys());
  const ordinary = assigned.filter(({ num }) => !specialNumbers.has(num));
  assert.equal(ordinary.length, 47);
  assert.ok(ordinary.every(({ status }) => status === "ok"));
  assert.ok(ordinary.every(({ reasonCodes }) => reasonCodes.length === 0));

  const counts = assigned.reduce((result, slot) => {
    result[slot.status] = (result[slot.status] || 0) + 1;
    return result;
  }, {});
  assert.deepEqual(counts, { ok: 49, review: 3 });
});

test("低解像度OCRは誤読を確定せず、読めた枠だけ手動番号との矛盾を防ぐ", async () => {
  const attachedPages = [];
  const recognizedCounts = [];
  for (const fixture of FIXTURES) {
    const image = await loadFixture(fixture.file);
    const analysis = runAnalysis(image.data, image.width, image.height);
    const page = attachMachineNumbersToSlots(
      image.data,
      image.width,
      image.height,
      analysis.results,
    );
    attachedPages.push(page.slots);
    recognizedCounts.push(page.recognizedCount);
  }

  assert.deepEqual(recognizedCounts, [0, 0, 11]);
  const lastPage = attachedPages[2];
  assert.equal(lastPage[1].machineNumberOcr.accepted, false, "564は無理に確定しない");
  assert.equal(lastPage[3].machineNumberOcr.accepted, true);
  assert.equal(lastPage[3].machineNumberOcr.candidate, "566", "566を586へ誤確定しない");

  const slots = attachedPages.flat();
  const validManual = validateReviewedNumberAssignment(slots, EXPECTED_NUMBERS);
  assert.equal(validManual.valid, true, "未読取枠を手入力し、合格済みOCR枠と一致すれば進める");

  const mismatched = [...EXPECTED_NUMBERS];
  mismatched[43] = "586"; // 写真4の4枠目（566）を以前の誤候補へ置き換える。
  const invalidManual = validateReviewedNumberAssignment(slots, mismatched);
  assert.equal(invalidManual.valid, false);
  assert.deepEqual(invalidManual.mismatchIndices, [43]);
  assert.deepEqual(invalidManual.mismatches, [{ index: 43, expected: "566", actual: "586" }]);
});
