#!/usr/bin/env node

import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parseEnvFile } from "./slack-notify.mjs";

const CONFIG_FILE = ".env.slack.local";
const STATE_FILE = ".slack-inbox-state.local";
const DEFAULT_PREFIXES = ["codex:", "codex：", "指示:", "指示："];

export function parseArgs(argv) {
  const options = {
    mode: "next",
    ackTs: "",
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--check") options.mode = "check";
    else if (arg === "--discover-users") options.mode = "discover-users";
    else if (arg === "--next") options.mode = "next";
    else if (arg === "--bootstrap") options.mode = "bootstrap";
    else if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg === "--ack") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error("--ack の後にSlackメッセージのIDが必要です。");
      options.mode = "ack";
      options.ackTs = value;
      index += 1;
    } else {
      throw new Error(`不明な指定です: ${arg}`);
    }
  }
  return options;
}

export function parseInstruction(text, prefixes = DEFAULT_PREFIXES) {
  const source = String(text || "").trim();
  const lowerSource = source.toLocaleLowerCase("ja-JP");
  const prefix = prefixes.find((candidate) => lowerSource.startsWith(candidate.toLocaleLowerCase("ja-JP")));
  if (!prefix) return null;
  const instruction = source.slice(prefix.length).trim();
  return instruction || null;
}

export function selectNextInstruction(messages, { allowedUserId, lastTs = "0" }) {
  if (!allowedUserId) return null;
  return [...messages]
    .filter((message) => (
      message
      && message.user === allowedUserId
      && !message.bot_id
      && !message.subtype
      && Number(message.ts) > Number(lastTs)
      && parseInstruction(message.text)
    ))
    .sort((left, right) => Number(left.ts) - Number(right.ts))
    .map((message) => ({
      ts: message.ts,
      userId: message.user,
      instruction: parseInstruction(message.text),
      threadTs: message.thread_ts || message.ts,
    }))[0] || null;
}

async function loadLocalConfig() {
  const path = resolve(process.cwd(), CONFIG_FILE);
  if (!existsSync(path)) return {};
  return parseEnvFile(await readFile(path, "utf8"));
}

function getConfig(fileConfig) {
  const read = (key, fallback = "") => process.env[key] || fileConfig[key] || fallback;
  return {
    botToken: read("SLACK_BOT_TOKEN"),
    channelId: read("SLACK_CHANNEL_ID"),
    allowedUserId: read("SLACK_ALLOWED_USER_ID"),
  };
}

async function slackApi(method, token, payload = {}) {
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

async function readState() {
  const path = resolve(process.cwd(), STATE_FILE);
  if (!existsSync(path)) return { lastTs: "0" };
  try {
    const state = JSON.parse(await readFile(path, "utf8"));
    return { lastTs: String(state.lastTs || "0") };
  } catch {
    return { lastTs: "0" };
  }
}

async function writeState(lastTs) {
  if (!/^\d+\.\d+$/u.test(String(lastTs))) throw new Error("SlackメッセージのID形式が正しくありません。");
  const path = resolve(process.cwd(), STATE_FILE);
  await writeFile(path, `${JSON.stringify({ lastTs: String(lastTs) }, null, 2)}\n`, "utf8");
}

async function fetchHistory(config, limit = 100) {
  return slackApi("conversations.history", config.botToken, {
    channel: config.channelId,
    limit,
    inclusive: true,
  });
}

function validateBaseConfig(config) {
  if (!config.botToken || !config.channelId) {
    throw new Error("SLACK_BOT_TOKEN と SLACK_CHANNEL_ID が必要です。");
  }
}

function printHelp() {
  console.log(`Slack 指示受信

Slackの #pati-tracker に次の形式で投稿します。
  codex: ホーム画面の表示崩れを直してください

使い方:
  npm run slack:inbox -- --check
  npm run slack:inbox -- --discover-users
  npm run slack:inbox -- --next
  npm run slack:inbox -- --ack 1234567890.123456
  npm run slack:inbox -- --bootstrap

通常メッセージは無視し、SLACK_ALLOWED_USER_ID の投稿だけを受け付けます。`);
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) {
    printHelp();
    return;
  }

  const config = getConfig(await loadLocalConfig());
  validateBaseConfig(config);

  if (options.mode === "check") {
    const [auth, history] = await Promise.all([
      slackApi("auth.test", config.botToken),
      fetchHistory(config, 1),
    ]);
    console.log(JSON.stringify({
      status: "ok",
      readMessages: Array.isArray(history.messages),
      allowedUserConfigured: Boolean(config.allowedUserId),
      botUserIdDetected: Boolean(auth.user_id),
    }));
    return;
  }

  const history = await fetchHistory(config);
  const messages = Array.isArray(history.messages) ? history.messages : [];

  if (options.mode === "discover-users") {
    const users = new Map();
    for (const message of messages) {
      if (message.user && !message.bot_id) {
        const current = users.get(message.user);
        if (!current || Number(message.ts) > Number(current.latestTs)) {
          users.set(message.user, { userId: message.user, latestTs: message.ts });
        }
      }
    }
    console.log(JSON.stringify({ users: [...users.values()] }));
    return;
  }

  if (options.mode === "bootstrap") {
    const latestTs = messages.map((message) => message.ts).filter(Boolean).sort((a, b) => Number(b) - Number(a))[0];
    if (latestTs) await writeState(latestTs);
    console.log(JSON.stringify({ status: "bootstrapped", hasMessages: Boolean(latestTs) }));
    return;
  }

  if (options.mode === "ack") {
    await writeState(options.ackTs);
    console.log(JSON.stringify({ status: "acknowledged", ts: options.ackTs }));
    return;
  }

  if (!config.allowedUserId) {
    console.log(JSON.stringify({ status: "configuration_required", reason: "SLACK_ALLOWED_USER_ID" }));
    return;
  }

  const state = await readState();
  const instruction = selectNextInstruction(messages, {
    allowedUserId: config.allowedUserId,
    lastTs: state.lastTs,
  });
  console.log(JSON.stringify(instruction
    ? { status: "instruction", ...instruction }
    : { status: "none" }));
}

const isDirectRun = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  main().catch((error) => {
    console.error(`Slack指示の確認に失敗しました: ${error.message}`);
    process.exitCode = 1;
  });
}
