import { db } from "./db.js";

// Phase C-3: 操作単位の cold snapshot を別 IDB ストアに atomic 保存し、
// 強制終了からの復帰で 100% 復元できるようにする。
//
// 設計:
// - スナップショット payload は既存 getUndoSnapshot() の戻り値（13 state）を流用
// - 単一トランザクションで挿入 → 中断耐性を確保
// - 最大 KEEP_LIMIT 件保持、超過分は古いものから削除
// - 同一 250ms 内の連続呼び出しは debounce で間引き

const KEEP_LIMIT = 30;
const DEBOUNCE_MS = 250;

let lastTakeAt = 0;
let pendingTimer = null;
let pendingArgs = null;

function buildMeta(payload) {
    const jp = payload?.jpLog || [];
    const rot = payload?.rotRows || [];
    return {
        jpLogLen: jp.length,
        jpLogTailTs: jp.length > 0 ? (jp[jp.length - 1].time || null) : null,
        rotRowsLen: rot.length,
        rotRowsTailTs: rot.length > 0 ? (rot[rot.length - 1].time || null) : null,
    };
}

async function persistOne(reason, payload) {
    const ts = Date.now();
    const meta = buildMeta(payload);
    // 構造化クローンに耐える deep copy
    const safePayload = JSON.parse(JSON.stringify(payload));
    await db.transaction("rw", db.snapshots, async () => {
        await db.snapshots.add({ ts, reason, meta, payload: safePayload });
        // 直近 KEEP_LIMIT 件以外を枝刈り
        const total = await db.snapshots.count();
        if (total > KEEP_LIMIT) {
            const excess = total - KEEP_LIMIT;
            const oldest = await db.snapshots.orderBy("id").limit(excess).primaryKeys();
            if (oldest.length > 0) await db.snapshots.bulkDelete(oldest);
        }
    });
}

// 通常の取得タイミング（操作直後）。debounce あり。
export function takeSnapshot(reason, payload) {
    pendingArgs = { reason, payload };
    const now = Date.now();
    const elapsed = now - lastTakeAt;
    if (elapsed >= DEBOUNCE_MS && pendingTimer == null) {
        // 即時実行
        const args = pendingArgs;
        pendingArgs = null;
        lastTakeAt = now;
        persistOne(args.reason, args.payload).catch((e) =>
            console.error("[snapshot] persist failed:", e)
        );
        return;
    }
    if (pendingTimer != null) return; // 既に予約済み: 引数を上書きするだけ
    const wait = Math.max(DEBOUNCE_MS - elapsed, 0);
    pendingTimer = setTimeout(() => {
        const args = pendingArgs;
        pendingTimer = null;
        pendingArgs = null;
        lastTakeAt = Date.now();
        if (args) {
            persistOne(args.reason, args.payload).catch((e) =>
                console.error("[snapshot] persist failed:", e)
            );
        }
    }, wait);
}

// debounce を無視して即時保存（ライフサイクル / セッション終了直前用）
export async function takeSnapshotImmediate(reason, payload) {
    if (pendingTimer != null) {
        clearTimeout(pendingTimer);
        pendingTimer = null;
        pendingArgs = null;
    }
    lastTakeAt = Date.now();
    try {
        await persistOne(reason, payload);
    } catch (e) {
        console.error("[snapshot] immediate persist failed:", e);
    }
}

export async function getLatest() {
    try {
        const rows = await db.snapshots.orderBy("id").reverse().limit(1).toArray();
        return rows[0] || null;
    } catch {
        return null;
    }
}
