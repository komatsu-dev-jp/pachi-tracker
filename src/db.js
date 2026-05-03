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
