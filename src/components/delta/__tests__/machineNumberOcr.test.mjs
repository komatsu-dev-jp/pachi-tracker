import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

import { runAnalysis } from "../deltaEngine.js";
import {
  attachMachineNumbersToSlots,
  combineMachineNumberPages,
  compareMachineNumberSet,
  readPanelMachineNumber,
} from "../machineNumberOcr.js";

const FIXTURE_DIR = path.resolve("src/components/delta/__tests__/fixtures/p-analysis-2026-02-13");
const FIXTURES = [
  {
    file: "01.png",
    numbers: Array.from({ length: 18 }, (_, index) => String(810 + index)),
  },
  {
    file: "02.png",
    numbers: [
      ...Array.from({ length: 10 }, (_, index) => String(777 + index)),
      ...Array.from({ length: 10 }, (_, index) => String(800 + index)),
    ],
  },
  {
    file: "03.png",
    numbers: Array.from({ length: 20 }, (_, index) => String(757 + index)),
  },
];
// fixtureはリポジトリへ同梱し、CIでも実画像回帰を必ず実行する。
const HAS_REAL_FIXTURES = true;

async function loadFixture(file, scale = 1) {
  const { createCanvas, loadImage } = await import("@napi-rs/canvas");
  const image = await loadImage(path.join(FIXTURE_DIR, file));
  const width = Math.round(image.width * scale);
  const height = Math.round(image.height * scale);
  const canvas = createCanvas(width, height);
  const context = canvas.getContext("2d");
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(image, 0, 0, width, height);
  return { data: context.getImageData(0, 0, width, height).data, width, height };
}

function cloneImage(image) {
  return { ...image, data: new Uint8ClampedArray(image.data) };
}

function fillRect(image, x, y, width, height, rgba = [245, 245, 245, 255]) {
  const left = Math.max(0, Math.floor(x));
  const top = Math.max(0, Math.floor(y));
  const right = Math.min(image.width, Math.ceil(x + width));
  const bottom = Math.min(image.height, Math.ceil(y + height));
  for (let py = top; py < bottom; py += 1) {
    for (let px = left; px < right; px += 1) {
      image.data.set(rgba, (py * image.width + px) * 4);
    }
  }
}

function copyRect(image, sourceX, sourceY, targetX, targetY, width, height) {
  const copy = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const source = ((sourceY + y) * image.width + sourceX + x) * 4;
      copy.set(image.data.subarray(source, source + 4), (y * width + x) * 4);
    }
  }
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const target = ((targetY + y) * image.width + targetX + x) * 4;
      const copied = (y * width + x) * 4;
      image.data.set(copy.subarray(copied, copied + 4), target);
    }
  }
}

test("不正画像や範囲外ラベルを推測で確定しない", () => {
  const invalid = readPanelMachineNumber(null, 0, 0, null);
  assert.equal(invalid.accepted, false);
  assert.deepEqual(invalid.reasonCodes, ["invalid-image"]);

  const data = new Uint8ClampedArray(20 * 20 * 4).fill(255);
  const outOfBounds = readPanelMachineNumber(data, 20, 20, {
    bbox: { x: 2, y: 2, width: 10, height: 8 },
  });
  assert.equal(outOfBounds.accepted, false);
  assert.ok(outOfBounds.reasonCodes.includes("label-out-of-bounds"));
});

test("入力台番号集合との照合は件数・不足・余分を個別に返す", () => {
  const page = { accepted: true, candidates: ["757", "758", "759"] };
  assert.equal(compareMachineNumberSet(page, [757, 758, 759]).matched, true);

  const mismatch = compareMachineNumberSet(page, [757, 758, 760]);
  assert.equal(mismatch.matched, false);
  assert.deepEqual(mismatch.missingNumbers, ["760"]);
  assert.deepEqual(mismatch.unexpectedNumbers, ["759"]);
  assert.ok(mismatch.reasonCodes.includes("missing-number"));
  assert.ok(mismatch.reasonCodes.includes("unexpected-number"));

  const rejected = compareMachineNumberSet({ accepted: false, candidates: ["757"] }, [757]);
  assert.equal(rejected.matched, false);
  assert.ok(rejected.reasonCodes.includes("ocr-page-rejected"));
});

test("複数ページは全ページ合格・全体一意の時だけ番号順に確定する", () => {
  const pageA = {
    accepted: true,
    slots: [
      { val: 1000, machineNumberCandidate: "811" },
      { val: 2000, machineNumberCandidate: "812" },
    ],
  };
  const pageB = {
    accepted: true,
    slots: [{ val: 3000, machineNumberCandidate: "810" }],
  };
  const combined = combineMachineNumberPages([pageA, pageB]);
  assert.equal(combined.accepted, true);
  assert.deepEqual(combined.numbers, ["810", "811", "812"]);
  assert.deepEqual(combined.slots.map(({ machineNumber, val }) => [machineNumber, val]), [
    ["810", 3000],
    ["811", 1000],
    ["812", 2000],
  ]);

  const oneRejected = combineMachineNumberPages([pageA, { ...pageB, accepted: false }]);
  assert.equal(oneRejected.accepted, false);
  assert.ok(oneRejected.reasonCodes.includes("unresolved-page"));
  assert.ok(oneRejected.slots.every((slot) => slot.machineNumber === null));

  const duplicate = combineMachineNumberPages([
    pageA,
    { accepted: true, slots: [{ machineNumberCandidate: "811" }] },
  ]);
  assert.equal(duplicate.accepted, false);
  assert.deepEqual(duplicate.duplicateNumbers, ["811"]);
  assert.ok(duplicate.slots.every((slot) => slot.machineNumber === null));
});

test("実画像3枚の58台をグラフ枠と同じ順序で58/58認識する", {
  skip: !HAS_REAL_FIXTURES && "実画像fixtureなし",
}, async () => {
  let recognized = 0;
  for (const fixture of FIXTURES) {
    const image = await loadFixture(fixture.file);
    const analysis = runAnalysis(image.data, image.width, image.height);
    const page = attachMachineNumbersToSlots(
      image.data,
      image.width,
      image.height,
      analysis.results,
    );
    assert.equal(page.accepted, true, `${fixture.file}: ページ全体が合格すること`);
    assert.deepEqual(page.candidates, fixture.numbers);
    assert.deepEqual(page.numbers, fixture.numbers);
    assert.equal(compareMachineNumberSet(page, fixture.numbers).matched, true);
    assert.ok(page.slots.every((slot) => slot.machineNumber === slot.machineNumberCandidate));
    recognized += page.numbers.length;
  }
  assert.equal(recognized, 58);
});

test("3画像の投入順を変えても58台の番号とグラフslot対応が変わらない", {
  skip: !HAS_REAL_FIXTURES && "実画像fixtureなし",
}, async () => {
  const pages = [];
  for (const fixture of FIXTURES) {
    const image = await loadFixture(fixture.file);
    const analysis = runAnalysis(image.data, image.width, image.height);
    const page = attachMachineNumbersToSlots(
      image.data,
      image.width,
      image.height,
      analysis.results,
    );
    pages.push({
      ...page,
      slots: page.slots.map((slot) => ({ ...slot, sourceFile: fixture.file })),
    });
  }

  const normal = combineMachineNumberPages(pages);
  const shuffled = combineMachineNumberPages([pages[2], pages[0], pages[1]]);
  const expected = [
    ...Array.from({ length: 30 }, (_, index) => String(757 + index)),
    ...Array.from({ length: 28 }, (_, index) => String(800 + index)),
  ];
  assert.equal(normal.accepted, true);
  assert.equal(shuffled.accepted, true);
  assert.deepEqual(normal.numbers, expected);
  assert.deepEqual(shuffled.numbers, expected);

  const fingerprint = (result) => result.slots.map((slot) => [
    slot.machineNumber,
    slot.val,
    slot.sourceFile,
    slot.bbox.x,
    slot.bbox.y,
  ]);
  assert.deepEqual(fingerprint(shuffled), fingerprint(normal));
});

test("2月13日実画像は58台の台番号・差玉・判定をgolden値へ固定する", async () => {
  const pages = [];
  for (const fixture of FIXTURES) {
    const image = await loadFixture(fixture.file);
    const analysis = runAnalysis(image.data, image.width, image.height);
    pages.push(attachMachineNumbersToSlots(image.data, image.width, image.height, analysis.results));
  }
  const combined = combineMachineNumberPages([pages[2], pages[0], pages[1]]);
  assert.equal(combined.accepted, true);
  assert.equal(combined.slots.length, 58);

  const visible = new Map([
    ["757", [26000, "ok"]], ["758", [-12000, "ok"]],
    ["759", [29500, "review", "boundary-uncertain"]],
    ["760", [-4000, "review", "short-series"]],
    ["761", [-20500, "ok"]], ["762", [30000, "review", "clipped-series"]],
    ["763", [1000, "ok"]], ["764", [-15500, "ok"]],
    ["777", [13500, "ok"]], ["778", [500, "ok"]],
    ["779", [-4500, "ok"]], ["780", [-25500, "ok"]],
    ["810", [-8500, "ok"]], ["811", [-5000, "ok"]],
    ["812", [22000, "ok"]], ["813", [2000, "ok"]],
  ]);
  const statusCounts = { ok: 0, review: 0, failed: 0 };
  for (const slot of combined.slots) {
    statusCounts[slot.status] += 1;
    const expected = visible.get(slot.machineNumber);
    if (!expected) {
      assert.equal(slot.val, null, `${slot.machineNumber}: 折れ線なしはnull`);
      assert.equal(slot.status, "failed", `${slot.machineNumber}: 保存不可`);
      assert.ok(slot.reasonCodes.includes("missing-series"));
      continue;
    }
    assert.equal(slot.val, expected[0], `${slot.machineNumber}: 差玉`);
    assert.equal(slot.status, expected[1], `${slot.machineNumber}: 判定`);
    if (expected[2]) {
      assert.ok(
        slot.reasonCodes.includes(expected[2]),
        `${slot.machineNumber}: ${expected[2]} を含む（actual: ${slot.reasonCodes.join(",")}）`,
      );
    }
  }
  assert.deepEqual(statusCounts, { ok: 13, review: 3, failed: 42 });
});

test("同じページを別名で追加しても横断重複として全slotを未確定にする", {
  skip: !HAS_REAL_FIXTURES && "実画像fixtureなし",
}, async () => {
  const fixture = FIXTURES[0];
  const image = await loadFixture(fixture.file);
  const analysis = runAnalysis(image.data, image.width, image.height);
  const page = attachMachineNumbersToSlots(
    image.data,
    image.width,
    image.height,
    analysis.results,
  );
  const renamedCopy = {
    ...page,
    name: "renamed-copy.png",
    slots: page.slots.map((slot) => ({ ...slot, sourceName: "renamed-copy.png" })),
  };
  const combined = combineMachineNumberPages([{ ...page, name: fixture.file }, renamedCopy]);
  assert.equal(combined.accepted, false);
  assert.ok(combined.reasonCodes.includes("duplicate-number"));
  assert.deepEqual(combined.duplicateNumbers, fixture.numbers);
  assert.equal(combined.numbers.length, 0);
  assert.ok(combined.slots.every((slot) => slot.machineNumber === null));
});

test("1件の文字が欠損したらページ全体を拒否し、他台も確定番号を持たない", {
  skip: !HAS_REAL_FIXTURES && "実画像fixtureなし",
}, async () => {
  const image = cloneImage(await loadFixture("01.png"));
  const before = runAnalysis(image.data, image.width, image.height);
  const firstPanel = before.results[0].bbox;
  // [810] の数字3桁を消し、括弧だけが残る破損を再現する。
  fillRect(image, firstPanel.x + firstPanel.width / 2 - 24, firstPanel.y - 43, 48, 26);
  const analysis = runAnalysis(image.data, image.width, image.height);
  const page = attachMachineNumbersToSlots(image.data, image.width, image.height, analysis.results);
  assert.equal(page.accepted, false);
  assert.ok(page.reasonCodes.includes("unresolved-number"));
  assert.equal(page.numbers.length, 0);
  assert.ok(page.slots.every((slot) => slot.machineNumber === null));
  assert.ok(page.slots.some((slot) => !slot.machineNumberOcr.accepted));
});

test("同じ台番号を2枠から読んだら重複としてページ全体を拒否する", {
  skip: !HAS_REAL_FIXTURES && "実画像fixtureなし",
}, async () => {
  const image = cloneImage(await loadFixture("01.png"));
  // 左上の[810]領域を右上の[811]領域へ複製する。
  copyRect(image, 160, 500, 546, 500, 98, 42);
  const analysis = runAnalysis(image.data, image.width, image.height);
  const page = attachMachineNumbersToSlots(image.data, image.width, image.height, analysis.results);
  assert.equal(page.candidates[0], "810");
  assert.equal(page.candidates[1], "810");
  assert.equal(page.accepted, false);
  assert.deepEqual(page.duplicateNumbers, ["810"]);
  assert.ok(page.reasonCodes.includes("duplicate-number"));
  assert.ok(page.slots.every((slot) => slot.machineNumber === null));
});

test("判読限界まで縮小された画像は誤保存せずページ拒否する", {
  skip: !HAS_REAL_FIXTURES && "実画像fixtureなし",
}, async () => {
  const image = await loadFixture("03.png", 0.4);
  const analysis = runAnalysis(image.data, image.width, image.height);
  const page = attachMachineNumbersToSlots(image.data, image.width, image.height, analysis.results);
  assert.equal(analysis.results.length, 20, "グラフ枠自体は20台を維持すること");
  assert.equal(page.accepted, false);
  assert.equal(page.numbers.length, 0);
  assert.ok(page.slots.every((slot) => slot.machineNumber === null));
});
