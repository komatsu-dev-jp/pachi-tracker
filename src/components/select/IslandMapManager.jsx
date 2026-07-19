// 島マップ管理画面（再設計・島レイアウト管理＝「店舗の島構成を管理する」画面）
//
// 役割分離の方針:
//   - 本画面（島マップ管理）＝「管理」。店舗の島構成（島名・機種名・台番号範囲・台数・並び）を
//     登録／編集／俯瞰する。推定回転率・確信度・良台率・密度・強ゾーン・候補台・着席推奨・TOP5
//     などの分析情報は一切表示しない（それらは戦略マップ画面の役割）。
//   - 戦略マップ画面＝「分析」。本画面は触れない。
//
// データの実体は App.jsx の pt_hallMaps（{ [storeId]: Island[] }、
// Island = { id, name, start, end, machineName }）。本コンポーネントは hallMapSelectors の
// 純粋関数のみで不変更新し、rotRows（回転数記録）・logic.js には触れない。
// 世界観は戦略マップと統一（Bloomberg風・ダーク・ネオンブルー）だが、より管理寄りでシンプル。

import React, { useState, useMemo, useRef, useEffect } from "react";
import {
  islandCount,
  islandLayoutCells,
  islandLayoutColumns,
  islandRanges,
  addIsland,
  removeIsland,
  updateIsland,
  moveIslandUp,
  moveIslandDown,
  LAYOUT_ROWS_MIN,
  LAYOUT_ROWS_MAX,
} from "./hallMapSelectors";

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
  red: "#EF4444",
  cyan: "#06B6D4",
};
const RADIUS = 24;
const FONT = "var(--font-main)";
const MONO = "var(--font-mono)";

// 島ごとの簡易カラータグ（管理用の識別色のみ。分析的な意味は持たない）。
const TAG_COLORS = ["#06B6D4", "#3B82F6", "#14B8A6", "#8B5CF6", "#F59E0B", "#EC4899"];
const tagColor = (i) => TAG_COLORS[i % TAG_COLORS.length];

// レイアウトプレビューで描画する台セルの上限（極端な範囲指定時の保護）。
const MAX_CELLS = 200;

const TABS = [
  { id: "list", label: "島一覧" },
  { id: "layout", label: "レイアウト図" },
  { id: "history", label: "変更履歴" },
];

function fmt(n) {
  if (n == null || !isFinite(n)) return "—";
  return Number(n).toLocaleString("ja-JP");
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
const ChevronIcon = (p) => <Icon {...p} d="M9 6l6 6-6 6" />;
const ClockIcon = (p) => <Icon {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></Icon>;
const SaveIcon = (p) => <Icon {...p}><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><path d="M17 21v-8H7v8" /><path d="M7 3v5h8" /></Icon>;
const HashIcon = (p) => <Icon {...p}><path d="M4 9h16" /><path d="M4 15h16" /><path d="M10 3L8 21" /><path d="M16 3l-2 18" /></Icon>;
const StackIcon = (p) => <Icon {...p}><path d="M12 3l9 5-9 5-9-5 9-5z" /><path d="M3 13l9 5 9-5" /></Icon>;

// ============================ 共通枠 ============================
function Section({ title, sub, accent = P.cyan, children }) {
  return (
    <div style={{ marginTop: 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 16px 9px" }}>
        <span style={{ width: 4, height: 14, borderRadius: 2, background: accent }} />
        <span style={{ fontSize: 13.5, fontWeight: 900, color: P.text, letterSpacing: 0.4 }}>{title}</span>
        {sub && <span style={{ fontSize: 10, color: P.sub, marginLeft: "auto" }}>{sub}</span>}
      </div>
      {children}
    </div>
  );
}

function pillBtn(extra) {
  return {
    height: 40, minWidth: 44, borderRadius: 13, background: P.card, border: `1px solid ${P.line}`,
    display: "flex", alignItems: "center", justifyContent: "center", gap: 5, cursor: "pointer",
    color: P.text, fontSize: 12.5, fontWeight: 800, fontFamily: FONT, padding: "0 11px",
    WebkitTapHighlightColor: "transparent", ...extra,
  };
}
const cyanBtn = {
  background: "linear-gradient(180deg, #0ea5c4 0%, #06B6D4 100%)", border: "none",
  color: "#04141a", boxShadow: "0 4px 14px rgba(6,182,212,0.35)",
};

// ============================ ヘッダー ============================
function Header({ onBack, onHelp, onCreate }) {
  return (
    <div style={{
      position: "sticky", top: 0, zIndex: 20,
      background: "linear-gradient(180deg, #050A14 82%, rgba(5,10,20,0))",
      padding: "calc(env(safe-area-inset-top, 0px) + 10px) 14px 10px",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button className="b" onClick={onBack} aria-label="戻る" style={pillBtn({ width: 44, padding: 0 })}>
          <BackIcon />
        </button>
        <div style={{ flex: 1, minWidth: 0, textAlign: "center" }}>
          <div style={{ fontSize: 17, fontWeight: 900, color: P.text, fontFamily: FONT, letterSpacing: 0.4 }}>島マップ管理</div>
          <div style={{ fontSize: 10, color: P.sub, marginTop: 1 }}>島レイアウト管理</div>
        </div>
        <button className="b" onClick={onHelp} aria-label="使い方" style={pillBtn()}>
          <HelpIcon size={17} stroke={P.subHi} /> 使い方
        </button>
        <button className="b" onClick={onCreate} aria-label="新規作成" style={pillBtn(cyanBtn)}>
          <PlusIcon size={17} stroke="#04141a" /> 新規作成
        </button>
      </div>
    </div>
  );
}

// ============================ 店舗サマリー ============================
function StorePicker({ stores, storeId, onChangeStore }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => { if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);
  if (!Array.isArray(stores) || stores.length < 2) return null;
  return (
    <div ref={rootRef} style={{ position: "relative", flexShrink: 0 }}>
      <button className="b" aria-label="店舗を切り替える" onClick={() => setOpen((v) => !v)} style={{
        minHeight: 36, borderRadius: 11, padding: "0 11px", border: `1px solid ${P.lineHi}`,
        background: P.cardHi, color: P.subHi, fontSize: 11, fontWeight: 800, fontFamily: FONT,
        display: "flex", alignItems: "center", gap: 5,
      }}>
        店舗切替 <span style={{ fontSize: 9 }}>▼</span>
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", right: 0, minWidth: 180, maxWidth: 240,
          maxHeight: 240, overflowY: "auto", background: P.card, border: `1px solid ${P.lineHi}`,
          borderRadius: 12, boxShadow: "0 12px 30px rgba(0,0,0,0.6)", zIndex: 30,
        }}>
          {stores.map((st, i) => {
            const active = st.id === storeId;
            return (
              <button key={st.id ?? i} className="b" aria-label={`${st.name}に切り替える`}
                onClick={() => { setOpen(false); if (!active) onChangeStore(st.id); }}
                style={{
                  width: "100%", minHeight: 44, boxSizing: "border-box",
                  background: active ? "rgba(6,182,212,0.14)" : "transparent", border: "none",
                  borderBottom: `1px solid ${P.line}`, color: active ? P.cyan : P.text,
                  fontSize: 13, fontWeight: active ? 900 : 700, fontFamily: FONT, textAlign: "left",
                  padding: "0 13px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
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
          <div style={{
            width: 54, height: 54, flexShrink: 0, borderRadius: 15,
            background: "linear-gradient(135deg, rgba(6,182,212,0.28), rgba(6,182,212,0.06))",
            border: "1px solid rgba(6,182,212,0.34)", display: "flex", alignItems: "center",
            justifyContent: "center", boxShadow: "0 0 18px rgba(6,182,212,0.18)",
          }}>
            <StoreIcon size={24} stroke={P.cyan} />
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
            <div style={{ fontSize: 11.5, color: P.subHi, marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {store?.address ? store.address : "住所未登録"}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: P.sub, marginTop: 4 }}>
              <ClockIcon size={12} stroke={P.sub} sw={1.8} /> 最終更新 {updatedAt || "—"}
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 13 }}>
          {[
            { label: "総島数", value: fmt(totalIslands), unit: "島" },
            { label: "総台数", value: fmt(totalMachines), unit: "台" },
          ].map((it) => (
            <div key={it.label} style={{ background: P.bg, border: `1px solid ${P.line}`, borderRadius: 14, padding: "10px 12px 11px" }}>
              <div style={{ fontSize: 9.5, color: P.sub, fontWeight: 700 }}>{it.label}</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 3, marginTop: 5 }}>
                <span style={{ fontSize: 22, fontWeight: 900, color: P.text, fontFamily: MONO, letterSpacing: -0.6 }}>{it.value}</span>
                <span style={{ fontSize: 10, color: P.sub, fontWeight: 700 }}>{it.unit}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================ ホール全体プレビュー（俯瞰確認専用） ============================
function PreviewIsland({ island, index }) {
  const count = islandCount(island);
  const color = tagColor(index);
  return (
    <div style={{ flex: "1 0 132px", minWidth: 132, maxWidth: 180, background: P.cardHi, border: `1px solid ${P.line}`, borderRadius: 16, padding: "11px 12px 12px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ width: 9, height: 9, borderRadius: 3, background: color, boxShadow: `0 0 6px ${color}`, flexShrink: 0 }} />
        <span style={{ fontSize: 13, fontWeight: 900, color: P.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {island.name || "（名称未設定）"}
        </span>
      </div>
      <div style={{ fontSize: 11, color: P.subHi, marginTop: 5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {island.machineName || "機種未設定"}
      </div>
      <div style={{ fontSize: 13, fontWeight: 800, color: P.text, fontFamily: MONO, marginTop: 6 }}>
        {island.start}〜{island.end}
      </div>
      <div style={{ fontSize: 11, color: P.sub, marginTop: 2, fontFamily: MONO }}>{count}台</div>
    </div>
  );
}

function HallPreview({ islands }) {
  return (
    <Section title="ホール全体プレビュー" sub="俯瞰確認用">
      {islands.length === 0 ? (
        <div style={{ padding: "0 14px" }}>
          <div style={{ background: P.card, border: `1px dashed ${P.lineHi}`, borderRadius: 16, padding: "18px 14px", textAlign: "center", color: P.sub, fontSize: 12 }}>
            島が未登録です。「新規作成」から島を追加してください。
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 8, overflowX: "auto", padding: "0 14px 4px", WebkitOverflowScrolling: "touch", scrollbarWidth: "none" }}>
          {islands.map((isl, i) => <PreviewIsland key={isl.id} island={isl} index={i} />)}
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
            <button key={t.id} className="b" onClick={() => onChange(t.id)} aria-current={on ? "true" : undefined}
              style={{
                flex: 1, border: "none", borderRadius: 14,
                background: on ? "linear-gradient(180deg, #0ea5c4 0%, #06B6D4 100%)" : "transparent",
                color: on ? "#04141a" : P.subHi, fontSize: 13, fontWeight: on ? 900 : 700, fontFamily: FONT,
                cursor: "pointer", boxShadow: on ? "0 4px 14px rgba(6,182,212,0.35)" : "none", transition: "all 0.2s ease",
              }}>
              {t.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// 台番号セル（管理用・番号のみ。分析データは表示しない）。
// onClick を渡すと編集用のタップ可能セル（button）になる。
function NumberCell({ num, color, onClick, ariaLabel }) {
  const style = {
    aspectRatio: "1 / 1", minWidth: 0, borderRadius: 8,
    border: `1px solid ${P.line}`, background: P.bg,
    display: "flex", alignItems: "center", justifyContent: "center",
    borderTop: `2px solid ${color}`, boxSizing: "border-box", padding: 0,
  };
  const label = <span style={{ fontSize: 12, fontWeight: 800, color: P.subHi, fontFamily: MONO }}>{num}</span>;
  if (onClick) {
    return (
      <button className="b" onClick={onClick} aria-label={ariaLabel}
        style={{ ...style, cursor: "pointer", WebkitTapHighlightColor: "transparent" }}>
        {label}
      </button>
    );
  }
  return <div style={style}>{label}</div>;
}

// 欠けセル（その台番号の台が存在しない）。位置は台セルと同じまま薄く表示し、
// onClick を渡すとタップで台に戻せる。
function GapCell({ num, onClick }) {
  const style = {
    aspectRatio: "1 / 1", minWidth: 0, borderRadius: 8,
    border: `1px dashed ${P.lineHi}`, background: "transparent",
    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
    boxSizing: "border-box", padding: 0, gap: 1,
  };
  const label = (
    <>
      <span style={{ fontSize: 10, fontWeight: 700, color: P.sub, fontFamily: MONO, textDecoration: "line-through" }}>{num}</span>
      <span style={{ fontSize: 8.5, fontWeight: 700, color: P.sub }}>欠</span>
    </>
  );
  if (onClick) {
    return (
      <button className="b" onClick={onClick} aria-label={`${num}を台に戻す`}
        style={{ ...style, cursor: "pointer", WebkitTapHighlightColor: "transparent" }}>
        {label}
      </button>
    );
  }
  return <div style={style}>{label}</div>;
}

// レイアウトセルのグリッド（列数指定時は横スクロール可能なプレビュー枠内で表示）。
function CellGrid({ cols, children }) {
  if (cols) {
    return (
      <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch", scrollbarWidth: "none" }}>
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, minmax(44px, 1fr))`, gap: 5 }}>
          {children}
        </div>
      </div>
    );
  }
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(44px, 1fr))", gap: 5 }}>
      {children}
    </div>
  );
}

// ============================ 島一覧（メイン） ============================
function ListCard({ island, index, expanded, onToggle, onEdit }) {
  const count = islandCount(island);
  const color = tagColor(index);
  const cells = expanded ? islandLayoutCells(island, MAX_CELLS) : [];
  const shownMachines = cells.filter((c) => !c.gap).length;
  const gridCols = cells.length > 0 ? islandLayoutColumns(island, cells.length) : null;
  return (
    <div style={{ background: P.card, border: `1px solid ${expanded ? P.lineHi : P.line}`, borderRadius: 18, marginBottom: 10, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "stretch" }}>
        <button className="b" onClick={onToggle} aria-label={`${island.name || "島"}の詳細を${expanded ? "閉じる" : "開く"}`} aria-expanded={expanded}
          style={{
            flex: 1, minWidth: 0, background: "transparent", border: "none", cursor: "pointer",
            display: "flex", alignItems: "center", gap: 10, padding: "12px 4px 12px 14px", textAlign: "left",
            WebkitTapHighlightColor: "transparent",
          }}>
          <span style={{ width: 8, height: 38, borderRadius: 4, background: color, flexShrink: 0, boxShadow: `0 0 8px ${color}55` }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 900, color: P.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {island.name || "（名称未設定）"}
            </div>
            <div style={{ fontSize: 11.5, color: P.subHi, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {island.machineName || "機種未設定"}
            </div>
          </div>
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 900, color: P.text, fontFamily: MONO }}>{island.start}〜{island.end}</div>
            <div style={{ fontSize: 10, color: P.sub, marginTop: 2, fontWeight: 700 }}>{count}台{island.ranges ? "・飛び番" : ""}</div>
          </div>
          <span style={{ flexShrink: 0, color: P.sub, transform: expanded ? "rotate(90deg)" : "none", transition: "transform 0.2s ease" }}>
            <ChevronIcon size={18} stroke={P.sub} />
          </span>
        </button>
        <button className="b" onClick={onEdit} aria-label={`${island.name || "島"}を編集`}
          style={{
            flexShrink: 0, alignSelf: "center", margin: "0 12px 0 6px", minHeight: 40, borderRadius: 12, padding: "0 13px",
            border: `1px solid ${P.lineHi}`, background: P.cardHi, color: P.text, fontSize: 12.5, fontWeight: 900,
            fontFamily: FONT, display: "flex", alignItems: "center", gap: 5,
          }}>
          <EditIcon size={15} stroke={P.text} sw={2} /> 編集
        </button>
      </div>

      {expanded && (
        <div style={{ padding: "2px 14px 14px" }}>
          <div style={{ fontSize: 10, color: P.sub, fontWeight: 700, margin: "4px 0 8px" }}>台番号一覧 ・ レイアウトプレビュー</div>
          {cells.length > 0 ? (
            <CellGrid cols={gridCols}>
              {cells.map((c) => c.gap
                ? <GapCell key={c.num} num={c.num} />
                : <NumberCell key={c.num} num={c.num} color={color} />)}
            </CellGrid>
          ) : (
            <div style={{ fontSize: 11, color: P.sub }}>台番号範囲が未設定です。</div>
          )}
          {count > shownMachines && (
            <div style={{ fontSize: 9, color: P.sub, marginTop: 6, textAlign: "right" }}>※ 表示は先頭{shownMachines}台まで</div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================ レイアウト図 ============================
function LayoutHall({ islands }) {
  return (
    <div style={{ padding: "6px 14px 0" }}>
      <div style={{
        display: "flex", gap: 8, alignItems: "flex-start", overflowX: "auto",
        background: "radial-gradient(circle at 50% 0%, rgba(6,182,212,0.07), transparent 60%), #070D1A",
        border: `1px solid ${P.line}`, borderRadius: 18, padding: "12px 10px",
        WebkitOverflowScrolling: "touch", scrollbarWidth: "none",
      }}>
        {islands.map((isl, i) => {
          const color = tagColor(i);
          const layoutCells = islandLayoutCells(isl, MAX_CELLS);
          return (
            <div key={isl.id} style={{ flex: "1 0 150px", minWidth: 150, background: P.cardHi, border: `1px solid ${P.line}`, borderRadius: 14, padding: "9px 9px 10px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: 3, background: color, boxShadow: `0 0 6px ${color}`, flexShrink: 0 }} />
                <span style={{ fontSize: 12, fontWeight: 900, color: P.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{isl.name || "島"}</span>
                <span style={{ marginLeft: "auto", fontSize: 10, color: P.sub, fontFamily: MONO }}>{islandCount(isl)}台</span>
              </div>
              <div style={{ fontSize: 9.5, color: P.sub, marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{isl.machineName || "機種未設定"}</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 4, marginTop: 8 }}>
                {layoutCells.map((c) => c.gap
                  ? <GapCell key={c.num} num={c.num} />
                  : <NumberCell key={c.num} num={c.num} color={color} />)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================ 変更履歴 ============================
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
function QuickActions({ onAdd, onBulkNum, onBulkCount, onReset }) {
  const items = [
    { label: "島追加", sub: "新しい島を作成", Icon: PlusIcon, onClick: onAdd },
    { label: "台番号一括編集", sub: "範囲をまとめて調整", Icon: HashIcon, onClick: onBulkNum },
    { label: "台数一括編集", sub: "台数をまとめて調整", Icon: StackIcon, onClick: onBulkCount },
    { label: "データリセット", sub: "この店舗の島を全削除", Icon: TrashIcon, onClick: onReset, danger: true },
  ];
  return (
    <Section title="クイックアクション">
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, padding: "0 14px" }}>
        {items.map((it) => (
          <button key={it.label} className="b" onClick={it.onClick} aria-label={it.label}
            style={{
              minHeight: 72, textAlign: "left", cursor: "pointer",
              background: it.danger ? "rgba(239,68,68,0.10)" : P.card,
              border: `1px solid ${it.danger ? "rgba(239,68,68,0.32)" : P.line}`, borderRadius: 18, padding: "12px 13px",
              display: "flex", flexDirection: "column", gap: 8, WebkitTapHighlightColor: "transparent",
            }}>
            <span style={{
              width: 34, height: 34, borderRadius: 11,
              background: it.danger ? "rgba(239,68,68,0.16)" : "rgba(6,182,212,0.14)",
              border: `1px solid ${it.danger ? "rgba(239,68,68,0.34)" : "rgba(6,182,212,0.3)"}`,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <it.Icon size={18} stroke={it.danger ? P.red : P.cyan} sw={2} />
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
    "「島一覧」で店舗の島構成（島名・機種名・台番号範囲・台数）を管理します。",
    "島カードをタップすると台番号一覧を確認できます。",
    "「編集」から島ごとのレイアウトを編集し、「保存」で確定します。",
    "推定回転率などの分析は戦略マップ画面で確認してください。",
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

// ============================ 編集画面（別画面） ============================
function EditField({ label, value, onCommit, placeholder, ariaLabel, mono }) {
  return (
    <div>
      <div style={{ fontSize: 10.5, color: P.sub, fontWeight: 700, marginBottom: 5 }}>{label}</div>
      <input
        type="text"
        defaultValue={value}
        placeholder={placeholder}
        aria-label={ariaLabel || label}
        onFocus={(e) => { e.target.style.borderColor = P.cyan; }}
        onBlur={(e) => { e.target.style.borderColor = P.lineHi; onCommit(e.target.value); }}
        style={{
          width: "100%", boxSizing: "border-box", minHeight: 46, background: P.bg,
          border: `1px solid ${P.lineHi}`, borderRadius: 12, color: P.text,
          fontFamily: mono ? MONO : FONT, fontSize: 15, fontWeight: 700, padding: "8px 12px", outline: "none",
        }}
      />
    </div>
  );
}

function ToolBtn({ label, onClick, disabled, danger }) {
  return (
    <button className="b" onClick={onClick} disabled={disabled} aria-label={label}
      style={{
        minHeight: 46, borderRadius: 12, padding: "0 12px",
        border: `1px solid ${danger ? "rgba(239,68,68,0.4)" : P.lineHi}`,
        background: danger ? "rgba(239,68,68,0.12)" : P.cardHi,
        color: disabled ? P.sub : (danger ? P.red : P.text), opacity: disabled ? 0.4 : 1,
        fontSize: 13, fontWeight: 900, fontFamily: FONT, cursor: disabled ? "default" : "pointer",
        display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
      }}>
      {label}
    </button>
  );
}

// 編集開始時の行数。保存済み rows を優先し、旧 cols 設定の島は見た目が変わらないよう行数へ換算する。
function initialRows(island) {
  if (island.rows) return island.rows;
  const total = islandCount(island) + (island.gaps?.length || 0); // 欠けを含む全セル数
  if (island.cols) {
    return Math.max(LAYOUT_ROWS_MIN, Math.min(LAYOUT_ROWS_MAX, Math.ceil(total / island.cols)));
  }
  return 2; // 既定は対面2行（島を上から見た並び）
}

// 下書き中の追加連番範囲（文字列のまま保持）から、有効な数値範囲だけを取り出す。
function validExtraRanges(extra) {
  const out = [];
  for (const r of extra) {
    const sRaw = String(r.start ?? "").trim();
    const eRaw = String(r.end ?? "").trim();
    if (sRaw === "" && eRaw === "") continue;
    const s = Math.max(0, Math.round(Number(sRaw) || 0));
    const e = Math.max(s, Math.round(Number(eRaw === "" ? sRaw : eRaw) || s));
    out.push({ start: s, end: e });
  }
  return out;
}

function EditScreen({ island, index, total, onBack, onSave, onMoveUp, onMoveDown, onRemove }) {
  // 下書き編集 → 「保存」で確定（保存後に戦略マップへ反映）。
  // rows（行数）・gaps（欠け台番号）・extra（追加の連番範囲）も下書きに含め、保存で島データへ永続化する。
  const segs0 = islandRanges(island);
  const [draft, setDraft] = useState({
    name: island.name, machineName: island.machineName,
    start: segs0[0].start, end: segs0[0].end,
    extra: segs0.slice(1), // 2つ目以降の連番範囲（連番が途中で切れる島用）
    rows: initialRows(island), gaps: Array.isArray(island.gaps) ? island.gaps : [],
  });

  const startN = Math.max(0, Math.round(Number(draft.start) || 0));
  const endN = Math.max(startN, Math.round(Number(draft.end) || startN));
  const rows = Math.max(LAYOUT_ROWS_MIN, Math.min(LAYOUT_ROWS_MAX, Math.round(Number(draft.rows) || 2)));
  const color = tagColor(index);

  // 全連番範囲（先頭範囲＋追加範囲）。プレビューは入力順につなげて表示する。
  const segsAll = [{ start: startN, end: endN }, ...validExtraRanges(draft.extra)];
  const count = segsAll.reduce((a, seg) => a + (seg.end - seg.start + 1), 0);

  // プレビュー用セル（上から見た島マップ）。セル位置は台番号で固定され、
  // 欠けにしても他のセルは一切動かない（タップでその場トグル）。
  const inRanges = (n) => segsAll.some((seg) => n >= seg.start && n <= seg.end);
  const gaps = draft.gaps.filter(inRanges); // 連番範囲内の欠け台番号のみ有効
  const gapSet = new Set(gaps);
  const machines = count - gaps.length; // 実台数（欠けを除く）
  const totalCells = Math.min(count, MAX_CELLS);
  const cols = Math.max(1, Math.ceil(totalCells / rows)); // 横方向のセル数（範囲から自動算出）
  const cells = [];
  for (const seg of segsAll) {
    for (let n = seg.start; n <= seg.end && cells.length < totalCells; n++) {
      cells.push(gapSet.has(n) ? { num: n, gap: true } : { num: n });
    }
  }

  // 台追加/削除は最後の連番範囲の終了番号を増減する（追加範囲が無ければ先頭範囲）。
  const bumpEnd = (delta) => setDraft((d) => {
    const extra = [...d.extra];
    for (let i = extra.length - 1; i >= 0; i--) {
      const sRaw = String(extra[i].start ?? "").trim();
      if (sRaw === "") continue;
      const s = Math.max(0, Math.round(Number(sRaw) || 0));
      const eRaw = String(extra[i].end ?? "").trim();
      const e = Math.max(s, Math.round(Number(eRaw === "" ? sRaw : eRaw) || s));
      extra[i] = { ...extra[i], end: Math.max(s, e + delta) };
      return { ...d, extra };
    }
    const s = Math.max(0, Math.round(Number(d.start) || 0));
    const e = Math.max(s, Math.round(Number(d.end) || s) + delta);
    return { ...d, end: e };
  });
  const setRows = (v) => setDraft((d) => ({
    ...d, rows: Math.max(LAYOUT_ROWS_MIN, Math.min(LAYOUT_ROWS_MAX, Math.round(Number(v) || 2))),
  }));
  const setExtra = (i, patch) => setDraft((d) => ({
    ...d, extra: d.extra.map((r, j) => (j === i ? { ...r, ...patch } : r)),
  }));
  const addExtra = () => setDraft((d) => ({ ...d, extra: [...d.extra, { start: "", end: "" }] }));
  const removeExtra = (i) => setDraft((d) => ({ ...d, extra: d.extra.filter((_, j) => j !== i) }));
  // 台番号 n の欠けをその場でトグルする（他のセルは動かない）。
  const toggleGap = (n) => setDraft((d) => ({
    ...d,
    gaps: d.gaps.includes(n)
      ? d.gaps.filter((g) => g !== n)
      : [...d.gaps, n].sort((a, b) => a - b),
  }));

  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", background: P.bg, color: P.text, fontFamily: FONT, overflow: "hidden" }}>
      <div style={{
        position: "sticky", top: 0, zIndex: 20, background: "linear-gradient(180deg, #050A14 82%, rgba(5,10,20,0))",
        padding: "calc(env(safe-area-inset-top, 0px) + 10px) 14px 10px",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button className="b" onClick={onBack} aria-label="キャンセルして戻る" style={pillBtn({ width: 44, padding: 0 })}><BackIcon /></button>
          <div style={{ flex: 1, minWidth: 0, textAlign: "center" }}>
            <div style={{ fontSize: 17, fontWeight: 900, color: P.text, letterSpacing: 0.4 }}>島を編集</div>
            <div style={{ fontSize: 10, color: P.sub, marginTop: 1 }}>レイアウト編集</div>
          </div>
          <button className="b" onClick={() => onSave({ ...draft, start: startN, end: endN, ranges: segsAll, rows, gaps, cols: null })} aria-label="保存" style={pillBtn(cyanBtn)}>
            <SaveIcon size={16} stroke="#04141a" /> 保存
          </button>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", paddingBottom: "calc(96px + env(safe-area-inset-bottom))" }}>
        {/* 基本情報 */}
        <div style={{ padding: "8px 14px 0" }}>
          <div style={{ background: P.card, border: `1px solid ${P.line}`, borderRadius: RADIUS, padding: 14, display: "grid", gap: 12 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <EditField label="島名" value={draft.name} placeholder="例：1島" onCommit={(v) => setDraft((d) => ({ ...d, name: v }))} />
              <EditField label="機種名" value={draft.machineName} placeholder="例：東京喰種" onCommit={(v) => setDraft((d) => ({ ...d, machineName: v }))} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr auto", gap: 10, alignItems: "end" }}>
              <EditField label="開始番号" value={draft.start} mono onCommit={(v) => setDraft((d) => ({ ...d, start: v }))} />
              <span style={{ fontSize: 15, color: P.sub, fontWeight: 800, paddingBottom: 12 }}>〜</span>
              <EditField label="終了番号" value={draft.end} mono onCommit={(v) => setDraft((d) => ({ ...d, end: v }))} />
              <div style={{ textAlign: "center", paddingBottom: 4 }}>
                <div style={{ fontSize: 10.5, color: P.sub, fontWeight: 700, marginBottom: 5 }}>台数</div>
                <div style={{ minHeight: 46, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, fontWeight: 900, color: P.cyan, fontFamily: MONO }}>{machines}</div>
              </div>
            </div>

            {/* 追加の連番範囲（連番が途中で切れる島用。例: 479〜490 の後に 499〜509 が続く） */}
            {draft.extra.map((r, i) => (
              <div key={`extra-${i}-${draft.extra.length}`} style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr auto", gap: 10, alignItems: "end" }}>
                <EditField label={`開始番号（連番${i + 2}）`} value={r.start} placeholder="例：546" mono onCommit={(v) => setExtra(i, { start: v })} />
                <span style={{ fontSize: 15, color: P.sub, fontWeight: 800, paddingBottom: 12 }}>〜</span>
                <EditField label="終了番号" value={r.end} placeholder="例：574" mono onCommit={(v) => setExtra(i, { end: v })} />
                <button className="b" onClick={() => removeExtra(i)} aria-label={`連番${i + 2}を削除`}
                  style={{
                    minHeight: 46, minWidth: 46, borderRadius: 12, border: "1px solid rgba(239,68,68,0.4)",
                    background: "rgba(239,68,68,0.12)", color: P.red, fontSize: 16, fontWeight: 900,
                    cursor: "pointer", WebkitTapHighlightColor: "transparent",
                  }}>
                  ✕
                </button>
              </div>
            ))}
            <ToolBtn label="＋ 連番範囲を追加（番号が飛ぶ島）" onClick={addExtra} />
            {draft.extra.length > 0 && (
              <div style={{ fontSize: 10, color: P.sub, lineHeight: 1.6, marginTop: -4 }}>
                ※ 連番が途中で切れる島（例: 479〜490 → 499〜509 → 546〜574）は範囲を分けて登録します。レイアウトは切れ目をまたいで1つの島としてつながります。
              </div>
            )}
          </div>
        </div>

        {/* レイアウト編集ツール */}
        <Section title="レイアウト編集">
          <div style={{ padding: "0 14px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <ToolBtn label="＋ 台追加" onClick={() => bumpEnd(1)} />
              <ToolBtn label="− 台削除" onClick={() => bumpEnd(-1)} disabled={count <= 0} />
              <ToolBtn label="＋ 列追加" onClick={() => bumpEnd(rows)} />
              {/* 行数コントロール（−/＋、数値は直接入力可。対面なら2行） */}
              <div style={{ display: "flex", alignItems: "stretch", gap: 6 }}>
                <ToolBtn label="−" onClick={() => setRows(rows - 1)} disabled={rows <= LAYOUT_ROWS_MIN} />
                <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                  <input
                    key={`rows-${rows}`}
                    type="number"
                    inputMode="numeric"
                    min={LAYOUT_ROWS_MIN}
                    max={LAYOUT_ROWS_MAX}
                    defaultValue={rows}
                    aria-label="行数"
                    onFocus={(e) => { e.target.style.borderColor = P.cyan; }}
                    onBlur={(e) => { e.target.style.borderColor = P.lineHi; setRows(e.target.value); }}
                    style={{
                      width: "100%", boxSizing: "border-box", minHeight: 30, background: P.bg,
                      border: `1px solid ${P.lineHi}`, borderRadius: 9, color: P.text, textAlign: "center",
                      fontFamily: MONO, fontSize: 14, fontWeight: 800, padding: "2px 4px", outline: "none",
                    }}
                  />
                  <div style={{ fontSize: 8.5, color: P.sub, fontWeight: 700, marginTop: 1 }}>行数</div>
                </div>
                <ToolBtn label="＋" onClick={() => setRows(rows + 1)} disabled={rows >= LAYOUT_ROWS_MAX} />
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <div style={{ flex: 1 }}><ToolBtn label="↑ 上へ並び替え" onClick={onMoveUp} disabled={index === 0} /></div>
              <div style={{ flex: 1 }}><ToolBtn label="↓ 下へ並び替え" onClick={onMoveDown} disabled={index === total - 1} /></div>
            </div>
            <div style={{ fontSize: 10, color: P.sub, marginTop: 8, lineHeight: 1.6 }}>
              ※ 島を上から見たマップです。「行数」は島の並び数（対面なら2行）で、台は横方向に増えていきます。プレビューの台をタップするとその台がその場で「欠け」（存在しない台）になり、もう一度タップすると元に戻ります。他の台の位置や番号は動きません。行数と欠けはこの島の設定として保存され、台数は欠けを除いた実台数になります。
            </div>

            {/* レイアウトプレビュー（上から見た島マップ・横スクロール・タップで欠けの挿入/解除） */}
            <div style={{ background: P.card, border: `1px solid ${P.line}`, borderRadius: 16, padding: 12, marginTop: 12 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontSize: 11, color: P.subHi, fontWeight: 700 }}>レイアウトプレビュー</span>
                <span style={{ fontSize: 10, color: P.sub, fontFamily: MONO }}>
                  {rows}行×{cols}列{gaps.length > 0 ? ` ・ 欠け${gaps.length}` : ""}
                </span>
              </div>
              {cells.length > 0 ? (
                <CellGrid cols={cols}>
                  {cells.map((c) => c.gap
                    ? <GapCell key={c.num} num={c.num} onClick={() => toggleGap(c.num)} />
                    : <NumberCell key={c.num} num={c.num} color={color}
                        onClick={() => toggleGap(c.num)} ariaLabel={`${c.num}を欠けにする`} />)}
                </CellGrid>
              ) : (
                <div style={{ fontSize: 11, color: P.sub }}>台番号範囲が未設定です。</div>
              )}
              {count > totalCells && (
                <div style={{ fontSize: 9, color: P.sub, marginTop: 6, textAlign: "right" }}>※ 表示は先頭{totalCells}台分まで</div>
              )}
            </div>
          </div>
        </Section>

        {/* 島削除 */}
        <div style={{ padding: "18px 14px 0" }}>
          <ToolBtn label="この島を削除" onClick={onRemove} danger />
        </div>
        <div style={{ padding: "14px 18px 6px", fontSize: 11, color: P.sub, lineHeight: 1.8 }}>
          「保存」で変更を確定します。保存後、戦略マップへ即反映されます。
        </div>
      </div>
    </div>
  );
}

// ============================ 本体 ============================
export default function IslandMapManager({ store, stores, onChangeStore, islands, onChangeIslands, onBack }) {
  const [tab, setTab] = useState("list"); // 管理画面のため初期表示は島一覧
  const [editId, setEditId] = useState(null); // 編集画面で編集中の島ID（別画面）
  const [expandedId, setExpandedId] = useState(null);
  const [showHelp, setShowHelp] = useState(false);
  const [history, setHistory] = useState([]); // セッション内の変更履歴（恒久保存は将来連携予定）

  const totalIslands = islands.length;
  const totalMachines = useMemo(() => islands.reduce((a, isl) => a + islandCount(isl), 0), [islands]);
  const updatedAt = history[0]?.at || store?.lastVisit || "";

  const logChange = (summary) =>
    setHistory((prev) => [{ id: Date.now() + Math.random(), at: nowStamp(), summary, user: "あなた" }, ...prev].slice(0, 50));

  const editingIndex = editId != null ? islands.findIndex((x) => x.id === editId) : -1;
  const editingIsland = editingIndex >= 0 ? islands[editingIndex] : null;

  const handleCreate = () => {
    const next = addIsland(islands);
    const created = next[next.length - 1];
    onChangeIslands(next);
    logChange(`「${created?.name || "新しい島"}」を追加`);
    setEditId(created?.id ?? null); // 別の編集画面へ
  };

  const handleSave = (patch) => {
    if (!editingIsland) return;
    onChangeIslands(updateIsland(islands, editingIsland.id, patch));
    logChange(`「${patch.name || editingIsland.name || "島"}」を更新 ${patch.start}〜${patch.end}`);
    setEditId(null);
  };

  const handleMove = (dir) => {
    if (!editingIsland) return;
    const next = dir < 0 ? moveIslandUp(islands, editingIsland.id) : moveIslandDown(islands, editingIsland.id);
    onChangeIslands(next);
    logChange(`「${editingIsland.name || "島"}」を${dir < 0 ? "上" : "下"}へ移動`);
  };

  const handleRemoveEditing = () => {
    if (!editingIsland) return;
    const label = editingIsland.name ? `「${editingIsland.name}」` : "この島";
    if (!window.confirm(`${label}を削除しますか？`)) return;
    onChangeIslands(removeIsland(islands, editingIsland.id));
    logChange(`${label}を削除`);
    setEditId(null);
  };

  const handleReset = () => {
    if (!islands.length) return;
    if (!window.confirm("この店舗の島構成をすべて削除しますか？\nこの操作は元に戻せません。")) return;
    onChangeIslands([]);
    logChange("全島をリセット");
    setExpandedId(null);
  };

  const toggleExpand = (id) => setExpandedId((cur) => (cur === id ? null : id));
  const openEdit = (id) => setEditId(id);

  // 一括編集の導線: 島一覧へ移動（各島カードの「編集」から調整）。
  const goManage = () => { setEditId(null); setTab("list"); };

  // ── 編集画面（別画面） ──
  if (editingIsland) {
    return (
      <EditScreen
        island={editingIsland}
        index={editingIndex}
        total={islands.length}
        onBack={() => setEditId(null)}
        onSave={handleSave}
        onMoveUp={() => handleMove(-1)}
        onMoveDown={() => handleMove(1)}
        onRemove={handleRemoveEditing}
      />
    );
  }

  // ── メイン画面 ──
  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", background: P.bg, color: P.text, fontFamily: FONT, overflow: "hidden" }}>
      <Header onBack={onBack} onHelp={() => setShowHelp((v) => !v)} onCreate={handleCreate} />

      <div style={{ flex: 1, overflowY: "auto", paddingBottom: "calc(96px + env(safe-area-inset-bottom))" }}>
        {showHelp && <HelpPanel onClose={() => setShowHelp(false)} />}

        <StoreSummary
          store={store}
          stores={stores}
          onChangeStore={onChangeStore}
          totalIslands={totalIslands}
          totalMachines={totalMachines}
          updatedAt={updatedAt}
        />

        <HallPreview islands={islands} />

        <TabBar active={tab} onChange={setTab} />

        <div style={{ marginTop: 16 }}>
          {tab === "list" && (
            <div style={{ padding: "0 14px" }}>
              {islands.length === 0 ? (
                <div style={{ background: P.card, border: `1px dashed ${P.lineHi}`, borderRadius: 18, padding: "22px 16px", textAlign: "center", color: P.sub, fontSize: 12.5 }}>
                  島がまだありません。「新規作成」から追加してください。
                </div>
              ) : (
                islands.map((isl, i) => (
                  <ListCard
                    key={isl.id}
                    island={isl}
                    index={i}
                    expanded={expandedId === isl.id}
                    onToggle={() => toggleExpand(isl.id)}
                    onEdit={() => openEdit(isl.id)}
                  />
                ))
              )}
            </div>
          )}

          {tab === "layout" && (
            islands.length === 0 ? (
              <div style={{ padding: "0 14px" }}>
                <div style={{ background: P.card, border: `1px dashed ${P.lineHi}`, borderRadius: 18, padding: "22px 16px", textAlign: "center", color: P.sub, fontSize: 12.5 }}>
                  島がまだありません。「新規作成」から追加してください。
                </div>
              </div>
            ) : (
              <LayoutHall islands={islands} />
            )
          )}

          {tab === "history" && <HistoryTab entries={history} />}
        </div>

        <QuickActions
          onAdd={handleCreate}
          onBulkNum={goManage}
          onBulkCount={goManage}
          onReset={handleReset}
        />

        <div style={{ padding: "16px 18px 6px" }}>
          <div style={{ fontSize: 11.5, color: P.sub, lineHeight: 1.8 }}>
            島構成の変更はいつでも可能です。<br />
            編集内容を保存すると、戦略マップへ反映されます。
          </div>
        </div>
      </div>
    </div>
  );
}
