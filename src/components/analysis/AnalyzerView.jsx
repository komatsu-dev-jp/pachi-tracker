import React, { useMemo, useState } from "react";
import { C, f, sc, sp, font, mono } from "../../constants";
import { Card } from "../Atoms";
import { filterArchives, listAvailableMachines } from "./analysisSelectors";
import {
  buildSpinRateTrend,
  buildBorderDiffHistogram,
  HISTOGRAM_MIN_SAMPLE,
} from "./analyzerSelectors";
import {
  buildEvAnalysis,
  buildSessionCumulative,
  buildAiComment,
  storeAnalysis,
  machineAnalysis,
} from "./analyticsViewSelectors";
import { CumulativeChart, MetricCell } from "./AnalyticsCharts";

// 分析+（詳細分析）ビュー — 金融端末風に刷新
//   期待値分析 / 店舗分析 / 機種分析 の3セクションを内部タブで切替える。
//   集計はすべて純粋関数（analysisSelectors / analyzerSelectors / analyticsViewSelectors）に委譲。
//   logic.js・計算式・保存データ構造には一切触れない。

const ACCENT = "var(--at-accent)";

const EMPTY = (text) => (
  <div style={{ textAlign: "center", padding: "28px 16px", color: C.sub, fontFamily: font, fontSize: 12, lineHeight: 1.6 }}>
    {text}
  </div>
);

function SectionLabel({ children, hint }) {
  return (
    <div style={{ padding: "12px 14px 8px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <div style={{ fontSize: 12, color: C.sub, fontWeight: 700, letterSpacing: 0.4 }}>{children}</div>
      {hint && <div style={{ fontSize: 10, color: C.sub, opacity: 0.7 }}>{hint}</div>}
    </div>
  );
}

// 内部タブバー（期待値 / 店舗 / 機種）
function SubTabBar({ tab, setTab }) {
  const tabs = [
    { id: "ev", label: "期待値分析" },
    { id: "store", label: "店舗分析" },
    { id: "machine", label: "機種分析" },
  ];
  return (
    <div style={{
      display: "flex", gap: 4, background: C.surfaceHi, borderRadius: 12, padding: 3,
      border: `1px solid ${C.border}`, marginBottom: 12,
    }}>
      {tabs.map((t) => {
        const active = tab === t.id;
        return (
          <button
            key={t.id}
            className="b"
            onClick={() => setTab(t.id)}
            style={{
              flex: 1, minHeight: 40,
              background: active ? `color-mix(in srgb, ${ACCENT} 16%, var(--surface))` : "transparent",
              border: active ? `1px solid color-mix(in srgb, ${ACCENT} 40%, transparent)` : "1px solid transparent",
              borderRadius: 9,
              color: active ? ACCENT : C.sub,
              fontSize: 12, fontWeight: active ? 800 : 600, fontFamily: font, cursor: "pointer",
            }}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// 機種ごとの回転率/K 推移（折れ線）
// ──────────────────────────────────────────────────────────────────────────────
function SpinRateTrendChart({ points, width = 340, height = 168 }) {
  const color = ACCENT;
  if (!points || points.length === 0) {
    return EMPTY("該当機種の回転率記録がありません");
  }
  if (points.length === 1) {
    const p = points[0];
    return (
      <div style={{ textAlign: "center", padding: "22px 16px", fontFamily: font }}>
        <div style={{ fontSize: 11, color: C.sub }}>{p.label}</div>
        <div style={{
          fontSize: 30, fontWeight: 900, marginTop: 4, color: C.text,
          fontFamily: mono, fontVariantNumeric: "tabular-nums", lineHeight: 1,
        }}>
          {f(p.value, 1)}<span style={{ fontSize: 12, color: C.sub, marginLeft: 3, fontFamily: font }}>回/K</span>
        </div>
        <div style={{ fontSize: 10, color: C.sub, marginTop: 8 }}>データ不足（2件以上で推移グラフを表示）</div>
      </div>
    );
  }
  const pad = { top: 12, right: 12, bottom: 22, left: 40 };
  const w = width - pad.left - pad.right;
  const h = height - pad.top - pad.bottom;
  const vals = points.map((p) => p.value);
  const minV = Math.min(...vals);
  const maxV = Math.max(...vals);
  const range = maxV - minV || 1;
  const pts = points.map((p, i) => ({
    x: pad.left + (i / (points.length - 1)) * w,
    y: pad.top + h - ((p.value - minV) / range) * h,
    ...p,
  }));
  const pathD = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const yLabels = [maxV, (maxV + minV) / 2, minV].map((v) => ({ v, y: pad.top + h - ((v - minV) / range) * h }));
  const xTickIdx = Array.from(new Set([0, Math.floor(points.length / 2), points.length - 1]));
  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} style={{ display: "block" }}>
      {yLabels.map((l, i) => (
        <g key={i}>
          <line x1={pad.left} y1={l.y} x2={width - pad.right} y2={l.y} stroke="var(--border)" strokeWidth={1} />
          <text x={pad.left - 4} y={l.y + 3} textAnchor="end" fill="var(--sub)" fontSize={9} fontFamily="monospace">
            {l.v.toFixed(1)}
          </text>
        </g>
      ))}
      <path d={`${pathD} L ${pts[pts.length - 1].x} ${pad.top + h} L ${pts[0].x} ${pad.top + h} Z`} fill="url(#spin-grad)" />
      <defs>
        <linearGradient id="spin-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.30" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={pathD} fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
      {pts.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={3.2} fill={color} stroke="rgba(0,0,0,0.45)" strokeWidth={1} />
      ))}
      {xTickIdx.map((i) => (
        <text key={i} x={pts[i].x} y={height - 4} textAnchor="middle" fill="var(--sub)" fontSize={9}>
          {points[i].label}
        </text>
      ))}
    </svg>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// ボーダー差の分布ヒストグラム（棒グラフ）
// ──────────────────────────────────────────────────────────────────────────────
function BorderDiffHistogram({ data, width = 340, height = 170 }) {
  if (!data || data.total === 0) {
    return EMPTY("ボーダー差の記録がありません");
  }
  if (!data.enough) {
    return EMPTY(`データ不足（分布表示には ${HISTOGRAM_MIN_SAMPLE} 件以上必要・現在 ${data.total} 件）`);
  }
  const pad = { top: 10, right: 10, bottom: 26, left: 28 };
  const w = width - pad.left - pad.right;
  const h = height - pad.top - pad.bottom;
  const bins = data.bins;
  const maxCount = Math.max(...bins.map((b) => b.count), 1);
  const gap = 2;
  const bw = w / bins.length;
  const labelStep = Math.ceil(bins.length / 6);
  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} style={{ display: "block" }}>
      <text x={pad.left - 4} y={pad.top + 8} textAnchor="end" fill="var(--sub)" fontSize={9} fontFamily="monospace">
        {maxCount}
      </text>
      <line x1={pad.left} y1={pad.top + h} x2={width - pad.right} y2={pad.top + h} stroke="var(--border)" strokeWidth={1} />
      {bins.map((b, i) => {
        const bh = (b.count / maxCount) * h;
        const x = pad.left + i * bw;
        const y = pad.top + h - bh;
        const fill = b.mid >= 0 ? C.green : C.red;
        return (
          <g key={i}>
            <rect x={x + gap / 2} y={y} width={Math.max(1, bw - gap)} height={bh} rx={2} fill={fill} opacity={b.count > 0 ? 0.85 : 0} />
            {b.count > 0 && (
              <text x={x + bw / 2} y={y - 3} textAnchor="middle" fill="var(--text)" fontSize={9} fontFamily="monospace">
                {b.count}
              </text>
            )}
            {i % labelStep === 0 && (
              <text x={x + bw / 2} y={height - 14} textAnchor="middle" fill="var(--sub)" fontSize={8} fontFamily="monospace">
                {b.lo}
              </text>
            )}
          </g>
        );
      })}
      <text x={width / 2} y={height - 2} textAnchor="middle" fill="var(--sub)" fontSize={9} fontFamily={font}>
        ボーダー差（回/K）
      </text>
    </svg>
  );
}

function HistogramStats({ data }) {
  if (!data || data.total === 0) return null;
  const cells = [
    { label: "平均差", val: sp(data.avg, 1), col: sc(data.avg), unit: "回/K" },
    { label: "プラス率", val: data.plusRate != null ? f(data.plusRate, 0) : "—", col: data.plusRate >= 50 ? C.green : C.red, unit: "%" },
    { label: "件数", val: f(data.total), col: C.text, unit: "件" },
  ];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, padding: "4px 14px 12px" }}>
      {cells.map((c) => (
        <div key={c.label} style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10, padding: "8px 10px" }}>
          <div style={{ fontSize: 10, color: C.sub, fontWeight: 600, marginBottom: 3 }}>{c.label}</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 2 }}>
            <span style={{ fontSize: 16, fontWeight: 800, color: c.col, fontFamily: mono, fontVariantNumeric: "tabular-nums" }}>{c.val}</span>
            <span style={{ fontSize: 9, color: C.sub, fontFamily: font }}>{c.unit}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// AIコメント
// ──────────────────────────────────────────────────────────────────────────────
function AiCommentCard({ lines }) {
  if (!lines || lines.length === 0) return null;
  return (
    <Card>
      <div style={{ padding: "12px 14px 6px", display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: ACCENT, boxShadow: `0 0 6px ${ACCENT}` }} />
        <div style={{ fontSize: 12, color: ACCENT, fontWeight: 800, letterSpacing: 0.4 }}>AIコメント</div>
      </div>
      <div style={{ padding: "2px 14px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
        {lines.map((t, i) => (
          <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
            <span style={{ color: ACCENT, fontSize: 12, lineHeight: 1.6, flexShrink: 0 }}>▸</span>
            <span style={{ fontSize: 13, color: C.text, fontFamily: font, lineHeight: 1.6 }}>{t}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// 期待値分析セクション
// ──────────────────────────────────────────────────────────────────────────────
function EvSection({ archives, extraFilters }) {
  const ev = useMemo(() => buildEvAnalysis(archives, extraFilters), [archives, extraFilters]);
  const cumulative = useMemo(() => buildSessionCumulative(archives, extraFilters), [archives, extraFilters]);
  const histogram = useMemo(() => buildBorderDiffHistogram(archives, { ...extraFilters, binSize: 1 }), [archives, extraFilters]);
  const aiLines = useMemo(() => buildAiComment(archives, extraFilters), [archives, extraFilters]);

  const cells = [
    { label: "期待値", value: sp(Math.round(ev.ev)), unit: "円", color: ACCENT },
    { label: "実収支", value: ev.hasActual ? sp(Math.round(ev.actual)) : "—", unit: ev.hasActual ? "円" : "", color: ev.hasActual ? sc(ev.actual) : C.sub },
    { label: "期待値との差", value: ev.hasActual ? sp(Math.round(ev.diff)) : "—", unit: ev.hasActual ? "円" : "", color: ev.hasActual ? sc(ev.diff) : C.sub },
    { label: "収束率", value: ev.convergence != null ? f(ev.convergence, 0) : "—", unit: ev.convergence != null ? "%" : "", color: ev.convergence == null ? C.sub : ev.convergence >= 80 ? C.green : ev.convergence >= 40 ? C.yellow : C.red },
    { label: "期待値/日", value: ev.evPerDay != null ? sp(Math.round(ev.evPerDay)) : "—", unit: "円", color: ACCENT },
    { label: "実収支/日", value: ev.actualPerDay != null ? sp(Math.round(ev.actualPerDay)) : "—", unit: ev.actualPerDay != null ? "円" : "", color: ev.actualPerDay != null ? sc(ev.actualPerDay) : C.sub },
    { label: "期待値/時間", value: ev.evPerHour != null ? sp(Math.round(ev.evPerHour)) : "—", unit: ev.evPerHour != null ? "円" : "", color: ACCENT },
    { label: "実収支/時間", value: ev.actualPerHour != null ? sp(Math.round(ev.actualPerHour)) : "—", unit: ev.actualPerHour != null ? "円" : "", color: ev.actualPerHour != null ? sc(ev.actualPerHour) : C.sub },
  ];

  return (
    <>
      {/* 指標グリッド */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
        {cells.map((c) => (
          <MetricCell key={c.label} label={c.label} value={c.value} unit={c.unit} color={c.color} />
        ))}
      </div>

      {/* 累積推移（3本ライン） */}
      <Card>
        <SectionLabel hint="実収支 / 期待値 / 差異">期待値 累積推移</SectionLabel>
        <div style={{ padding: "4px 8px 12px" }}>
          <CumulativeChart data={cumulative} />
        </div>
      </Card>

      {/* ボーダー差の分布 */}
      <Card>
        <SectionLabel hint="回転率 − ボーダー">ボーダー差の分布</SectionLabel>
        <div style={{ padding: "0 8px 4px" }}>
          <BorderDiffHistogram data={histogram} />
        </div>
        <HistogramStats data={histogram} />
      </Card>

      {/* AIコメント */}
      <AiCommentCard lines={aiLines} />
    </>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// 店舗分析セクション（ランキング + 店舗強度ヒートマップ）
// ──────────────────────────────────────────────────────────────────────────────
function StoreSection({ archives, extraFilters }) {
  const rows = useMemo(() => storeAnalysis(archives, extraFilters), [archives, extraFilters]);
  if (rows.length === 0) {
    return <Card style={{ padding: "32px 16px", textAlign: "center" }}>{EMPTY("店舗の記録がありません")}</Card>;
  }

  // ヒートマップの色（強度 0〜1 を 赤→黄→緑 に補間）
  const heatColor = (s) => {
    if (s == null) return "var(--surface-hi)";
    if (s >= 0.66) return `color-mix(in srgb, ${C.green} ${40 + s * 50}%, transparent)`;
    if (s >= 0.33) return `color-mix(in srgb, ${C.yellow} ${40 + s * 40}%, transparent)`;
    return `color-mix(in srgb, ${C.red} ${40 + (0.5 - s) * 60}%, transparent)`;
  };

  return (
    <>
      {/* ランキング */}
      <Card>
        <SectionLabel hint="実収支順">店舗ランキング</SectionLabel>
        <div style={{
          display: "grid", gridTemplateColumns: "20px 1fr 52px 56px 56px",
          gap: 6, padding: "0 14px 6px", borderBottom: `1px solid ${C.border}`,
        }}>
          {["#", "店舗", "回転率", "EV", "実収支"].map((hh, i) => (
            <div key={hh} style={{ fontSize: 9, color: C.sub, fontWeight: 700, textAlign: i === 1 ? "left" : i === 0 ? "center" : "right" }}>{hh}</div>
          ))}
        </div>
        {rows.map((r, i) => (
          <div key={r.key} style={{
            display: "grid", gridTemplateColumns: "20px 1fr 52px 56px 56px",
            gap: 6, padding: "10px 14px", alignItems: "center",
            borderTop: i === 0 ? "none" : `1px solid ${C.border}`,
          }}>
            <div style={{ textAlign: "center", fontSize: 12, fontWeight: 800, color: i < 3 ? ACCENT : C.sub, fontFamily: mono }}>{i + 1}</div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.storeName}</div>
              <div style={{ fontSize: 9, color: C.sub, marginTop: 1 }}>{r.days}日 ・ {r.sessions}回</div>
            </div>
            <div style={{ textAlign: "right", fontSize: 12, fontWeight: 700, color: r.spinRate != null ? C.text : C.sub, fontFamily: mono, fontVariantNumeric: "tabular-nums" }}>
              {r.spinRate != null ? f(r.spinRate, 1) : "—"}
            </div>
            <div style={{ textAlign: "right", fontSize: 12, fontWeight: 800, color: sc(r.evAmount), fontFamily: mono, fontVariantNumeric: "tabular-nums" }}>
              {sp(Math.round(r.evAmount))}
            </div>
            <div style={{ textAlign: "right" }}>
              {r.hasActual
                ? <span style={{ fontSize: 12, fontWeight: 800, color: sc(r.actualPL), fontFamily: mono, fontVariantNumeric: "tabular-nums" }}>{sp(Math.round(r.actualPL))}</span>
                : <span style={{ fontSize: 10, color: C.sub }}>未記録</span>}
            </div>
          </div>
        ))}
      </Card>

      {/* 店舗強度ヒートマップ */}
      <Card>
        <SectionLabel hint="緑=強い / 黄=普通 / 赤=弱い">店舗強度マップ</SectionLabel>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(64px, 1fr))", gap: 6, padding: "0 14px 14px" }}>
          {rows.map((r) => (
            <div key={r.key} style={{
              aspectRatio: "1 / 1", borderRadius: 10,
              background: heatColor(r.strength),
              border: `1px solid ${C.border}`,
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              padding: 4, minHeight: 56,
            }}>
              <div style={{
                fontSize: 10, fontWeight: 700, color: C.text, textAlign: "center", lineHeight: 1.1,
                overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
              }}>
                {r.storeName}
              </div>
              <div style={{ fontSize: 11, fontWeight: 800, color: sc(r.hasActual ? r.actualPL : r.evAmount), fontFamily: mono, marginTop: 3 }}>
                {sp(Math.round((r.hasActual ? r.actualPL : r.evAmount) / 1000))}k
              </div>
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// 機種カルテ（注目1機種のレーダーチャート + 2位以下のカードリスト）
// ──────────────────────────────────────────────────────────────────────────────

// 機種別の総回転数（machineAnalysis には無い生の netRot 合計）。
// 既存セレクタと同じ filterArchives スコープで、表示専用に集計するだけ（新しい計算式は導入しない）。
function buildMachineTotalSpins(archives, extraFilters) {
  const filtered = filterArchives(archives, extraFilters || {});
  const map = new Map();
  for (const a of filtered) {
    const name = a?.machineName || "未設定";
    map.set(name, (map.get(name) || 0) + (Number(a?.stats?.netRot) || 0));
  }
  return map;
}

function machineWage(row) {
  return row.hours > 0 && row.hasActual ? row.actualPL / row.hours : null;
}

function normalize(value, max) {
  if (value == null || !isFinite(value) || max <= 0) return 0;
  return Math.max(0, Math.min(1, value / max));
}

const RADAR_LABELS = ["期待値", "回転率", "勝率", "時給", "稼働"];
function MachineRadar({ values }) {
  const cx = 80, cy = 78, r = 60;
  const angleFor = (i) => -Math.PI / 2 + (i * 2 * Math.PI) / 5;
  const ptsAt = (scale) => [0, 1, 2, 3, 4].map((i) => {
    const a = angleFor(i);
    return `${(cx + Math.cos(a) * r * scale).toFixed(1)},${(cy + Math.sin(a) * r * scale).toFixed(1)}`;
  }).join(" ");
  const dataPts = values.map((v, i) => {
    const a = angleFor(i);
    return `${(cx + Math.cos(a) * r * v).toFixed(1)},${(cy + Math.sin(a) * r * v).toFixed(1)}`;
  }).join(" ");
  return (
    <svg width="152" height="150" viewBox="0 0 160 150" style={{ flexShrink: 0 }}>
      {[0.33, 0.66, 1].map((s) => (
        <polygon key={s} points={ptsAt(s)} fill="none" stroke={C.border} />
      ))}
      <polygon points={dataPts} fill={`color-mix(in srgb, ${ACCENT} 18%, transparent)`} stroke={ACCENT} strokeWidth={2} />
      {RADAR_LABELS.map((t, i) => {
        const a = angleFor(i);
        const x = (cx + Math.cos(a) * 74).toFixed(1);
        const y = (cy + Math.sin(a) * 74 + 3).toFixed(1);
        return <text key={t} x={x} y={y} textAnchor="middle" fill={C.sub} fontSize="9" fontWeight="700">{t}</text>;
      })}
    </svg>
  );
}

function FeaturedMachineCard({ row, totalSpins, radarValues, onSelect }) {
  const stats = [
    { label: "実収支", value: row.hasActual ? `${sp(Math.round(row.actualPL))}円` : "—", color: row.hasActual ? sc(row.actualPL) : C.sub },
    { label: "期待値", value: `${sp(Math.round(row.evAmount))}円`, color: ACCENT },
    { label: "平均回転率", value: row.spinRate != null ? `${f(row.spinRate, 1)}回/k` : "—", color: C.text },
    { label: "総回転数", value: totalSpins > 0 ? `${f(totalSpins, 0)}G` : "—", color: C.text },
    { label: "勝率", value: row.winRate != null ? `${f(row.winRate, 0)}%` : "—", color: C.yellow },
  ];
  return (
    <button
      type="button"
      onClick={() => onSelect?.(row.machineName)}
      style={{
        display: "block", width: "100%", textAlign: "left", cursor: onSelect ? "pointer" : "default",
        background: `linear-gradient(170deg, color-mix(in srgb, ${C.yellow} 14%, transparent), color-mix(in srgb, ${C.yellow} 2%, transparent))`,
        border: `1px solid color-mix(in srgb, ${C.yellow} 35%, transparent)`,
        borderRadius: 16, overflow: "hidden", marginBottom: 12, boxShadow: "var(--card-shadow)", padding: 16,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ width: 26, height: 26, borderRadius: "50%", background: C.yellow, color: "#1d1503", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 900, fontFamily: mono, flexShrink: 0 }}>1</span>
        <span style={{ minWidth: 0, flex: 1, fontSize: 15, fontWeight: 900, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: font }}>{row.machineName}</span>
      </div>
      <div style={{ marginTop: 12, display: "flex", gap: 14, alignItems: "center" }}>
        <MachineRadar values={radarValues} />
        <div style={{ minWidth: 0, flex: 1, display: "flex", flexDirection: "column", gap: 9 }}>
          {stats.map((s) => (
            <div key={s.label} style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: C.sub, fontFamily: font }}>{s.label}</span>
              <span style={{ fontSize: 13, fontWeight: 900, color: s.color, fontFamily: mono, fontVariantNumeric: "tabular-nums" }}>{s.value}</span>
            </div>
          ))}
        </div>
      </div>
    </button>
  );
}

function MachineKarteRow({ row, rank, totalSpins, onSelect }) {
  const badge = rank === 1
    ? { bg: C.yellow, fg: "#1d1503" }
    : rank === 2
      ? { bg: `color-mix(in srgb, ${C.sub} 20%, transparent)`, fg: C.subHi ?? C.sub }
      : { bg: `color-mix(in srgb, ${C.orange} 20%, transparent)`, fg: C.orange };
  return (
    <button
      type="button"
      onClick={() => onSelect?.(row.machineName)}
      style={{ display: "block", width: "100%", textAlign: "left", padding: "12px 14px", borderTop: `1px solid ${C.border}` }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{
          width: 26, height: 26, flexShrink: 0, borderRadius: 8, display: "flex", alignItems: "center",
          justifyContent: "center", fontSize: 12, fontWeight: 900, fontFamily: mono, background: badge.bg, color: badge.fg,
        }}>{rank}</span>
        <span style={{ minWidth: 0, flex: 1, fontSize: 13.5, fontWeight: 800, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: font }}>{row.machineName}</span>
        <span style={{ flexShrink: 0, fontSize: 15, fontWeight: 900, fontFamily: mono, fontVariantNumeric: "tabular-nums", color: row.hasActual ? sc(row.actualPL) : C.sub }}>
          {row.hasActual ? `${sp(Math.round(row.actualPL))}円` : "未記録"}
        </span>
      </div>
      <div style={{ marginTop: 9, display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 6 }}>
        {[
          { label: "期待値", value: `${sp(Math.round(row.evAmount))}円`, color: ACCENT },
          { label: "平均回転率", value: row.spinRate != null ? `${f(row.spinRate, 1)}回/k` : "—" },
          { label: "総回転数", value: totalSpins > 0 ? `${f(totalSpins, 0)}G` : "—" },
          { label: "遊技時間", value: row.hours > 0 ? `${f(row.hours, 1)}h` : "—" },
        ].map((m) => (
          <div key={m.label} style={{ minWidth: 0 }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: C.sub, fontFamily: font }}>{m.label}</div>
            <div style={{ marginTop: 2, fontSize: 11.5, fontWeight: 900, color: m.color || C.text, fontFamily: mono, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{m.value}</div>
          </div>
        ))}
      </div>
      {row.winRate != null && (
        <div style={{ marginTop: 9, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 9, fontWeight: 700, color: C.sub, fontFamily: font, whiteSpace: "nowrap" }}>勝率 {f(row.winRate, 0)}%</span>
          <span style={{ flex: 1, height: 5, borderRadius: 3, background: C.surfaceHi, overflow: "hidden", display: "flex" }}>
            <span style={{ width: `${Math.max(0, Math.min(100, row.winRate))}%`, background: C.yellow, borderRadius: 3 }} />
          </span>
        </div>
      )}
    </button>
  );
}

// 機種カルテ（1位のみレーダーチャート付きで強調表示、2位以下は4指標＋勝率バーのカード）。
// row タップでの機種詳細（#4a）への遷移は別PRで対応予定のため、現時点では非インタラクティブ。
function MachineKarte({ rows, totalsMap, onSelect }) {
  if (rows.length === 0) return null;
  const maxima = {
    ev: Math.max(1, ...rows.map((r) => r.evAmount || 0)),
    spin: Math.max(1, ...rows.map((r) => r.spinRate || 0)),
    wage: Math.max(1, ...rows.map((r) => machineWage(r) || 0)),
    hours: Math.max(1, ...rows.map((r) => r.hours || 0)),
  };
  const radarValues = (row) => [
    normalize(row.evAmount, maxima.ev),
    normalize(row.spinRate, maxima.spin),
    (row.winRate ?? 0) / 100,
    normalize(machineWage(row), maxima.wage),
    normalize(row.hours, maxima.hours),
  ];
  const [top, ...rest] = rows;
  return (
    <>
      <FeaturedMachineCard row={top} totalSpins={totalsMap.get(top.machineName) || 0} radarValues={radarValues(top)} onSelect={onSelect} />
      {rest.length > 0 && (
        <Card style={{ padding: 0 }}>
          <SectionLabel hint="現在の並べ替え順">機種カルテ</SectionLabel>
          {rest.map((row, i) => (
            <MachineKarteRow key={row.key} row={row} rank={i + 2} totalSpins={totalsMap.get(row.machineName) || 0} onSelect={onSelect} />
          ))}
        </Card>
      )}
    </>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// 機種分析セクション（並べ替えランキング + 選択機種の回転率推移）
// ──────────────────────────────────────────────────────────────────────────────
const MACHINE_SORTS = [
  { id: "actual", label: "収支順" },
  { id: "ev", label: "期待値順" },
  { id: "spin", label: "回転率順" },
  { id: "hours", label: "稼働時間順" },
];

function MachineSection({ archives, extraFilters, onSelectMachine }) {
  const [sortKey, setSortKey] = useState("actual");
  const rows = useMemo(() => machineAnalysis(archives, { ...extraFilters, sortKey }), [archives, extraFilters, sortKey]);
  const totalsMap = useMemo(() => buildMachineTotalSpins(archives, extraFilters), [archives, extraFilters]);

  const machines = useMemo(() => listAvailableMachines(archives), [archives]);
  const [selectedMachine, setSelectedMachine] = useState("");
  const effMachine = selectedMachine || machines[0] || "";
  const trendPoints = useMemo(() => buildSpinRateTrend(archives, effMachine, extraFilters), [archives, effMachine, extraFilters]);

  if (rows.length === 0) {
    return <Card style={{ padding: "32px 16px", textAlign: "center" }}>{EMPTY("機種の記録がありません")}</Card>;
  }

  return (
    <>
      {/* 並べ替え */}
      <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
        {MACHINE_SORTS.map((s) => {
          const active = sortKey === s.id;
          return (
            <button
              key={s.id}
              className="b"
              onClick={() => setSortKey(s.id)}
              style={{
                flex: "1 1 0", minWidth: 0, minHeight: 40,
                background: active ? `color-mix(in srgb, ${ACCENT} 18%, var(--surface))` : C.surfaceHi,
                border: `1px solid ${active ? ACCENT : C.border}`,
                borderRadius: 10,
                color: active ? ACCENT : C.sub,
                fontSize: 11, fontWeight: active ? 800 : 600, fontFamily: font, cursor: "pointer",
              }}
            >
              {s.label}
            </button>
          );
        })}
      </div>

      {/* 機種カルテ（1位=レーダーチャート付き強調カード／2位以下=4指標+勝率バー） */}
      <MachineKarte rows={rows} totalsMap={totalsMap} onSelect={onSelectMachine} />

      {/* 選択機種の回転率推移 */}
      <Card>
        <SectionLabel hint="セッション時系列">機種別 回転率/K 推移</SectionLabel>
        <div style={{ padding: "0 14px 8px" }}>
          {machines.length === 0 ? EMPTY("機種名の記録がありません") : (
            <select
              value={effMachine}
              onChange={(e) => setSelectedMachine(e.target.value)}
              aria-label="機種を選択"
              style={{
                width: "100%", minHeight: 44,
                background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10,
                padding: "0 12px", color: C.text, fontFamily: font, fontSize: 14,
                appearance: "none", WebkitAppearance: "none",
                backgroundImage: "linear-gradient(45deg, transparent 50%, var(--sub) 50%), linear-gradient(135deg, var(--sub) 50%, transparent 50%)",
                backgroundPosition: "calc(100% - 16px) center, calc(100% - 11px) center",
                backgroundSize: "5px 5px, 5px 5px",
                backgroundRepeat: "no-repeat",
              }}
            >
              {machines.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          )}
        </div>
        <div style={{ padding: "0 8px 12px" }}>
          <SpinRateTrendChart points={trendPoints} />
        </div>
      </Card>
    </>
  );
}

export default function AnalyzerView({ archives, extraFilters, onSelectMachine }) {
  const list = useMemo(() => archives || [], [archives]);
  const [tab, setTab] = useState("ev");

  if (list.length === 0) {
    return (
      <Card style={{ padding: "32px 16px", textAlign: "center" }}>
        <div style={{ fontSize: 13, color: C.sub, fontFamily: font, lineHeight: 1.6 }}>
          アーカイブがまだありません。実戦記録を保存すると、ここに詳細分析が表示されます。
        </div>
      </Card>
    );
  }

  return (
    <>
      <SubTabBar tab={tab} setTab={setTab} />
      {tab === "ev" && <EvSection archives={list} extraFilters={extraFilters} />}
      {tab === "store" && <StoreSection archives={list} extraFilters={extraFilters} />}
      {tab === "machine" && <MachineSection archives={list} extraFilters={extraFilters} onSelectMachine={onSelectMachine} />}
    </>
  );
}
