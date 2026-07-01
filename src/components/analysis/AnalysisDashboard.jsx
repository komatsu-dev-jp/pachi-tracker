import React, { useMemo, useRef, useState } from "react";
import {
  BarChart3,
  CalendarDays,
  CalendarRange,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Filter,
  LineChart as LineChartIcon,
  Share2,
  Sigma,
  Sparkles,
  Target,
  Wallet,
  X,
} from "lucide-react";
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  aggregateByDay,
  aggregateByMonth,
  aggregateByYear,
  filterArchives,
  getActualPL,
  getEvAmount,
  listAvailableMachines,
  listAvailableStores,
  machineRanking,
  summarize,
} from "./analysisSelectors";
import { CalendarTab } from "../Tabs";
import AnalyzerView from "./AnalyzerView";

// 表示の切替（月別/年別/通算/分析+）はヘッダーの期間ラベルをタップして開く
// プルダウンメニュー（VIEW_MENU）でまとめて選ぶ。
const VIEW_MENU = [
  { id: "month", label: "月別カレンダー", desc: "日別の収支ヒートマップ", Icon: CalendarDays },
  { id: "year", label: "年別", desc: "月ごとのパフォーマンス", Icon: CalendarRange },
  { id: "all", label: "通算", desc: "全期間の合計", Icon: Sigma },
  { id: "analyzer", label: "分析+", desc: "機種・店舗・グラフ分析", Icon: BarChart3 },
];

// 記録ゼロ時に表示するデモ用の日別収支（モックアップ準拠の表示値）。
// 本番では archives から実データを生成するため、ここは空状態のプレビュー専用。
const DEMO_DAYS = {
  1: { actual: -2000, ev: 0 },
  5: { actual: 10000, ev: 0 },
  14: { actual: -500, ev: 0 },
  15: { actual: 943, ev: 0 },
  17: { actual: 6937, ev: 0 },
  19: { actual: 3486, ev: 0 },
};

const DEMO_MACHINES = [
  { machineName: "スマスロ マギアレコード", hours: 6.5, spin: 19.7, evAmount: 2615, actualPL: 5406, winRate: 67 },
  { machineName: "eシン・エヴァンゲリオン", hours: 7.2, spin: 20.1, evAmount: 3200, actualPL: 2800, winRate: 50 },
  { machineName: "P大海物語5", hours: 3.4, spin: 18.2, evAmount: 1800, actualPL: -1250, winRate: 33 },
  { machineName: "東京喰種", hours: 4.1, spin: 17.9, evAmount: 2400, actualPL: -2900, winRate: 25 },
  { machineName: "北斗の拳 暴凶星", hours: 4.0, spin: 16.8, evAmount: 1300, actualPL: -4800, winRate: 25 },
];

const DEMO_STORES = [
  { storeName: "丸之内ヘリオス2000竹原", size: "大型店", spin: 19.7, ev: 18240, actual: 15920, days: 3 },
  { storeName: "BIG ROCKY北久米", size: "大型店", spin: 18.9, ev: 12530, actual: 10120, days: 2 },
  { storeName: "マルハン今治店", size: "大型店", spin: 17.6, ev: 4220, actual: 2910, days: 1 },
  { storeName: "ダイナム愛媛北条店", size: "中型店", spin: 16.4, ev: -3120, actual: -1880, days: 1 },
  { storeName: "BIG ROCKY堀江店", size: "中型店", spin: 15.8, ev: -5800, actual: -4220, days: 1 },
];

// 記録ゼロ時の「月次詳細」グラフ用デモ（2026年5月＝モック準拠）。
// dailyActual の累計を累計収支(actual)、evCum を累計期待値(ev)とする。プレビュー専用値。
const DEMO_TREND = (() => {
  const dailyActual = [
    -1500, -1800, -1700, 3000, -4500, -2500, -3000, 1500, -3500, -2500,
    3500, -2500, -1500, -1500, 3500, 2500, 3500, 5000, 5000, 4500,
    -2500, -2500, -3500, 5000, 3500, 3000, -2000, 1500, -1000, 500, -3080,
  ];
  const evCum = [
    800, -200, -1500, -800, -3000, -4500, -3000, -1500, -3500, -5000,
    -3000, -4500, -6000, -7000, -5500, -4500, -6000, -5000, -7000, -8500,
    -7000, -6500, -8000, -6500, -5500, -6500, -7500, -6000, -7000, -6500, -5800,
  ];
  let actual = 0;
  return dailyActual.map((delta, index) => {
    actual += delta;
    const ev = evCum[index];
    return { day: `5/${index + 1}`, actual, ev, diff: actual - ev };
  });
})();

const fmt = (value) => Math.round(Number(value) || 0).toLocaleString("ja-JP");
const signed = (value) => `${Number(value) > 0 ? "+" : ""}${fmt(value)}`;
const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];
const moneyClass = (value) => Number(value) >= 0 ? "text-[#25D366]" : "text-[#FF5B6E]";
const card = "rounded-[14px] border border-white/[0.09] bg-[linear-gradient(145deg,rgba(12,25,47,.98),rgba(5,13,27,.98))] shadow-[0_16px_45px_rgba(0,0,0,.34)]";
const label = "text-[11px] font-semibold tracking-[.04em] text-[#8090aa]";

function buildRealDays(archives, month) {
  return Object.fromEntries(
    aggregateByDay(archives, month).map((row) => [
      Number(row.date.slice(8, 10)),
      {
        actual: row.hasActual ? row.actualPL : 0,
        ev: row.evAmount,
        date: row.date,
      },
    ]),
  );
}

function buildStoreRanking(archives) {
  const rows = Array.isArray(archives) ? archives : [];
  const map = new Map();
  rows.forEach((entry) => {
    const name = entry.storeName || "店舗未設定";
    const current = map.get(name) || { storeName: name, ev: 0, actual: 0, days: new Set(), spinTotal: 0, spinCount: 0 };
    current.ev += getEvAmount(entry);
    current.actual += getActualPL(entry) || 0;
    if (entry.date) current.days.add(entry.date);
    const spin = Number(entry?.stats?.spinRate || entry?.stats?.kaitenPer1k || entry?.stats?.rotPer1k);
    if (Number.isFinite(spin) && spin > 0) {
      current.spinTotal += spin;
      current.spinCount += 1;
    }
    map.set(name, current);
  });
  return [...map.values()]
    .map((row) => ({
      ...row,
      size: "中型店",
      spin: row.spinCount ? row.spinTotal / row.spinCount : 0,
      days: row.days.size,
    }))
    .sort((a, b) => b.ev - a.ev)
    .slice(0, 5);
}

function buildTrend(dayMap, year, month) {
  let actual = 0;
  let ev = 0;
  const count = new Date(year, month, 0).getDate();
  return Array.from({ length: count }, (_, index) => {
    const day = index + 1;
    const row = dayMap[day];
    actual += row?.actual || 0;
    ev += row?.ev || 0;
    return { day: `${month}/${day}`, actual, ev, diff: actual - ev };
  });
}

function buildPeriodTrend(archives, periodTab, year, month, dayMap) {
  if (periodTab === "month") return buildTrend(dayMap, year, month);
  const source = periodTab === "year"
    ? aggregateByMonth(archives, String(year))
    : aggregateByYear(archives);
  let actual = 0;
  let ev = 0;
  return source.map((row) => {
    actual += row.actualPL || 0;
    ev += row.evAmount || 0;
    return {
      day: periodTab === "year" ? `${Number(row.month.slice(5))}月` : row.year,
      actual,
      ev,
      diff: actual - ev,
    };
  });
}

function buildPeriodRows(archives, periodTab, year) {
  if (periodTab === "year") {
    return aggregateByMonth(archives, String(year)).map((row) => ({
      key: row.month,
      label: `${Number(row.month.slice(5))}月`,
      actual: row.actualPL,
      ev: row.evAmount,
      days: row.days,
    }));
  }
  return aggregateByYear(archives).map((row) => ({
    key: row.year,
    label: `${row.year}年`,
    actual: row.actualPL,
    ev: row.evAmount,
    days: row.days,
  }));
}

function SectionTitle({ children, note, action }) {
  return (
    <div className="mb-2.5 flex items-center justify-between gap-2">
      <div className="min-w-0">
        <h2 className="text-[15px] font-black tracking-[.02em] text-white">{children}</h2>
        {note && <p className="mt-0.5 text-[10px] text-[#8090aa]">{note}</p>}
      </div>
      {action}
    </div>
  );
}

function ActionButton({ children, onClick, active = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[10px] font-bold transition ${
        active
          ? "border-[#16C8FF] bg-[#16C8FF]/10 text-[#16C8FF] shadow-[0_0_18px_rgba(22,200,255,.12)]"
          : "border-white/10 bg-[#081224] text-[#c4ccda] hover:border-[#16C8FF]/50"
      }`}
    >
      {children}
    </button>
  );
}

// 月別トップの4指標ストリップ（月収支 / 期待値 / 差 / 勝率）。
// モック準拠でアイコン・カードを廃し、罫線区切りの横並びテキストで情報密度を上げる。
// 値はすべて既存 summary から算出（計算ロジックには未介入）。
function MonthStatStrip({ actual, ev, diff, winRate }) {
  const items = [
    { label: "月収支", value: `${signed(actual)}円`, cls: moneyClass(actual) },
    { label: "期待値", value: `${signed(ev)}円`, cls: ev >= 0 ? "text-[#16C8FF]" : "text-[#ff637a]" },
    { label: "差", value: `${signed(diff)}円`, cls: moneyClass(diff) },
    { label: "勝率", value: `${winRate}%`, cls: "text-white" },
  ];
  return (
    <section className="grid grid-cols-4 border-b border-white/[0.08] pb-4">
      {items.map((item, index) => (
        <div key={item.label} className={`min-w-0 px-1 text-center ${index > 0 ? "border-l border-white/[0.08]" : ""}`}>
          <div className="truncate text-[11px] font-semibold text-[#8090aa]">{item.label}</div>
          <div className={`mt-1.5 whitespace-nowrap font-mono text-[clamp(14px,4.2vw,18px)] font-black tracking-[-.04em] tabular-nums ${item.cls}`}>{item.value}</div>
        </div>
      ))}
    </section>
  );
}

function SummaryHero({ summary, isDemo, heroTitle = "月間収支" }) {
  const actual = isDemo ? -12130 : summary.totalRealPL;
  const ev = isDemo ? 3120 : summary.evAmount;
  const winRate = isDemo ? 60 : Math.round(summary.winRate || 0);
  const days = isDemo ? 7 : (summary.days || 0);
  return (
    <section className={`${card} overflow-hidden p-3.5`}>
      <div className={label}>{heroTitle}</div>
      <div className={`mt-0.5 flex items-end font-mono ${moneyClass(actual)}`}>
        <strong className="text-[42px] font-black leading-none tracking-[-.055em]">{signed(actual)}</strong>
        <span className="mb-1 ml-1.5 text-[15px] font-bold">円</span>
      </div>
      <div className="mt-3 grid grid-cols-3 border-t border-white/[0.08] pt-2.5">
        <div className="min-w-0">
          <div className={label}>期待値</div>
          <div className="mt-0.5 whitespace-nowrap font-mono text-[16px] font-black text-[#16C8FF]">{signed(ev)}<span className="text-[9px]">円</span></div>
        </div>
        <div className="min-w-0 border-l border-white/[0.08] pl-3">
          <div className={label}>勝率</div>
          <div className="mt-0.5 whitespace-nowrap font-mono text-[16px] font-black text-white">{winRate}<span className="text-[9px]">%</span></div>
        </div>
        <div className="min-w-0 border-l border-white/[0.08] pl-3">
          <div className={label}>稼働日数</div>
          <div className="mt-0.5 whitespace-nowrap font-mono text-[16px] font-black text-white">{days}<span className="text-[9px]">日</span></div>
        </div>
      </div>
    </section>
  );
}

function Kpis({ summary, isDemo }) {
  const workHours = summary.workHours || 0;
  const hourly = workHours > 0 ? Math.round((summary.totalRealPL || 0) / workHours) : 0;
  const values = [
    { icon: LineChartIcon, title: "期待値", value: isDemo ? "+3,120" : signed(summary.evAmount), unit: "円", positive: true },
    { icon: Sparkles, title: "平均回転率", value: isDemo ? "27.2" : "—", unit: "回/k" },
    { icon: Wallet, title: "時給", value: isDemo ? "-2,378" : (workHours > 0 ? signed(hourly) : "—"), unit: "円/h", positive: isDemo ? false : hourly >= 0 },
    { icon: Target, title: "勝率", value: isDemo ? "60" : Math.round(summary.winRate || 0), unit: "%", sub: isDemo ? "(3/5)" : "" },
    { icon: Clock3, title: "稼働時間", value: isDemo ? "5.1" : workHours.toFixed(1), unit: "時間" },
  ];
  return (
    <section className={`${card} grid grid-cols-2 overflow-hidden`}>
      {values.map((item, index) => (
        <div
          key={item.title}
          className={`flex min-h-[62px] min-w-0 flex-col items-center justify-center px-2 py-3 ${
            index === values.length - 1 ? "col-span-2" : ""
          } ${index % 2 === 1 ? "border-l border-white/[0.08]" : ""} ${index >= 2 ? "border-t border-white/[0.08]" : ""}`}
        >
          <div className="flex items-center gap-1">
            <item.icon className="h-3.5 w-3.5 text-[#5e9df7]" />
            <span className="truncate text-[9px] text-[#8390a7]">{item.title}</span>
          </div>
          <div className={`mt-1.5 whitespace-nowrap font-mono text-[18px] font-black ${item.positive ? "text-[#25D366]" : "text-white"}`}>
            {item.value}<span className="ml-0.5 text-[9px]">{item.unit}</span>
          </div>
          {item.sub && <span className="mt-0.5 text-[8px] text-[#6880a4]">{item.sub}</span>}
        </div>
      ))}
    </section>
  );
}

function CalendarCell({ day, row, selected, weekday, onSelect }) {
  // 角丸の独立セル＋ヒートカラー（緑＝プラス / 赤＝マイナス）。境界線も色味を合わせる。
  const amount = Number(row?.actual);
  const hasAmount = row && amount !== 0;
  let heat = "bg-[#0e1a2e] border-white/[0.05]";
  if (amount >= 1000) heat = "bg-[#123a2b] border-[#1f7a52]/45";
  else if (amount > 0) heat = "bg-[#0f2a22] border-[#1f7a52]/30";
  else if (amount <= -1000) heat = "bg-[#3a1620] border-[#8a2438]/50";
  else if (amount < 0) heat = "bg-[#281620] border-[#8a2438]/35";
  // 日付色：稼働日は損益色、未稼働は曜日色（日＝赤 / 土＝青）。選択中は白で強調。
  const dayColor = selected
    ? "text-white"
    : hasAmount
      ? (amount >= 0 ? "text-[#3fe0a0]" : "text-[#ff7a8a]")
      : weekday === 0
        ? "text-[#ff7a8a]"
        : weekday === 6
          ? "text-[#6ea8ff]"
          : "text-[#c4cdde]";
  return (
    <button
      type="button"
      onClick={() => row && onSelect(day)}
      className={`relative flex aspect-square min-w-0 flex-col items-start overflow-hidden rounded-[8px] border px-1.5 pb-1 pt-1 transition ${heat} ${
        selected ? "z-10 border-[#16C8FF] shadow-[0_0_0_1.5px_#16C8FF,0_0_14px_rgba(22,200,255,.55)]" : ""
      }`}
    >
      {/* 日付は左上。金額は日付の下に配置（「k」を使わず実額・等幅・詰め字で枠内に収める）。 */}
      <span className={`text-[11px] font-bold leading-none ${dayColor}`}>{day}</span>
      {hasAmount && (
        <span className={`mt-auto w-full text-center font-mono text-[8.5px] font-black leading-none tracking-[-.05em] tabular-nums ${moneyClass(amount)}`}>{signed(amount)}</span>
      )}
    </button>
  );
}

function DayDetail({ dateLabel, row, onEditRecords }) {
  const detail = row || {};
  const actual = Number(detail.actual) || 0;
  const ev = Number(detail.ev) || 0;
  const diffVal = actual - ev;
  // 稼働時間は日別集計（dayMap）に含まれないため、未連携時は「—」を表示（将来連携予定）。
  const hours = Number(detail.hours) || 0;
  const stats = [
    { label: "実収支", value: `${signed(actual)}円`, cls: moneyClass(actual) },
    { label: "期待値", value: `${signed(ev)}円`, cls: ev >= 0 ? "text-[#16C8FF]" : "text-[#ff637a]" },
    { label: "差", value: `${signed(diffVal)}円`, cls: moneyClass(diffVal) },
    { label: "稼働時間", value: hours > 0 ? `${hours.toFixed(1)}時間` : "—", cls: "text-white" },
  ];
  return (
    <section className={`${card} p-4`}>
      <div className="text-[15px] font-black text-white">{dateLabel}</div>
      {/* 実収支 / 期待値 / 差 / 稼働時間（4列・モック準拠）。 */}
      <div className="mt-3 grid grid-cols-4 gap-1.5 border-t border-white/[0.08] pt-3">
        {stats.map((s) => (
          <div key={s.label} className="min-w-0">
            <div className="truncate text-[10px] text-[#8090aa]">{s.label}</div>
            <div className={`mt-1.5 whitespace-nowrap font-mono text-[clamp(11px,3.2vw,13px)] font-black leading-none tracking-[-.04em] tabular-nums ${s.cls}`}>{s.value}</div>
          </div>
        ))}
      </div>
      {/* 記録の編集・削除は既存のカレンダー記録エディタ（CalendarTab）へ該当日で遷移する唯一の導線として残置。 */}
      <button type="button" onClick={onEditRecords} className="mt-3 flex h-10 w-full items-center justify-center gap-1.5 rounded-lg border border-white/[0.10] bg-[#0a1528] text-[11px] font-bold text-[#aab6ca]">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
        </svg>
        記録を編集
      </button>
    </section>
  );
}

function CalendarLegend() {
  return (
    <div className="ml-auto flex shrink-0 items-center gap-1.5 text-[9px] text-[#9aa6bb]">
      <span className="flex items-center gap-0.5"><i className="inline-block h-1.5 w-1.5 rounded-[2px] bg-[#1f7a52]" />プラス</span>
      <span className="flex items-center gap-0.5"><i className="inline-block h-1.5 w-1.5 rounded-[2px] bg-[#2a3550]" />±0</span>
      <span className="flex items-center gap-0.5"><i className="inline-block h-1.5 w-1.5 rounded-[2px] bg-[#8a2438]" />マイナス</span>
    </div>
  );
}

function CalendarPanel({ dayMap, selectedDay, setSelectedDay, year, month }) {
  // 月の初日曜日と日数から正しいグリッドを生成する（固定px・固定30日を避ける）。
  const blanks = new Date(year, month - 1, 1).getDay();
  const count = new Date(year, month, 0).getDate();
  const cells = [...Array(blanks).fill(null), ...Array.from({ length: count }, (_, i) => i + 1)];
  return (
    <section className={`${card} p-3.5`}>
      {/* 見出し＋凡例。狭い端末では凡例が次行へ折り返し（flex-wrap）、枠外にはみ出さない。 */}
      <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1">
        <div className="flex shrink-0 items-center gap-2">
          <CalendarDays className="h-5 w-5 shrink-0 text-[#16C8FF]" />
          <h2 className="text-[14px] font-black tracking-[.02em] text-white">日別ヒートマップ</h2>
        </div>
        <CalendarLegend />
      </div>
      {/* 曜日見出し。日曜は赤系・土曜は青系。セルと同じ7列・同じ余白で整列。 */}
      <div className="grid grid-cols-7 gap-1 px-0.5 text-center text-[11px] font-bold text-[#9aa6bb]">
        {WEEKDAYS.map((day, index) => (
          <span key={day} className={index === 0 ? "text-[#ff7a8a]" : index === 6 ? "text-[#6ea8ff]" : ""}>{day}</span>
        ))}
      </div>
      {/* 角丸の独立セルを gap で並べる（選択日はシアンのグロー枠）。 */}
      <div className="mt-1.5 grid grid-cols-7 gap-1">
        {cells.map((day, index) => day
          ? (
            <CalendarCell
              key={day}
              day={day}
              row={dayMap[day]}
              selected={day === selectedDay}
              weekday={new Date(year, month - 1, day).getDay()}
              onSelect={setSelectedDay}
            />
          )
          : <div key={`blank-${index}`} className="aspect-square rounded-[8px] bg-white/[0.015]" />)}
      </div>
    </section>
  );
}

function PeriodBreakdownPanel({ periodTab, rows, isDemo }) {
  const displayRows = rows.length > 0
    ? rows
    : isDemo
      ? [{ key: "demo", label: periodTab === "year" ? "6月" : "2026年", actual: -12130, ev: 3120, days: 7 }]
      : [];
  return (
    <section className={`${card} p-3`}>
      <SectionTitle note="実収支｜期待値｜稼働日数">
        {periodTab === "year" ? "月別パフォーマンス" : "年別パフォーマンス"}
      </SectionTitle>
      {displayRows.length === 0 ? (
        <div className="py-10 text-center text-[10px] text-[#8090aa]">対象期間の記録がありません</div>
      ) : (
        <div className="grid grid-cols-3 gap-1.5">
          {displayRows.map((row) => (
            <div key={row.key} className="rounded-lg border border-white/[0.08] bg-[#0a1528] p-2.5">
              <div className="text-[10px] font-black text-white">{row.label}</div>
              <div className={`mt-2 font-mono text-[13px] font-black ${moneyClass(row.actual)}`}>{signed(row.actual)}円</div>
              <div className="mt-1 font-mono text-[9px] font-bold text-[#16C8FF]">期待値 {signed(row.ev)}円</div>
              <div className="mt-2 text-[8px] text-[#8090aa]">稼働 {row.days || 0}日</div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function TrendPanel({ data }) {
  return (
    <section className={`${card} overflow-hidden`}>
      <div className="p-2.5">
        <SectionTitle>収支推移グラフ</SectionTitle>
        <div className="h-[220px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 4, right: 3, bottom: 0, left: -22 }}>
              <CartesianGrid stroke="rgba(255,255,255,.07)" vertical={false} />
              <XAxis dataKey="day" tick={{ fill: "#8794a9", fontSize: 7 }} tickLine={false} axisLine={false} interval={6} />
              <YAxis tick={{ fill: "#8794a9", fontSize: 7 }} tickLine={false} axisLine={false} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
              <ReferenceLine y={0} stroke="rgba(255,255,255,.18)" />
              <Tooltip
                contentStyle={{ background: "#071326", border: "1px solid rgba(255,255,255,.12)", borderRadius: 8, fontSize: 9 }}
                formatter={(value) => `${signed(value)}円`}
              />
              <Legend iconSize={7} wrapperStyle={{ fontSize: 8 }} />
              <Line type="monotone" dataKey="actual" name="実収支" stroke="#25D366" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="ev" name="期待値" stroke="#16C8FF" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="diff" name="差異" stroke="#8794a9" strokeDasharray="4 4" strokeWidth={1.2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </section>
  );
}

function MachinePanel({ rows, sortMode, setSortMode }) {
  const sorted = [...rows].sort((a, b) => sortMode === "spin" ? b.spin - a.spin : b.evAmount - a.evAmount);
  return (
    <section className={`${card} p-2.5`}>
      <SectionTitle
        action={<button className="text-[8px] font-bold text-[#16C8FF]">すべて見る</button>}
      >
        機種ランキング <span className="text-[8px] font-normal text-[#a0aec0]">（{sortMode === "spin" ? "回転率順" : "期待値順"}）</span>
      </SectionTitle>
      <div className="grid grid-cols-[22px_1fr_38px_38px_50px_50px_32px] gap-1 border-b border-white/[0.08] pb-1.5 text-right text-[8px] text-[#75839a]">
        <span className="text-left">順位</span><span className="text-left">機種名</span><span>時間</span><span>回転率</span><span>期待値</span><span>実収支</span><span>勝率</span>
      </div>
      {sorted.slice(0, 5).map((row, index) => (
        <div key={row.machineName} className="grid grid-cols-[22px_1fr_38px_38px_50px_50px_32px] items-center gap-1 border-b border-white/[0.06] py-2.5 text-right font-mono text-[9px]">
          <span className={`text-left font-black ${index === 0 ? "text-[#FFC83D]" : index === 1 ? "text-[#c5cedd]" : index === 2 ? "text-[#f08a45]" : "text-white"}`}>{index < 3 ? "♛" : index + 1}</span>
          <span className="truncate text-left font-sans font-bold text-white">{row.machineName}</span>
          <span className="text-[#c0cad9]">{row.hours || "—"}h</span>
          <span className="text-[#c0cad9]">{row.spin || "—"}</span>
          <span className="font-bold text-[#25D366]">{signed(row.evAmount)}</span>
          <span className={`font-bold ${moneyClass(row.actualPL)}`}>{signed(row.actualPL)}</span>
          <span className="text-[#c0cad9]">{row.winRate || 0}%</span>
        </div>
      ))}
      <div className="mt-2 flex gap-3 text-[7px]">
        <button type="button" onClick={() => setSortMode("ev")} className={sortMode === "ev" ? "text-[#16C8FF]" : "text-[#8794a9]"}>▶ 期待値順</button>
        <button type="button" onClick={() => setSortMode("spin")} className={sortMode === "spin" ? "text-[#16C8FF]" : "text-[#8794a9]"}>回転率順</button>
      </div>
    </section>
  );
}

function StorePanel({ rows }) {
  return (
    <section className={`${card} p-2.5`}>
      <SectionTitle action={<button className="text-[8px] font-bold text-[#16C8FF]">すべて見る</button>}>
        店舗ランキング <span className="text-[8px] font-normal text-[#a0aec0]">（期待値順）</span>
      </SectionTitle>
      <div className="grid grid-cols-[22px_1fr_40px_38px_50px_50px_28px] gap-1 border-b border-white/[0.08] pb-1.5 text-right text-[8px] text-[#75839a]">
        <span className="text-left">順位</span><span className="text-left">店舗名</span><span>規模</span><span>回転率</span><span>期待値</span><span>実収支</span><span>日</span>
      </div>
      {rows.slice(0, 5).map((row, index) => (
        <div key={row.storeName} className="grid grid-cols-[22px_1fr_40px_38px_50px_50px_28px] items-center gap-1 border-b border-white/[0.06] py-2.5 text-right font-mono text-[9px]">
          <span className={`text-left font-black ${index === 0 ? "text-[#FFC83D]" : index === 1 ? "text-[#c5cedd]" : index === 2 ? "text-[#f08a45]" : "text-white"}`}>{index < 3 ? "♛" : index + 1}</span>
          <span className="truncate text-left font-sans font-bold text-white">{row.storeName}</span>
          <span className="font-sans text-[#c0cad9]">{row.size}</span>
          <span className="text-[#c0cad9]">{row.spin?.toFixed?.(1) || row.spin}</span>
          <span className={`font-bold ${moneyClass(row.ev)}`}>{signed(row.ev)}</span>
          <span className={`font-bold ${moneyClass(row.actual)}`}>{signed(row.actual)}</span>
          <span className="text-[#c0cad9]">{row.days}</span>
        </div>
      ))}
    </section>
  );
}

function ShareCTA({ onShare, title = "今月の結果を共有", subtitle = "月間収支カードをSNSに投稿できます" }) {
  return (
    <section className={`${card} flex items-center gap-3 p-4`}>
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-[#16C8FF]/40 bg-[#16C8FF]/10">
        <Share2 className="h-6 w-6 text-[#16C8FF]" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[14px] font-black text-white">{title}</div>
        <p className="mt-0.5 text-[11px] text-[#8090aa]">{subtitle}</p>
      </div>
      <button type="button" onClick={onShare} className="h-12 shrink-0 rounded-lg border border-[#16C8FF]/70 bg-[#16C8FF]/10 px-4 text-[13px] font-black text-[#16C8FF]">
        SNSカード作成
      </button>
    </section>
  );
}

function FilterPanel({ stores, machines, filters, setFilters, onClose }) {
  return (
    <div className={`${card} mb-2 grid gap-2 p-3 sm:grid-cols-2`}>
      <div>
        <label className={label}>店舗</label>
        <select value={filters.storeName || ""} onChange={(e) => setFilters({ ...filters, storeName: e.target.value })} className="mt-1 h-9 w-full rounded-md border border-white/10 bg-[#071326] px-2 text-[10px] text-white">
          <option value="">すべての店舗</option>
          {stores.map((store) => <option key={store} value={store}>{store}</option>)}
        </select>
      </div>
      <div>
        <label className={label}>機種</label>
        <select value={filters.machineName || ""} onChange={(e) => setFilters({ ...filters, machineName: e.target.value })} className="mt-1 h-9 w-full rounded-md border border-white/10 bg-[#071326] px-2 text-[10px] text-white">
          <option value="">すべての機種</option>
          {machines.map((machine) => <option key={machine} value={machine}>{machine}</option>)}
        </select>
      </div>
      <button type="button" onClick={onClose} className="text-left text-[9px] font-bold text-[#16C8FF]">絞り込みを閉じる</button>
    </div>
  );
}

// SNS共有用のカード（モーダル）。テキストとレイアウトのみで魅せる上品な明色カード。
// 機種画像・店舗画像などの著作権素材は使わない。
function ShareMiniCalendar({ year, month, dayMap }) {
  const blanks = new Date(year, month - 1, 1).getDay();
  const count = new Date(year, month, 0).getDate();
  const cells = [...Array(blanks).fill(null), ...Array.from({ length: count }, (_, i) => i + 1)];
  const moneyTone = (value) => Number(value) >= 0 ? "text-[#1a8f4c]" : "text-[#d6394c]";
  const heatTone = (value) => {
    if (value >= 10000) return "bg-[#d6f3e0]";
    if (value >= 1000) return "bg-[#e9f7ee]";
    if (value <= -10000) return "bg-[#fbdfe3]";
    if (value <= -1000) return "bg-[#fdecee]";
    return "bg-[#f4f4f2]";
  };
  return (
    <div className="mt-5 grid grid-cols-7 gap-[3px]">
      {WEEKDAYS.map((day) => (
        <span key={day} className="pb-0.5 text-center text-[7px] font-bold text-[#9aa3b2]">{day}</span>
      ))}
      {cells.map((day, index) => {
        if (!day) return <div key={`blank-${index}`} />;
        const row = dayMap[day];
        const hasAmount = row && Number(row.actual) !== 0;
        return (
          <div key={day} className={`flex min-h-[26px] flex-col rounded-[4px] px-0.5 py-0.5 ${row ? heatTone(row.actual) : "bg-[#f6f6f4]"}`}>
            <span className="text-[7px] font-bold leading-none text-[#5b6475]">{day}</span>
            {hasAmount && (
              <span className={`mt-auto text-center font-mono text-[6px] font-black leading-none tracking-[-.02em] ${moneyTone(row.actual)}`}>{signed(row.actual)}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ShareCard({ year, month, actual, ev, winRate, days, dayMap, onClose }) {
  const mainTone = actual >= 0 ? "text-[#1a8f4c]" : "text-[#d6394c]";
  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/80 p-5 backdrop-blur-md" onClick={onClose}>
      <div className="w-full max-w-[340px]" onClick={(event) => event.stopPropagation()}>
        <div className="relative overflow-hidden rounded-[20px] border border-black/[0.06] bg-[#fbfbf9] p-6 text-[#1c2230] shadow-[0_30px_90px_rgba(0,0,0,.55)]">
          <button type="button" onClick={onClose} className="absolute right-4 top-4 text-[#aab0bd]"><X className="h-5 w-5" /></button>
          <div className="text-center">
            <div className="font-serif text-[15px] tracking-[.12em] text-[#2c3444]">{year}年{month}月</div>
            <div className="mt-4 text-[10px] font-bold tracking-[.24em] text-[#9aa3b2]">実質収支</div>
            <div className={`mt-1 font-mono text-[34px] font-black tracking-[-.03em] ${mainTone}`}>{signed(actual)}円</div>
          </div>
          <div className="mt-5 grid grid-cols-3 rounded-2xl border border-black/[0.06] bg-white py-3">
            <div className="px-2 text-center">
              <div className="text-[8px] font-bold tracking-[.06em] text-[#9aa3b2]">期待値</div>
              <div className="mt-1 font-mono text-[13px] font-black text-[#1a8f4c]">{signed(ev)}<span className="text-[8px]">円</span></div>
            </div>
            <div className="border-l border-black/[0.06] px-2 text-center">
              <div className="text-[8px] font-bold tracking-[.06em] text-[#9aa3b2]">勝率</div>
              <div className="mt-1 font-mono text-[13px] font-black text-[#2c3444]">{winRate}<span className="text-[8px]">%</span></div>
            </div>
            <div className="border-l border-black/[0.06] px-2 text-center">
              <div className="text-[8px] font-bold tracking-[.06em] text-[#9aa3b2]">稼働</div>
              <div className="mt-1 font-mono text-[13px] font-black text-[#2c3444]">{days}<span className="text-[8px]">日</span></div>
            </div>
          </div>
          <ShareMiniCalendar year={year} month={month} dayMap={dayMap} />
          <div className="mt-5 text-center text-[10px] font-black tracking-[.28em] text-[#aab0bd]">PachiTracker</div>
        </div>
        <button type="button" onClick={onClose} className="mt-3 h-11 w-full rounded-xl bg-[#16C8FF] text-[12px] font-black text-[#03101c]">カードを閉じる</button>
      </div>
    </div>
  );
}

// 月間サマリー詳細の統計1項目（ラベル＋値のピル）。値が無い項目は「—」。
function SummaryStat({ label, value, cls = "text-white" }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg bg-white/[0.04] px-3 py-2.5">
      <span className="shrink-0 text-[11px] text-[#8090aa]">{label}</span>
      <span className={`min-w-0 truncate text-right font-mono text-[14px] font-black tabular-nums ${cls}`}>{value}</span>
    </div>
  );
}

// 月次詳細の本文（ヘッダーの「月次詳細」ボタンで月別カレンダーと切り替える）。
// 収支グラフ（日別バー＋累計ライン）＋成績＋統計をページ内に表示する（モック準拠：同一画面の切替）。
function MonthDetailContent({ chartData, score, stats }) {
  return (
    <>
      {/* 今月の収支グラフ：日別収支バー＋累計収支ライン＋累計期待値ライン。 */}
      <section className={`${card} overflow-hidden p-3`}>
        <SectionTitle>今月の収支グラフ</SectionTitle>
        <div className="h-[210px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 6, right: 4, bottom: 0, left: -18 }}>
              <CartesianGrid stroke="rgba(255,255,255,.07)" vertical={false} />
              <XAxis dataKey="day" tick={{ fill: "#8794a9", fontSize: 8 }} tickLine={false} axisLine={false} interval={6} />
              <YAxis tick={{ fill: "#8794a9", fontSize: 8 }} tickLine={false} axisLine={false} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
              <ReferenceLine y={0} stroke="rgba(255,255,255,.2)" />
              <Tooltip contentStyle={{ background: "#071326", border: "1px solid rgba(255,255,255,.12)", borderRadius: 8, fontSize: 10 }} formatter={(value) => `${signed(value)}円`} />
              <Legend iconSize={8} wrapperStyle={{ fontSize: 9 }} />
              <Bar dataKey="daily" name="日別収支" radius={[2, 2, 0, 0]} maxBarSize={12}>
                {chartData.map((d, i) => <Cell key={i} fill={d.daily >= 0 ? "#16C8FF" : "#ff637a"} />)}
              </Bar>
              <Line type="monotone" dataKey="cum" name="累計収支" stroke="#16C8FF" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="cumEv" name="累計期待値" stroke="#FF9F45" strokeWidth={1.6} strokeDasharray="4 3" dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </section>
      {/* 今月の成績（実質総収支）。 */}
      <section className={`${card} flex items-center justify-between gap-3 p-4`}>
        <div className="text-[15px] font-black text-white">今月の成績</div>
        <div className={`whitespace-nowrap font-mono text-[30px] font-black leading-none tracking-[-.04em] tabular-nums ${moneyClass(score)}`}>{signed(score)}<span className="ml-1 text-[13px]">円</span></div>
      </section>
      {/* 統計グリッド（2列）。期待値系は未連携のため「—」表示。 */}
      <div className="grid grid-cols-2 gap-2">
        {stats.map((s) => <SummaryStat key={s.label} label={s.label} value={s.value} cls={s.cls} />)}
      </div>
    </>
  );
}

// 画面ヘッダー。左に前の月（‹）、中央に期間ラベル（タップで表示切替メニュー）＋次の月（›）、
// 右端に「月次詳細」トグルボタン（月別のみ）。期間ラベルのタップで月別/年別/通算/分析+ を切り替える。
function HeaderBar({ title, onPrev, onNext, navDisabled, onTitleTap, menuOpen, current, onSelect, onToggleDetail, detailActive }) {
  const hasNav = Boolean(onPrev && onNext);
  return (
    <div className="relative z-40 mb-3 flex h-12 shrink-0 items-center justify-between">
      {/* 左：前の月（カレンダーのフリックと併存）。 */}
      {hasNav ? (
        <button type="button" onClick={onPrev} disabled={navDisabled} aria-label="前へ" className="flex h-10 w-10 items-center justify-center rounded-xl text-[#aab6ca] disabled:opacity-20">
          <ChevronLeft className="h-6 w-6" />
        </button>
      ) : <span className="h-10 w-10 shrink-0" />}

      {/* 中央：期間ラベル（タップで表示切替メニュー）＋次の月（絶対配置で中央寄せ）。 */}
      <div className="absolute left-1/2 flex -translate-x-1/2 items-center gap-1">
        <button type="button" onClick={onTitleTap} className="flex items-center gap-1 rounded-lg px-1.5 py-0.5" aria-label={`${title} 表示を切り替える`} aria-expanded={menuOpen}>
          <h1 className="whitespace-nowrap text-[21px] font-black tracking-[.01em] text-white">{title}</h1>
          {onTitleTap && <ChevronDown className={`h-3.5 w-3.5 text-[#7d93b7] transition ${menuOpen ? "rotate-180" : ""}`} />}
        </button>
        {hasNav && (
          <button type="button" onClick={onNext} disabled={navDisabled} aria-label="次へ" className="flex h-7 w-7 items-center justify-center rounded-lg text-[#aab6ca] disabled:opacity-20">
            <ChevronRight className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* 右：月次詳細トグル（月別のみ）。押すとカレンダーと月次詳細を同一画面で切り替える。 */}
      {onToggleDetail ? (
        <button
          type="button"
          onClick={onToggleDetail}
          aria-pressed={detailActive}
          className={`flex h-10 shrink-0 items-center gap-1.5 rounded-xl border px-3 text-[12px] font-bold transition ${
            detailActive
              ? "border-[#16C8FF] bg-[#16C8FF]/12 text-[#16C8FF] shadow-[0_0_18px_rgba(22,200,255,.18)]"
              : "border-white/12 bg-[#0b1528] text-[#c4ccda]"
          }`}
        >
          <BarChart3 className="h-[18px] w-[18px]" />
          月次詳細
        </button>
      ) : <span className="h-10 w-10 shrink-0" />}

      {menuOpen && <HeaderMenu current={current} onSelect={onSelect} />}
    </div>
  );
}

// ハンバーガーから開くプルダウン。月別/年別/通算/分析+ を選んで切り替える。
function HeaderMenu({ current, onSelect }) {
  return (
    <div className="hdr-menu-pop absolute left-1/2 top-[calc(100%+8px)] z-50 w-60 -translate-x-1/2 overflow-hidden rounded-2xl border border-white/10 bg-[#0b1424] p-1.5 shadow-[0_18px_50px_rgba(0,0,0,.6)]">
      {VIEW_MENU.map((item) => {
        const active = current === item.id;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(item.id)}
            className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition ${
              active ? "bg-[#16C8FF]/12" : "hover:bg-white/[0.05]"
            }`}
          >
            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${active ? "border-[#16C8FF]/50 bg-[#16C8FF]/15 text-[#16C8FF]" : "border-white/10 bg-[#13233e] text-[#5e9df7]"}`}>
              <item.Icon className="h-[18px] w-[18px]" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[14px] font-black text-white">{item.label}</span>
              <span className="block truncate text-[10px] text-[#8090aa]">{item.desc}</span>
            </span>
            {active && <Check className="h-4 w-4 shrink-0 text-[#16C8FF]" />}
          </button>
        );
      })}
    </div>
  );
}

export default function AnalysisDashboard({
  S,
  onReset,
  periodTab: externalPeriodTab,
  onChangePeriodTab,
  filters: externalFilters,
  onChangeFilters,
}) {
  const archives = useMemo(() => Array.isArray(S?.archives) ? S.archives : [], [S]);
  const isDemo = archives.length === 0;
  const [internalTab, setInternalTab] = useState("month");
  const rawPeriodTab = externalPeriodTab || internalTab;
  // 旧上位タブ「カレンダー」(記録エディタ単独タブ)の永続値は廃止。月別として扱う。
  const periodTab = rawPeriodTab === "calendar" ? "month" : rawPeriodTab;
  const setPeriodTab = onChangePeriodTab || setInternalTab;
  const [internalFilters, setInternalFilters] = useState({ storeName: "", machineName: "", dateStart: "", dateEnd: "", weekdays: [] });
  const filters = externalFilters || internalFilters;
  const setFilters = onChangeFilters || setInternalFilters;
  const [filterOpen, setFilterOpen] = useState(false);
  const [selectedDay, setSelectedDay] = useState(14);
  const [sortMode, setSortMode] = useState("ev");
  const [shareOpen, setShareOpen] = useState(false);
  const [monthOffset, setMonthOffset] = useState(0);
  // ヘッダーの期間ラベルをタップで開くプルダウンの開閉。月別/年別/通算/分析+ の切替導線。
  const [viewMenuOpen, setViewMenuOpen] = useState(false);
  // 月別画面の「月次詳細」表示トグル（false=カレンダー / true=収支グラフ＋成績）。
  const [detailView, setDetailView] = useState(false);
  // 月送り遷移の向き（next=左スワイプ/prev=右スワイプ/fade=メニュー切替）。CSSアニメーション用。
  const [slideDir, setSlideDir] = useState("fade");
  // 記録エディタ（CalendarTab）を該当日で開くためのサブ画面状態（null=非表示 / "YYYY-MM-DD"）。
  const [recordsDay, setRecordsDay] = useState(null);
  // スワイプ判定用のタッチ開始座標。
  const touchRef = useRef({ x: 0, y: 0, active: false });

  // 表示メニューから期間/分析を選択（選択後はメニューを閉じる。切替はフェード遷移）。
  // 月別以外へ移ると月次詳細トグルは意味を持たないため false に戻す。
  const handleSelectView = (id) => {
    setSlideDir("fade");
    setPeriodTab(id);
    setDetailView(false);
    setViewMenuOpen(false);
  };

  // 月次詳細トグル（カレンダー⇄収支グラフ＋成績）。切替はフェード遷移。
  const toggleDetailView = () => {
    setSlideDir("fade");
    setDetailView((value) => !value);
  };

  // 期間を前後へ送る（カレンダーのフリック/スワイプで月送り）。通算は移動なし。
  const goPeriod = (delta) => {
    if (periodTab === "all" || delta === 0) return;
    const step = periodTab === "year" ? 12 : 1;
    setSlideDir(delta > 0 ? "next" : "prev");
    setMonthOffset((value) => value + delta * step);
  };

  // 横スワイプ（フリック）で月送り。縦スクロールを阻害しないよう横優勢時のみ反応。
  const onSwipeStart = (event) => {
    const point = event.touches?.[0];
    if (!point) return;
    touchRef.current = { x: point.clientX, y: point.clientY, active: true };
  };
  const onSwipeEnd = (event) => {
    if (!touchRef.current.active) return;
    touchRef.current.active = false;
    const point = event.changedTouches?.[0];
    if (!point) return;
    const dx = point.clientX - touchRef.current.x;
    const dy = point.clientY - touchRef.current.y;
    if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.2) {
      goPeriod(dx < 0 ? 1 : -1); // 左スワイプ＝次の月へ / 右スワイプ＝前の月へ
    }
  };

  const baseDate = isDemo ? new Date(2026, 4, 1) : new Date();
  const shownDate = new Date(baseDate.getFullYear(), baseDate.getMonth() + monthOffset, 1);
  const year = shownDate.getFullYear();
  const month = shownDate.getMonth() + 1;
  const monthKey = `${year}-${String(month).padStart(2, "0")}`;
  const periodFilters = useMemo(() => {
    if (periodTab === "month") return { month: monthKey };
    if (periodTab === "year") return { year: String(year) };
    return {};
  }, [monthKey, periodTab, year]);
  const filtered = useMemo(
    () => filterArchives(archives, { ...filters, ...periodFilters }),
    [archives, filters, periodFilters],
  );
  const summary = useMemo(() => summarize(filtered), [filtered]);
  const dayMap = useMemo(() => isDemo ? DEMO_DAYS : buildRealDays(filtered, monthKey), [filtered, isDemo, monthKey]);
  const trend = useMemo(
    () => isDemo ? DEMO_TREND : buildPeriodTrend(filtered, periodTab, year, month, dayMap),
    [dayMap, filtered, isDemo, month, periodTab, year],
  );
  const periodRows = useMemo(
    () => buildPeriodRows(filterArchives(archives, filters), periodTab, year),
    [archives, filters, periodTab, year],
  );
  const machines = useMemo(() => {
    if (isDemo) return DEMO_MACHINES;
    return machineRanking(filtered, { limit: 5 }).map((row) => ({
      ...row,
      hours: "—",
      spin: Number(row.spinRate || 0),
      winRate: row.sessions ? Math.round(((row.actualPL > 0 ? 1 : 0) / row.sessions) * 100) : 0,
    }));
  }, [filtered, isDemo]);
  const stores = useMemo(() => isDemo ? DEMO_STORES : buildStoreRanking(filtered), [filtered, isDemo]);
  const storeOptions = useMemo(() => listAvailableStores(archives), [archives]);
  const machineOptions = useMemo(() => listAvailableMachines(archives), [archives]);
  const actual = isDemo ? -11704 : summary.totalRealPL;
  const ev = isDemo ? 2934 : summary.evAmount;
  const winRate = isDemo ? 67 : Math.round(summary.winRate || 0);
  const days = isDemo ? 8 : (summary.days || 0);
  // 月別ストリップの「差」（＝実収支−期待値）。既存 summary から算出・logic非変更。
  const monthDiff = isDemo ? -14638 : ((summary.totalRealPL || 0) - (summary.evAmount || 0));
  const heroTitle = periodTab === "month" ? "月間収支" : periodTab === "year" ? "年間収支" : "通算収支";
  // ヘッダー中央に出す現在の期間/分析ラベル。
  const headerTitle = periodTab === "month"
    ? `${year}年${month}月`
    : periodTab === "year"
      ? `${year}年`
      : periodTab === "all"
        ? "通算"
        : "分析+";
  const selectedDateLabel = `${month}月${selectedDay}日（${WEEKDAYS[new Date(year, month - 1, selectedDay).getDay()]}）`;
  const selectedDateStr = `${year}-${String(month).padStart(2, "0")}-${String(selectedDay).padStart(2, "0")}`;

  // 月間サマリー詳細（ヘッダーの月タップで開く）用の集計。
  // 負数/引分/最高投資/最高回収は既存 selector に無いため filtered から読み取りで算出（logic非変更）。
  const summaryExtra = useMemo(() => {
    let losses = 0, draws = 0, maxInvest = 0, maxRecovery = 0;
    for (const a of filtered) {
      const pl = getActualPL(a);
      if (pl != null) { if (pl < 0) losses += 1; else if (pl === 0) draws += 1; }
      const inv = Number(a?.investYen) || 0;
      const rec = Number(a?.recoveryYen) || 0;
      if (inv > maxInvest) maxInvest = inv;
      if (rec > maxRecovery) maxRecovery = rec;
    }
    return { losses, draws, maxInvest, maxRecovery };
  }, [filtered]);
  // 収支グラフ用：累計（trend）から日別収支デルタを復元し、日別バー＋累計ラインを描く。
  const summaryChart = useMemo(() => {
    const src = trend || [];
    return src.map((t, i) => {
      const cum = Number(t.actual) || 0;
      const prevCum = i > 0 ? (Number(src[i - 1].actual) || 0) : 0;
      return { day: t.day, daily: cum - prevCum, cum, cumEv: Number(t.ev) || 0 };
    });
  }, [trend]);
  const summaryScore = isDemo ? -3080 : (summary.totalRealPL || 0);
  const summaryStats = useMemo(() => {
    const muted = "text-[#6e7e99]";
    if (isDemo) {
      return [
        { label: "回数", value: "16" }, { label: "投資合計", value: "86,500" },
        { label: "勝数", value: "9" }, { label: "回収合計", value: "10,000" },
        { label: "負数", value: "7" }, { label: "平均額", value: "-4,781", cls: moneyClass(-4781) },
        { label: "引分", value: "0" }, { label: "最高投資", value: "14,000" },
        { label: "勝率", value: "56.2%" }, { label: "最高回収", value: "10,000" },
        { label: "時間", value: "7.2h" }, { label: "時給", value: "-430/h", cls: moneyClass(-430) },
        { label: "期待値勝数", value: "—", cls: muted }, { label: "期待値入力", value: "—", cls: muted },
        { label: "期待値負数", value: "—", cls: muted }, { label: "期待値合計", value: "—", cls: muted },
        { label: "期待値引分", value: "—", cls: muted }, { label: "期待値平均", value: "—", cls: muted },
      ];
    }
    const real = summary.realSessions || 0;
    const avg = real > 0 ? Math.round((summary.totalPL || 0) / real) : 0;
    return [
      { label: "回数", value: String(summary.sessions || 0) },
      { label: "投資合計", value: fmt(summary.totalInvest || 0) },
      { label: "勝数", value: String(summary.winCount || 0) },
      { label: "回収合計", value: fmt(summary.totalRecovery || 0) },
      { label: "負数", value: String(summaryExtra.losses) },
      { label: "平均額", value: signed(avg), cls: moneyClass(avg) },
      { label: "引分", value: String(summaryExtra.draws) },
      { label: "最高投資", value: fmt(summaryExtra.maxInvest) },
      { label: "勝率", value: summary.winRate != null ? `${summary.winRate.toFixed(1)}%` : "—" },
      { label: "最高回収", value: fmt(summaryExtra.maxRecovery) },
      { label: "時間", value: `${(summary.workHours || 0).toFixed(1)}h` },
      { label: "時給", value: summary.wage != null ? `${signed(summary.wage)}/h` : "—", cls: summary.wage != null ? moneyClass(summary.wage) : muted },
      { label: "期待値勝数", value: "—", cls: muted }, { label: "期待値入力", value: "—", cls: muted },
      { label: "期待値負数", value: "—", cls: muted }, { label: "期待値合計", value: "—", cls: muted },
      { label: "期待値引分", value: "—", cls: muted }, { label: "期待値平均", value: "—", cls: muted },
    ];
  }, [isDemo, summary, summaryExtra]);

  // 月別の「記録を編集」導線で開く記録エディタのサブ画面（該当日を初期選択）。
  if (recordsDay !== null) {
    return (
      <div className="analytics-terminal flex min-h-0 flex-1 flex-col overflow-hidden bg-[#050B18] text-white">
        <div className="mx-auto flex w-full max-w-[430px] shrink-0 items-center gap-2 px-5 pt-4">
          <button type="button" onClick={() => setRecordsDay(null)} className="flex h-9 items-center gap-1 rounded-lg border border-white/10 bg-[#0b1528] px-3 text-[12px] font-bold text-[#aab6ca]">
            <ChevronLeft className="h-4 w-4" />戻る
          </button>
          <h1 className="text-[15px] font-black tracking-[.02em]">記録を編集</h1>
        </div>
        {/* スクロールを画面内に閉じ込める（親mainの高さ依存を避け、下部ナビと重ならない） */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <CalendarTab S={S} onReset={onReset} initialDate={recordsDay} />
        </div>
      </div>
    );
  }

  if (periodTab === "analyzer") {
    return (
      <div className="analytics-terminal flex min-h-0 flex-1 flex-col overflow-hidden bg-[#050B18] text-white">
        <div className="relative mx-auto flex min-h-0 w-full max-w-[430px] flex-1 flex-col px-5 pt-4">
          <HeaderBar title={headerTitle} onTitleTap={() => setViewMenuOpen((value) => !value)} menuOpen={viewMenuOpen} current={periodTab} onSelect={handleSelectView} />
          {viewMenuOpen && <div className="fixed inset-0 z-30" onClick={() => setViewMenuOpen(false)} />}
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain pb-12">
            {filterOpen && <FilterPanel stores={storeOptions} machines={machineOptions} filters={filters} setFilters={setFilters} onClose={() => setFilterOpen(false)} />}
            <AnalyzerView archives={archives} extraFilters={filters} />
            <MachinePanel rows={machines} sortMode={sortMode} setSortMode={setSortMode} />
            <StorePanel rows={stores} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="analytics-terminal flex min-h-0 flex-1 flex-col overflow-hidden bg-[#050B18] text-white">
      <div className="relative mx-auto flex min-h-0 w-full max-w-[430px] flex-1 flex-col px-5 pt-4">
        {/* 左の ‹ ／ 右側の › と中央ラベル横の › で月（年別は年）送り。ラベルのタップで表示切替メニュー。
            右端の「月次詳細」ボタンでカレンダーと収支グラフ＋成績を同一画面で切り替える（月別のみ）。 */}
        <HeaderBar
          title={headerTitle}
          onPrev={() => goPeriod(-1)}
          onNext={() => goPeriod(1)}
          navDisabled={periodTab === "all"}
          onTitleTap={() => setViewMenuOpen((value) => !value)}
          menuOpen={viewMenuOpen}
          current={periodTab}
          onSelect={handleSelectView}
          onToggleDetail={periodTab === "month" ? toggleDetailView : undefined}
          detailActive={detailView}
        />
        {viewMenuOpen && <div className="fixed inset-0 z-30" onClick={() => setViewMenuOpen(false)} />}

        {filterOpen && <FilterPanel stores={storeOptions} machines={machineOptions} filters={filters} setFilters={setFilters} onClose={() => setFilterOpen(false)} />}

        {/* 画面内スクロール領域。横スワイプで月送り（縦スクロールは阻害しない）。 */}
        <main onTouchStart={onSwipeStart} onTouchEnd={onSwipeEnd} className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-12">
          {/* 月送り・表示切替で key が変わり、向きに応じたアニメーションを再生する。 */}
          <div key={`${periodTab}-${monthOffset}-${detailView}`} className={`month-pane-${slideDir} space-y-5`}>
            {periodTab === "month" ? (
              detailView ? (
                /* 月次詳細：今月の収支グラフ＋成績＋統計（モック2）。 */
                <MonthDetailContent chartData={summaryChart} score={summaryScore} stats={summaryStats} />
              ) : (
                <>
                  {/* 4指標ストリップ＋日別ヒートマップ＋選択日詳細（モック1）。 */}
                  <MonthStatStrip actual={actual} ev={ev} diff={monthDiff} winRate={winRate} />
                  <CalendarPanel dayMap={dayMap} selectedDay={selectedDay} setSelectedDay={setSelectedDay} year={year} month={month} />
                  <DayDetail dateLabel={selectedDateLabel} row={dayMap[selectedDay]} onEditRecords={() => setRecordsDay(selectedDateStr)} />
                </>
              )
            ) : (
              <>
                <SummaryHero summary={summary} isDemo={isDemo} heroTitle={heroTitle} />
                <PeriodBreakdownPanel periodTab={periodTab} rows={periodRows} isDemo={isDemo} />
                <TrendPanel data={trend} />
                <Kpis summary={summary} isDemo={isDemo} />
                <ShareCTA onShare={() => setShareOpen(true)} title="成果を共有" subtitle="収支カードをSNSに投稿できます" />
              </>
            )}
          </div>
        </main>
      </div>
      {shareOpen && <ShareCard year={year} month={month} actual={actual} ev={ev} winRate={winRate} days={days} dayMap={dayMap} onClose={() => setShareOpen(false)} />}
    </div>
  );
}
