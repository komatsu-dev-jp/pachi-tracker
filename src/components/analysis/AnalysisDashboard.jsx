import React, { useMemo, useState } from "react";
import { C, f, sc, sp, font, mono } from "../../constants";
import { Card } from "../Atoms";
import { CalendarTab } from "../Tabs";
import {
  buildDailyChartPoints,
  buildMonthlyChartPoints,
  buildYearlyChartPoints,
  listAvailableMonths,
  listAvailableYears,
  machineRanking,
  summarize,
} from "./analysisSelectors";

// 期間タブ定義
const PERIOD_TABS = [
  { id: "month",    label: "月別" },
  { id: "year",     label: "年別" },
  { id: "all",      label: "通算" },
  { id: "calendar", label: "カレンダー" },
];

// シンプルな SVG ラインチャート（既存 Tabs.jsx 内 LineChart と同等。
//   ここでは AnalysisDashboard 専用に最低限の機能で再実装する）
function TrendChart({ points, width = 320, height = 160, color = "#3b82f6" }) {
  if (!points || points.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "32px 16px", color: C.sub, fontFamily: font, fontSize: 12 }}>
        この期間には記録がありません
      </div>
    );
  }
  if (points.length === 1) {
    const p = points[0];
    return (
      <div style={{ textAlign: "center", padding: "24px 16px", color: C.sub, fontFamily: font, fontSize: 12 }}>
        <div>{p.label}</div>
        <div style={{
          fontSize: 22, fontWeight: 800, marginTop: 6,
          color: sc(p.value), fontFamily: mono, fontVariantNumeric: "tabular-nums",
        }}>
          {sp(p.value)}円
        </div>
        <div style={{ fontSize: 10, marginTop: 6, opacity: 0.6 }}>記録2件以上でグラフ表示</div>
      </div>
    );
  }
  const pad = { top: 12, right: 12, bottom: 22, left: 48 };
  const w = width - pad.left - pad.right;
  const h = height - pad.top - pad.bottom;
  const vals = points.map((p) => p.value);
  const minV = Math.min(...vals, 0);
  const maxV = Math.max(...vals, 0);
  const range = maxV - minV || 1;

  const pts = points.map((p, i) => {
    const x = pad.left + (i / (points.length - 1)) * w;
    const y = pad.top + h - ((p.value - minV) / range) * h;
    return { x, y, ...p };
  });
  const pathD = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const zeroY = pad.top + h - ((0 - minV) / range) * h;
  const yLabels = [maxV, Math.round((maxV + minV) / 2), minV].map((v) => ({
    v,
    y: pad.top + h - ((v - minV) / range) * h,
  }));
  const xTickIdx = Array.from(
    new Set([0, Math.floor(points.length / 2), points.length - 1])
  );

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} style={{ display: "block" }}>
      {yLabels.map((l, i) => (
        <g key={i}>
          <line x1={pad.left} y1={l.y} x2={width - pad.right} y2={l.y}
            stroke="rgba(255,255,255,0.06)" strokeWidth={1} />
          <text x={pad.left - 4} y={l.y + 3} textAnchor="end"
            fill="rgba(255,255,255,0.34)" fontSize={9} fontFamily="monospace">
            {Math.abs(l.v) >= 1000 ? (l.v / 1000).toFixed(0) + "k" : l.v.toLocaleString()}
          </text>
        </g>
      ))}
      {minV < 0 && maxV > 0 && (
        <line x1={pad.left} y1={zeroY} x2={width - pad.right} y2={zeroY}
          stroke="rgba(255,255,255,0.18)" strokeWidth={1} strokeDasharray="4,3" />
      )}
      <path
        d={`${pathD} L ${pts[pts.length - 1].x} ${pad.top + h} L ${pts[0].x} ${pad.top + h} Z`}
        fill="url(#trend-grad)"
      />
      <defs>
        <linearGradient id="trend-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.34" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={pathD} fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
      {pts.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={3.2} fill={color} stroke="rgba(0,0,0,0.45)" strokeWidth={1} />
      ))}
      {xTickIdx.map((i) => (
        <text key={i} x={pts[i].x} y={height - 4} textAnchor="middle" fill="rgba(255,255,255,0.36)" fontSize={9}>
          {points[i].label}
        </text>
      ))}
    </svg>
  );
}

// 4 つのサマリーカード（収支 / 回収率 / 稼働日数 / 勝率）
function SummaryCards({ summary }) {
  const items = [
    {
      label: "収支",
      val: summary.hasActual ? sp(summary.totalPL) : "—",
      unit: summary.hasActual ? "円" : "",
      col: summary.hasActual ? sc(summary.totalPL) : C.sub,
    },
    {
      label: "回収率",
      val: summary.recoverRate != null ? f(summary.recoverRate, 1) : "—",
      unit: summary.recoverRate != null ? "%" : "",
      col: summary.recoverRate == null
        ? C.sub
        : summary.recoverRate >= 100 ? C.green : C.red,
    },
    {
      label: "稼働日数",
      val: f(summary.days),
      unit: "日",
      col: C.text,
    },
    {
      label: "勝率",
      val: summary.winRate != null ? f(summary.winRate, 1) : "—",
      unit: summary.winRate != null ? "%" : "",
      col: summary.winRate == null
        ? C.sub
        : summary.winRate >= 50 ? C.green : C.red,
    },
  ];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
      {items.map((it) => (
        <div
          key={it.label}
          style={{
            background: C.surface,
            border: `1px solid ${C.border}`,
            borderRadius: 14,
            padding: "14px 14px 12px",
            boxShadow: "var(--card-shadow)",
          }}
        >
          <div style={{ fontSize: 11, color: C.sub, fontWeight: 700, letterSpacing: 0.4, marginBottom: 6 }}>
            {it.label}
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
            <span style={{
              fontSize: 24, fontWeight: 900, color: it.col,
              fontFamily: mono, fontVariantNumeric: "tabular-nums",
              letterSpacing: "-0.5px", lineHeight: 1,
            }}>
              {it.val}
            </span>
            {it.unit && (
              <span style={{ fontSize: 12, color: C.sub, fontFamily: font, fontWeight: 600 }}>
                {it.unit}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// 機種別 TOP5 リスト
function MachineRankList({ rows }) {
  if (!rows || rows.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "20px 16px", color: C.sub, fontFamily: font, fontSize: 12 }}>
        該当する記録がありません
      </div>
    );
  }
  const rankColors = ["#fbbf24", "#cbd5e1", "#d97706"]; // 金 / 銀 / 銅
  return (
    <div>
      {rows.map((r, i) => {
        const rankColor = rankColors[i] || C.sub;
        const pl = r.hasActual ? r.actualPL : r.evAmount;
        return (
          <div
            key={r.key}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "12px 14px",
              borderTop: i === 0 ? "none" : `1px solid ${C.border}`,
            }}
          >
            {/* 順位バッジ */}
            <div style={{
              width: 26, height: 26, borderRadius: "50%",
              background: i < 3 ? `color-mix(in srgb, ${rankColor} 22%, transparent)` : C.surfaceHi,
              border: `1px solid ${i < 3 ? rankColor : C.border}`,
              color: i < 3 ? rankColor : C.sub,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 12, fontWeight: 800, fontFamily: mono,
              flexShrink: 0,
            }}>
              {i + 1}
            </div>

            {/* 機種名 + サブ情報 */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 14, fontWeight: 700, color: C.text,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {r.machineName}
              </div>
              <div style={{ fontSize: 10, color: C.sub, marginTop: 2, fontFamily: font }}>
                {r.sessions}回
                {r.recoverRate != null && <> ・ 回収率 {f(r.recoverRate, 1)}%</>}
              </div>
            </div>

            {/* 収支 */}
            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <div style={{
                fontSize: 15, fontWeight: 800,
                color: r.hasActual ? sc(r.actualPL) : sc(r.evAmount),
                fontFamily: mono, fontVariantNumeric: "tabular-nums",
                letterSpacing: "-0.3px",
              }}>
                {sp(Math.round(pl))}
                <span style={{ fontSize: 10, color: C.sub, marginLeft: 2, fontFamily: font, fontWeight: 600 }}>円</span>
              </div>
              {!r.hasActual && (
                <div style={{ fontSize: 9, color: C.sub, marginTop: 1 }}>期待値</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// 期間ナビ（左右矢印 + 現在の期間表示）
function PeriodNav({ label, onPrev, onNext, hasPrev, hasNext }) {
  const btnStyle = (disabled) => ({
    width: 40, height: 40, borderRadius: 12,
    background: C.surface, border: `1px solid ${C.border}`,
    color: disabled ? C.sub : C.text,
    fontSize: 18, fontWeight: 700, fontFamily: mono,
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.4 : 1,
    display: "flex", alignItems: "center", justifyContent: "center",
  });
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "0 4px", marginBottom: 12,
    }}>
      <button className="b" onClick={onPrev} disabled={!hasPrev} style={btnStyle(!hasPrev)}>‹</button>
      <div style={{
        fontSize: 16, fontWeight: 800, color: C.text, fontFamily: font,
        letterSpacing: 0.2,
      }}>
        {label}
      </div>
      <button className="b" onClick={onNext} disabled={!hasNext} style={btnStyle(!hasNext)}>›</button>
    </div>
  );
}

function emptyState(text) {
  return (
    <Card style={{ padding: "32px 16px", textAlign: "center" }}>
      <div style={{ fontSize: 13, color: C.sub, fontFamily: font, lineHeight: 1.6 }}>{text}</div>
    </Card>
  );
}

export default function AnalysisDashboard({ S, onReset, periodTab: extPeriodTab, onChangePeriodTab }) {
  const rawArchives = S?.archives;
  const archives = useMemo(() => rawArchives || [], [rawArchives]);
  const [innerPeriodTab, setInnerPeriodTab] = useState("month");
  const periodTab = extPeriodTab ?? innerPeriodTab;
  const setPeriodTab = onChangePeriodTab ?? setInnerPeriodTab;

  // 利用可能な期間の一覧
  const availableMonths = useMemo(() => listAvailableMonths(archives), [archives]);
  const availableYears  = useMemo(() => listAvailableYears(archives),  [archives]);

  // 現在の表示対象月／年（デフォルトは最新月／最新年。記録ゼロなら現在月／現在年）
  const today = new Date();
  const defaultMonth = availableMonths.length > 0
    ? availableMonths[availableMonths.length - 1]
    : `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  const defaultYear = availableYears.length > 0
    ? availableYears[availableYears.length - 1]
    : String(today.getFullYear());

  const [viewMonth, setViewMonth] = useState(defaultMonth);
  const [viewYear,  setViewYear]  = useState(defaultYear);

  // 月／年ナビ操作
  const shiftMonth = (delta) => {
    const [y, m] = viewMonth.split("-").map(Number);
    const d = new Date(y, (m - 1) + delta, 1);
    setViewMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };
  const shiftYear = (delta) => {
    setViewYear(String(Number(viewYear) + delta));
  };

  // 表示用ラベル
  const monthLabel = (() => {
    const [y, m] = viewMonth.split("-").map(Number);
    return `${y}年${m}月`;
  })();
  const yearLabel = `${viewYear}年`;

  // タブごとに必要な集計を実行
  const isAll = periodTab === "all";
  const isYear = periodTab === "year";

  const summary = useMemo(() => {
    if (periodTab === "all") return summarize(archives, {});
    if (periodTab === "year") return summarize(archives, { year: viewYear });
    return summarize(archives, { month: viewMonth });
  }, [archives, periodTab, viewMonth, viewYear]);

  const chartPoints = useMemo(() => {
    if (periodTab === "all") return buildYearlyChartPoints(archives);
    if (periodTab === "year") return buildMonthlyChartPoints(archives, viewYear);
    return buildDailyChartPoints(archives, viewMonth);
  }, [archives, periodTab, viewMonth, viewYear]);

  const machineTop = useMemo(() => {
    if (periodTab === "all") return machineRanking(archives, { limit: 5 });
    if (periodTab === "year") return machineRanking(archives, { year: viewYear, limit: 5 });
    return machineRanking(archives, { month: viewMonth, limit: 5 });
  }, [archives, periodTab, viewMonth, viewYear]);

  // 期間ナビの可否
  const hasMonthData = availableMonths.length > 0;
  const hasYearData  = availableYears.length > 0;
  const prevAvailableMonth = hasMonthData ? availableMonths[0] : viewMonth;
  const nextAvailableMonth = hasMonthData ? availableMonths[availableMonths.length - 1] : viewMonth;
  const prevAvailableYear  = hasYearData  ? availableYears[0]  : viewYear;
  const nextAvailableYear  = hasYearData  ? availableYears[availableYears.length - 1] : viewYear;

  // カレンダーモードは既存 CalendarTab を埋め込み
  if (periodTab === "calendar") {
    return (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <DashboardHeader periodTab={periodTab} onChangeTab={setPeriodTab} />
        <div style={{ flex: 1, overflow: "auto" }}>
          <CalendarTab S={S} onReset={onReset} />
        </div>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <DashboardHeader periodTab={periodTab} onChangeTab={setPeriodTab} />

      <div style={{
        flex: 1, overflowY: "auto", overflowX: "hidden",
        padding: "8px 14px calc(20px + env(safe-area-inset-bottom))",
      }}>
        {/* 期間ナビ */}
        {periodTab === "month" && (
          <PeriodNav
            label={monthLabel}
            onPrev={() => shiftMonth(-1)}
            onNext={() => shiftMonth(1)}
            hasPrev={viewMonth > prevAvailableMonth || !hasMonthData}
            hasNext={viewMonth < nextAvailableMonth || !hasMonthData}
          />
        )}
        {periodTab === "year" && (
          <PeriodNav
            label={yearLabel}
            onPrev={() => shiftYear(-1)}
            onNext={() => shiftYear(1)}
            hasPrev={viewYear > prevAvailableYear || !hasYearData}
            hasNext={viewYear < nextAvailableYear || !hasYearData}
          />
        )}
        {periodTab === "all" && (
          <div style={{ textAlign: "center", padding: "0 4px", marginBottom: 12 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: C.text, fontFamily: font, letterSpacing: 0.2 }}>
              通算（全記録）
            </div>
            <div style={{ fontSize: 11, color: C.sub, marginTop: 2 }}>
              アーカイブ {archives.length} 件
            </div>
          </div>
        )}

        {/* 記録ゼロの場合 */}
        {archives.length === 0 && emptyState("アーカイブがまだありません。実戦記録を保存すると、ここに集計が表示されます。")}

        {archives.length > 0 && (
          <>
            {/* 4 サマリーカード */}
            <SummaryCards summary={summary} />

            {/* 収支推移グラフ */}
            <Card>
              <div style={{ padding: "12px 14px 4px" }}>
                <div style={{ fontSize: 12, color: C.sub, fontWeight: 700, letterSpacing: 0.4 }}>
                  {isAll ? "年別収支推移" : isYear ? "月別収支推移" : "日別収支推移"}
                </div>
              </div>
              <div style={{ padding: "0 8px 12px" }}>
                <TrendChart points={chartPoints} />
              </div>
            </Card>

            {/* 機種別 TOP5 */}
            <Card>
              <div style={{ padding: "12px 14px 8px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontSize: 12, color: C.sub, fontWeight: 700, letterSpacing: 0.4 }}>
                  機種別成績 TOP5
                </div>
                {machineTop.length > 0 && machineTop[0].hasActual === false && (
                  <div style={{ fontSize: 10, color: C.sub, opacity: 0.7 }}>※ 実損益未記録</div>
                )}
              </div>
              <MachineRankList rows={machineTop} />
            </Card>

            {/* 補足: 期待値・時給など（実損益がある場合のみ） */}
            {summary.hasActual && (
              <Card>
                <div style={{ padding: "12px 14px 6px" }}>
                  <div style={{ fontSize: 12, color: C.sub, fontWeight: 700, letterSpacing: 0.4 }}>
                    詳細指標
                  </div>
                </div>
                <div style={{ padding: "0 14px 12px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <DetailMini label="期待値合計" val={sp(Math.round(summary.evAmount))} unit="円" col={sc(summary.evAmount)} />
                  <DetailMini label="時給" val={summary.wage != null ? sp(summary.wage) : "—"} unit={summary.wage != null ? "円/h" : ""} col={summary.wage != null ? sc(summary.wage) : C.sub} />
                  <DetailMini label="投資合計" val={f(summary.totalInvest)} unit="円" col={C.red} />
                  <DetailMini label="回収合計" val={f(summary.totalRecovery)} unit="円" col={C.green} />
                </div>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function DashboardHeader({ periodTab, onChangeTab }) {
  return (
    <div style={{ flexShrink: 0, padding: "10px 14px 0" }}>
      <div style={{ fontSize: 17, fontWeight: 800, color: C.text, fontFamily: font, marginBottom: 10 }}>
        収支分析
      </div>
      <div style={{
        display: "flex", gap: 4,
        background: C.surfaceHi, borderRadius: 12, padding: 3,
        border: `1px solid ${C.border}`,
        marginBottom: 10,
      }}>
        {PERIOD_TABS.map((t) => {
          const active = periodTab === t.id;
          return (
            <button
              key={t.id}
              className="b"
              onClick={() => onChangeTab(t.id)}
              style={{
                flex: 1, minHeight: 36,
                background: active ? C.surface : "transparent",
                border: "none", borderRadius: 9,
                color: active ? C.blue : C.sub,
                fontSize: 12, fontWeight: active ? 800 : 600,
                fontFamily: font, cursor: "pointer",
                boxShadow: active ? "0 1px 2px rgba(17,24,39,0.08)" : "none",
                transition: "background .15s ease, color .15s ease",
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

function DetailMini({ label, val, unit, col }) {
  return (
    <div style={{
      background: C.bg, border: `1px solid ${C.border}`,
      borderRadius: 10, padding: "10px 12px",
    }}>
      <div style={{ fontSize: 10, color: C.sub, fontWeight: 600, marginBottom: 4 }}>{label}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 3 }}>
        <span style={{
          fontSize: 15, fontWeight: 800, color: col || C.text,
          fontFamily: mono, fontVariantNumeric: "tabular-nums",
        }}>
          {val}
        </span>
        {unit && <span style={{ fontSize: 10, color: C.sub, fontFamily: font, fontWeight: 600 }}>{unit}</span>}
      </div>
    </div>
  );
}
