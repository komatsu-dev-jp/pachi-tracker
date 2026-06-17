// 島マップ管理画面（全面リニューアル・見た目優先プロトタイプ）
//
// 旧「島一覧」中心の編集画面を、「この店舗の島構成を俯瞰する」レイアウト管理画面へ再設計する。
// 戦略マップ（StrategyMapDashboard）と同じ世界観（Bloomberg風・ネオンブルー・ダーク）で自己完結する。
//
// データの実体は App.jsx の pt_hallMaps（{ [storeId]: Island[] }、
// Island = { id, name, start, end, machineName }）。本コンポーネントは
// hallMapSelectors の純粋関数のみで不変更新し、rotRows（回転数記録）・logic.js には触れない。
//
// ⚠️ レイアウト図 / プレビューに表示する「推定回転率・確信度・良台率・密度・強ゾーン」は
//    islandMapData.js が生成する仮データ（将来連携予定・表示専用）。実体の島配置から
//    台番号のみを使い、指標は決定論的に生成する。将来 差玉解析 / P-EVIDENCE の実データへ差し替える。

import React, { useState, useMemo, useRef, useEffect } from "react";
import {
  islandCount,
  addIsland,
  removeIsland,
  updateIsland,
  moveIslandUp,
  moveIslandDown,
} from "./hallMapSelectors";
import { buildHallLayout } from "./islandMapData";

// ---- 配色（戦略マップ準拠の固定パレット）----
const P = {
  bg: "#050A14",
  card: "#0B1220",
  cardHi: "#0E1626",
  line: "rgba(255,255,255,0.08)",
  lineHi: "rgba(255,255,255,0.14)",
  text: "#E6EDF6",
  sub: "#64748B",
  subHi: "#94A3B8",
  green: "#22C55E",
  yellow: "#EAB308",
  red: "#EF4444",
  gray: "#64748B",
  cyan: "#06B6D4",
};
const RADIUS = 24;
const FONT = "var(--font-main)";
const MONO = "var(--font-mono)";

const VERDICT = {
  strong: { color: P.green, label: "ボーダー超え" },
  watch: { color: P.yellow, label: "様子見" },
  weak: { color: P.red, label: "未満" },
  nodata: { color: P.gray, label: "データ不足" },
};

const TABS = [
  { id: "layout", label: "レイアウト図" },
  { id: "list", label: "島一覧" },
  { id: "history", label: "変更履歴" },
];

function fmt(n, d = 0) {
  if (n == null || !isFinite(n)) return "—";
  return Number(n).toLocaleString("ja-JP", { minimumFractionDigits: d, maximumFractionDigits: d });
}
function signed(n, d = 0) {
  if (n == null || !isFinite(n)) return "—";
  return (n >= 0 ? "+" : "") + fmt(n, d);
}
function nowStamp() {
  const d = new Date();
  const p = (x) => String(x).padStart(2, "0");
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// ============================ アイコン ============================
function Icon({ d, size = 22, stroke = P.text, sw = 2.1, children }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
      {d ? <path d={d} /> : children}
    </svg>
  );
}
const BackIcon = (p) => <Icon {...p} d="M15 18l-6-6 6-6" />;
const PlusIcon = (p) => <Icon {...p}><path d="M12 5v14" /><path d="M5 12h14" /></Icon>;
const HelpIcon = (p) => <Icon {...p}><circle cx="12" cy="12" r="9" /><path d="M9.2 9.3a2.8 2.8 0 1 1 4 2.5c-.9.5-1.7 1-1.7 2.2" /><path d="M12 17.2h.01" /></Icon>;
const EditIcon = (p) => <Icon {...p}><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></Icon>;
const StoreIcon = (p) => <Icon {...p}><path d="M3 9l1.5-5h15L21 9" /><path d="M3 9h18v3a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0z" /><path d="M5 12v8h14v-8" /></Icon>;
const TrashIcon = (p) => <Icon {...p}><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M6 6l1 14h10l1-14" /></Icon>;
const GridIcon = (p) => <Icon {...p}><rect x="3" y="3" width="7" height="7" rx="1.4" /><rect x="14" y="3" width="7" height="7" rx="1.4" /><rect x="3" y="14" width="7" height="7" rx="1.4" /><rect x="14" y="14" width="7" height="7" rx="1.4" /></Icon>;
const HashIcon = (p) => <Icon {...p}><path d="M4 9h16" /><path d="M4 15h16" /><path d="M10 3L8 21" /><path d="M16 3l-2 18" /></Icon>;
const StackIcon = (p) => <Icon {...p}><path d="M12 3l9 5-9 5-9-5 9-5z" /><path d="M3 13l9 5 9-5" /></Icon>;
const ChevronIcon = (p) => <Icon {...p} d="M9 6l6 6-6 6" />;
const ClockIcon = (p) => <Icon {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></Icon>;

// ============================ 共通枠 ============================
function Section({ title, accent = P.cyan, sub, right, children }) {
  return (
    <div style={{ marginTop: 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 16px 9px" }}>
        <span style={{ width: 4, height: 14, borderRadius: 2, background: accent }} />
        <span style={{ fontSize: 13.5, fontWeight: 900, color: P.text, letterSpacing: 0.4 }}>{title}</span>
        {sub && <span style={{ fontSize: 10, color: P.sub, marginLeft: right ? 0 : "auto" }}>{sub}</span>}
        {right && <span style={{ marginLeft: "auto" }}>{right}</span>}
      </div>
      {children}
    </div>
  );
}

// 台セルの背景色（確信度で濃淡）。
function cellBg(m) {
  const v = VERDICT[m.verdict];
  if (m.verdict === "nodata") return "rgba(100,116,139,0.14)";
  const pct = Math.round(Math.max(0.16, Math.min(0.42, m.confidence / 150)) * 100);
  return `color-mix(in srgb, ${v.color} ${pct}%, ${P.card})`;
}

// ============================ ヘッダー ============================
function Header({ onBack, onHelp, onCreate }) {
  const sideBtn = (extra) => ({
    height: 40,
    minWidth: 44,
    borderRadius: 13,
    background: P.card,
    border: `1px solid ${P.line}`,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    cursor: "pointer",
    color: P.text,
    fontSize: 12.5,
    fontWeight: 800,
    fontFamily: FONT,
    padding: "0 11px",
    WebkitTapHighlightColor: "transparent",
    ...extra,
  });
  return (
    <div
      style={{
        position: "sticky",
        top: 0,
        zIndex: 20,
        background: "linear-gradient(180deg, #050A14 82%, rgba(5,10,20,0))",
        padding: "calc(env(safe-area-inset-top, 0px) + 10px) 14px 10px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button className="b" onClick={onBack} aria-label="戻る" style={{ ...sideBtn(), width: 44, padding: 0 }}>
          <BackIcon />
        </button>
        <div style={{ flex: 1, minWidth: 0, textAlign: "center" }}>
          <div style={{ fontSize: 17, fontWeight: 900, color: P.text, fontFamily: FONT, letterSpacing: 0.4 }}>
            島マップ管理
          </div>
          <div style={{ fontSize: 10, color: P.sub, marginTop: 1 }}>島レイアウト管理</div>
        </div>
        <button className="b" onClick={onHelp} aria-label="使い方" style={sideBtn()}>
          <HelpIcon size={17} stroke={P.subHi} /> 使い方
        </button>
        <button
          className="b"
          onClick={onCreate}
          aria-label="新規作成"
          style={sideBtn({
            background: "linear-gradient(180deg, #0ea5c4 0%, #06B6D4 100%)",
            border: "none",
            color: "#04141a",
            boxShadow: "0 4px 14px rgba(6,182,212,0.35)",
          })}
        >
          <PlusIcon size={17} stroke="#04141a" /> 新規作成
        </button>
      </div>
    </div>
  );
}

// ============================ 店舗サマリーカード ============================
function StorePicker({ stores, storeId, onChangeStore }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);
  if (!Array.isArray(stores) || stores.length < 2) return null;
  return (
    <div ref={rootRef} style={{ position: "relative", flexShrink: 0 }}>
      <button
        className="b"
        aria-label="店舗を切り替える"
        onClick={() => setOpen((v) => !v)}
        style={{
          minHeight: 36, borderRadius: 11, padding: "0 11px",
          border: `1px solid ${P.lineHi}`, background: P.cardHi, color: P.subHi,
          fontSize: 11, fontWeight: 800, fontFamily: FONT,
          display: "flex", alignItems: "center", gap: 5,
        }}
      >
        店舗切替 <span style={{ fontSize: 9 }}>▼</span>
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", right: 0,
          minWidth: 180, maxWidth: 240, maxHeight: 240, overflowY: "auto",
          background: P.card, border: `1px solid ${P.lineHi}`, borderRadius: 12,
          boxShadow: "0 12px 30px rgba(0,0,0,0.6)", zIndex: 30,
        }}>
          {stores.map((st, i) => {
            const active = st.id === storeId;
            return (
              <button
                key={st.id ?? i}
                className="b"
                aria-label={`${st.name}に切り替える`}
                onClick={() => { setOpen(false); if (!active) onChangeStore(st.id); }}
                style={{
                  width: "100%", minHeight: 44, boxSizing: "border-box",
                  background: active ? "rgba(6,182,212,0.14)" : "transparent",
                  border: "none", borderBottom: `1px solid ${P.line}`,
                  color: active ? P.cyan : P.text,
                  fontSize: 13, fontWeight: active ? 900 : 700, fontFamily: FONT,
                  textAlign: "left", padding: "0 13px",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}
              >
                {st.name || "（名称未設定）"}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StoreSummary({ store, stores, onChangeStore, totalIslands, totalMachines, updatedAt }) {
  return (
    <div style={{ padding: "8px 14px 0" }}>
      <div style={{ background: P.card, border: `1px solid ${P.line}`, borderRadius: RADIUS, padding: 14 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
          {/* 店舗画像（実画像は未保持のためネオン枠のプレースホルダー・将来連携予定） */}
          <div style={{
            width: 58, height: 58, flexShrink: 0, borderRadius: 16,
            background: "linear-gradient(135deg, rgba(6,182,212,0.28), rgba(6,182,212,0.06))",
            border: "1px solid rgba(6,182,212,0.34)",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 0 18px rgba(6,182,212,0.18)",
          }}>
            <StoreIcon size={26} stroke={P.cyan} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{
                flex: 1, minWidth: 0, fontSize: 18, fontWeight: 900, color: P.text, fontFamily: FONT,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", letterSpacing: 0.2,
              }}>
                {store?.name || "店舗未選択"}
              </div>
              <StorePicker stores={stores} storeId={store?.id} onChangeStore={onChangeStore} />
            </div>
            <div style={{
              fontSize: 11.5, color: P.subHi, marginTop: 3,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {store?.address ? store.address : "住所未登録"}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: P.sub, marginTop: 4 }}>
              <ClockIcon size={12} stroke={P.sub} sw={1.8} />
              最終更新 {updatedAt || "—"}
            </div>
          </div>
        </div>

        {/* サマリー指標（総島数・総台数・更新日時） */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1.3fr", gap: 8, marginTop: 13 }}>
          {[
            { label: "総島数", value: fmt(totalIslands), unit: "島", color: P.cyan },
            { label: "総台数", value: fmt(totalMachines), unit: "台", color: P.green },
            { label: "更新日時", value: updatedAt ? updatedAt.split(" ")[1] || "—" : "—", unit: updatedAt ? updatedAt.split(" ")[0] : "", color: P.subHi, small: true },
          ].map((it) => (
            <div key={it.label} style={{ background: P.bg, border: `1px solid ${P.line}`, borderRadius: 14, padding: "9px 10px 10px", minWidth: 0 }}>
              <div style={{ fontSize: 9, color: P.sub, fontWeight: 700, whiteSpace: "nowrap" }}>{it.label}</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 3, marginTop: 5 }}>
                <span style={{ fontSize: it.small ? 13 : 20, fontWeight: 900, color: it.color, fontFamily: MONO, letterSpacing: -0.6, whiteSpace: "nowrap" }}>{it.value}</span>
                {it.unit && <span style={{ fontSize: 9, color: P.sub, fontWeight: 700 }}>{it.unit}</span>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================ ホール全体プレビュー ============================
function PreviewIsland({ layout }) {
  // 簡易表示: 島の判定構成を色帯＋ドットで俯瞰する（編集ではなく俯瞰確認用）。
  const dotCells = layout.machines.slice(0, 12);
  return (
    <div style={{
      flex: "1 0 116px", minWidth: 116, maxWidth: 168,
      background: P.cardHi, border: `1px solid ${P.line}`, borderRadius: 16, padding: "10px 10px 11px",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 4 }}>
        <span style={{ fontSize: 12, fontWeight: 900, color: P.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {layout.name || "（名称未設定）"}
        </span>
        <span style={{ fontSize: 10, color: P.sub, fontFamily: MONO, flexShrink: 0 }}>{layout.count}台</span>
      </div>
      <div style={{ fontSize: 9, color: P.sub, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {layout.machineName || "機種未設定"}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginTop: 8 }}>
        {dotCells.map((m) => (
          <span key={m.id} style={{
            width: 12, height: 12, borderRadius: 4,
            background: VERDICT[m.verdict].color,
            opacity: m.verdict === "nodata" ? 0.5 : 0.9,
            boxShadow: m.verdict === "nodata" ? "none" : `0 0 5px ${VERDICT[m.verdict].color}`,
          }} />
        ))}
        {layout.count > dotCells.length && (
          <span style={{ fontSize: 9, color: P.sub, alignSelf: "center", fontFamily: MONO }}>+{layout.count - dotCells.length}</span>
        )}
      </div>
      <div style={{ fontSize: 9, color: P.sub, marginTop: 8, fontFamily: MONO }}>
        {layout.start}〜{layout.end}
      </div>
    </div>
  );
}

function HallPreview({ layouts }) {
  return (
    <Section title="ホール全体プレビュー" accent={P.cyan} sub="色＝強さ ／ 俯瞰確認用">
      {layouts.length === 0 ? (
        <div style={{ padding: "0 14px" }}>
          <div style={{ background: P.card, border: `1px dashed ${P.lineHi}`, borderRadius: 16, padding: "18px 14px", textAlign: "center", color: P.sub, fontSize: 12 }}>
            島が未登録です。「新規作成」から島を追加してください。
          </div>
        </div>
      ) : (
        <div style={{
          display: "flex", gap: 8, overflowX: "auto", padding: "0 14px 4px",
          WebkitOverflowScrolling: "touch", scrollbarWidth: "none",
        }}>
          {layouts.map((l) => <PreviewIsland key={l.id} layout={l} />)}
        </div>
      )}
    </Section>
  );
}

// ============================ タブ ============================
function TabBar({ active, onChange }) {
  return (
    <div style={{ padding: "16px 14px 0" }}>
      <div style={{ display: "flex", gap: 4, height: 52, background: P.card, border: `1px solid ${P.line}`, borderRadius: 18, padding: 5 }}>
        {TABS.map((t) => {
          const on = active === t.id;
          return (
            <button
              key={t.id}
              className="b"
              onClick={() => onChange(t.id)}
              aria-current={on ? "true" : undefined}
              style={{
                flex: 1, border: "none", borderRadius: 14,
                background: on ? "linear-gradient(180deg, #0ea5c4 0%, #06B6D4 100%)" : "transparent",
                color: on ? "#04141a" : P.subHi,
                fontSize: 13, fontWeight: on ? 900 : 700, fontFamily: FONT, cursor: "pointer",
                boxShadow: on ? "0 4px 14px rgba(6,182,212,0.35)" : "none",
                transition: "all 0.2s ease",
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ============================ 編集パネル（島1件） ============================
function StepBtn({ label, onClick, disabled }) {
  return (
    <button
      className="b"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      style={{
        minWidth: 44, minHeight: 44, borderRadius: 11, padding: "0 12px",
        border: `1px solid ${P.lineHi}`, background: P.cardHi,
        color: disabled ? P.sub : P.text, opacity: disabled ? 0.4 : 1,
        fontSize: 13, fontWeight: 900, fontFamily: FONT, cursor: disabled ? "default" : "pointer",
      }}
    >
      {label}
    </button>
  );
}

function FieldInput({ value, onCommit, placeholder, ariaLabel, mono }) {
  return (
    <input
      type="text"
      defaultValue={value}
      placeholder={placeholder}
      aria-label={ariaLabel}
      onFocus={(e) => { e.target.style.borderColor = P.cyan; }}
      onBlur={(e) => { e.target.style.borderColor = P.lineHi; onCommit(e.target.value); }}
      style={{
        width: "100%", boxSizing: "border-box", minHeight: 44,
        background: P.bg, border: `1px solid ${P.lineHi}`, borderRadius: 11,
        color: P.text, fontFamily: mono ? MONO : FONT, fontSize: 15, fontWeight: 700,
        padding: "8px 12px", outline: "none",
      }}
    />
  );
}

function IslandEditPanel({ island, index, total, onChange, onRemove, onUp, onDown }) {
  const count = islandCount(island);
  const setEnd = (delta) => onChange({ end: Math.max(island.start, island.end + delta) });
  return (
    <div style={{ marginTop: 12, borderTop: `1px solid ${P.line}`, paddingTop: 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <div>
          <div style={{ fontSize: 10, color: P.sub, fontWeight: 700, marginBottom: 4 }}>島名</div>
          <FieldInput key={`name-${island.id}`} value={island.name} placeholder="例：1島" ariaLabel="島名" onCommit={(v) => onChange({ name: v })} />
        </div>
        <div>
          <div style={{ fontSize: 10, color: P.sub, fontWeight: 700, marginBottom: 4 }}>機種名</div>
          <FieldInput key={`mc-${island.id}`} value={island.machineName} placeholder="機種名" ariaLabel="機種名" onCommit={(v) => onChange({ machineName: v })} />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 8, alignItems: "end", marginTop: 10 }}>
        <div>
          <div style={{ fontSize: 10, color: P.sub, fontWeight: 700, marginBottom: 4 }}>開始番号</div>
          <FieldInput key={`s-${island.start}`} value={island.start} ariaLabel="開始台番号" mono onCommit={(v) => onChange({ start: v })} />
        </div>
        <span style={{ fontSize: 15, color: P.sub, fontWeight: 800, paddingBottom: 11 }}>〜</span>
        <div>
          <div style={{ fontSize: 10, color: P.sub, fontWeight: 700, marginBottom: 4 }}>終了番号</div>
          <FieldInput key={`e-${island.end}`} value={island.end} ariaLabel="終了台番号" mono onCommit={(v) => onChange({ end: v })} />
        </div>
      </div>

      {/* 台番号追加 / 削除 / 並び替え */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12, alignItems: "center" }}>
        <StepBtn label="＋ 台番号追加" onClick={() => setEnd(1)} />
        <StepBtn label="− 台番号削除" onClick={() => setEnd(-1)} disabled={count <= 0} />
        <div style={{ flex: 1 }} />
        <StepBtn label="↑" onClick={onUp} disabled={index === 0} />
        <StepBtn label="↓" onClick={onDown} disabled={index === total - 1} />
        <button
          className="b"
          onClick={onRemove}
          aria-label="この島を削除"
          style={{
            minHeight: 44, borderRadius: 11, padding: "0 14px",
            border: "1px solid rgba(239,68,68,0.4)", background: "rgba(239,68,68,0.12)",
            color: P.red, fontSize: 13, fontWeight: 900, fontFamily: FONT, display: "flex", alignItems: "center", gap: 6,
          }}
        >
          <TrashIcon size={15} stroke={P.red} sw={2} /> 削除
        </button>
      </div>
      <div style={{ fontSize: 10, color: P.sub, marginTop: 10, fontWeight: 700 }}>
        現在 {count}台 ・ 編集内容は即保存されます
      </div>
    </div>
  );
}

// ============================ レイアウト図タブ ============================
function MachineCell({ m }) {
  const v = VERDICT[m.verdict];
  return (
    <div
      aria-label={`${m.num}番台 ${v.label} 推定回転率${m.rot} 確信度${m.confidence}%`}
      style={{
        position: "relative", aspectRatio: "1 / 1", minWidth: 0, borderRadius: 8,
        border: `1px solid color-mix(in srgb, ${v.color} 46%, transparent)`,
        background: cellBg(m), display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", padding: 1,
      }}
    >
      <span style={{ fontSize: 8, fontWeight: 700, color: P.subHi, fontFamily: MONO, lineHeight: 1 }}>{m.num}</span>
      <span style={{ fontSize: 12, fontWeight: 900, color: v.color, fontFamily: MONO, lineHeight: 1.15 }}>
        {m.verdict === "nodata" ? "—" : fmt(m.rot, 1)}
      </span>
      <span style={{ fontSize: 7, fontWeight: 700, color: P.sub, fontFamily: MONO, lineHeight: 1 }}>
        {m.verdict === "nodata" ? "" : `${m.confidence}%`}
      </span>
    </div>
  );
}

function LayoutIslandCard({ layout, island, index, total, editing, onToggleEdit, onChange, onRemove, onUp, onDown }) {
  return (
    <div style={{ background: P.card, border: `1px solid ${P.line}`, borderRadius: RADIUS, padding: "13px 13px 14px", marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span style={{ fontSize: 17, fontWeight: 900, color: P.text, fontFamily: FONT }}>{layout.name || "（名称未設定）"}</span>
            <span style={{ fontSize: 11, color: P.sub, fontFamily: MONO }}>{layout.start}〜{layout.end}</span>
          </div>
          <div style={{ fontSize: 11.5, color: P.subHi, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {layout.machineName || "機種未設定"}
          </div>
        </div>
        <button
          className="b"
          onClick={onToggleEdit}
          aria-label={editing ? "編集を終了" : "この島を編集"}
          style={{
            flexShrink: 0, minHeight: 40, borderRadius: 12, padding: "0 14px",
            border: editing ? "none" : `1px solid ${P.lineHi}`,
            background: editing ? "linear-gradient(180deg, #0ea5c4 0%, #06B6D4 100%)" : P.cardHi,
            color: editing ? "#04141a" : P.text, fontSize: 12.5, fontWeight: 900, fontFamily: FONT,
            display: "flex", alignItems: "center", gap: 5,
            boxShadow: editing ? "0 4px 12px rgba(6,182,212,0.3)" : "none",
          }}
        >
          <EditIcon size={15} stroke={editing ? "#04141a" : P.text} sw={2} /> {editing ? "編集中" : "編集"}
        </button>
      </div>

      {/* 良台率 / 密度 */}
      <div style={{ display: "flex", gap: 16, marginTop: 10, marginBottom: 11 }}>
        <span style={{ fontSize: 11, color: P.sub }}>良台率 <b style={{ color: P.green, fontFamily: MONO, fontSize: 13 }}>{layout.goodRate}%</b></span>
        <span style={{ fontSize: 11, color: P.sub }}>密度 <b style={{ color: P.subHi, fontFamily: MONO, fontSize: 13 }}>{signed(layout.evDensity)}</b></span>
        <span style={{ fontSize: 11, color: P.sub, marginLeft: "auto" }}>{layout.count}台</span>
      </div>

      {/* 台セル */}
      {layout.machines.length > 0 ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(46px, 1fr))", gap: 5 }}>
          {layout.machines.map((m) => <MachineCell key={m.id} m={m} />)}
        </div>
      ) : (
        <div style={{ fontSize: 11, color: P.sub, padding: "6px 0" }}>台番号範囲が未設定です。</div>
      )}
      {layout.truncated && (
        <div style={{ fontSize: 9, color: P.sub, marginTop: 6, textAlign: "right" }}>※ 表示は先頭{layout.machines.length}台まで</div>
      )}

      {/* 強ゾーン */}
      <div style={{
        marginTop: 11, fontSize: 11, color: P.subHi, textAlign: "center",
        background: "rgba(34,197,94,0.10)", border: "1px solid rgba(34,197,94,0.22)",
        borderRadius: 12, padding: "7px 8px", fontWeight: 700,
      }}>
        強ゾーン <span style={{ color: P.green, fontWeight: 900 }}>{layout.strongZone}</span>
      </div>

      {editing && (
        <IslandEditPanel
          island={island}
          index={index}
          total={total}
          onChange={onChange}
          onRemove={onRemove}
          onUp={onUp}
          onDown={onDown}
        />
      )}
    </div>
  );
}

function Legend() {
  const items = [["ボーダー超え", P.green], ["様子見", P.yellow], ["未満", P.red], ["データ不足", P.gray]];
  return (
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap", padding: "0 16px 4px" }}>
      {items.map(([label, color]) => (
        <span key={label} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10, color: P.subHi }}>
          <span style={{ width: 9, height: 9, borderRadius: 3, background: color, boxShadow: `0 0 6px ${color}` }} />
          {label}
        </span>
      ))}
    </div>
  );
}

// ============================ 島一覧タブ ============================
function ListRow({ layout, island, index, total, expanded, editing, onToggleExpand, onToggleEdit, onChange, onRemove, onUp, onDown }) {
  return (
    <div style={{ background: P.card, border: `1px solid ${expanded ? P.lineHi : P.line}`, borderRadius: 18, marginBottom: 10, overflow: "hidden" }}>
      <button
        className="b"
        onClick={onToggleExpand}
        aria-label={`${layout.name || "島"}を${expanded ? "閉じる" : "開く"}`}
        aria-expanded={expanded}
        style={{
          width: "100%", minHeight: 60, background: "transparent", border: "none", cursor: "pointer",
          display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", textAlign: "left",
          WebkitTapHighlightColor: "transparent",
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 900, color: P.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {layout.name || "（名称未設定）"}
          </div>
          <div style={{ fontSize: 11, color: P.sub, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {layout.machineName || "機種未設定"}
          </div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 900, color: P.text, fontFamily: MONO }}>{layout.start}〜{layout.end}</div>
          <div style={{ fontSize: 10, color: P.sub, marginTop: 2, fontWeight: 700 }}>{layout.count}台</div>
        </div>
        <span style={{ flexShrink: 0, color: P.sub, transform: expanded ? "rotate(90deg)" : "none", transition: "transform 0.2s ease" }}>
          <ChevronIcon size={18} stroke={P.sub} />
        </span>
      </button>

      {expanded && (
        <div style={{ padding: "0 14px 14px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <span style={{ fontSize: 11, color: P.sub }}>
              良台率 <b style={{ color: P.green, fontFamily: MONO }}>{layout.goodRate}%</b> ・ 密度 <b style={{ color: P.subHi, fontFamily: MONO }}>{signed(layout.evDensity)}</b>
            </span>
            <button
              className="b"
              onClick={onToggleEdit}
              aria-label={editing ? "編集を終了" : "レイアウトを編集"}
              style={{
                minHeight: 40, borderRadius: 12, padding: "0 14px",
                border: editing ? "none" : `1px solid ${P.lineHi}`,
                background: editing ? "linear-gradient(180deg, #0ea5c4 0%, #06B6D4 100%)" : P.cardHi,
                color: editing ? "#04141a" : P.text, fontSize: 12.5, fontWeight: 900, fontFamily: FONT,
                display: "flex", alignItems: "center", gap: 5,
              }}
            >
              <EditIcon size={15} stroke={editing ? "#04141a" : P.text} sw={2} /> {editing ? "編集中" : "編集"}
            </button>
          </div>

          {!editing && layout.machines.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(44px, 1fr))", gap: 5, marginTop: 8 }}>
              {layout.machines.map((m) => <MachineCell key={m.id} m={m} />)}
            </div>
          )}

          {editing && (
            <IslandEditPanel island={island} index={index} total={total} onChange={onChange} onRemove={onRemove} onUp={onUp} onDown={onDown} />
          )}
        </div>
      )}
    </div>
  );
}

// ============================ 変更履歴タブ ============================
function HistoryTab({ entries }) {
  if (!entries.length) {
    return (
      <div style={{ padding: "0 14px" }}>
        <div style={{ background: P.card, border: `1px dashed ${P.lineHi}`, borderRadius: 18, padding: "22px 16px", textAlign: "center" }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: P.text, marginBottom: 6 }}>変更履歴はまだありません</div>
          <div style={{ fontSize: 11, color: P.sub, lineHeight: 1.7 }}>
            このセッション中に島構成を編集すると、ここに記録されます。<br />
            ※端末をまたいだ恒久保存は将来連携予定です。
          </div>
        </div>
      </div>
    );
  }
  return (
    <div style={{ padding: "0 14px" }}>
      {entries.map((e) => (
        <div key={e.id} style={{ display: "flex", gap: 11, background: P.card, border: `1px solid ${P.line}`, borderRadius: 16, padding: "12px 14px", marginBottom: 10 }}>
          <div style={{ width: 8, height: 8, borderRadius: 4, background: P.cyan, marginTop: 5, flexShrink: 0, boxShadow: `0 0 6px ${P.cyan}` }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, color: P.sub, fontFamily: MONO }}>{e.at}</div>
            <div style={{ fontSize: 13.5, fontWeight: 800, color: P.text, marginTop: 3, lineHeight: 1.4 }}>{e.summary}</div>
            <div style={{ fontSize: 10.5, color: P.subHi, marginTop: 3 }}>変更者 {e.user}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ============================ クイックアクション ============================
function QuickActions({ onLayout, onBulkNum, onBulkCount, onReset }) {
  const items = [
    { label: "レイアウト図", sub: "俯瞰確認に戻る", Icon: GridIcon, color: P.cyan, onClick: onLayout },
    { label: "台番号一括編集", sub: "範囲をまとめて調整", Icon: HashIcon, color: P.cyan, onClick: onBulkNum },
    { label: "台数一括編集", sub: "台数をまとめて調整", Icon: StackIcon, color: P.cyan, onClick: onBulkCount },
    { label: "データリセット", sub: "この店舗の島を全削除", Icon: TrashIcon, color: P.red, onClick: onReset, danger: true },
  ];
  return (
    <Section title="クイックアクション" accent={P.cyan}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, padding: "0 14px" }}>
        {items.map((it) => (
          <button
            key={it.label}
            className="b"
            onClick={it.onClick}
            aria-label={it.label}
            style={{
              minHeight: 72, textAlign: "left", cursor: "pointer",
              background: it.danger ? "rgba(239,68,68,0.10)" : P.card,
              border: `1px solid ${it.danger ? "rgba(239,68,68,0.32)" : P.line}`,
              borderRadius: 18, padding: "12px 13px",
              display: "flex", flexDirection: "column", gap: 8,
              WebkitTapHighlightColor: "transparent",
            }}
          >
            <span style={{
              width: 34, height: 34, borderRadius: 11,
              background: it.danger ? "rgba(239,68,68,0.16)" : "rgba(6,182,212,0.14)",
              border: `1px solid ${it.danger ? "rgba(239,68,68,0.34)" : "rgba(6,182,212,0.3)"}`,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <it.Icon size={18} stroke={it.color} sw={2} />
            </span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 900, color: it.danger ? P.red : P.text }}>{it.label}</div>
              <div style={{ fontSize: 10, color: P.sub, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.sub}</div>
            </div>
          </button>
        ))}
      </div>
    </Section>
  );
}

// ============================ 使い方パネル ============================
function HelpPanel({ onClose }) {
  const lines = [
    "「レイアウト図」で島ごとの台構成・良台率を俯瞰できます。",
    "各島の「編集」から台番号範囲・島名・機種名を変更できます。",
    "「新規作成」で島を追加し、↑↓で並び替えできます。",
    "編集内容は即保存され、戦略マップへ反映されます。",
  ];
  return (
    <div style={{ padding: "10px 14px 0" }}>
      <div style={{ background: P.card, border: `1px solid rgba(6,182,212,0.3)`, borderRadius: RADIUS, padding: "13px 14px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 900, color: P.cyan, display: "flex", alignItems: "center", gap: 6 }}>
            <HelpIcon size={16} stroke={P.cyan} /> 使い方
          </span>
          <button className="b" onClick={onClose} aria-label="使い方を閉じる" style={{ width: 32, height: 32, borderRadius: 10, background: P.cardHi, border: `1px solid ${P.line}`, color: P.subHi, fontSize: 15, cursor: "pointer" }}>✕</button>
        </div>
        {lines.map((t, i) => (
          <div key={i} style={{ display: "flex", gap: 8, fontSize: 12, color: P.subHi, lineHeight: 1.5, marginTop: i ? 6 : 0 }}>
            <span style={{ color: P.cyan, fontWeight: 900 }}>{i + 1}.</span>
            <span>{t}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================ 本体 ============================
export default function IslandMapManager({ store, stores, onChangeStore, islands, onChangeIslands, onBack }) {
  const [tab, setTab] = useState("layout");
  const [editingId, setEditingId] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [showHelp, setShowHelp] = useState(false);
  const [history, setHistory] = useState([]); // セッション内の変更履歴（恒久保存は将来連携予定）

  const hall = useMemo(() => buildHallLayout(islands), [islands]);
  const updatedAt = history[0]?.at || (store?.lastVisit || "");

  // 変更履歴へ1件追記する（このセッション内のみ・端末をまたがない）。
  const logChange = (summary) => {
    setHistory((prev) => [{ id: Date.now() + Math.random(), at: nowStamp(), summary, user: "あなた" }, ...prev].slice(0, 50));
  };

  const commit = (next, summary) => {
    onChangeIslands(next);
    if (summary) logChange(summary);
  };

  const patchIsland = (island, patch) => {
    const next = updateIsland(islands, island.id, patch);
    const updated = next.find((x) => x.id === island.id);
    let summary;
    if ("name" in patch) summary = `「${updated?.name || "島"}」の名称を変更`;
    else if ("machineName" in patch) summary = `「${updated?.name || "島"}」の機種名を変更`;
    else if ("start" in patch || "end" in patch) summary = `「${updated?.name || "島"}」の番号範囲を変更 ${updated?.start}〜${updated?.end}`;
    commit(next, summary);
  };

  const handleCreate = () => {
    const next = addIsland(islands);
    const created = next[next.length - 1];
    commit(next, `「${created?.name || "新しい島"}」を追加`);
    setTab("layout");
    setEditingId(created?.id ?? null);
    setExpandedId(created?.id ?? null);
  };

  const handleRemove = (island) => {
    const label = island.name ? `「${island.name}」` : "この島";
    if (!window.confirm(`${label}を削除しますか？`)) return;
    commit(removeIsland(islands, island.id), `${label}を削除`);
    if (editingId === island.id) setEditingId(null);
  };

  const handleReset = () => {
    if (!islands.length) return;
    if (!window.confirm("この店舗の島構成をすべて削除しますか？\nこの操作は元に戻せません。")) return;
    commit([], "全島をリセット");
    setEditingId(null);
    setExpandedId(null);
  };

  const moveUp = (island) => commit(moveIslandUp(islands, island.id), `「${island.name || "島"}」を上へ移動`);
  const moveDown = (island) => commit(moveIslandDown(islands, island.id), `「${island.name || "島"}」を下へ移動`);

  const toggleLayoutEdit = (id) => setEditingId((cur) => (cur === id ? null : id));
  const toggleExpand = (id) => {
    setExpandedId((cur) => (cur === id ? null : id));
    setEditingId(null);
  };

  // 一括編集の導線: 先頭島を編集状態にしてレイアウト/一覧へ誘導する。
  const startBulkEdit = (targetTab) => {
    setTab(targetTab);
    const first = islands[0];
    if (first) {
      setEditingId(first.id);
      setExpandedId(first.id);
    } else {
      handleCreate();
    }
  };

  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", background: P.bg, color: P.text, fontFamily: FONT, overflow: "hidden" }}>
      <Header onBack={onBack} onHelp={() => setShowHelp((v) => !v)} onCreate={handleCreate} />

      <div style={{ flex: 1, overflowY: "auto", paddingBottom: "calc(96px + env(safe-area-inset-bottom))" }}>
        {showHelp && <HelpPanel onClose={() => setShowHelp(false)} />}

        {/* 店舗サマリー（画面上部・主役導入） */}
        <StoreSummary
          store={store}
          stores={stores}
          onChangeStore={onChangeStore}
          totalIslands={hall.totalIslands}
          totalMachines={hall.totalMachines}
          updatedAt={updatedAt}
        />

        {/* ホール全体プレビュー（この画面の主役・俯瞰確認） */}
        <HallPreview layouts={hall.layouts} />

        {/* タブ */}
        <TabBar active={tab} onChange={(t) => { setTab(t); setEditingId(null); }} />

        {/* タブ内容 */}
        <div style={{ marginTop: 16 }}>
          {tab === "layout" && (
            <>
              <Legend />
              <div style={{ padding: "6px 14px 0" }}>
                {hall.layouts.length === 0 ? (
                  <div style={{ background: P.card, border: `1px dashed ${P.lineHi}`, borderRadius: 18, padding: "22px 16px", textAlign: "center", color: P.sub, fontSize: 12.5 }}>
                    島がまだありません。「新規作成」から追加してください。
                  </div>
                ) : (
                  hall.layouts.map((l, i) => {
                    const island = islands[i];
                    return (
                      <LayoutIslandCard
                        key={l.id}
                        layout={l}
                        island={island}
                        index={i}
                        total={islands.length}
                        editing={editingId === l.id}
                        onToggleEdit={() => toggleLayoutEdit(l.id)}
                        onChange={(patch) => patchIsland(island, patch)}
                        onRemove={() => handleRemove(island)}
                        onUp={() => moveUp(island)}
                        onDown={() => moveDown(island)}
                      />
                    );
                  })
                )}
              </div>
            </>
          )}

          {tab === "list" && (
            <div style={{ padding: "0 14px" }}>
              {hall.layouts.length === 0 ? (
                <div style={{ background: P.card, border: `1px dashed ${P.lineHi}`, borderRadius: 18, padding: "22px 16px", textAlign: "center", color: P.sub, fontSize: 12.5 }}>
                  島がまだありません。「新規作成」から追加してください。
                </div>
              ) : (
                hall.layouts.map((l, i) => {
                  const island = islands[i];
                  return (
                    <ListRow
                      key={l.id}
                      layout={l}
                      island={island}
                      index={i}
                      total={islands.length}
                      expanded={expandedId === l.id}
                      editing={editingId === l.id}
                      onToggleExpand={() => toggleExpand(l.id)}
                      onToggleEdit={() => toggleLayoutEdit(l.id)}
                      onChange={(patch) => patchIsland(island, patch)}
                      onRemove={() => handleRemove(island)}
                      onUp={() => moveUp(island)}
                      onDown={() => moveDown(island)}
                    />
                  );
                })
              )}
            </div>
          )}

          {tab === "history" && <HistoryTab entries={history} />}
        </div>

        {/* クイックアクション */}
        <QuickActions
          onLayout={() => { setTab("layout"); setEditingId(null); }}
          onBulkNum={() => startBulkEdit("layout")}
          onBulkCount={() => startBulkEdit("list")}
          onReset={handleReset}
        />

        {/* 説明文 */}
        <div style={{ padding: "16px 18px 6px" }}>
          <div style={{ fontSize: 11.5, color: P.sub, lineHeight: 1.8 }}>
            島構成の変更はいつでも可能です。<br />
            編集内容は即座に戦略マップへ反映されます。
          </div>
        </div>
      </div>
    </div>
  );
}
