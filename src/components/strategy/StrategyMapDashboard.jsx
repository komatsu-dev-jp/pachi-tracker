import React, { useMemo, useState } from "react";
import { buildStrategyMap } from "./strategyMapData";

// 戦略マップ画面（見た目優先プロトタイプ）
//
// 目的: ホールに入った瞬間に「どこへ向かうべきか」を5秒以内に判断できる画面。
// 既存UIコンポーネント（Card / Atoms / Select系）は流用せず、本ファイル内で自己完結する。
// 表示データは strategyMapData.js の仮データ（将来 P-EVIDENCE / 差玉解析 連携予定）。

// ---- 配色（モック準拠の固定パレット）----
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
  strong: { color: P.green, label: "本命", reco: "着席推奨" },
  watch: { color: P.yellow, label: "様子見", reco: "様子見" },
  weak: { color: P.red, label: "回収", reco: "見送り" },
  nodata: { color: P.gray, label: "不足", reco: "データ不足" },
};

const TABS = [
  { id: "all", label: "全台" },
  { id: "candidates", label: "良台候補" },
  { id: "playing", label: "実戦中のみ" },
];

function fmt(n, d = 0) {
  if (n == null || !isFinite(n)) return "—";
  return Number(n).toLocaleString("ja-JP", { minimumFractionDigits: d, maximumFractionDigits: d });
}
function signed(n, d = 0) {
  if (n == null || !isFinite(n)) return "—";
  return (n >= 0 ? "+" : "") + fmt(n, d);
}
function nowHM() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// ============================ ヘッダー ============================
function BackIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={P.text} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

function Header({ data, updatedAt, onBack }) {
  return (
    <div
      style={{
        position: "sticky",
        top: 0,
        zIndex: 20,
        background: "linear-gradient(180deg, #050A14 78%, rgba(5,10,20,0))",
        padding: "12px 14px 10px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button
          className="b"
          onClick={onBack}
          aria-label="戻る"
          style={{
            width: 44,
            height: 44,
            flexShrink: 0,
            borderRadius: 14,
            background: P.card,
            border: `1px solid ${P.line}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
          }}
        >
          <BackIcon />
        </button>

        <div style={{ flex: 1, minWidth: 0, textAlign: "center" }}>
          <div style={{ fontSize: 18, fontWeight: 900, color: P.text, fontFamily: FONT, letterSpacing: 0.3 }}>
            戦略マップ
          </div>
          <div style={{ fontSize: 11, color: P.subHi, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {data.machineName}
          </div>
          <div style={{ fontSize: 10, color: P.sub, marginTop: 1 }}>
            島全体 {data.total}台
          </div>
        </div>

        <div style={{ flexShrink: 0, textAlign: "right", minWidth: 56 }}>
          <div style={{ fontSize: 10, color: P.sub }}>更新 {updatedAt}</div>
          <div style={{ fontSize: 13, fontWeight: 900, color: P.cyan, marginTop: 3, fontFamily: MONO }}>
            候補 {data.kpi.candidates}台
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================ タブ ============================
function Tabs({ active, onChange }) {
  return (
    <div style={{ padding: "0 14px" }}>
      <div
        style={{
          display: "flex",
          gap: 4,
          height: 56,
          background: P.card,
          border: `1px solid ${P.line}`,
          borderRadius: 18,
          padding: 5,
        }}
      >
        {TABS.map((t) => {
          const on = active === t.id;
          return (
            <button
              key={t.id}
              className="b"
              onClick={() => onChange(t.id)}
              aria-current={on ? "true" : undefined}
              style={{
                flex: 1,
                border: "none",
                borderRadius: 14,
                background: on ? "linear-gradient(180deg, #0ea5c4 0%, #06B6D4 100%)" : "transparent",
                color: on ? "#04141a" : P.subHi,
                fontSize: 13,
                fontWeight: on ? 900 : 700,
                fontFamily: FONT,
                cursor: "pointer",
                transition: "all 0.2s ease",
                boxShadow: on ? "0 4px 14px rgba(6,182,212,0.35)" : "none",
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

// ============================ 本日のTOP5 ============================
function Top5({ rows, selectedId, onSelect }) {
  return (
    <Section title="本日のTOP5" accent={P.cyan}>
      <div
        style={{
          display: "flex",
          gap: 10,
          overflowX: "auto",
          padding: "2px 14px 6px",
          WebkitOverflowScrolling: "touch",
          scrollbarWidth: "none",
        }}
      >
        {rows.map((m) => {
          const v = VERDICT[m.verdict];
          const on = selectedId === m.id;
          return (
            <button
              key={m.id}
              className="b"
              onClick={() => onSelect(m.id)}
              style={{
                flex: "0 0 auto",
                width: 138,
                textAlign: "left",
                borderRadius: 20,
                background: P.card,
                border: on ? `1.5px solid ${P.cyan}` : `1px solid ${P.line}`,
                padding: "12px 13px",
                cursor: "pointer",
                transition: "all 0.2s ease",
                boxShadow: on ? "0 0 0 3px rgba(6,182,212,0.18)" : "none",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 900,
                    color: P.cyan,
                    background: "rgba(6,182,212,0.14)",
                    border: "1px solid rgba(6,182,212,0.34)",
                    borderRadius: 8,
                    padding: "2px 7px",
                    fontFamily: FONT,
                  }}
                >
                  {m.rank}位
                </span>
                {m.isStar && <span style={{ color: P.yellow, fontSize: 14, textShadow: `0 0 8px ${P.yellow}` }}>★</span>}
              </div>
              <div style={{ fontSize: 24, fontWeight: 900, color: P.text, fontFamily: MONO, marginTop: 7, lineHeight: 1 }}>
                {m.num}
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 3, marginTop: 9 }}>
                <span style={{ fontSize: 18, fontWeight: 900, color: v.color, fontFamily: MONO }}>{fmt(m.rot, 1)}</span>
                <span style={{ fontSize: 10, color: P.sub }}>/k</span>
              </div>
              <div style={{ fontSize: 13, fontWeight: 800, color: m.evPerHour >= 0 ? P.green : P.red, fontFamily: MONO, marginTop: 3 }}>
                {signed(m.evPerHour)}<span style={{ fontSize: 9, color: P.sub, fontFamily: FONT }}>円/h</span>
              </div>
              <div style={{ fontSize: 11, color: P.subHi, marginTop: 4 }}>
                確信度 <span style={{ color: v.color, fontWeight: 900, fontFamily: MONO }}>{m.confidence}%</span>
              </div>
            </button>
          );
        })}
      </div>
    </Section>
  );
}

// ============================ KPIサマリー ============================
function Kpi({ kpi }) {
  const items = [
    { label: "推定期待値", value: signed(kpi.evPerHour), unit: "円/h", color: kpi.evPerHour >= 0 ? P.green : P.red },
    { label: "予測回転率", value: fmt(kpi.rot, 1), unit: "/k", color: P.cyan },
    { label: "確信度", value: fmt(kpi.confidence), unit: "%", color: P.yellow },
    { label: "候補台数", value: fmt(kpi.candidates), unit: "台", color: P.green },
  ];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, padding: "0 14px" }}>
      {items.map((it) => (
        <div
          key={it.label}
          style={{
            background: P.card,
            border: `1px solid ${P.line}`,
            borderRadius: 16,
            padding: "11px 8px 12px",
            minWidth: 0,
          }}
        >
          <div style={{ fontSize: 9, color: P.sub, fontWeight: 700, whiteSpace: "nowrap" }}>{it.label}</div>
          <div
            style={{
              fontSize: 16,
              fontWeight: 900,
              color: it.color,
              fontFamily: MONO,
              fontVariantNumeric: "tabular-nums",
              letterSpacing: -0.8,
              marginTop: 7,
              whiteSpace: "nowrap",
            }}
          >
            {it.value}
          </div>
          <div style={{ fontSize: 8, color: P.sub, fontWeight: 700, marginTop: 1 }}>{it.unit}</div>
        </div>
      ))}
    </div>
  );
}

// ============================ ホールマップ ============================
function Legend() {
  const items = [
    ["ボーダー超え", P.green],
    ["様子見", P.yellow],
    ["未満", P.red],
    ["データ不足", P.gray],
  ];
  return (
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", padding: "0 14px 10px" }}>
      {items.map(([label, color]) => (
        <span key={label} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10, color: P.subHi }}>
          <span style={{ width: 9, height: 9, borderRadius: 3, background: color, boxShadow: `0 0 6px ${color}` }} />
          {label}
        </span>
      ))}
    </div>
  );
}

function FacilityIcon({ kind }) {
  const c = P.subHi;
  const common = { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: c, strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round" };
  switch (kind) {
    case "entrance":
      return <svg {...common}><path d="M14 3h5a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1h-5" /><path d="M10 12H3" /><path d="M7 8l-4 4 4 4" /></svg>;
    case "counter":
      return <svg {...common}><rect x="3" y="9" width="18" height="11" rx="1.5" /><path d="M3 13h18" /><path d="M7 9V6a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v3" /></svg>;
    case "toilet":
      return <svg {...common}><circle cx="12" cy="6" r="2.4" /><path d="M9 21v-6l-2-1 2-4h6l2 4-2 1v6" /></svg>;
    case "vending":
      return <svg {...common}><rect x="6" y="3" width="12" height="18" rx="1.5" /><path d="M9 7h2M9 10h2" /><rect x="13.5" y="14" width="3" height="3" rx="0.5" /></svg>;
    case "smoking":
      return <svg {...common}><rect x="3" y="13" width="14" height="4" rx="1" /><path d="M19 13v4M21 13v4" /><path d="M14 10c0-2-2-2-2-4" /></svg>;
    case "exit":
      return <svg {...common}><path d="M9 3H5a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h4" /><path d="M14 12h7" /><path d="M18 8l4 4-4 4" /></svg>;
    default:
      return null;
  }
}

function FacilityRail({ items, side }) {
  return (
    <div
      style={{
        width: 30,
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "space-around",
        gap: 8,
        paddingTop: 22,
      }}
    >
      {items.map((it) => (
        <div key={it.kind} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 9,
              background: P.card,
              border: `1px solid ${P.line}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <FacilityIcon kind={it.kind} />
          </div>
          <span style={{ fontSize: 8, color: P.sub, writingMode: "horizontal-tb", textAlign: side }}>{it.label}</span>
        </div>
      ))}
    </div>
  );
}

function MachineCell({ m, dim, selected, onSelect }) {
  const v = VERDICT[m.verdict];
  const bg = m.verdict === "nodata"
    ? "rgba(100,116,139,0.14)"
    : `color-mix(in srgb, ${v.color} ${Math.round(Math.max(0.16, Math.min(0.42, m.confidence / 150)) * 100)}%, ${P.card})`;
  return (
    <button
      className="b"
      onClick={() => onSelect(m.id)}
      aria-label={`${m.num}番台 ${v.label} 推定回転率${m.rot} 確信度${m.confidence}%`}
      style={{
        position: "relative",
        aspectRatio: "1 / 1",
        minWidth: 0,
        borderRadius: 8,
        border: selected ? `2px solid ${P.cyan}` : `1px solid color-mix(in srgb, ${v.color} 46%, transparent)`,
        background: bg,
        color: P.text,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 0,
        padding: 1,
        cursor: "pointer",
        opacity: dim ? 0.26 : 1,
        transition: "all 0.2s ease",
        boxShadow: m.isStar
          ? `0 0 10px color-mix(in srgb, ${v.color} 55%, transparent), inset 0 0 0 1px color-mix(in srgb, ${v.color} 30%, transparent)`
          : "none",
      }}
    >
      {m.isStar && (
        <span style={{ position: "absolute", top: -6, right: -4, color: P.yellow, fontSize: 11, textShadow: "0 0 6px rgba(0,0,0,0.8)" }}>★</span>
      )}
      <span style={{ fontSize: 8, fontWeight: 700, color: P.subHi, fontFamily: MONO, lineHeight: 1 }}>{m.num}</span>
      <span style={{ fontSize: 12, fontWeight: 900, color: v.color, fontFamily: MONO, lineHeight: 1.15 }}>
        {m.verdict === "nodata" ? "—" : fmt(m.rot, 1)}
      </span>
      <span style={{ fontSize: 7, fontWeight: 700, color: P.sub, fontFamily: MONO, lineHeight: 1 }}>
        {m.verdict === "nodata" ? "" : `${m.confidence}%`}
      </span>
    </button>
  );
}

function IslandCard({ island, filter, selectedId, onSelect }) {
  const isDim = (m) => {
    if (filter === "candidates") return m.verdict !== "strong";
    if (filter === "playing") return !m.isPlaying;
    return false;
  };
  return (
    <div style={{ flex: 1, minWidth: 0, background: P.cardHi, border: `1px solid ${P.line}`, borderRadius: 14, padding: "8px 7px 9px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 4 }}>
        <span style={{ fontSize: 11, fontWeight: 900, color: P.text }}>{island.name}</span>
        <span
          style={{
            fontSize: 11,
            fontWeight: 900,
            color: P.cyan,
            background: "rgba(6,182,212,0.14)",
            borderRadius: 7,
            padding: "1px 6px",
            fontFamily: MONO,
          }}
        >
          {island.grade}
        </span>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 5, marginBottom: 7 }}>
        <span style={{ fontSize: 8, color: P.sub }}>良台率 <b style={{ color: P.green, fontFamily: MONO }}>{island.goodRate}%</b></span>
        <span style={{ fontSize: 8, color: P.sub }}>密度 <b style={{ color: P.subHi, fontFamily: MONO }}>{signed(island.evDensity)}</b></span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
        {island.machines.map((m) => (
          <MachineCell key={m.id} m={m} dim={isDim(m)} selected={selectedId === m.id} onSelect={onSelect} />
        ))}
      </div>
      <div
        style={{
          marginTop: 7,
          fontSize: 8,
          color: P.subHi,
          textAlign: "center",
          background: "rgba(34,197,94,0.10)",
          border: "1px solid rgba(34,197,94,0.22)",
          borderRadius: 7,
          padding: "3px 4px",
        }}
      >
        強ゾーン {island.strongZone}
      </div>
    </div>
  );
}

function HallMap({ data, filter, selectedId, onSelect }) {
  return (
    <Section title="ホールマップ" accent={P.cyan} sub="色＝強さ ／ ★＝本日の本命">
      <Legend />
      <div style={{ padding: "0 12px 4px" }}>
        <div
          style={{
            display: "flex",
            gap: 6,
            alignItems: "stretch",
            background: "radial-gradient(circle at 50% 0%, rgba(6,182,212,0.08), transparent 60%), #070D1A",
            border: `1px solid ${P.line}`,
            borderRadius: 18,
            padding: "10px 8px",
          }}
        >
          <FacilityRail
            side="right"
            items={[
              { kind: "entrance", label: "入口" },
              { kind: "counter", label: "カウンター" },
              { kind: "toilet", label: "トイレ" },
            ]}
          />
          <div style={{ flex: 1, display: "flex", gap: 6, minWidth: 0 }}>
            {data.islands.map((isl) => (
              <IslandCard key={isl.id} island={isl} filter={filter} selectedId={selectedId} onSelect={onSelect} />
            ))}
          </div>
          <FacilityRail
            side="left"
            items={[
              { kind: "vending", label: "自販機" },
              { kind: "smoking", label: "喫煙所" },
              { kind: "exit", label: "非常口" },
            ]}
          />
        </div>
      </div>
    </Section>
  );
}

// ============================ 選択台詳細 ============================
function Sparkline({ points, color }) {
  const w = 132;
  const h = 52;
  const pad = 4;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const step = (w - pad * 2) / (points.length - 1);
  const coords = points.map((p, i) => {
    const x = pad + i * step;
    const y = pad + (1 - (p - min) / span) * (h - pad * 2);
    return [x, y];
  });
  const line = coords.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const area = `${line} L${coords[coords.length - 1][0].toFixed(1)} ${h - pad} L${coords[0][0].toFixed(1)} ${h - pad} Z`;
  const last = coords[coords.length - 1];
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: "block" }}>
      <defs>
        <linearGradient id="spark" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.32" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#spark)" />
      <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r="3" fill={color} />
    </svg>
  );
}

function DetailMetric({ label, value, unit, color, big }) {
  return (
    <div style={{ background: P.bg, border: `1px solid ${P.line}`, borderRadius: 12, padding: "9px 9px 10px", minWidth: 0 }}>
      <div style={{ fontSize: 9, color: P.sub, fontWeight: 700 }}>{label}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 2, marginTop: 5 }}>
        <span style={{ fontSize: big ? 20 : 15, fontWeight: 900, color, fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{value}</span>
        {unit && <span style={{ fontSize: 9, color: P.sub, fontWeight: 700 }}>{unit}</span>}
      </div>
    </div>
  );
}

function SelectedDetail({ machine, islandAvgRot }) {
  if (!machine) return null;
  const v = VERDICT[machine.verdict];
  const diff = Math.round((machine.rot - islandAvgRot(machine.islandId)) * 10) / 10;
  return (
    <Section title="選択台詳細" accent={v.color}>
      <div style={{ padding: "0 14px 4px" }}>
        <div style={{ background: P.card, border: `1px solid color-mix(in srgb, ${v.color} 30%, ${P.line})`, borderRadius: RADIUS, padding: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 7 }}>
              <span style={{ fontSize: 22, fontWeight: 900, color: P.text, fontFamily: MONO }}>台{machine.num}</span>
              {machine.isStar && <span style={{ color: P.yellow, fontSize: 15, textShadow: `0 0 8px ${P.yellow}` }}>★</span>}
            </div>
            <span
              style={{
                fontSize: 12,
                fontWeight: 900,
                color: v.color,
                background: `color-mix(in srgb, ${v.color} 16%, transparent)`,
                border: `1px solid color-mix(in srgb, ${v.color} 38%, transparent)`,
                borderRadius: 999,
                padding: "5px 12px",
              }}
            >
              {v.reco}
            </span>
          </div>

          <div style={{ display: "flex", gap: 12, alignItems: "stretch" }}>
            <div style={{ flex: 1, minWidth: 0, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 7 }}>
              <DetailMetric label="推定回転率" value={fmt(machine.rot, 1)} unit="/k" color={v.color} />
              <DetailMetric label="期待値" value={signed(machine.evPerHour)} unit="円/h" color={machine.evPerHour >= 0 ? P.green : P.red} />
              <DetailMetric label="確信度" value={fmt(machine.confidence)} unit="%" color={P.yellow} />
              <DetailMetric label="島平均との差" value={signed(diff, 1)} unit="/k" color={diff >= 0 ? P.green : P.red} />
              <div style={{ gridColumn: "span 2" }}>
                <DetailMetric label="ボーダー" value={fmt(machine.border, 1)} unit="/k" color={P.subHi} />
              </div>
            </div>
            <div style={{ width: 132, flexShrink: 0 }}>
              <div style={{ fontSize: 9, color: P.sub, fontWeight: 700, marginBottom: 4 }}>過去推定回転率 ・7日</div>
              <div style={{ background: P.bg, border: `1px solid ${P.line}`, borderRadius: 12, padding: "6px 0" }}>
                <Sparkline points={machine.history} color={v.color} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </Section>
  );
}

// ============================ 共通セクション枠 ============================
function Section({ title, sub, accent, children }) {
  return (
    <div style={{ marginTop: 18 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, padding: "0 14px 8px" }}>
        <span style={{ width: 4, height: 14, borderRadius: 2, background: accent, alignSelf: "center" }} />
        <span style={{ fontSize: 13, fontWeight: 900, color: P.text, letterSpacing: 0.4 }}>{title}</span>
        {sub && <span style={{ fontSize: 10, color: P.sub, marginLeft: "auto" }}>{sub}</span>}
      </div>
      {children}
    </div>
  );
}

// ============================ 本体 ============================
export default function StrategyMapDashboard({ S, onBack }) {
  const playingNum = S?.sessionStarted ? S?.machineNum : null;
  const data = useMemo(() => buildStrategyMap({ playingNum }), [playingNum]);
  const updatedAt = useMemo(() => nowHM(), []);
  const [filter, setFilter] = useState("all");
  const [selectedId, setSelectedId] = useState(data.leadId);

  const selected = data.all.find((m) => m.id === selectedId) || data.all.find((m) => m.id === data.leadId) || null;

  return (
    <div style={{ flex: 1, background: P.bg, color: P.text, fontFamily: FONT, paddingBottom: "calc(24px + env(safe-area-inset-bottom))" }}>
      <Header data={data} updatedAt={updatedAt} onBack={onBack} />
      <Tabs active={filter} onChange={setFilter} />
      <Top5 rows={data.top5} selectedId={selectedId} onSelect={setSelectedId} />
      <div style={{ marginTop: 16 }}>
        <Kpi kpi={data.kpi} />
      </div>
      <HallMap data={data} filter={filter} selectedId={selectedId} onSelect={setSelectedId} />
      <SelectedDetail machine={selected} islandAvgRot={data.islandAvgRot} />
    </div>
  );
}
