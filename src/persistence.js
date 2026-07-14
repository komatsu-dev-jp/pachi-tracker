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
const BACKUP_VERSION = 2;
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

// IndexedDB にある全データを、端末の外へ保存できるバックアップ形式にまとめる。
// キーを手書きで列挙しないため、今後 pt_* の項目が増えても自動的に含まれる。
export async function createBackup() {
    await awaitReady();
    await flushAll();

    const [kvRows, snapshots, meta] = await Promise.all([
        db.kv.toArray(),
        db.snapshots.toArray(),
        db.meta.toArray(),
    ]);

    const kv = sanitizeBackupKv(kvRows);
    return {
        format: BACKUP_FORMAT,
        version: BACKUP_VERSION,
        createdAt: new Date().toISOString(),
        database: { kv, snapshots, meta },
    };
}

function normalizeBackup(input) {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
        throw new Error("バックアップファイルの形式が正しくありません");
    }

    // 現行形式: IndexedDB の全テーブルをそのまま保持する。
    if (input.format === BACKUP_FORMAT) {
        if (![1, BACKUP_VERSION].includes(input.version) || !input.database) {
            throw new Error("このバックアップ形式には対応していません");
        }
        const { kv, snapshots = [], meta = [] } = input.database;
        if (!Array.isArray(kv) || !Array.isArray(snapshots) || !Array.isArray(meta)) {
            throw new Error("バックアップファイルの内容が壊れています");
        }
        const validKv = kv.every((row) =>
            row && typeof row.key === "string" && row.key.startsWith(KEY_PREFIX) && "value" in row
        );
        if (!validKv) throw new Error("バックアップデータに不正な項目があります");
        return { kv: sanitizeBackupKv(kv), snapshots, meta };
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
    // 復元に失敗した場合にも、直前まで入力していた現在データはDBへ残しておく。
    await flushAll();
    const backup = normalizeBackup(input);
    const preservedSecrets = (await db.kv.bulkGet(SECRET_BACKUP_KEYS)).filter(Boolean);

    if (flushTimer != null) {
        clearTimeout(flushTimer);
        flushTimer = null;
    }
    dirtyKeys.clear();

    await db.transaction("rw", db.kv, db.snapshots, db.meta, async () => {
        await Promise.all([db.kv.clear(), db.snapshots.clear(), db.meta.clear()]);
        if (backup.kv.length > 0) await db.kv.bulkPut(backup.kv);
        if (preservedSecrets.length > 0) await db.kv.bulkPut(preservedSecrets);
        if (backup.snapshots.length > 0) await db.snapshots.bulkPut(backup.snapshots);
        if (backup.meta.length > 0) await db.meta.bulkPut(backup.meta);
        await db.meta.put({ key: "restored_at", value: Date.now(), ts: Date.now() });
    });

    memCache.clear();
    backup.kv.forEach((row) => memCache.set(row.key, row.value));
    preservedSecrets.forEach((row) => memCache.set(row.key, row.value));
    return { keyCount: backup.kv.length };
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
