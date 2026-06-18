import React, { useMemo, useState } from "react";
import { C, f, sc, sp, font, mono } from "../../constants";
import { Card } from "../Atoms";
import { CalendarTab } from "../Tabs";
import {
  getMachineHamariList,
  isFilterActive,
  listAvailableMachines,
  listAvailableMonths,
  listAvailableStores,
  listAvailableYears,
  machineRanking,
  summarize,
} from "./analysisSelectors";
import {
  avgSpinRate,
  buildCumulativeTrend,
  buildGrades,
} from "./analyticsViewSelectors";
import { CumulativeChart } from "./AnalyticsCharts";
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

// 期間タブ定義（現行構成を維持）
const PERIOD_TABS = [
  { id: "month",    label: "月別" },
  { id: "year",     label: "年別" },
  { id: "all",      label: "通算" },
  { id: "analyzer", label: "分析+" },
  { id: "calendar", label: "カレンダー" },
];

const ACCENT = "var(--at-accent)";

// ──────────────────────────────────────────────────────────────────────────────
// ヒーローカード（今月どうだったかが3秒で分かる主役カード）
// ──────────────────────────────────────────────────────────────────────────────
function HeroCard({ summary, periodWord }) {
  const hasActual = summary.hasActual;
  const mainVal = hasActual ? (summary.hasChodama ? summary.totalRealPL : summary.totalPL) : null;
  const heroValue = mainVal != null ? Math.round(mainVal) : Math.round(summary.evAmount);
  const heroLabel = hasActual
    ? (summary.hasChodama ? `${periodWord}の実質収支` : `${periodWord}の収支`)
    : `${periodWord}の期待値`;
  const diff = mainVal != null ? Math.round(mainVal - summary.evAmount) : null;

  return (
    <div
      style={{
        background: "linear-gradient(160deg, var(--surface) 0%, var(--surface-alt) 100%)",
        border: `1px solid ${C.border}`,
        borderRadius: 18,
        padding: "18px 18px 16px",
        marginBottom: 12,
        boxShadow: "var(--card-shadow)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* アクセントのトップライン */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: 2,
        background: `linear-gradient(90deg, transparent, ${ACCENT}, transparent)`,
        opacity: 0.7,
      }} />
      <div style={{ fontSize: 12, color: C.subHi, fontWeight: 700, letterSpacing: 0.6, marginBottom: 8 }}>
        {heroLabel}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
        <span style={{
          fontSize: 42, fontWeight: 900, color: sc(heroValue),
          fontFamily: mono, fontVariantNumeric: "tabular-nums",
          letterSpacing: "-1.5px", lineHeight: 1,
        }}>
          {sp(heroValue)}
        </span>
        <span style={{ fontSize: 16, color: C.sub, fontFamily: font, fontWeight: 700 }}>円</span>
      </div>

      {/* サブ: 期待値 / 期待値との差 */}
      <div style={{
        display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 16,
      }}>
        <div style={{
          background: C.surfaceHi, border: `1px solid ${C.border}`, borderRadius: 12, padding: "10px 12px",
        }}>
          <div style={{ fontSize: 10, color: C.sub, fontWeight: 700, marginBottom: 5, letterSpacing: 0.4 }}>期待値</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 3 }}>
            <span style={{ fontSize: 18, fontWeight: 900, color: ACCENT, fontFamily: mono, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.4px" }}>
              {sp(Math.round(summary.evAmount))}
            </span>
            <span style={{ fontSize: 10, color: C.sub, fontWeight: 600 }}>円</span>
          </div>
        </div>
        <div style={{
          background: C.surfaceHi, border: `1px solid ${C.border}`, borderRadius: 12, padding: "10px 12px",
        }}>
          <div style={{ fontSize: 10, color: C.sub, fontWeight: 700, marginBottom: 5, letterSpacing: 0.4 }}>期待値との差</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 3 }}>
            <span style={{
              fontSize: 18, fontWeight: 900,
              color: diff == null ? C.sub : sc(diff),
              fontFamily: mono, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.4px",
            }}>
              {diff == null ? "—" : sp(diff)}
            </span>
            {diff != null && <span style={{ fontSize: 10, color: C.sub, fontWeight: 600 }}>円</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

// グレードに応じた色（A系=緑、B系=シアン、C系=黄、D=赤）
function gradeColor(g) {
  if (g === "—") return C.sub;
  const head = g[0];
  if (head === "A") return C.green;
  if (head === "B") return ACCENT;
  if (head === "C") return C.yellow;
  return C.red;
}

// 期待値ステータス（5枚の評価カード）
function GradeStatus({ grades }) {
  const items = [
    { label: "期待値", g: grades.ev },
    { label: "回転率", g: grades.spin },
    { label: "店舗選択", g: grades.store },
    { label: "収支", g: grades.pl },
    { label: "総合評価", g: grades.total, primary: true },
  ];
  return (
    <Card style={{ marginBottom: 12 }}>
      <div style={{ padding: "12px 14px 6px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 12, color: C.sub, fontWeight: 700, letterSpacing: 0.4 }}>期待値ステータス</div>
        <div style={{ fontSize: 9, color: C.sub, opacity: 0.7 }}>評価は目安</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6, padding: "0 12px 14px" }}>
        {items.map((it) => {
          const col = gradeColor(it.g);
          return (
            <div
              key={it.label}
              style={{
                background: it.primary ? `color-mix(in srgb, ${col} 14%, var(--surface-hi))` : C.surfaceHi,
                border: `1px solid ${it.primary ? col : C.border}`,
                borderRadius: 12,
                padding: "10px 2px 9px",
                textAlign: "center",
                minHeight: 64,
                display: "flex", flexDirection: "column", justifyContent: "center", gap: 4,
              }}
            >
              <div style={{
                fontSize: 22, fontWeight: 900, color: col,
                fontFamily: mono, fontVariantNumeric: "tabular-nums", lineHeight: 1, letterSpacing: "-0.5px",
              }}>
                {it.g}
              </div>
              <div style={{ fontSize: 9, color: C.sub, fontWeight: 700, lineHeight: 1.1 }}>{it.label}</div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// 今月サマリー（5カード: 稼働日数 / 勝率 / 平均回転率 / 期待値 / 稼働時間）
function SummaryGrid({ summary, avgSpin }) {
  const items = [
    { label: "稼働日数", val: f(summary.days), unit: "日", col: C.text },
    {
      label: "勝率",
      val: summary.winRate != null ? f(summary.winRate, 0) : "—",
      unit: summary.winRate != null ? "%" : "",
      col: summary.winRate == null ? C.sub : summary.winRate >= 50 ? C.green : C.red,
    },
    {
      label: "平均回転率",
      val: avgSpin != null ? f(avgSpin, 1) : "—",
      unit: avgSpin != null ? "回/K" : "",
      col: avgSpin != null ? ACCENT : C.sub,
    },
    {
      label: "期待値",
      val: sp(Math.round(summary.evAmount)),
      unit: "円",
      col: sc(summary.evAmount),
    },
    {
      label: "稼働時間",
      val: summary.workHours > 0 ? f(summary.workHours, 1) : "—",
      unit: summary.workHours > 0 ? "h" : "",
      col: C.text,
    },
  ];
  return (
    <div style={{
      display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 12,
    }}>
      {items.map((it) => (
        <div
          key={it.label}
          style={{
            background: C.surface,
            border: `1px solid ${C.border}`,
            borderRadius: 13,
            padding: "12px 10px 10px",
            boxShadow: "var(--card-shadow)",
          }}
        >
          <div style={{ fontSize: 10, color: C.sub, fontWeight: 700, letterSpacing: 0.3, marginBottom: 6 }}>
            {it.label}
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 3 }}>
            <span style={{
              fontSize: 19, fontWeight: 900, color: it.col,
              fontFamily: mono, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.5px", lineHeight: 1,
            }}>
              {it.val}
            </span>
            {it.unit && <span style={{ fontSize: 10, color: C.sub, fontWeight: 600 }}>{it.unit}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

// 実質収支カード（現金収支 + 貯玉消費分 = 実質総収支）
//   貯玉を消費したセッションが期間内にある場合のみ表示する。
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
  const rankColors = ["#FFC83D", "#A7B6D0", "#FF9F45"];
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
    width: 42, height: 42, borderRadius: 12,
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
        fontSize: 17, fontWeight: 800, color: C.text, fontFamily: font,
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

  const availableStores = useMemo(() => listAvailableStores(archives), [archives]);
  const availableMachines = useMemo(() => listAvailableMachines(archives), [archives]);

  const extraFilters = useMemo(() => ({
    storeName: filters.storeName || "",
    machineName: filters.machineName || "",
    dateStart: filters.dateStart || "",
    dateEnd: filters.dateEnd || "",
    weekdays: Array.isArray(filters.weekdays) ? filters.weekdays : [],
  }), [filters]);

  const availableMonths = useMemo(() => listAvailableMonths(archives), [archives]);
  const availableYears  = useMemo(() => listAvailableYears(archives),  [archives]);

  const today = new Date();
  const defaultMonth = availableMonths.length > 0
    ? availableMonths[availableMonths.length - 1]
    : `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  const defaultYear = availableYears.length > 0
    ? availableYears[availableYears.length - 1]
    : String(today.getFullYear());

  const [viewMonth, setViewMonth] = useState(defaultMonth);
  const [viewYear,  setViewYear]  = useState(defaultYear);

  // 新規アーカイブ追加で最新月/年が更新された場合に表示を追従させる（手動移動後は尊重）
  const [prevDefaultMonth, setPrevDefaultMonth] = useState(defaultMonth);
  if (defaultMonth !== prevDefaultMonth) {
    if (viewMonth === prevDefaultMonth) setViewMonth(defaultMonth);
    setPrevDefaultMonth(defaultMonth);
  }
  const [prevDefaultYear, setPrevDefaultYear] = useState(defaultYear);
  if (defaultYear !== prevDefaultYear) {
    if (viewYear === prevDefaultYear) setViewYear(defaultYear);
    setPrevDefaultYear(defaultYear);
  }

  const shiftMonth = (delta) => {
    const [y, m] = viewMonth.split("-").map(Number);
    const d = new Date(y, (m - 1) + delta, 1);
    setViewMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };
  const shiftYear = (delta) => setViewYear(String(Number(viewYear) + delta));

  const monthLabel = (() => {
    const [y, m] = viewMonth.split("-").map(Number);
    return `${y}年${m}月`;
  })();
  const yearLabel = `${viewYear}年`;
  const periodWord = periodTab === "all" ? "通算" : periodTab === "year" ? yearLabel : "今月";

  const isAll = periodTab === "all";
  const isYear = periodTab === "year";

  // タブごとの集計オプション
  const periodOpts = useMemo(() => {
    if (periodTab === "all") return { ...extraFilters };
    if (periodTab === "year") return { ...extraFilters, year: viewYear };
    return { ...extraFilters, month: viewMonth };
  }, [periodTab, viewMonth, viewYear, extraFilters]);

  const summary = useMemo(() => summarize(archives, periodOpts), [archives, periodOpts]);

  const cumulative = useMemo(
    () => buildCumulativeTrend(archives, periodTab, viewMonth, viewYear, extraFilters),
    [archives, periodTab, viewMonth, viewYear, extraFilters]
  );

  const grades = useMemo(() => buildGrades(archives, periodOpts), [archives, periodOpts]);
  const avgSpin = useMemo(() => avgSpinRate(archives, periodOpts), [archives, periodOpts]);

  const machineTop = useMemo(
    () => machineRanking(archives, { ...periodOpts, limit: 5 }),
    [archives, periodOpts]
  );

  const machineHamariData = useMemo(
    () => getMachineHamariList(archives, extraFilters).slice(0, 5),
    [archives, extraFilters]
  );

  const hasMonthData = availableMonths.length > 0;
  const hasYearData  = availableYears.length > 0;
  const prevAvailableMonth = hasMonthData ? availableMonths[0] : viewMonth;
  const nextAvailableMonth = hasMonthData ? availableMonths[availableMonths.length - 1] : viewMonth;
  const prevAvailableYear  = hasYearData  ? availableYears[0]  : viewYear;
  const nextAvailableYear  = hasYearData  ? availableYears[availableYears.length - 1] : viewYear;

  // カレンダーモードは既存 CalendarTab を埋め込み
  if (periodTab === "calendar") {
    return (
      <div className="analytics-terminal" style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--bg)" }}>
        <DashboardHeader periodTab={periodTab} onChangeTab={setPeriodTab} />
        <div style={{ flex: 1, overflow: "auto" }}>
          <CalendarTab S={S} onReset={onReset} />
        </div>
      </div>
    );
  }

  return (
    <div className="analytics-terminal" style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--bg)" }}>
      <DashboardHeader periodTab={periodTab} onChangeTab={setPeriodTab} />

      <div style={{
        flex: 1, overflowY: "auto", overflowX: "hidden",
        padding: "8px 14px calc(20px + env(safe-area-inset-bottom))",
      }}>
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

        {/* 分析+（詳細分析）: 期待値分析 / 店舗分析 / 機種分析 */}
        {periodTab === "analyzer" && (
          <AnalyzerView archives={archives} extraFilters={extraFilters} />
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

        {periodTab !== "analyzer" && archives.length === 0 && emptyState("アーカイブがまだありません。実戦記録を保存すると、ここに集計が表示されます。")}

        {periodTab !== "analyzer" && archives.length > 0 && summary.sessions === 0 && (
          emptyState(filterActive
            ? "指定された条件に一致する記録がありません。絞り込みを変更するかリセットしてください。"
            : "この期間には記録がありません。")
        )}

        {periodTab !== "analyzer" && archives.length > 0 && summary.sessions > 0 && (
          <>
            {/* ヒーローカード（主役） */}
            <HeroCard summary={summary} periodWord={periodWord} />

            {/* 期待値ステータス（5評価カード） */}
            <GradeStatus grades={grades} />

            {/* 今月サマリー（5カード） */}
            <SummaryGrid summary={summary} avgSpin={avgSpin} />

            {/* 実質収支（貯玉込み）: 期間内に貯玉消費がある場合のみ表示 */}
            {summary.hasChodama && <RealBalanceCard summary={summary} />}

            {/* 累積収支推移グラフ（TradingView 風・3本ライン） */}
            <Card>
              <div style={{ padding: "12px 14px 4px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontSize: 12, color: C.sub, fontWeight: 700, letterSpacing: 0.4 }}>
                  {isAll ? "年別 累積推移" : isYear ? "月別 累積推移" : "日別 累積推移"}
                </div>
                <div style={{ fontSize: 9, color: C.sub, opacity: 0.7 }}>実収支 / 期待値 / 差異</div>
              </div>
              <div style={{ padding: "4px 8px 12px" }}>
                <CumulativeChart data={cumulative} />
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
    <div style={{ flexShrink: 0, padding: "10px 14px 0", background: "var(--bg)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{
          width: 8, height: 8, borderRadius: "50%", background: ACCENT,
          boxShadow: `0 0 8px ${ACCENT}`,
        }} />
        <div style={{ fontSize: 17, fontWeight: 800, color: C.text, fontFamily: font, letterSpacing: 0.3 }}>
          収支分析
        </div>
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
                flex: 1, minHeight: 38,
                background: active ? `color-mix(in srgb, ${ACCENT} 16%, var(--surface))` : "transparent",
                border: active ? `1px solid color-mix(in srgb, ${ACCENT} 40%, transparent)` : "1px solid transparent",
                borderRadius: 9,
                color: active ? ACCENT : C.sub,
                fontSize: 12, fontWeight: active ? 800 : 600,
                fontFamily: font, cursor: "pointer",
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
      border: `1px solid ${active ? ACCENT : C.border}`,
      borderRadius: 14,
      marginBottom: 12,
      overflow: "hidden",
      boxShadow: "var(--card-shadow)",
    }}>
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
              background: ACCENT, color: "#04121c",
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
                      background: selected ? `color-mix(in srgb, ${ACCENT} 24%, ${C.surfaceHi})` : C.surfaceHi,
                      border: `1px solid ${selected ? ACCENT : C.border}`,
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
          <div style={{
            fontSize: 12, fontWeight: 700, color: C.text,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {r.machineName}
            <div style={{ fontSize: 9, color: C.sub, fontWeight: 600, marginTop: 1 }}>
              {r.sessions}セッション
            </div>
          </div>

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
