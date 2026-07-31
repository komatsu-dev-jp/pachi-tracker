import Dexie from "dexie";

// PACHI TRACKER の永続化 DB。
// kv:        useLS のバックエンド（key-value、key=string PK, value=任意の構造化クローン可能値）
// snapshots: Phase C-3 のセッション復元用 cold snapshot（++id, ts インデックス）
// meta:      migrated フラグ等のメタ情報（key=string PK, value=任意）
export const db = new Dexie("pachi_tracker_db");

db.version(1).stores({
    kv: "key",
    snapshots: "++id, ts",
    meta: "key",
});

// Pushで受け取った解析結果は、既存データへ直接書き込まず受信箱へ保管する。
// batchIdを主キーにすることで、同じPushの再送は追加できない（上書きもしない）。
db.version(2).stores({
    kv: "key",
    snapshots: "++id, ts",
    meta: "key",
    pushInbox: "batchId, receivedAt",
    // pushInbox本体は不変のまま、処理結果だけを別テーブルへ記録する。
    pushInboxStatus: "batchId, status, updatedAt",
});
