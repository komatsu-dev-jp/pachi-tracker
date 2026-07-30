import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";

function createIndexedDbMock() {
  const records = new Map();

  const database = {
    objectStoreNames: {
      contains: (name) => name === "pushInbox",
    },
    close() {},
    transaction(_storeName, mode) {
      const transaction = {
        error: null,
        objectStore() {
          return {
            add(record) {
              queueMicrotask(() => {
                if (records.has(record.batchId)) {
                  const error = new Error("duplicate");
                  error.name = "ConstraintError";
                  transaction.error = error;
                  transaction.onerror?.();
                  return;
                }
                records.set(record.batchId, structuredClone(record));
                transaction.oncomplete?.();
              });
            },
            get(batchId) {
              const request = {};
              queueMicrotask(() => {
                request.result = records.get(String(batchId));
                request.onsuccess?.();
              });
              return request;
            },
          };
        },
      };
      assert.ok(mode === "readonly" || mode === "readwrite");
      return transaction;
    },
  };

  return {
    records,
    indexedDB: {
      open() {
        const request = {};
        queueMicrotask(() => {
          request.result = database;
          request.onsuccess?.();
        });
        return request;
      },
    },
  };
}

function makeEnvelope(batchId, digestCharacter = "a") {
  return {
    schema: "pachi-tracker.push-batch",
    version: 1,
    batchId,
    createdAt: "2026-07-30T03:00:00.000Z",
    digest: `sha256:${digestCharacter.repeat(64)}`,
    payload: {
      schema: "pachi-tracker.delta-import",
    },
  };
}

async function loadPushWorker() {
  const source = await readFile(
    new URL("../../public/push-sw.js", import.meta.url),
    "utf8",
  );
  const { indexedDB, records } = createIndexedDbMock();
  const listeners = new Map();
  const messages = [];
  const notifications = [];
  let focusCount = 0;
  let navigateCount = 0;

  const client = {
    url: "https://pachi.example/app/",
    async focus() {
      focusCount += 1;
    },
    postMessage(message) {
      messages.push(structuredClone(message));
    },
    async navigate() {
      navigateCount += 1;
    },
  };

  const self = {
    registration: {
      scope: "https://pachi.example/app/",
      async showNotification(title, options) {
        notifications.push({ title, options: structuredClone(options) });
      },
    },
    clients: {
      async matchAll() {
        return [client];
      },
      async openWindow() {
        throw new Error("既存clientがあるためopenWindowは呼ばれません");
      },
    },
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
  };

  const context = vm.createContext({
    console,
    Date,
    Promise,
    URL,
    indexedDB,
    queueMicrotask,
    self,
  });
  vm.runInContext(
    `${source}\n;globalThis.__pushSwTest = { addPushInboxRecord, postPushInboxUpdated };`,
    context,
  );

  return {
    api: context.__pushSwTest,
    listeners,
    messages,
    notifications,
    records,
    counts: {
      get focus() {
        return focusCount;
      },
      get navigate() {
        return navigateCount;
      },
    },
  };
}

test("Service Workerは同じbatchIdの同内容だけを重複扱いし、別内容を競合として保護する", async () => {
  const worker = await loadPushWorker();
  const original = makeEnvelope("batch-safe-1", "a");

  assert.equal(await worker.api.addPushInboxRecord(original), "stored");
  assert.equal(await worker.api.addPushInboxRecord(original), "duplicate");
  assert.equal(
    await worker.api.addPushInboxRecord(makeEnvelope("batch-safe-1", "b")),
    "batch-id-conflict",
  );
  assert.equal(
    worker.records.get("batch-safe-1").envelope.digest,
    original.digest,
    "競合データで受信原本を上書きしてはいけない",
  );
});

test("Push保存後と通知クリック時は起動中アプリへ知らせ、既存画面をnavigateしない", async () => {
  const worker = await loadPushWorker();
  let pushTask;
  worker.listeners.get("push")({
    data: {
      text: () => JSON.stringify(makeEnvelope("batch-open-app", "c")),
    },
    waitUntil(task) {
      pushTask = task;
    },
  });
  await pushTask;

  assert.equal(worker.notifications.length, 1, "Push受信時は必ず見える通知を出す");
  assert.deepEqual(
    worker.messages.at(-1),
    {
      type: "PUSH_INBOX_UPDATED",
      batchId: "batch-open-app",
      reason: "stored",
    },
  );

  let clickTask;
  worker.listeners.get("notificationclick")({
    notification: {
      data: {
        url: "https://pachi.example/app/?pushInbox=1",
        batchId: "batch-open-app",
      },
      close() {},
    },
    waitUntil(task) {
      clickTask = task;
    },
  });
  await clickTask;

  assert.equal(worker.counts.focus, 1);
  assert.equal(worker.counts.navigate, 0, "入力途中の画面を再読み込みしてはいけない");
  assert.equal(worker.messages.at(-1).reason, "notification-click");
});
