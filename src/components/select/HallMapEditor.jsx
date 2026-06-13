// 台選び：ユーザー編集式ホールマップ（島配置）コンポーネント
//
// 店舗ごとに島の追加・削除・並び替え・台番号範囲・機種割り当てを編集できる。
// データの実体は App.jsx の pt_hallMaps（state: hallMaps / setHallMaps）に保存され、
// 永続化・正規化は hallMapSelectors.js の純粋関数に委譲する。
// このデータは台選び用の独立した設定データであり、rotRows（回転数記録）とは無関係。
//
// 閲覧モード: ユーザー編集の島がある場合のみ、その配置を表示する。
//             既存の P-EVIDENCE ダミーマップ（SelectDashboard 内 HallMap）には一切触れない。
// 編集モード: 「編集」ボタンで切替。閲覧モードの既存操作タップ数は増やさない。

import React, { useState, useRef, useEffect } from "react";
import { C, font, mono } from "../../constants";
import { Card } from "../Atoms";
import {
  islandCount,
  addIsland,
  removeIsland,
  updateIsland,
  moveIslandUp,
  moveIslandDown,
} from "./hallMapSelectors";

// 編集中の数値入力（台番号範囲）。空欄を許容しつつ、確定時に数値へ寄せる。
function RangeInput({ value, onCommit, ariaLabel }) {
  return (
    <input
      type="text"
      inputMode="numeric"
      defaultValue={String(value)}
      aria-label={ariaLabel}
      onFocus={(e) => { e.target.style.borderColor = C.blue; }}
      onBlur={(e) => {
        e.target.style.borderColor = C.borderHi;
        onCommit(e.target.value);
      }}
      style={{
        width: "100%",
        minHeight: 44,
        background: C.surface,
        border: `1px solid ${C.borderHi}`,
        borderRadius: 10,
        color: C.text,
        fontFamily: mono,
        fontSize: 16,
        fontWeight: 700,
        textAlign: "center",
        padding: "8px 6px",
        outline: "none",
      }}
    />
  );
}

function TextInput({ value, onCommit, placeholder, ariaLabel }) {
  return (
    <input
      type="text"
      defaultValue={value}
      placeholder={placeholder}
      aria-label={ariaLabel}
      onFocus={(e) => { e.target.style.borderColor = C.blue; }}
      onBlur={(e) => {
        e.target.style.borderColor = C.borderHi;
        onCommit(e.target.value);
      }}
      style={{
        width: "100%",
        minHeight: 44,
        background: C.surface,
        border: `1px solid ${C.borderHi}`,
        borderRadius: 10,
        color: C.text,
        fontFamily: font,
        fontSize: 15,
        fontWeight: 600,
        padding: "8px 12px",
        outline: "none",
      }}
    />
  );
}

// 編集モードの島1件分のカード。
function IslandEditRow({ island, index, total, onChange, onRemove, onUp, onDown }) {
  const count = islandCount(island);
  return (
    <div style={{
      border: `1px solid ${C.border}`,
      borderRadius: 12,
      background: C.surfaceHi,
      padding: "12px",
      marginTop: 10,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 12, color: C.sub, fontWeight: 800, fontFamily: mono, minWidth: 24 }}>
          {index + 1}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <TextInput
            value={island.name}
            placeholder="島名（例：1島）"
            ariaLabel="島名"
            onCommit={(v) => onChange({ name: v })}
          />
        </div>
        <button
          className="b"
          aria-label="この島を上へ移動"
          disabled={index === 0}
          onClick={onUp}
          style={{
            minWidth: 44, minHeight: 44, borderRadius: 10,
            border: `1px solid ${C.border}`,
            background: C.surface,
            color: index === 0 ? C.sub : C.text,
            opacity: index === 0 ? 0.4 : 1,
            fontSize: 18, fontWeight: 900,
          }}
        >
          ↑
        </button>
        <button
          className="b"
          aria-label="この島を下へ移動"
          disabled={index === total - 1}
          onClick={onDown}
          style={{
            minWidth: 44, minHeight: 44, borderRadius: 10,
            border: `1px solid ${C.border}`,
            background: C.surface,
            color: index === total - 1 ? C.sub : C.text,
            opacity: index === total - 1 ? 0.4 : 1,
            fontSize: 18, fontWeight: 900,
          }}
        >
          ↓
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 8, alignItems: "center", marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 10, color: C.sub, fontWeight: 700, marginBottom: 4 }}>開始番号</div>
          <RangeInput key={`start-${island.start}`} value={island.start} ariaLabel="開始台番号" onCommit={(v) => onChange({ start: v })} />
        </div>
        <span style={{ fontSize: 16, color: C.sub, fontWeight: 800, paddingTop: 18 }}>〜</span>
        <div>
          <div style={{ fontSize: 10, color: C.sub, fontWeight: 700, marginBottom: 4 }}>終了番号</div>
          <RangeInput key={`end-${island.end}`} value={island.end} ariaLabel="終了台番号" onCommit={(v) => onChange({ end: v })} />
        </div>
      </div>

      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 10, color: C.sub, fontWeight: 700, marginBottom: 4 }}>機種名（任意）</div>
        <TextInput
          value={island.machineName}
          placeholder="機種名"
          ariaLabel="機種名"
          onCommit={(v) => onChange({ machineName: v })}
        />
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 11, color: C.sub, fontWeight: 700 }}>
          {count}台
        </span>
        <button
          className="b"
          aria-label="この島を削除"
          onClick={onRemove}
          style={{
            minHeight: 44, borderRadius: 10, padding: "0 16px",
            border: "1px solid color-mix(in srgb, var(--red) 40%, transparent)",
            background: "color-mix(in srgb, var(--red) 12%, transparent)",
            color: C.red, fontSize: 13, fontWeight: 800, fontFamily: font,
          }}
        >
          削除
        </button>
      </div>
    </div>
  );
}

// 閲覧モードの島1件分の行（ユーザー編集データがある場合のみ描画）。
function IslandViewRow({ island }) {
  const count = islandCount(island);
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "10px 14px",
      borderTop: `1px solid ${C.border}`,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {island.name || "（名称未設定）"}
        </div>
        {island.machineName && (
          <div style={{ fontSize: 11, color: C.sub, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {island.machineName}
          </div>
        )}
      </div>
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 900, color: C.text, fontFamily: mono }}>
          {island.start}〜{island.end}
        </div>
        <div style={{ fontSize: 10, color: C.sub, marginTop: 2, fontWeight: 700 }}>
          {count}台
        </div>
      </div>
    </div>
  );
}

// 店舗を持たない / 未選択の場合の案内（編集対象が決まらない）。
function NoStoreNotice() {
  return (
    <Card>
      <div style={{ padding: "16px 14px" }}>
        <div style={{ fontSize: 13, color: C.text, fontWeight: 800, marginBottom: 6 }}>
          ホールマップの編集には店舗が必要です
        </div>
        <div style={{ fontSize: 12, color: C.sub, lineHeight: 1.6 }}>
          店舗を登録・選択すると、この店舗のマップを編集できます。
        </div>
      </div>
    </Card>
  );
}

// 編集対象店舗の切り替えピッカー。登録店舗が2件以上のときのみ表示する。
function StorePicker({ stores, storeId, storeName, onChangeStore }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  // 開いている間だけ、外側タップで閉じるリスナーを登録する。
  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  if (!Array.isArray(stores) || stores.length < 2) return null;

  return (
    <div ref={rootRef} style={{ position: "relative", flexShrink: 0 }}>
      <button
        className="b"
        aria-label="マップ編集の対象店舗を切り替える"
        onClick={() => setOpen((v) => !v)}
        style={{
          minHeight: 44, borderRadius: 11, padding: "0 12px",
          border: `1px solid ${C.borderHi}`,
          background: C.surfaceHi,
          color: C.text,
          fontSize: 12, fontWeight: 800, fontFamily: font,
          display: "flex", alignItems: "center", gap: 6,
          maxWidth: 140,
        }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {storeName || "店舗を選択"}
        </span>
        <span style={{ fontSize: 10, color: C.sub, flexShrink: 0 }}>▼</span>
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", right: 0,
          minWidth: 160, maxWidth: 220, maxHeight: 220, overflowY: "auto",
          background: C.surface, border: `1px solid ${C.borderHi}`, borderRadius: 10,
          boxShadow: "0 8px 24px rgba(0,0,0,0.5)", zIndex: 20,
        }}>
          {stores.map((st, i) => {
            const name = typeof st === "object" ? st.name : st;
            const id = typeof st === "object" ? st.id : st;
            const active = id === storeId;
            return (
              <button
                key={st.id || i}
                className="b"
                aria-label={`マップ編集対象を${name}に切り替える`}
                onClick={() => {
                  setOpen(false);
                  if (!active) onChangeStore(id);
                }}
                style={{
                  width: "100%", minHeight: 44, boxSizing: "border-box",
                  background: active ? "color-mix(in srgb, var(--blue) 14%, transparent)" : "transparent",
                  border: "none", borderBottom: `1px solid ${C.border}`,
                  color: active ? C.blue : C.text,
                  fontSize: 13, fontWeight: active ? 900 : 700, fontFamily: font,
                  textAlign: "left", padding: "0 12px",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}
              >
                {name}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function HallMapEditor({ storeId, storeName, stores, onChangeStore, islands, onChangeIslands }) {
  const [editing, setEditing] = useState(false);

  // 編集対象の店舗が決まらない場合は案内のみ（編集導線は出さない）。
  if (storeId == null) {
    return <NoStoreNotice />;
  }

  const hasIslands = islands.length > 0;

  const handleAdd = () => onChangeIslands(addIsland(islands));
  const handleRemove = (island) => {
    const label = island.name ? `「${island.name}」` : "この島";
    if (window.confirm(`${label}を削除しますか？`)) {
      onChangeIslands(removeIsland(islands, island.id));
    }
  };

  return (
    // 店舗ピッカーのドロップダウン（position:absolute）がカード境界でクリップされ
    // 下のカードと重なって見える不具合を防ぐため、overflow を visible にする。
    <Card style={{ overflow: "visible" }}>
      <div style={{ padding: "12px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, color: C.text, fontWeight: 900, letterSpacing: 0.2 }}>
            マップ編集
          </div>
          <div style={{ fontSize: 10, color: C.sub, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {storeName || "登録店舗"} ・ {islands.length}島
          </div>
        </div>
        <StorePicker stores={stores} storeId={storeId} storeName={storeName} onChangeStore={onChangeStore} />
        <button
          className="b"
          aria-label={editing ? "閲覧モードに戻る" : "マップを編集する"}
          onClick={() => setEditing((v) => !v)}
          style={{
            flexShrink: 0,
            minHeight: 44, minWidth: 88, borderRadius: 11, padding: "0 16px",
            border: editing ? "none" : `1px solid ${C.borderHi}`,
            background: editing ? C.blue : C.surfaceHi,
            color: editing ? "#fff" : C.text,
            fontSize: 13, fontWeight: 900, fontFamily: font,
          }}
        >
          {editing ? "編集を終了" : "編集"}
        </button>
      </div>

      {!editing && (
        hasIslands ? (
          <div style={{ paddingBottom: 4 }}>
            {islands.map((island) => (
              <IslandViewRow key={island.id} island={island} />
            ))}
          </div>
        ) : (
          <div style={{ padding: "4px 14px 16px" }}>
            <div style={{ fontSize: 12, color: C.sub, lineHeight: 1.6 }}>
              この店舗のマップは未登録です。「編集」から島を追加できます。
            </div>
          </div>
        )
      )}

      {editing && (
        <div style={{ padding: "0 12px 14px" }}>
          {islands.map((island, i) => (
            <IslandEditRow
              key={island.id}
              island={island}
              index={i}
              total={islands.length}
              onChange={(patch) => onChangeIslands(updateIsland(islands, island.id, patch))}
              onRemove={() => handleRemove(island)}
              onUp={() => onChangeIslands(moveIslandUp(islands, island.id))}
              onDown={() => onChangeIslands(moveIslandDown(islands, island.id))}
            />
          ))}
          <button
            className="b"
            aria-label="島を追加"
            onClick={handleAdd}
            style={{
              width: "100%", minHeight: 48, borderRadius: 12, marginTop: 12,
              border: `1px dashed color-mix(in srgb, var(--blue) 50%, var(--border))`,
              background: "color-mix(in srgb, var(--blue) 8%, transparent)",
              color: C.blue, fontSize: 14, fontWeight: 900, fontFamily: font,
            }}
          >
            ＋ 島を追加
          </button>
        </div>
      )}
    </Card>
  );
}
