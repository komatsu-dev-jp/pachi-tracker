// このファイルはWorkbox製Service WorkerからimportScriptsで読み込む。
// Pushは既存の解析記録へ直接書かず、追加専用の受信箱へだけ保存する。
const PUSH_INBOX_DB_NAME = "pachi_tracker_db";
const PUSH_INBOX_STORE_NAME = "pushInbox";
const PUSH_ENVELOPE_SCHEMA = "pachi-tracker.push-batch";
const REVIEW_NOTICE_SCHEMA = "pachi-tracker.review-notice";
const PUSH_SCHEMA_VERSION = 1;
const BATCH_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/i;

function isPlainPushObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isStorablePushEnvelope(value) {
  return isPlainPushObject(value)
    && value.schema === PUSH_ENVELOPE_SCHEMA
    && value.version === PUSH_SCHEMA_VERSION
    && BATCH_ID_PATTERN.test(String(value.batchId || ""))
    && typeof value.createdAt === "string"
    && Number.isFinite(Date.parse(value.createdAt))
    && DIGEST_PATTERN.test(String(value.digest || ""))
    && isPlainPushObject(value.payload);
}

function openPushInboxDatabase() {
  return new Promise((resolve, reject) => {
    // Dexieの論理v2は内部でIndexedDBのバージョンへ変換されるため、
    // ここでは番号を指定せず、アプリが準備済みのDBを開く。
    const request = indexedDB.open(PUSH_INBOX_DB_NAME);
    request.onupgradeneeded = () => {
      // Push購読前にアプリ側がv2を準備する。SW単独では空DBを作らない。
      request.transaction.abort();
    };
    request.onerror = () => reject(request.error || new Error("受信箱DBを開けません"));
    request.onblocked = () => reject(new Error("受信箱DBが使用中です"));
    request.onsuccess = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(PUSH_INBOX_STORE_NAME)) {
        database.close();
        reject(new Error("受信箱が準備されていません"));
        return;
      }
      resolve(database);
    };
  });
}

function readPushInboxRecord(database, batchId) {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(PUSH_INBOX_STORE_NAME, "readonly");
    const request = transaction.objectStore(PUSH_INBOX_STORE_NAME).get(String(batchId));
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error || new Error("既存の受信データを確認できません"));
    transaction.onabort = () => reject(transaction.error || new Error("既存の受信データを確認できません"));
  });
}

async function addPushInboxRecord(envelope) {
  const database = await openPushInboxDatabase();
  try {
    await new Promise((resolve, reject) => {
      const transaction = database.transaction(PUSH_INBOX_STORE_NAME, "readwrite");
      const store = transaction.objectStore(PUSH_INBOX_STORE_NAME);
      // addを使い、同じbatchIdの再送で既存内容を上書きしない。
      store.add({
        batchId: String(envelope.batchId),
        receivedAt: new Date().toISOString(),
        status: "pending",
        envelope,
      });
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error("受信データを保存できません"));
      transaction.onabort = () => reject(transaction.error || new Error("受信データを追加できません"));
    });
    return "stored";
  } catch (error) {
    if (error?.name === "ConstraintError") {
      const existing = await readPushInboxRecord(database, envelope.batchId);
      const existingDigest = String(existing?.envelope?.digest || "").toLowerCase();
      const incomingDigest = String(envelope.digest || "").toLowerCase();
      return existingDigest === incomingDigest ? "duplicate" : "batch-id-conflict";
    }
    throw error;
  } finally {
    database.close();
  }
}

async function postPushInboxUpdated(batchId, reason = "stored") {
  try {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) {
      client.postMessage({
        type: "PUSH_INBOX_UPDATED",
        batchId: String(batchId || ""),
        reason,
      });
    }
  } catch {
    // アプリが閉じている場合もある。通知は別経路で必ず表示する。
  }
}

async function showPushResultNotification(result, batchId = "", envelope = null) {
  const messages = {
    stored: "解析データを受信しました。アプリを開くと安全確認後に自動登録します。",
    duplicate: "同じ解析データを再受信しました。既存データは変更していません。",
    "batch-id-conflict": "同じIDで内容が異なるデータを受信したため、既存データを保護して取り込みませんでした。",
    invalid: "受信データを確認できませんでした。Windows側から再送してください。",
    failed: "受信データを保存できませんでした。Windows側から再送してください。",
  };
  const isReviewNotice = envelope?.payload?.schema === REVIEW_NOTICE_SCHEMA;
  const pendingMachineCount = Array.isArray(envelope?.payload?.notice?.pendingMachines)
    ? envelope.payload.notice.pendingMachines.length
    : 0;
  const body = result === "stored" && isReviewNotice
    ? `Windows解析で${pendingMachineCount}台の確認が必要です。アプリの「保留」を確認してください。`
    : (messages[result] || messages.failed);
  const url = new URL("./?pushInbox=1", self.registration.scope).href;
  await self.registration.showNotification("パチトラッカー", {
    body,
    icon: new URL("icon-192.png", self.registration.scope).href,
    badge: new URL("favicon-32.png", self.registration.scope).href,
    tag: batchId ? `pachi-push-${batchId}` : `pachi-push-error-${Date.now()}`,
    renotify: true,
    data: { url, batchId },
  });
}

self.addEventListener("push", (event) => {
  event.waitUntil((async () => {
    let envelope = null;
    try {
      envelope = event.data ? JSON.parse(event.data.text()) : null;
    } catch {
      await showPushResultNotification("invalid");
      return;
    }

    if (!isStorablePushEnvelope(envelope)) {
      await showPushResultNotification("invalid");
      return;
    }

    try {
      const result = await addPushInboxRecord(envelope);
      if (result === "stored") {
        await postPushInboxUpdated(envelope.batchId, "stored");
      }
      await showPushResultNotification(result, envelope.batchId, envelope);
    } catch {
      await showPushResultNotification("failed", envelope.batchId);
    }
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url
    || new URL("./?pushInbox=1", self.registration.scope).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) {
      if (new URL(client.url).origin === new URL(targetUrl).origin) {
        await client.focus();
        client.postMessage({
          type: "PUSH_INBOX_UPDATED",
          batchId: String(event.notification.data?.batchId || ""),
          reason: "notification-click",
        });
        return;
      }
    }
    await self.clients.openWindow(targetUrl);
  })());
});
