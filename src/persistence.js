import { db } from "./db.js";

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
const FLUSH_DEBOUNCE_MS = 250;
// localStorage クリーンアップ猶予: 30 日
const LS_CLEANUP_GRACE_MS = 30 * 24 * 60 * 60 * 1000;

const memCache = new Map();
const dirtyKeys = new Set();
let flushTimer = null;
let bootPromise = null;
let bootCompleted = false;

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
    if (flushTimer != null) return;
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

export function set(key, value) {
    memCache.set(key, value);
    dirtyKeys.add(key);
    scheduleFlush();
}

export async function flushAll() {
    if (dirtyKeys.size === 0) return;
    const batch = [];
    dirtyKeys.forEach((k) => {
        batch.push({ key: k, value: memCache.get(k) });
    });
    dirtyKeys.clear();
    try {
        await db.kv.bulkPut(batch);
    } catch (e) {
        console.error("[persistence] bulkPut failed, restoring dirty set:", e);
        batch.forEach((r) => dirtyKeys.add(r.key));
        throw e;
    }
}

// ErrorBoundary / リストア用: IDB 全テーブルと localStorage の pt_* を空にする
export async function clearAll() {
    memCache.clear();
    dirtyKeys.clear();
    if (flushTimer != null) {
        clearTimeout(flushTimer);
        flushTimer = null;
    }
    try {
        await db.transaction("rw", db.kv, db.snapshots, db.meta, async () => {
            await db.kv.clear();
            await db.snapshots.clear();
            await db.meta.clear();
        });
    } catch (e) {
        console.error("[persistence] clearAll IDB error:", e);
    }
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
}
