#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { basename, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const CONFIG_FILE = ".env.slack.local";
const MAX_BLOCK_TEXT = 2800;

export const STAGES = Object.freeze({
  plan: {
    emoji: "📋",
    label: "実装計画",
    imageNote: "計画資料です。実装済み画面ではありません。",
  },
  mock: {
    emoji: "🖼️",
    label: "確認用モック画像",
    imageNote: "これは確認用モックです。実装済み画面ではありません。",
  },
  progress: {
    emoji: "🚧",
    label: "実装中",
    imageNote: "これは現在実装中の画面です。仕様や見た目が変わる場合があります。",
  },
  complete: {
    emoji: "✅",
    label: "実装完了",
    imageNote: "実装完了後の確認画面です。",
  },
  warning: {
    emoji: "⚠️",
    label: "要確認",
    imageNote: "確認が必要な画面です。",
  },
});

export function parseEnvFile(source) {
  const result = {};
  for (const rawLine of String(source).split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      value.length >= 2
      && ((value.startsWith('"') && value.endsWith('"'))
        || (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    if (/^[A-Z][A-Z0-9_]*$/u.test(key)) result[key] = value;
  }
  return result;
}

export function parseArgs(argv) {
  const options = {
    type: "progress",
    title: "",
    message: "",
    messageFile: "",
    images: [],
    dryRun: false,
    check: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--check") options.check = true;
    else if (arg === "--help" || arg === "-h") options.help = true;
    else if (["--type", "--title", "--message", "--message-file", "--image"].includes(arg)) {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${arg} の後に値が必要です。`);
      index += 1;
      if (arg === "--type") options.type = value;
      else if (arg === "--title") options.title = value;
      else if (arg === "--message") options.message = value;
      else if (arg === "--message-file") options.messageFile = value;
      else options.images.push(value);
    } else {
      throw new Error(`不明な指定です: ${arg}`);
    }
  }
  return options;
}

function splitText(value, maxLength = MAX_BLOCK_TEXT) {
  const text = String(value || "").trim();
  if (!text) return [];
  const chunks = [];
  let rest = text;
  while (rest.length > maxLength) {
    let cut = rest.lastIndexOf("\n", maxLength);
    if (cut < Math.floor(maxLength * 0.5)) cut = maxLength;
    chunks.push(rest.slice(0, cut));
    rest = rest.slice(cut).trimStart();
  }
  if (rest) chunks.push(rest);
  return chunks;
}

function escapeSlackText(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function gitValue(args) {
  try {
    return execFileSync("git", args, {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

export function buildMessage({ type, title, message, project, branch, commit, hasImages }) {
  const stage = STAGES[type];
  if (!stage) throw new Error(`--type は ${Object.keys(STAGES).join(" / ")} のどれかを指定してください。`);

  const safeTitle = title.trim() || stage.label;
  const heading = `${stage.emoji} ${stage.label}｜${safeTitle}`;
  const note = hasImages ? stage.imageNote : "";
  const body = [note, message.trim()].filter(Boolean).join("\n\n");
  const timestamp = new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Tokyo",
  }).format(new Date());
  const context = [project, branch ? `branch: ${branch}` : "", commit ? `commit: ${commit}` : "", timestamp]
    .filter(Boolean)
    .join("  •  ");

  const blocks = [
    {
      type: "header",
      text: { type: "plain_text", text: heading.slice(0, 150), emoji: true },
    },
    ...splitText(body).map((chunk) => ({
      type: "section",
      text: { type: "mrkdwn", text: escapeSlackText(chunk) },
    })),
    {
      type: "context",
      elements: [{ type: "mrkdwn", text: escapeSlackText(context) }],
    },
  ];

  return {
    heading,
    note,
    text: [heading, note, message.trim()].filter(Boolean).join("\n"),
    blocks,
  };
}

async function loadLocalConfig() {
  const path = resolve(process.cwd(), CONFIG_FILE);
  if (!existsSync(path)) return {};
  return parseEnvFile(await readFile(path, "utf8"));
}

async function loadOptions(argv) {
  const options = parseArgs(argv);
  if (options.messageFile) {
    options.message = await readFile(resolve(process.cwd(), options.messageFile), "utf8");
  }
  options.images = options.images.map((path) => resolve(process.cwd(), path));
  return options;
}

function getConfig(fileConfig) {
  const read = (key, fallback = "") => process.env[key] || fileConfig[key] || fallback;
  return {
    botToken: read("SLACK_BOT_TOKEN"),
    channelId: read("SLACK_CHANNEL_ID"),
    webhookUrl: read("SLACK_WEBHOOK_URL"),
    project: read("SLACK_PROJECT_NAME", "Pachi Tracker"),
    threadTs: read("SLACK_THREAD_TS"),
  };
}

function printHelp() {
  console.log(`Slack 開発通知

使い方:
  npm run slack:check
  npm run slack:notify -- --type plan --title "次の実装" --message "1. UI確認\n2. 実装"
  npm run slack:notify -- --type mock --title "ホーム画面案" --message "A案です" --image mock.png
  npm run slack:notify -- --type progress --title "UI実装" --message "カードまで完了"
  npm run slack:notify -- --type complete --title "実装完了" --message "lint/build確認済み" --image result.png

指定:
  --type          plan / mock / progress / complete / warning
  --title         通知の見出し
  --message       通知本文
  --message-file  本文に使うテキストファイル
  --image         送信する画像。複数回指定可能
  --dry-run       Slackに送らず内容だけ確認
  --check         秘密鍵を表示せず設定状態を確認
`);
}

function validateConfig(config, hasImages) {
  const hasBotDestination = Boolean(config.botToken && config.channelId);
  if (hasImages && (!config.botToken || !config.channelId)) {
    throw new Error("画像送信には SLACK_BOT_TOKEN と SLACK_CHANNEL_ID が必要です。");
  }
  if (!hasImages && !hasBotDestination && !config.webhookUrl) {
    if (config.botToken && !config.channelId) {
      throw new Error("SLACK_BOT_TOKEN を使う場合は SLACK_CHANNEL_ID も必要です。");
    }
    throw new Error("SLACK_BOT_TOKEN または SLACK_WEBHOOK_URL を設定してください。");
  }
}

async function slackJsonApi(method, token, payload) {
  const response = await fetch(`https://slack.com/api/${method}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30_000),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.ok) {
    throw new Error(`Slack API (${method}) エラー: ${result.error || response.status}`);
  }
  return result;
}

async function slackFormApi(method, token, payload) {
  const form = new URLSearchParams();
  for (const [key, value] of Object.entries(payload)) form.set(key, String(value));
  const response = await fetch(`https://slack.com/api/${method}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/x-www-form-urlencoded; charset=utf-8",
    },
    body: form,
    signal: AbortSignal.timeout(30_000),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.ok) {
    throw new Error(`Slack API (${method}) エラー: ${result.error || response.status}`);
  }
  return result;
}

async function postText(config, content) {
  if (config.botToken && config.channelId) {
    return slackJsonApi("chat.postMessage", config.botToken, {
      channel: config.channelId,
      text: content.text,
      blocks: content.blocks,
      ...(config.threadTs ? { thread_ts: config.threadTs } : {}),
    });
  }

  const response = await fetch(config.webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ text: content.text, blocks: content.blocks }),
    signal: AbortSignal.timeout(30_000),
  });
  const result = await response.text();
  if (!response.ok || result.trim() !== "ok") {
    throw new Error(`Slack Webhook エラー: ${response.status}`);
  }
  return { ok: true };
}

async function requestUpload(config, imagePath) {
  const info = await stat(imagePath);
  if (!info.isFile()) throw new Error(`画像ファイルではありません: ${imagePath}`);
  const filename = basename(imagePath);
  const ticket = await slackFormApi("files.getUploadURLExternal", config.botToken, {
    filename,
    length: info.size,
  });
  const bytes = await readFile(imagePath);
  const upload = await fetch(ticket.upload_url, {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream" },
    body: bytes,
    signal: AbortSignal.timeout(60_000),
  });
  if (!upload.ok) throw new Error(`Slack 画像アップロードエラー: ${upload.status}`);
  return { id: ticket.file_id, title: filename };
}

async function uploadImages(config, content, images) {
  const files = [];
  for (const imagePath of images) files.push(await requestUpload(config, imagePath));
  return slackJsonApi("files.completeUploadExternal", config.botToken, {
    files,
    channel_id: config.channelId,
    initial_comment: content.text,
    ...(config.threadTs ? { thread_ts: config.threadTs } : {}),
  });
}

function assertImages(images) {
  const allowed = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp"]);
  for (const imagePath of images) {
    if (!existsSync(imagePath)) throw new Error(`画像が見つかりません: ${imagePath}`);
    if (!allowed.has(extname(imagePath).toLowerCase())) {
      throw new Error(`対応画像は PNG / JPG / GIF / WebP です: ${imagePath}`);
    }
  }
}

export async function main(argv = process.argv.slice(2)) {
  const options = await loadOptions(argv);
  if (options.help) {
    printHelp();
    return;
  }

  const config = getConfig(await loadLocalConfig());
  if (options.check) {
    const canPostText = (config.botToken && config.channelId) || config.webhookUrl;
    console.log(`Slack 設定: 文章通知=${canPostText ? "利用可能" : "未設定"} / 画像通知=${config.botToken && config.channelId ? "利用可能" : "未設定"}`);
    return;
  }

  if (!STAGES[options.type]) {
    throw new Error(`--type は ${Object.keys(STAGES).join(" / ")} のどれかを指定してください。`);
  }
  if (!options.message.trim() && options.images.length === 0) {
    throw new Error("--message、--message-file、--image のいずれかを指定してください。");
  }
  if (options.type === "mock" && options.images.length === 0) {
    throw new Error("モック通知には --image で画像を指定してください。");
  }
  assertImages(options.images);

  const content = buildMessage({
    type: options.type,
    title: options.title,
    message: options.message,
    project: config.project,
    branch: gitValue(["rev-parse", "--abbrev-ref", "HEAD"]),
    commit: gitValue(["rev-parse", "--short", "HEAD"]),
    hasImages: options.images.length > 0,
  });

  if (options.dryRun) {
    console.log(JSON.stringify({
      mode: "dry-run",
      type: options.type,
      text: content.text,
      images: options.images.map((path) => basename(path)),
    }, null, 2));
    return;
  }

  validateConfig(config, options.images.length > 0);
  if (options.images.length > 0) await uploadImages(config, content, options.images);
  else await postText(config, content);
  console.log(`Slackへ送信しました: ${content.heading}`);
}

const isDirectRun = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  main().catch((error) => {
    console.error(`Slack通知に失敗しました: ${error.message}`);
    process.exitCode = 1;
  });
}
