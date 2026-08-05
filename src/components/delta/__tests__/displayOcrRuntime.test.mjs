import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import test from "node:test";
import { OCR_ASSET_VERSION, createDisplayOcrSession, recognizeDisplayImages } from "../displayOcrRuntime.js";

const sha256 = (path) => createHash("sha256").update(readFileSync(path)).digest("hex").toUpperCase();

test("worker uses the versioned complete-core assets without an external fallback", async () => {
  let args;
  await recognizeDisplayImages([], { createWorkerImpl: async (...value) => { args = value; return { terminate: async () => {} }; } });
  assert.equal(OCR_ASSET_VERSION, "tesseract-v7-data-v2");
  assert.equal(args[0], "jpn+eng");
  assert.equal(args[1], 1);
  assert.match(args[2].workerPath, /\/ocr\/tesseract-v7-data-v2\/worker\.min\.mjs$/);
  assert.match(args[2].langPath, /\/ocr\/tesseract-v7-data-v2$/);
  assert.match(args[2].corePath, /\/ocr\/tesseract-v7-data-v2\/tesseract-core\.wasm\.js$/);
  assert.equal(args[2].legacyCore, true);
  assert.equal(args[2].legacyLang, true);
  for (const key of ["workerPath", "langPath", "corePath"]) assert.doesNotMatch(args[2][key], /^https?:\/\//);
});

test("v2 OCR assets match the pinned complete-core sources", () => {
  const root = "public/ocr/tesseract-v7-data-v2";
  const assets = [
    ["worker.min.mjs", 111307, "576B7DF7E3393E137E51849357C9ADB53FE7AC1BB69BFA06CF3D61520F182C6D"],
    ["jpn.traineddata.gz", 16163676, "70304835D33B4FEACF5FAA60F56176578B64A03DE2EEB0801539A3F6E7807CCC"],
    ["eng.traineddata.gz", 10923060, "ED350F3752F81EE8F38769EDC14D92D997DABABE23B565C59879372CC46A2468"],
    ["tesseract-core.wasm.js", 4687944, "0BC6CE3E5FBBD0CD89706CF2FD70960E3372F4F01EE24265B26990808AAEB286"],
    ["tesseract-core.wasm", 3449168, "C7F5ACE62AC0AD065E71E9C6725F1D7CDF82E7EDA8FBA532CBB9563964DA7098"],
  ];
  for (const [name, size, hash] of assets) {
    const path = `${root}/${name}`;
    assert.equal(statSync(path).size, size, name);
    assert.equal(sha256(path), hash, name);
  }
  assert.equal(sha256(`${root}/tesseract-core.wasm.js`), sha256("node_modules/tesseract.js-core/tesseract-core.wasm.js"));
  assert.notEqual(sha256(`${root}/tesseract-core.wasm.js`), sha256("node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js"));
});

test("one worker processes files sequentially and terminates once", async () => {
  const calls = []; let terminated = 0;
  const rows = await recognizeDisplayImages(["a", "b", "c"], { createWorkerImpl: async () => ({ recognize: async (file) => { calls.push(file); return { data: { text: "" } }; }, terminate: async () => { terminated += 1; } }) });
  assert.deepEqual(calls, ["a", "b", "c"]); assert.equal(rows.length, 3); assert.equal(terminated, 1);
});
test("worker terminates exactly once after recognition failure", async () => { let terminated = 0; await assert.rejects(() => recognizeDisplayImages(["a"], { createWorkerImpl: async () => ({ recognize: async () => { throw new Error("failed"); }, terminate: async () => { terminated += 1; } }) })); assert.equal(terminated, 1); });
test("abort terminates an active worker exactly once", async () => { const controller = new AbortController(); let terminated = 0; const promise = recognizeDisplayImages(["a"], { signal: controller.signal, createWorkerImpl: async () => ({ recognize: async () => new Promise(() => {}), terminate: async () => { terminated += 1; } }) }); await new Promise((resolve) => setTimeout(resolve, 0)); controller.abort(); await new Promise((resolve) => setTimeout(resolve, 0)); assert.equal(terminated, 1); });

function deferred() { let resolve; let reject; const promise = new Promise((res, rej) => { resolve = res; reject = rej; }); return { promise, resolve, reject }; }
test("newer run is the only run allowed to publish progress, success and settled", async () => {
  const work = []; const calls = [];
  const session = createDisplayOcrSession((_files, options) => { const next = deferred(); work.push({ next, signal: options.signal, progress: options.onProgress }); return next.promise; });
  const first = session.run(["A"], { onProgress: () => calls.push("A-progress"), onSuccess: () => calls.push("A-success"), onSettled: () => calls.push("A-settled") });
  const second = session.run(["B"], { onProgress: () => calls.push("B-progress"), onSuccess: () => calls.push("B-success"), onSettled: () => calls.push("B-settled") });
  assert.equal(work[0].signal.aborted, true);
  work[0].progress({ completed: 1, total: 1 }); work[0].next.resolve(["old"]);
  work[1].progress({ completed: 1, total: 1 }); work[1].next.resolve(["new"]);
  assert.deepEqual(await first, { stale: true, rows: [] }); assert.deepEqual(await second, { stale: false, rows: ["new"] });
  assert.deepEqual(calls, ["B-progress", "B-success", "B-settled"]);
});
test("cancel ignores late rejection and never settles stale run", async () => {
  const gate = deferred(); const calls = [];
  const session = createDisplayOcrSession((_files, options) => { gate.signal = options.signal; return gate.promise; });
  const running = session.run(["A"], { onError: () => calls.push("error"), onSettled: () => calls.push("settled") });
  session.cancel(); assert.equal(gate.signal.aborted, true);
  gate.reject(new Error("late"));
  assert.deepEqual(await running, { stale: true, rows: [] }); assert.deepEqual(calls, []);
});
