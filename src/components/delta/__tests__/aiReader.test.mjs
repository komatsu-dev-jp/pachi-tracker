// src/components/delta/__tests__/aiReader.test.mjs
// 実行: node --test src/components/delta/__tests__/aiReader.test.mjs
//
// AI読み取りクライアントの純粋関数（extractText / apiErrorMessage）の境界値テスト。
// fetch / canvas は環境依存のためテストしない。

import { test } from "node:test";
import assert from "node:assert";
import { extractText, apiErrorMessage, AI_MODEL, prepareAttachmentForAi } from "../aiReader.js";

// ──────────── AI_MODEL（API仕様の固定確認） ────────────

test("AI_MODEL: claude-opus-4-8 で固定", () => {
  assert.strictEqual(AI_MODEL, "claude-opus-4-8");
});

// ──────────── extractText ────────────

test("extractText: 単一 text ブロックの text を返す", () => {
  const json = { content: [{ type: "text", text: "816\t1239\t12" }] };
  assert.deepStrictEqual(extractText(json), { refused: false, text: "816\t1239\t12" });
});

test("extractText: 複数 text ブロックを連結する", () => {
  const json = { content: [{ type: "text", text: "行1\n" }, { type: "text", text: "行2" }] };
  assert.strictEqual(extractText(json).text, "行1\n行2");
});

test("extractText: text 以外のブロックは無視する", () => {
  const json = { content: [{ type: "tool_use", id: "x" }, { type: "text", text: "本文" }] };
  assert.strictEqual(extractText(json).text, "本文");
});

test("extractText: stop_reason refusal は { refused:true }", () => {
  const json = { stop_reason: "refusal", content: [{ type: "text", text: "無視される" }] };
  assert.deepStrictEqual(extractText(json), { refused: true });
});

test("extractText: 空 content は空文字", () => {
  assert.deepStrictEqual(extractText({ content: [] }), { refused: false, text: "" });
  assert.deepStrictEqual(extractText({}), { refused: false, text: "" });
  assert.deepStrictEqual(extractText(null), { refused: false, text: "" });
});

// ──────────── apiErrorMessage ────────────

test("apiErrorMessage: 401 はキー無効", () => {
  assert.strictEqual(apiErrorMessage(401), "APIキーが無効です。設定を確認してください");
});

test("apiErrorMessage: 429 はレート", () => {
  assert.strictEqual(apiErrorMessage(429), "リクエストが集中しています。少し待って再試行してください");
});

test("apiErrorMessage: 413 は画像サイズ", () => {
  assert.strictEqual(apiErrorMessage(413), "添付ファイルのサイズが大きすぎます");
});

test("apiErrorMessage: 400 はリクエストエラー", () => {
  assert.strictEqual(apiErrorMessage(400), "リクエストエラー（画像・PDF形式を確認してください）");
});

test("apiErrorMessage: 500 / 529 は混雑", () => {
  const msg = "AIサービスが混雑しています。少し待って再試行してください";
  assert.strictEqual(apiErrorMessage(500), msg);
  assert.strictEqual(apiErrorMessage(529), msg);
});

test("apiErrorMessage: その他はステータス番号付き", () => {
  assert.strictEqual(apiErrorMessage(418), "読み取りに失敗しました（エラー418）");
});

test("prepareAttachmentForAi: PDFをdocumentブロックへ変換", async () => {
  const block = await prepareAttachmentForAi({
    name: "大当たり情報.pdf",
    mediaType: "application/pdf",
    dataUrl: "data:application/pdf;base64,QUJD",
  });
  assert.deepStrictEqual(block, {
    type: "document",
    source: { type: "base64", media_type: "application/pdf", data: "QUJD" },
  });
});
