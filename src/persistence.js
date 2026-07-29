import { db } from "./db.js";
import {
    SECRET_BACKUP_KEYS,
    sanitizeBackupKv,
    sanitizeLegacyBackupObject,
} from "./backupSafety.js";

// useLS の同期 API 契約を保ったまま、内部実装を IndexedDB(Dexie) バックに差し替えるための層。
//
// 設計:
// - boot() で kv テーブルを一括 SELECT し memCache にロード（同期参照可能化）
// - useLS の useState lazy initializer は memCache.get(key) を返す
// - set(key, value) は memCache を即時更新し、IDB 書き込みは 250ms debounce + bulkPut で合流
// - visibilitychange/pagehide 等のライフサイクルイベントで flushAll() を即発火
//
// CLAUDE.md 規定: useLS の API シグネチャと外部契約（同期 setter / 初期値同期取得）は不変。

const KEY_PREFIX = "pt_";
const BACKUP_FORMAT = "pachi-tracker-backup";
const BACKUP_VERSION = 3;
const FLUSH_DEBOUNCE_MS = 250;
// localStorage クリーンアップ猶予: 30 日
const LS_CLEANUP_GRACE_MS = 30 * 24 * 60 * 60 * 1000;
const PERSISTENCE_LOCK_NAME = "pachi-tracker-persistence-v1";
const PERSISTENCE_CHANNEL_NAME = "pachi-tracker-persistence-events-v1";
export const PERSISTENCE_EPOCH_META_KEY = "persistence_epoch_v1";

export const PERSISTENCE_UPDATED_EVENT = "pachi:persistence-updated";
export const PERSISTENCE_EXCLUSIVE_START_EVENT = "pachi:persistence-exclusive-start";
export const PERSISTENCE_EXCLUSIVE_END_EVENT = "pachi:persistence-exclusive-end";

const memCache = new Map();
const dirtyKeys = new Set();
const writeVersions = new Map();
let flushTimer = null;
let bootPromise = null;
let bootCompleted = false;
let fallbackLockTail = Promise.resolve();
let persistenceEpoch = null;
let remoteExclusivePaused = false;
const persistenceTabId = (
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
)
    ? crypto.randomUUID()
    : `tab-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const persistenceChannel = (
    typeof window !== "undefined" && typeof BroadcastChannel === "function"
)
    ? new BroadcastChannel(PERSISTENCE_CHANNEL_NAME)
    : null;

function abortError() {
    return new DOMException("処理を中止しました", "AbortError");
}

function createPersistenceEpoch() {
    return (
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    )
        ? crypto.randomUUID()
        : `epoch-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function throwIfAborted(signal) {
    if (signal?.aborted) throw signal.reason || abortError();
}

async function assertPersistenceEpoch(expectedEpoch) {
    if (!expectedEpoch) throw abortError();
    const current = await db.meta.get(PERSISTENCE_EPOCH_META_KEY);
    if (current?.value !== expectedEpoch) throw abortError();
}

function dispatchPersistenceEvent(type, detail = {}) {
    if (typeof window === "undefined" || typeof window.dispatchEvent !== "function") return;
    window.dispatchEvent(new CustomEvent(type, { detail }));
}

function broadcastPersistenceEvent(type, detail = {}) {
    dispatchPersistenceEvent(type, detail);
    persistenceChannel?.postMessage({
        type,
        detail,
        sourceTabId: persistenceTabId,
    });
}

if (persistenceChannel) {
    persistenceChannel.addEventListener("message", (event) => {
        const message = event?.data;
        if (!message || message.sourceTabId === persistenceTabId) return;
        if (message.type === PERSISTENCE_EXCLUSIVE_START_EVENT) {
            remoteExclusivePaused = true;
            if (flushTimer != null) {
                clearTimeout(flushTimer);
                flushTimer = null;
            }
        } else if (message.type === PERSISTENCE_EXCLUSIVE_END_EVENT) {
            remoteExclusivePaused = false;
            if (dirtyKeys.size > 0) scheduleFlush();
        }
        if (message.type === PERSISTENCE_UPDATED_EVENT) {
            const key = message.detail?.key;
            if (typeof key === "string" && !dirtyKeys.has(key)) {
                memCache.set(key, message.detail.value);
            }
        }
        dispatchPersistenceEvent(message.type, {
            ...message.detail,
            remote: true,
        });
    });
}

export async function withExclusivePersistence(callback, { signal } = {}) {
    throwIfAborted(signal);
    if (
        typeof navigator !== "undefined"
        && navigator.locks
        && typeof navigator.locks.request === "function"
    ) {
        return navigator.locks.request(
            PERSISTENCE_LOCK_NAME,
            { mode: "exclusive", ...(signal ? { signal } : {}) },
            async () => {
                throwIfAborted(signal);
                return callback();
            },
        );
    }

    const previous = fallbackLockTail;
    let release;
    fallbackLockTail = new Promise((resolve) => {
        release = resolve;
    });
    await previous.catch(() => undefined);
    try {
        throwIfAborted(signal);
        return await callback();
    } finally {
        release();
    }
}

/* ────────────────────────────────────────────────────────────
   内部ヘルパー
──────────────────────────────────────────────────────────── */

function safeParseLS(raw) {
    try {
        return JSON.parse(raw);
    } catch {
        return undefined;
    }
}

function migrateFromLocalStorage() {
    // meta.migrated_v2 が立っていれば skip
    return db.transaction("rw", db.kv, db.meta, async () => {
        const flag = await db.meta.get("migrated_v2");
        if (flag && flag.value) return;

        const records = [];
        // localStorage の pt_* を全て読み出し IDB へコピー
        for (let i = 0; i < window.localStorage.length; i++) {
            const k = window.localStorage.key(i);
            if (!k || !k.startsWith(KEY_PREFIX)) continue;
            const raw = window.localStorage.getItem(k);
            if (raw == null) continue;
            const parsed = safeParseLS(raw);
            if (parsed === undefined) continue;
            records.push({ key: k, value: parsed });
        }
        if (records.length > 0) {
            await db.kv.bulkPut(records);
        }
        await db.meta.put({ key: "migrated_v2", value: true, ts: Date.now() });
        // クリーンアップ予定日（30 日後）を記録。実際の削除は別タイミング。
        await db.meta.put({
            key: "ls_cleanup_due_at",
            value: Date.now() + LS_CLEANUP_GRACE_MS,
        });
    });
}

async function loadAllIntoCache() {
    const rows = await db.kv.toArray();
    rows.forEach((row) => memCache.set(row.key, row.value));
}

async function loadOrCreatePersistenceEpoch() {
    persistenceEpoch = await db.transaction("rw", db.meta, async () => {
        const current = await db.meta.get(PERSISTENCE_EPOCH_META_KEY);
        if (typeof current?.value === "string" && current.value) return current.value;
        const next = createPersistenceEpoch();
        await db.meta.put({
            key: PERSISTENCE_EPOCH_META_KEY,
            value: next,
            ts: Date.now(),
        });
        return next;
    });
}

async function maybeRequestPersistentStorage() {
    try {
        if (
            typeof navigator !== "undefined" &&
            navigator.storage &&
            typeof navigator.storage.persist === "function"
        ) {
            await navigator.storage.persist();
        }
    } catch {
        // persist() のサポート無し / 拒否は致命的ではない
    }
}

function scheduleFlush() {
    if (remoteExclusivePaused || flushTimer != null) return;
    flushTimer = setTimeout(() => {
        flushTimer = null;
        flushAll().catch((e) => console.error("[persistence] flush error:", e));
    }, FLUSH_DEBOUNCE_MS);
}

/* ────────────────────────────────────────────────────────────
   公開 API
──────────────────────────────────────────────────────────── */

export function awaitReady() {
    if (bootCompleted) return Promise.resolve();
    if (bootPromise) return bootPromise;
    bootPromise = (async () => {
        try {
            await migrateFromLocalStorage();
            await loadOrCreatePersistenceEpoch();
            await loadAllIntoCache();
            // 起動時のストレージ永続化要求（戻り値は使わない）
            maybeRequestPersistentStorage();
        } catch (e) {
            console.error("[persistence] boot error:", e);
            // IDB が使えない環境ではフォールバックで localStorage を直接読む
            // （memCache が空のまま useLS が init を返す動作になる）
        } finally {
            bootCompleted = true;
        }
    })();
    return bootPromise;
}

export function getSync(key) {
    return memCache.get(key);
}

export function getPersistenceEpochSync() {
    return persistenceEpoch;
}

export function set(key, value) {
    if (Object.is(memCache.get(key), value)) return;
    memCache.set(key, value);
    dirtyKeys.add(key);
    writeVersions.set(key, (writeVersions.get(key) || 0) + 1);
    scheduleFlush();
}

export async function flushAll() {
    if (remoteExclusivePaused || dirtyKeys.size === 0) return;
    const expectedEpoch = persistenceEpoch;
    await withExclusivePersistence(async () => {
        if (remoteExclusivePaused) return;
        if (dirtyKeys.size === 0) return;
        const batch = [];
        dirtyKeys.forEach((key) => {
            batch.push({
                key,
                value: memCache.get(key),
                version: writeVersions.get(key) || 0,
            });
        });
        try {
            await db.transaction("rw", db.kv, db.meta, async () => {
                await assertPersistenceEpoch(expectedEpoch);
                await db.kv.bulkPut(batch.map(({ key, value }) => ({ key, value })));
            });
            batch.forEach(({ key, value, version }) => {
                if ((writeVersions.get(key) || 0) === version) {
                    dirtyKeys.delete(key);
                    broadcastPersistenceEvent(PERSISTENCE_UPDATED_EVENT, { key, value });
                }
            });
            if (dirtyKeys.size > 0) scheduleFlush();
        } catch (e) {
            console.error("[persistence] bulkPut failed:", e);
            batch.forEach(({ key }) => dirtyKeys.add(key));
            throw e;
        }
    });
}

// 1つの保存項目をIndexedDB内で「読んでから更新」まで一続きで処理する。
// 複数タブから同時に差玉データが届いても、古い配列で後勝ち上書きしないために使う。
export async function updateKeyAtomically(key, updater, { signal, expectedEpoch } = {}) {
    if (typeof key !== "string" || !key.startsWith(KEY_PREFIX)) {
        throw new Error("保存キーが不正です");
    }
    if (typeof updater !== "function") throw new Error("更新処理が必要です");
    await awaitReady();
    const requiredEpoch = expectedEpoch || persistenceEpoch;

    return withExclusivePersistence(async () => {
        throwIfAborted(signal);
        let nextValue;
        let changed = false;
        await db.transaction("rw", db.kv, db.meta, async () => {
            throwIfAborted(signal);
            await assertPersistenceEpoch(requiredEpoch);
            const row = await db.kv.get(key);
            const currentValue = dirtyKeys.has(key)
                ? memCache.get(key)
                : row?.value;
            nextValue = await updater(currentValue);
            throwIfAborted(signal);
            changed = !Object.is(nextValue, currentValue);
            if (changed) await db.kv.put({ key, value: nextValue });
        });
        throwIfAborted(signal);
        memCache.set(key, nextValue);
        dirtyKeys.delete(key);
        writeVersions.set(key, (writeVersions.get(key) || 0) + 1);
        broadcastPersistenceEvent(PERSISTENCE_UPDATED_EVENT, {
            key,
            value: nextValue,
            changed,
        });
        return nextValue;
    }, { signal });
}

// IndexedDB にある全データを、端末の外へ保存できるバックアップ形式にまとめる。
// キーを手書きで列挙しないため、今後 pt_* の項目が増えても自動的に含まれる。
function sanitizePushInboxRows(rows) {
    if (!Array.isArray(rows)) {
        throw new Error("バックアップ内のWindows受信データが壊れています");
    }
    const batchIds = new Set();
    return rows.map((row) => {
        let safe;
        try {
            const serialized = JSON.stringify(row);
            if (!serialized || serialized.length > 2_000_000) throw new Error();
            safe = JSON.parse(serialized);
        } catch {
            throw new Error("バックアップ内のWindows受信データを確認できません");
        }
        const batchId = String(safe?.batchId || "");
        const envelope = safe?.envelope;
        const valid = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(batchId)
            && Number.isFinite(Date.parse(String(safe?.receivedAt || "")))
            && envelope
            && typeof envelope === "object"
            && !Array.isArray(envelope)
            && envelope.schema === "pachi-tracker.push-batch"
            && envelope.version === 1
            && envelope.batchId === batchId
            && /^sha256:[a-f0-9]{64}$/iu.test(String(envelope.digest || ""));
        if (!valid || batchIds.has(batchId)) {
            throw new Error("バックアップ内のWindows受信データに不正な項目があります");
        }
        batchIds.add(batchId);
        return {
            batchId,
            receivedAt: String(safe.receivedAt),
            status: "pending",
            envelope,
        };
    });
}

function pushInboxDigest(row) {
    return String(row?.envelope?.digest || "").toLowerCase();
}

export async function createBackup() {
    await awaitReady();
    await flushAll();

    let kvRows;
    let snapshots;
    let meta;
    let pushInboxRows;
    await db.transaction(
        "r",
        db.kv,
        db.snapshots,
        db.meta,
        db.pushInbox,
        async () => {
            [kvRows, snapshots, meta, pushInboxRows] = await Promise.all([
                db.kv.toArray(),
                db.snapshots.toArray(),
                db.meta.toArray(),
                db.pushInbox.toArray(),
            ]);
        },
    );

    const kv = sanitizeBackupKv(kvRows);
    const pushInbox = sanitizePushInboxRows(pushInboxRows);
    return {
        format: BACKUP_FORMAT,
        version: BACKUP_VERSION,
        createdAt: new Date().toISOString(),
        database: { kv, snapshots, meta, pushInbox },
    };
}

function normalizeBackup(input) {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
        throw new Error("バックアップファイルの形式が正しくありません");
    }

    // 現行形式: IndexedDB の全テーブルをそのまま保持する。
    if (input.format === BACKUP_FORMAT) {
        if (![1, 2, BACKUP_VERSION].includes(input.version) || !input.database) {
            throw new Error("このバックアップ形式には対応していません");
        }
        const {
            kv,
            snapshots = [],
            meta = [],
            pushInbox = [],
        } = input.database;
        if (
            !Array.isArray(kv)
            || !Array.isArray(snapshots)
            || !Array.isArray(meta)
            || !Array.isArray(pushInbox)
        ) {
            throw new Error("バックアップファイルの内容が壊れています");
        }
        const validKv = kv.every((row) =>
            row && typeof row.key === "string" && row.key.startsWith(KEY_PREFIX) && "value" in row
        );
        if (!validKv) throw new Error("バックアップデータに不正な項目があります");
        return {
            kv: sanitizeBackupKv(kv),
            snapshots,
            meta,
            pushInbox: sanitizePushInboxRows(pushInbox),
        };
    }

    // 旧形式: { "pt_xxx": value } も引き続き復元できる。
    const entries = sanitizeLegacyBackupObject(input);
    if (entries.length === 0) {
        throw new Error("パチトラッカーのデータが見つかりません");
    }
    const kv = entries.map(([key, value]) => {
        let parsed = value;
        if (typeof value === "string") {
            try { parsed = JSON.parse(value); } catch { /* 通常の文字列として保持 */ }
        }
        return { key, value: parsed };
    });
    const now = Date.now();
    return {
        kv,
        snapshots: [],
        pushInbox: [],
        meta: [
            { key: "migrated_v2", value: true, ts: now },
            { key: "restored_at", value: now, ts: now },
        ],
    };
}

// 復元はファイルの検証が完了してから、1回のトランザクションで全置換する。
// トランザクション（途中で失敗したら変更全体を取り消す仕組み）なので、半端な復元を防げる。
export async function restoreBackup(input) {
    await awaitReady();
    const backup = normalizeBackup(input);
    broadcastPersistenceEvent(PERSISTENCE_EXCLUSIVE_START_EVENT, {
        operation: "restore",
    });
    // 復元に失敗した場合にも、直前まで入力していた現在データはDBへ残しておく。
    try {
        await flushAll();
        return await withExclusivePersistence(async () => {
            const preservedSecrets = (await db.kv.bulkGet(SECRET_BACKUP_KEYS)).filter(Boolean);
            const nextEpoch = createPersistenceEpoch();

            if (flushTimer != null) {
                clearTimeout(flushTimer);
                flushTimer = null;
            }
            dirtyKeys.clear();

            await db.transaction(
                "rw",
                db.kv,
                db.snapshots,
                db.meta,
                db.pushInbox,
                db.pushInboxStatus,
                async () => {
                    const existingPushRows = backup.pushInbox.length > 0
                        ? await db.pushInbox.bulkGet(backup.pushInbox.map((row) => row.batchId))
                        : [];
                    existingPushRows.forEach((existing, index) => {
                        if (
                            existing
                            && pushInboxDigest(existing) !== pushInboxDigest(backup.pushInbox[index])
                        ) {
                            throw new Error(
                                `Windows受信データ ${backup.pushInbox[index].batchId} の内容が現在データと異なるため、復元を中止しました`,
                            );
                        }
                    });
                    await Promise.all([
                        db.kv.clear(),
                        db.snapshots.clear(),
                        db.meta.clear(),
                        // Push原本は残す。ただし「取込済み」等の状態は復元データと
                        // 食い違うため消し、次回起動時に重複確認からやり直す。
                        db.pushInboxStatus.clear(),
                    ]);
                    if (backup.kv.length > 0) await db.kv.bulkPut(backup.kv);
                    if (preservedSecrets.length > 0) await db.kv.bulkPut(preservedSecrets);
                    if (backup.snapshots.length > 0) await db.snapshots.bulkPut(backup.snapshots);
                    if (backup.meta.length > 0) await db.meta.bulkPut(backup.meta);
                    const missingPushRows = backup.pushInbox.filter(
                        (_, index) => !existingPushRows[index],
                    );
                    if (missingPushRows.length > 0) await db.pushInbox.bulkAdd(missingPushRows);
                    const now = Date.now();
                    await db.meta.put({ key: "migrated_v2", value: true, ts: now });
                    await db.meta.put({
                        key: PERSISTENCE_EPOCH_META_KEY,
                        value: nextEpoch,
                        ts: now,
                    });
                    await db.meta.put({ key: "restored_at", value: now, ts: now });
                },
            );

            persistenceEpoch = nextEpoch;
            memCache.clear();
            backup.kv.forEach((row) => memCache.set(row.key, row.value));
            preservedSecrets.forEach((row) => memCache.set(row.key, row.value));
            writeVersions.clear();
            return {
                keyCount: backup.kv.length,
                pushInboxCount: backup.pushInbox.length,
            };
        });
    } finally {
        broadcastPersistenceEvent(PERSISTENCE_EXCLUSIVE_END_EVENT, {
            operation: "restore",
        });
    }
}

// ErrorBoundary 回復用: アプリ設定を初期化するが、未処理を含むPush受信原本は残す。
export async function clearAll() {
    await awaitReady();
    broadcastPersistenceEvent(PERSISTENCE_EXCLUSIVE_START_EVENT, {
        operation: "clear-all",
    });
    try {
        await withExclusivePersistence(async () => {
            if (flushTimer != null) {
                clearTimeout(flushTimer);
                flushTimer = null;
            }
            const nextEpoch = createPersistenceEpoch();
            await db.transaction(
                "rw",
                db.kv,
                db.snapshots,
                db.meta,
                db.pushInboxStatus,
                async () => {
                    await db.kv.clear();
                    await db.snapshots.clear();
                    await db.meta.clear();
                    await db.pushInboxStatus.clear();
                    const now = Date.now();
                    await db.meta.put({ key: "migrated_v2", value: true, ts: now });
                    await db.meta.put({
                        key: PERSISTENCE_EPOCH_META_KEY,
                        value: nextEpoch,
                        ts: now,
                    });
                },
            );
            persistenceEpoch = nextEpoch;
            memCache.clear();
            dirtyKeys.clear();
            writeVersions.clear();
            // localStorage 側も同時にクリア
            try {
                const toRemove = [];
                for (let i = 0; i < window.localStorage.length; i++) {
                    const k = window.localStorage.key(i);
                    if (k && k.startsWith(KEY_PREFIX)) toRemove.push(k);
                }
                toRemove.forEach((k) => window.localStorage.removeItem(k));
            } catch (e) {
                console.error("[persistence] clearAll LS error:", e);
            }
        });
    } finally {
        broadcastPersistenceEvent(PERSISTENCE_EXCLUSIVE_END_EVENT, {
            operation: "clear-all",
        });
    }
}
