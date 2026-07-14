import test from "node:test";
import assert from "node:assert/strict";

import { parseArgs, parseInstruction, selectNextInstruction } from "../slack-inbox.mjs";

test("codexまたは指示の接頭辞だけを命令として扱う", () => {
  assert.equal(parseInstruction("codex: ホーム画面を直す"), "ホーム画面を直す");
  assert.equal(parseInstruction("Codex： テストする"), "テストする");
  assert.equal(parseInstruction("指示: ビルドする"), "ビルドする");
  assert.equal(parseInstruction("通常の会話です"), null);
  assert.equal(parseInstruction("codex:"), null);
});

test("許可ユーザーの未処理メッセージだけを古い順に選ぶ", () => {
  const messages = [
    { ts: "30.0", user: "U_OK", text: "codex: 3番目" },
    { ts: "20.0", user: "U_OTHER", text: "codex: 他人" },
    { ts: "15.0", user: "U_OK", text: "通常会話" },
    { ts: "10.0", user: "U_OK", text: "codex: 処理済み" },
    { ts: "25.0", user: "U_OK", text: "指示: 2番目" },
  ];

  assert.deepEqual(selectNextInstruction(messages, {
    allowedUserId: "U_OK",
    lastTs: "10.0",
  }), {
    ts: "25.0",
    userId: "U_OK",
    instruction: "2番目",
    threadTs: "25.0",
  });
});

test("Bot投稿とサブタイプ付き投稿を無視する", () => {
  const messages = [
    { ts: "11.0", user: "U_OK", text: "codex: Bot", bot_id: "B1" },
    { ts: "12.0", user: "U_OK", text: "codex: 編集", subtype: "message_changed" },
  ];
  assert.equal(selectNextInstruction(messages, { allowedUserId: "U_OK" }), null);
});

test("引数を解析する", () => {
  assert.deepEqual(parseArgs(["--check"]), { mode: "check", ackTs: "", help: false });
  assert.deepEqual(parseArgs(["--ack", "123.456"]), { mode: "ack", ackTs: "123.456", help: false });
  assert.throws(() => parseArgs(["--unknown"]), /不明な指定/u);
});
