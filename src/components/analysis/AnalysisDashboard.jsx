import React, { useMemo, useState } from "react";
import { C, f, sc, sp, font, mono } from "../../constants";
import { Card } from "../Atoms";
import { CalendarTab } from "../Tabs";
import {
  buildDailyChartPoints,
  buildMonthlyChartPoints,
  buildYearlyChartPoints,
  getMachineHamariList,
  isFilterActive,
  listAvailableMachines,
  listAvailableMonths,
  listAvailableStores,
  listAvailableYears,
  machineRanking,
  summarize,
} from "./analysisSelectors";
import AnalyzerView from "./AnalyzerView";

// 曜日チップの並び（日始まりに合わせる）
const WEEKDAY_CHIPS = [
  { value: 0, label: "日", color: "var(--red)" },
  { value: 1, label: "月" },
  { value: 2, label: "火" },
  { value: 3, label: "水" },
  { value: 4, label: "木" },
  { value: 5, label: "金" },
  { value: 6, label: "土", color: "var(--blue)" },
];

const EMPTY_FILTERS = Object.freeze({
  storeName: "",
  machineName: "",
  dateStart: "",
  dateEnd: "",
  weekdays: [],
});

// 期間タブ定義
const PERIOD_TABS = [
  { id: "month",    label: "月別" },
  { id: "year",     label: "年別" },
  { id: "all",      label: "通算" },
  { id: "analyzer", label: "分析+" },
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
            stroke="var(--border)" strokeWidth={1} />
          <text x={pad.left - 4} y={l.y + 3} textAnchor="end"
            fill="var(--sub)" fontSize={9} fontFamily="monospace">
            {Math.abs(l.v) >= 1000 ? (l.v / 1000).toFixed(0) + "k" : l.v.toLocaleString()}
          </text>
        </g>
      ))}
      {minV < 0 && maxV > 0 && (
        <line x1={pad.left} y1={zeroY} x2={width - pad.right} y2={zeroY}
          stroke="var(--border-hi)" strokeWidth={1} strokeDasharray="4,3" />
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
        <text key={i} x={pts[i].x} y={height - 4} textAnchor="middle" fill="var(--sub)" fontSize={9}>
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

// 実質収支カード（現金収支 + 貯玉消費分 = 実質総収支）
//   貯玉を消費したセッションが期間内にある場合のみ表示する。
//   貯玉未使用の期間では非表示となり、従来の収支表示のみとなる。
function RealBalanceCard({ summary }) {
  const cash = summary.totalPL;          // 現金収支
  const chodama = summary.totalChodamaPL; // 貯玉消費分（コスト = マイナス）
  const real = summary.totalRealPL;       // 実質総収支
  const rows = [
    { label: "現金収支", val: cash, col: sc(cash), sub: "回収 − 投資" },
    { label: "貯玉消費分", val: chodama, col: sc(chodama), sub: "消費玉 × 交換率で換算" },
  ];
  return (
    <Card style={{ marginBottom: 12 }}>
      <div style={{ padding: "12px 14px 6px", display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: 13 }}>💎</span>
        <div style={{ fontSize: 12, color: C.sub, fontWeight: 700, letterSpacing: 0.4 }}>
          実質収支（貯玉込み）
        </div>
      </div>
      <div style={{ padding: "0 14px 4px" }}>
        {rows.map((r) => (
          <div
            key={r.label}
            style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "8px 0",
            }}
          >
            <div>
              <div style={{ fontSize: 13, color: C.text, fontWeight: 600 }}>{r.label}</div>
              <div style={{ fontSize: 10, color: C.sub, marginTop: 1 }}>{r.sub}</div>
            </div>
            <div style={{
              fontSize: 17, fontWeight: 800, color: r.col,
              fontFamily: mono, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.3px",
            }}>
              {sp(Math.round(r.val))}
              <span style={{ fontSize: 11, color: C.sub, marginLeft: 2, fontFamily: font, fontWeight: 600 }}>円</span>
            </div>
          </div>
        ))}
        {/* 合算（実質総収支） */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "10px 0 6px", borderTop: `1px solid ${C.border}`, marginTop: 2,
        }}>
          <div style={{ fontSize: 14, color: C.text, fontWeight: 800 }}>実質総収支</div>
          <div style={{
            fontSize: 22, fontWeight: 900, color: sc(real),
            fontFamily: mono, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.5px",
          }}>
            {sp(Math.round(real))}
            <span style={{ fontSize: 12, color: C.sub, marginLeft: 2, fontFamily: font, fontWeight: 600 }}>円</span>
          </div>
        </div>
      </div>
      {/* 計算式の注釈 */}
      <div style={{
        padding: "8px 14px 12px", fontSize: 10, color: C.sub, lineHeight: 1.6,
        borderTop: `1px solid ${C.border}`, marginTop: 4,
      }}>
        現金収支 + 貯玉収支 = 実質総収支<br />
        貯玉消費分は「消費玉数 × 交換率」で円換算したコストです
      </div>
    </Card>
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
  const rankColors = ["#ca8a04", "#94a3b8", "#b45309"]; // 金 / 銀 / 銅（ライト/ダーク両対応の中間トーン）
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

export default function AnalysisDashboard({
  S,
  onReset,
  periodTab: extPeriodTab,
  onChangePeriodTab,
  filters: extFilters,
  onChangeFilters,
}) {
  const rawArchives = S?.archives;
  const archives = useMemo(() => rawArchives || [], [rawArchives]);
  const [innerPeriodTab, setInnerPeriodTab] = useState("month");
  const periodTab = extPeriodTab ?? innerPeriodTab;
  const setPeriodTab = onChangePeriodTab ?? setInnerPeriodTab;

  // 絞り込み条件（永続化 props がなければローカル state でフォールバック）
  const [innerFilters, setInnerFilters] = useState(EMPTY_FILTERS);
  const filters = extFilters ?? innerFilters;
  const setFilters = onChangeFilters ?? setInnerFilters;
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);

  // フィルタ更新ヘルパー
  const updateFilter = (patch) => setFilters({ ...filters, ...patch });
  const resetFilters = () => setFilters({ ...EMPTY_FILTERS });
  const toggleWeekday = (wd) => {
    const cur = Array.isArray(filters.weekdays) ? filters.weekdays : [];
    const next = cur.includes(wd) ? cur.filter((w) => w !== wd) : [...cur, wd].sort((a, b) => a - b);
    updateFilter({ weekdays: next });
  };

  const filterActive = isFilterActive(filters);
  const activeFilterCount = (
    (filters.storeName ? 1 : 0) +
    (filters.machineName ? 1 : 0) +
    (filters.dateStart || filters.dateEnd ? 1 : 0) +
    (Array.isArray(filters.weekdays) && filters.weekdays.length > 0 ? 1 : 0)
  );

  // フィルタ用の選択肢一覧
  const availableStores = useMemo(() => listAvailableStores(archives), [archives]);
  const availableMachines = useMemo(() => listAvailableMachines(archives), [archives]);

  // 集計関数に渡す絞り込み（period 由来の月／年を除いた追加条件）
  const extraFilters = useMemo(() => ({
    storeName: filters.storeName || "",
    machineName: filters.machineName || "",
    dateStart: filters.dateStart || "",
    dateEnd: filters.dateEnd || "",
    weekdays: Array.isArray(filters.weekdays) ? filters.weekdays : [],
  }), [filters]);

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
    if (periodTab === "all") return summarize(archives, { ...extraFilters });
    if (periodTab === "year") return summarize(archives, { ...extraFilters, year: viewYear });
    return summarize(archives, { ...extraFilters, month: viewMonth });
  }, [archives, periodTab, viewMonth, viewYear, extraFilters]);

  const chartPoints = useMemo(() => {
    if (periodTab === "all") return buildYearlyChartPoints(archives, extraFilters);
    if (periodTab === "year") return buildMonthlyChartPoints(archives, viewYear, extraFilters);
    return buildDailyChartPoints(archives, viewMonth, extraFilters);
  }, [archives, periodTab, viewMonth, viewYear, extraFilters]);

  const machineTop = useMemo(() => {
    if (periodTab === "all") return machineRanking(archives, { ...extraFilters, limit: 5 });
    if (periodTab === "year") return machineRanking(archives, { ...extraFilters, year: viewYear, limit: 5 });
    return machineRanking(archives, { ...extraFilters, month: viewMonth, limit: 5 });
  }, [archives, periodTab, viewMonth, viewYear, extraFilters]);

  const machineHamariData = useMemo(
    () => getMachineHamariList(archives, extraFilters).slice(0, 5),
    [archives, extraFilters]
  );

  // 期間ナビの可否
  const hasMonthData = availableMonths.length > 0;
  const hasYearData  = availableYears.length > 0;
  const prevAvailableMonth = hasMonthData ? availableMonths[0] : viewMonth;
  const nextAvailableMonth = hasMonthData ? availableMonths[availableMonths.length - 1] : viewMonth;
  const prevAvailableYear  = hasYearData  ? availableYears[0]  : viewYear;
  const nextAvailableYear  = hasYearData  ? availableYears[availableYears.length - 1] : viewYear;

  // カレンダーモードは既存 CalendarTab を埋め込み（絞り込みは適用しない）
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
        {/* 絞り込みパネル */}
        <FilterPanel
          open={filterPanelOpen}
          onToggle={() => setFilterPanelOpen((v) => !v)}
          filters={filters}
          updateFilter={updateFilter}
          toggleWeekday={toggleWeekday}
          resetFilters={resetFilters}
          availableStores={availableStores}
          availableMachines={availableMachines}
          activeCount={activeFilterCount}
          active={filterActive}
        />

        {/* 分析+（詳細分析）: 期間ナビ・サマリーを使わず、専用の集計ビューを表示 */}
        {periodTab === "analyzer" && (
          <>
            <div style={{ textAlign: "center", padding: "0 4px", marginBottom: 12 }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: C.text, fontFamily: font, letterSpacing: 0.2 }}>
                詳細分析（分析+）
              </div>
              <div style={{ fontSize: 11, color: C.sub, marginTop: 2 }}>
                回転率推移・ボーダー差分布・店舗/曜日傾向
              </div>
            </div>
            <AnalyzerView archives={archives} extraFilters={extraFilters} />
          </>
        )}

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
        {periodTab !== "analyzer" && archives.length === 0 && emptyState("アーカイブがまだありません。実戦記録を保存すると、ここに集計が表示されます。")}

        {/* 絞り込みで該当ゼロの場合 */}
        {periodTab !== "analyzer" && archives.length > 0 && summary.sessions === 0 && (
          emptyState(filterActive
            ? "指定された条件に一致する記録がありません。絞り込みを変更するかリセットしてください。"
            : "この期間には記録がありません。")
        )}

        {periodTab !== "analyzer" && archives.length > 0 && summary.sessions > 0 && (
          <>
            {/* 4 サマリーカード */}
            <SummaryCards summary={summary} />

            {/* 実質収支（貯玉込み）: 期間内に貯玉消費がある場合のみ表示 */}
            {summary.hasChodama && <RealBalanceCard summary={summary} />}

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

            {/* 機種別ハマり分析 */}
            <MachineHamariCard rows={machineHamariData} />

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

// 絞り込みパネル（折りたたみ式）
function FilterPanel({
  open, onToggle,
  filters, updateFilter, toggleWeekday, resetFilters,
  availableStores, availableMachines,
  activeCount, active,
}) {
  const selectStyle = {
    width: "100%",
    minHeight: 44,
    background: C.bg,
    border: `1px solid ${C.border}`,
    borderRadius: 10,
    padding: "0 12px",
    color: C.text,
    fontFamily: font,
    fontSize: 14,
    appearance: "none",
    WebkitAppearance: "none",
    backgroundImage:
      "linear-gradient(45deg, transparent 50%, var(--sub) 50%), linear-gradient(135deg, var(--sub) 50%, transparent 50%)",
    backgroundPosition:
      "calc(100% - 16px) center, calc(100% - 11px) center",
    backgroundSize: "5px 5px, 5px 5px",
    backgroundRepeat: "no-repeat",
  };
  const dateInputStyle = {
    flex: 1, minWidth: 0, minHeight: 44,
    background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10,
    padding: "0 12px", color: C.text, fontFamily: font, fontSize: 14,
  };

  return (
    <div style={{
      background: C.surface,
      border: `1px solid ${active ? C.blue : C.border}`,
      borderRadius: 14,
      marginBottom: 12,
      overflow: "hidden",
      boxShadow: "var(--card-shadow)",
    }}>
      {/* ヘッダー（タップで開閉） */}
      <button
        className="b"
        onClick={onToggle}
        aria-expanded={open}
        style={{
          width: "100%", minHeight: 44,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          gap: 8, padding: "8px 14px",
          background: "transparent", border: "none",
          color: C.text, fontFamily: font, fontSize: 14, fontWeight: 700,
          cursor: "pointer", textAlign: "left",
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span>絞り込み</span>
          {activeCount > 0 && (
            <span style={{
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              minWidth: 20, height: 20, padding: "0 6px",
              borderRadius: 10,
              background: C.blue, color: "#fff",
              fontSize: 11, fontWeight: 800, fontFamily: mono,
            }}>
              {activeCount}
            </span>
          )}
        </span>
        <span style={{ color: C.sub, fontSize: 12 }}>{open ? "閉じる ▲" : "開く ▼"}</span>
      </button>

      {open && (
        <div style={{
          padding: "4px 14px 14px",
          display: "flex", flexDirection: "column", gap: 12,
          borderTop: `1px solid ${C.border}`,
        }}>
          {/* 店舗名 */}
          <div>
            <div style={{ fontSize: 11, color: C.sub, fontWeight: 700, marginBottom: 6, letterSpacing: 0.4 }}>
              店舗名
            </div>
            <select
              value={filters.storeName || ""}
              onChange={(e) => updateFilter({ storeName: e.target.value })}
              style={selectStyle}
            >
              <option value="">すべての店舗</option>
              {availableStores.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            {availableStores.length === 0 && (
              <div style={{ fontSize: 10, color: C.sub, marginTop: 4 }}>
                記録に店舗名がありません
              </div>
            )}
          </div>

          {/* 機種名 */}
          <div>
            <div style={{ fontSize: 11, color: C.sub, fontWeight: 700, marginBottom: 6, letterSpacing: 0.4 }}>
              機種名
            </div>
            <select
              value={filters.machineName || ""}
              onChange={(e) => updateFilter({ machineName: e.target.value })}
              style={selectStyle}
            >
              <option value="">すべての機種</option>
              {availableMachines.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
            {availableMachines.length === 0 && (
              <div style={{ fontSize: 10, color: C.sub, marginTop: 4 }}>
                記録に機種名がありません
              </div>
            )}
          </div>

          {/* 期間（カスタム日付範囲） */}
          <div>
            <div style={{ fontSize: 11, color: C.sub, fontWeight: 700, marginBottom: 6, letterSpacing: 0.4 }}>
              期間（カスタム）
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="date"
                value={filters.dateStart || ""}
                onChange={(e) => updateFilter({ dateStart: e.target.value })}
                style={dateInputStyle}
                aria-label="開始日"
              />
              <span style={{ color: C.sub, fontSize: 12 }}>〜</span>
              <input
                type="date"
                value={filters.dateEnd || ""}
                onChange={(e) => updateFilter({ dateEnd: e.target.value })}
                style={dateInputStyle}
                aria-label="終了日"
              />
            </div>
            <div style={{ fontSize: 10, color: C.sub, marginTop: 4 }}>
              月／年タブの選択範囲内でさらに絞り込みます
            </div>
          </div>

          {/* 曜日 */}
          <div>
            <div style={{ fontSize: 11, color: C.sub, fontWeight: 700, marginBottom: 6, letterSpacing: 0.4 }}>
              曜日（複数選択可）
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {WEEKDAY_CHIPS.map((wd) => {
                const selected = Array.isArray(filters.weekdays) && filters.weekdays.includes(wd.value);
                const accent = wd.color || C.text;
                return (
                  <button
                    key={wd.value}
                    className="b"
                    onClick={() => toggleWeekday(wd.value)}
                    style={{
                      minWidth: 44, minHeight: 44,
                      borderRadius: 10,
                      background: selected ? `color-mix(in srgb, ${C.blue} 24%, ${C.surfaceHi})` : C.surfaceHi,
                      border: `1px solid ${selected ? C.blue : C.border}`,
                      color: selected ? C.text : accent,
                      fontSize: 14, fontWeight: 800, fontFamily: font,
                      cursor: "pointer",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}
                  >
                    {wd.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* リセットボタン */}
          <button
            className="b"
            onClick={resetFilters}
            disabled={!active}
            style={{
              width: "100%", minHeight: 44,
              borderRadius: 10,
              background: active ? "transparent" : C.surfaceHi,
              border: `1px solid ${active ? C.red : C.border}`,
              color: active ? C.red : C.sub,
              fontSize: 13, fontWeight: 700, fontFamily: font,
              cursor: active ? "pointer" : "default",
              opacity: active ? 1 : 0.5,
            }}
          >
            絞り込みをリセット
          </button>
        </div>
      )}
    </div>
  );
}

// 機種別ハマり回転数カード
function MachineHamariCard({ rows }) {
  if (!rows || rows.length === 0) return null;
  return (
    <Card style={{ marginBottom: 12 }}>
      <div style={{ padding: "12px 14px 8px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 12, color: C.sub, fontWeight: 700, letterSpacing: 0.4 }}>
          機種別ハマり分析
        </div>
        <div style={{ fontSize: 10, color: C.sub, opacity: 0.7 }}>大当たりなし回転数</div>
      </div>
      {/* ヘッダー行 */}
      <div style={{
        display: "grid", gridTemplateColumns: "1fr 56px 60px 68px",
        gap: 4, padding: "0 14px 6px",
        borderBottom: `1px solid ${C.border}`,
      }}>
        {["機種", "通算", "直近5回", "現在継続"].map((h) => (
          <div key={h} style={{ fontSize: 9, color: C.sub, fontWeight: 700, textAlign: h === "機種" ? "left" : "right" }}>
            {h}
          </div>
        ))}
      </div>
      {rows.map((r, i) => (
        <div
          key={r.key}
          style={{
            display: "grid", gridTemplateColumns: "1fr 56px 60px 68px",
            gap: 4, padding: "10px 14px",
            borderTop: i === 0 ? "none" : `1px solid ${C.border}`,
            alignItems: "center",
          }}
        >
          {/* 機種名 */}
          <div style={{
            fontSize: 12, fontWeight: 700, color: C.text,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {r.machineName}
            <div style={{ fontSize: 9, color: C.sub, fontWeight: 600, marginTop: 1 }}>
              {r.sessions}セッション
            </div>
          </div>

          {/* トータルハマり */}
          {r.hasData ? (
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: C.orange, fontFamily: mono, fontVariantNumeric: "tabular-nums" }}>
                {f(r.totalHamariRot)}
              </div>
              <div style={{ fontSize: 9, color: C.sub }}>回転</div>
            </div>
          ) : (
            <div style={{ textAlign: "right", fontSize: 9, color: C.sub }}>データ不足</div>
          )}

          {/* 直近Nセッション */}
          {r.hasData ? (
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: C.text, fontFamily: mono, fontVariantNumeric: "tabular-nums" }}>
                {f(r.recentHamariRot)}
              </div>
              <div style={{ fontSize: 9, color: C.sub }}>直近{r.recentCount}回</div>
            </div>
          ) : (
            <div style={{ textAlign: "right", fontSize: 9, color: C.sub }}>—</div>
          )}

          {/* 最後の大当たりからの累計 */}
          <div style={{ textAlign: "right" }}>
            <div style={{
              fontSize: 13, fontWeight: 800,
              color: r.sinceLastJPRot > 500 ? C.red : r.sinceLastJPRot > 200 ? C.orange : C.text,
              fontFamily: mono, fontVariantNumeric: "tabular-nums",
            }}>
              {r.sinceLastJPRot > 0 ? f(r.sinceLastJPRot) : "—"}
            </div>
            <div style={{ fontSize: 9, color: C.sub }}>回転</div>
          </div>
        </div>
      ))}
      <div style={{
        padding: "6px 14px 10px",
        fontSize: 9, color: C.sub, lineHeight: 1.5,
        borderTop: `1px solid ${C.border}`,
      }}>
        通算: 全セッションの初当たりまでの合計回転数 ／ 現在継続: 最後の大当たりから今日まで
      </div>
    </Card>
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
