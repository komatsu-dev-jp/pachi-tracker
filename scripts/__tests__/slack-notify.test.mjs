import test from "node:test";
import assert from "node:assert/strict";

import {
  buildMessage,
  parseArgs,
  parseEnvFile,
} from "../slack-notify.mjs";

test(".env のコメント・引用符・値内の = を扱える", () => {
  assert.deepEqual(parseEnvFile(`
# comment
SLACK_CHANNEL_ID=C123
SLACK_PROJECT_NAME="Pachi Tracker"
SLACK_WEBHOOK_URL=https://example.test/a=b
invalid-key=ignored
`), {
    SLACK_CHANNEL_ID: "C123",
    SLACK_PROJECT_NAME: "Pachi Tracker",
    SLACK_WEBHOOK_URL: "https://example.test/a=b",
  });
});

test("複数画像と dry-run を解釈できる", () => {
  assert.deepEqual(parseArgs([
    "--type", "mock",
    "--title", "A案",
    "--message", "確認ください",
    "--image", "a.png",
    "--image", "b.jpg",
    "--dry-run",
  ]), {
    type: "mock",
    title: "A案",
    message: "確認ください",
    messageFile: "",
    images: ["a.png", "b.jpg"],
    dryRun: true,
    check: false,
    help: false,
  });
});

test("モック画像に未実装の注記が必ず入る", () => {
  const content = buildMessage({
    type: "mock",
    title: "ホーム画面",
    message: "A案です",
    project: "Pachi Tracker",
    branch: "codex/example",
    commit: "abc1234",
    hasImages: true,
  });

  assert.match(content.text, /確認用モック/u);
  assert.match(content.text, /実装済み画面ではありません/u);
  assert.equal(content.blocks[0].type, "header");
});

test("実装中画像は仕様変更の可能性を表示する", () => {
  const content = buildMessage({
    type: "progress",
    title: "進捗",
    message: "カードを実装",
    project: "Pachi Tracker",
    branch: "main",
    commit: "abc1234",
    hasImages: true,
  });

  assert.match(content.text, /現在実装中/u);
  assert.match(content.text, /変わる場合/u);
});
