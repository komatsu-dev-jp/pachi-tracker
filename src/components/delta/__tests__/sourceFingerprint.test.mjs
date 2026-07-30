import test from "node:test";
import assert from "node:assert/strict";

import {
  createSourceFingerprint,
  normalizeSourceFingerprint,
} from "../sourceFingerprint.js";

function mockFile(text) {
  const bytes = new TextEncoder().encode(text);
  return {
    arrayBuffer: async () => bytes.slice().buffer,
  };
}

test("同じファイル集合は選択順が変わっても同じSHA-256になる", async () => {
  const first = await createSourceFingerprint([mockFile("graph"), mockFile("table")]);
  const second = await createSourceFingerprint([mockFile("table"), mockFile("graph")]);
  assert.deepEqual(first, second);
  assert.match(first.hash, /^[a-f0-9]{64}$/u);
  assert.equal(first.fileCount, 2);
});

test("内容が1つでも違えば別の取込元として識別する", async () => {
  const first = await createSourceFingerprint([mockFile("graph-a")]);
  const second = await createSourceFingerprint([mockFile("graph-b")]);
  assert.notEqual(first.hash, second.hash);
});

test("同じ内容を別の選択画面で重ねて選んでも同じ資料集合として扱う", async () => {
  const once = await createSourceFingerprint([mockFile("graph"), mockFile("table")]);
  const repeated = await createSourceFingerprint([
    mockFile("graph"),
    mockFile("table"),
    mockFile("table"),
  ]);
  assert.deepEqual(repeated, once);
});

test("壊れた指紋データは保存用に採用しない", () => {
  assert.equal(normalizeSourceFingerprint({ hash: "bad", fileCount: 1, fileHashes: ["bad"] }), null);
  assert.equal(normalizeSourceFingerprint({
    algorithm: "MD5",
    hash: "a".repeat(64),
    fileCount: 1,
    fileHashes: ["b".repeat(64)],
  }), null);
});
