import React, { useMemo, useState } from "react";
import { C, f, sc, sp, font, mono } from "../../constants";
import { Card } from "../Atoms";
import { listAvailableMachines } from "./analysisSelectors";
import {
  buildSpinRateTrend,
  buildBorderDiffHistogram,
  aggregateByStore,
  aggregateByWeekday,
  HISTOGRAM_MIN_SAMPLE,
} from "./analyzerSelectors";

// パチ analyzer（詳細分析）ビュー
//   既存「収支分析」タブバー内の一タブとして表示する読み取り専用の分析画面。
//   集計はすべて analyzerSelectors.js（純粋関数・読み取りのみ）に委譲する。
//
//   構成:
//     1. 機種ごとの回転率/K 推移（折れ線）
//     2. ボーダー差の分布ヒストグラム（棒グラフ）
//     3. 店舗別・曜日別の期待値傾向（集計表）
//   データ不足時は各セクションで「データ不足」と日本語明示する。

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

// ──────────────────────────────────────────────────────────────────────────────
// 1. 機種ごとの回転率/K 推移（折れ線）
// ──────────────────────────────────────────────────────────────────────────────
function SpinRateTrendChart({ points, width = 320, height = 168 }) {
  const color = C.teal;
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
  const yLabels = [maxV, (maxV + minV) / 2, minV].map((v) => ({
    v,
    y: pad.top + h - ((v - minV) / range) * h,
  }));
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
      <path
        d={`${pathD} L ${pts[pts.length - 1].x} ${pad.top + h} L ${pts[0].x} ${pad.top + h} Z`}
        fill="url(#spin-grad)"
      />
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
// 2. ボーダー差の分布ヒストグラム（棒グラフ）
// ──────────────────────────────────────────────────────────────────────────────
function BorderDiffHistogram({ data, width = 320, height = 170 }) {
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
  // ラベル間引き（密集回避）
  const labelStep = Math.ceil(bins.length / 6);
  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} style={{ display: "block" }}>
      {/* y 軸目盛（最大件数） */}
      <text x={pad.left - 4} y={pad.top + 8} textAnchor="end" fill="var(--sub)" fontSize={9} fontFamily="monospace">
        {maxCount}
      </text>
      <line x1={pad.left} y1={pad.top + h} x2={width - pad.right} y2={pad.top + h} stroke="var(--border)" strokeWidth={1} />
      {bins.map((b, i) => {
        const bh = (b.count / maxCount) * h;
        const x = pad.left + i * bw;
        const y = pad.top + h - bh;
        // ボーダー差プラス域=緑、マイナス域=赤
        const fill = b.mid >= 0 ? C.green : C.red;
        return (
          <g key={i}>
            <rect
              x={x + gap / 2}
              y={y}
              width={Math.max(1, bw - gap)}
              height={bh}
              rx={2}
              fill={fill}
              opacity={b.count > 0 ? 0.85 : 0}
            />
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

// ヒストグラムのサマリー（平均・最小最大・プラス率）
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
// 3. 店舗別・曜日別の期待値傾向（集計表）
// ──────────────────────────────────────────────────────────────────────────────
function GroupTable({ rows, firstColLabel }) {
  if (!rows || rows.length === 0) {
    return EMPTY("データ不足（集計できる記録がありません）");
  }
  return (
    <div>
      {/* ヘッダー行 */}
      <div style={{
        display: "grid", gridTemplateColumns: "1fr 56px 78px 78px",
        gap: 4, padding: "0 14px 6px", borderBottom: `1px solid ${C.border}`,
      }}>
        {[firstColLabel, "件数", "EV合計", "実収支"].map((hh) => (
          <div key={hh} style={{ fontSize: 9, color: C.sub, fontWeight: 700, textAlign: hh === firstColLabel ? "left" : "right" }}>
            {hh}
          </div>
        ))}
      </div>
      {rows.map((r, i) => (
        <div
          key={r.key}
          style={{
            display: "grid", gridTemplateColumns: "1fr 56px 78px 78px",
            gap: 4, padding: "10px 14px", alignItems: "center",
            borderTop: i === 0 ? "none" : `1px solid ${C.border}`,
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 700, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {r.label}
          </div>
          <div style={{ textAlign: "right", fontSize: 13, fontWeight: 700, color: C.text, fontFamily: mono, fontVariantNumeric: "tabular-nums" }}>
            {f(r.sessions)}
          </div>
          <div style={{ textAlign: "right", fontSize: 13, fontWeight: 800, color: sc(r.evAmount), fontFamily: mono, fontVariantNumeric: "tabular-nums" }}>
            {sp(Math.round(r.evAmount))}
          </div>
          <div style={{ textAlign: "right" }}>
            {r.hasActual ? (
              <span style={{ fontSize: 13, fontWeight: 800, color: sc(r.actualPL), fontFamily: mono, fontVariantNumeric: "tabular-nums" }}>
                {sp(Math.round(r.actualPL))}
              </span>
            ) : (
              <span style={{ fontSize: 10, color: C.sub }}>未記録</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// 内部の小タブ（店舗別 / 曜日別）
const GROUP_TABS = [
  { id: "store", label: "店舗別" },
  { id: "weekday", label: "曜日別" },
];

export default function AnalyzerView({ archives, extraFilters }) {
  const list = useMemo(() => archives || [], [archives]);

  // 機種選択（回転率推移用）。既定は記録のある先頭機種。
  const machines = useMemo(() => listAvailableMachines(list), [list]);
  const [selectedMachine, setSelectedMachine] = useState("");
  const effMachine = selectedMachine || machines[0] || "";

  const trendPoints = useMemo(
    () => buildSpinRateTrend(list, effMachine, extraFilters),
    [list, effMachine, extraFilters]
  );

  const histogram = useMemo(
    () => buildBorderDiffHistogram(list, { ...extraFilters, binSize: 1 }),
    [list, extraFilters]
  );

  const storeRows = useMemo(() => aggregateByStore(list, extraFilters), [list, extraFilters]);
  const weekdayRows = useMemo(() => aggregateByWeekday(list, extraFilters), [list, extraFilters]);

  const [groupTab, setGroupTab] = useState("store");

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
      {/* 1. 機種ごとの回転率/K 推移 */}
      <Card>
        <SectionLabel hint="セッション時系列">機種別 回転率/K 推移</SectionLabel>
        <div style={{ padding: "0 14px 8px" }}>
          {machines.length === 0 ? (
            EMPTY("機種名の記録がありません")
          ) : (
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

      {/* 2. ボーダー差の分布ヒストグラム */}
      <Card>
        <SectionLabel hint="回転率 − ボーダー">ボーダー差の分布</SectionLabel>
        <div style={{ padding: "0 8px 4px" }}>
          <BorderDiffHistogram data={histogram} />
        </div>
        <HistogramStats data={histogram} />
      </Card>

      {/* 3. 店舗別・曜日別の期待値傾向 */}
      <Card>
        <SectionLabel hint="EV・実収支・件数">傾向の比較</SectionLabel>
        <div style={{ padding: "0 14px 10px" }}>
          <div style={{
            display: "flex", gap: 4, background: C.surfaceHi, borderRadius: 12, padding: 3, border: `1px solid ${C.border}`,
          }}>
            {GROUP_TABS.map((t) => {
              const active = groupTab === t.id;
              return (
                <button
                  key={t.id}
                  className="b"
                  onClick={() => setGroupTab(t.id)}
                  style={{
                    flex: 1, minHeight: 44,
                    background: active ? C.surface : "transparent",
                    border: "none", borderRadius: 9,
                    color: active ? C.blue : C.sub,
                    fontSize: 12, fontWeight: active ? 800 : 600,
                    fontFamily: font, cursor: "pointer",
                    boxShadow: active ? "0 1px 2px rgba(17,24,39,0.08)" : "none",
                  }}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>
        {groupTab === "store"
          ? <GroupTable rows={storeRows} firstColLabel="店舗" />
          : <GroupTable rows={weekdayRows} firstColLabel="曜日" />}
        <div style={{ padding: "8px 14px 12px", fontSize: 9, color: C.sub, lineHeight: 1.5, borderTop: `1px solid ${C.border}` }}>
          EV合計 = 各セッションの期待値（上皿補正後）の合計 ／ 実収支 = 回収 − 投資（記録のあるセッションのみ）
        </div>
      </Card>
    </>
  );
}
