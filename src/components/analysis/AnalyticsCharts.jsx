import React from "react";
import { C, font, mono } from "../../constants";

const ACCENT = "var(--at-accent)";

// 凡例チップ
export function Legend({ color, label, dashed }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
      <span style={{ width: 14, height: 0, borderTop: `2px ${dashed ? "dashed" : "solid"} ${color}` }} />
      <span style={{ fontSize: 10, color: C.sub, fontFamily: font, fontWeight: 600 }}>{label}</span>
    </span>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// 累積収支推移チャート（TradingView 風・3本ライン）
//   data: { points: [{ label, actual, ev, diff }], hasActual }
//   実収支（グリーン）／期待値（シアン）／差異（グレー・破線）の累積を重ねる。
// ──────────────────────────────────────────────────────────────────────────────
export function CumulativeChart({ data, width = 340, height = 196 }) {
  // gradient id をインスタンスごとにユニーク化（複数チャート共存時の干渉防止）
  const uid = React.useId().replace(/[:]/g, "");
  const points = data?.points || [];
  if (points.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "36px 16px", color: C.sub, fontFamily: font, fontSize: 12 }}>
        この期間には記録がありません
      </div>
    );
  }

  const pad = { top: 14, right: 12, bottom: 24, left: 46 };
  const w = width - pad.left - pad.right;
  const h = height - pad.top - pad.bottom;

  const showActual = data.hasActual;
  const seriesVals = [];
  for (const p of points) {
    if (showActual) { seriesVals.push(p.actual, p.diff); }
    seriesVals.push(p.ev);
  }
  const minV = Math.min(...seriesVals, 0);
  const maxV = Math.max(...seriesVals, 0);
  const range = maxV - minV || 1;

  const X = (i) => pad.left + (points.length === 1 ? w / 2 : (i / (points.length - 1)) * w);
  const Y = (v) => pad.top + h - ((v - minV) / range) * h;

  const line = (key) => points.map((p, i) => `${i === 0 ? "M" : "L"} ${X(i).toFixed(1)} ${Y(p[key]).toFixed(1)}`).join(" ");
  const area = (key) =>
    `${line(key)} L ${X(points.length - 1).toFixed(1)} ${(pad.top + h).toFixed(1)} L ${X(0).toFixed(1)} ${(pad.top + h).toFixed(1)} Z`;

  const zeroY = Y(0);
  const yLabels = [maxV, (maxV + minV) / 2, minV].map((v) => ({ v, y: Y(v) }));
  const xTickIdx = Array.from(new Set([0, Math.floor((points.length - 1) / 2), points.length - 1]));
  const fmtK = (v) => (Math.abs(v) >= 1000 ? (v / 1000).toFixed(0) + "k" : Math.round(v).toLocaleString());

  return (
    <div>
      <div style={{ display: "flex", gap: 14, padding: "0 4px 8px", flexWrap: "wrap" }}>
        {showActual && <Legend color={C.green} label="実収支" />}
        <Legend color={ACCENT} label="期待値" />
        {showActual && <Legend color={C.sub} label="差異" dashed />}
      </div>
      <svg width="100%" viewBox={`0 0 ${width} ${height}`} style={{ display: "block" }}>
        {yLabels.map((l, i) => (
          <g key={i}>
            <line x1={pad.left} y1={l.y} x2={width - pad.right} y2={l.y} stroke="var(--border)" strokeWidth={1} />
            <text x={pad.left - 6} y={l.y + 3} textAnchor="end" fill="var(--sub)" fontSize={9} fontFamily="monospace">
              {fmtK(l.v)}
            </text>
          </g>
        ))}
        {minV < 0 && maxV > 0 && (
          <line x1={pad.left} y1={zeroY} x2={width - pad.right} y2={zeroY} stroke="var(--border-hi)" strokeWidth={1} strokeDasharray="3,3" />
        )}
        <defs>
          <linearGradient id={`at-actual-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={C.green} stopOpacity="0.26" />
            <stop offset="100%" stopColor={C.green} stopOpacity="0.01" />
          </linearGradient>
          <linearGradient id={`at-ev-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#18D7FF" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#18D7FF" stopOpacity="0.01" />
          </linearGradient>
        </defs>

        {!showActual && <path d={area("ev")} fill={`url(#at-ev-${uid})`} />}
        <path d={line("ev")} fill="none" stroke={ACCENT} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />

        {showActual && (
          <path d={line("diff")} fill="none" stroke={C.sub} strokeWidth={1.4} strokeDasharray="4,3" strokeLinecap="round" strokeLinejoin="round" />
        )}

        {showActual && (
          <>
            <path d={area("actual")} fill={`url(#at-actual-${uid})`} />
            <path d={line("actual")} fill="none" stroke={C.green} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
          </>
        )}

        {xTickIdx.map((i) => (
          <text key={i} x={X(i)} y={height - 5} textAnchor="middle" fill="var(--sub)" fontSize={9}>
            {points[i].label}
          </text>
        ))}
      </svg>
    </div>
  );
}

// 数値メトリクスのミニカード（期待値分析の指標グリッド用）
export function MetricCell({ label, value, unit, color, mono: useMono = true }) {
  return (
    <div style={{
      background: C.surfaceHi, border: `1px solid ${C.border}`, borderRadius: 12, padding: "11px 12px",
    }}>
      <div style={{ fontSize: 10, color: C.sub, fontWeight: 700, marginBottom: 6, letterSpacing: 0.3 }}>{label}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 3 }}>
        <span style={{
          fontSize: 18, fontWeight: 900, color: color || C.text,
          fontFamily: useMono ? mono : font, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.4px", lineHeight: 1,
        }}>
          {value}
        </span>
        {unit && <span style={{ fontSize: 10, color: C.sub, fontWeight: 600 }}>{unit}</span>}
      </div>
    </div>
  );
}
