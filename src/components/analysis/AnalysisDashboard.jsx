import React, { useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Filter,
  LineChart as LineChartIcon,
  Share2,
  Sparkles,
  Target,
  Wallet,
  X,
} from "lucide-react";
import {
  CartesianGrid,
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

const PERIOD_TABS = [
  { id: "month", label: "月別" },
  { id: "year", label: "年別" },
  { id: "all", label: "通算" },
  { id: "analyzer", label: "分析+" },
  { id: "calendar", label: "カレンダー" },
];

const DEMO_DAYS = {
  1: { actual: -7000, ev: 1800 },
  4: { actual: -8000, ev: 1200 },
  5: { actual: 9672, ev: 2100 },
  7: { actual: 8596, ev: 2400 },
  11: { actual: -14000, ev: 900 },
  14: { actual: -15500, ev: 1900 },
  15: { actual: 2637, ev: 1700 },
  16: { actual: -7000, ev: 1300 },
  17: { actual: 9097, ev: 2200 },
  18: {
    actual: 5406,
    ev: 2615,
    storeName: "丸之内ヘリオス2000竹原",
    machineName: "スマスロ マギアレコード",
    spinRate: 19.7,
    hours: 2.1,
    invest: 1000,
    recovery: 6406,
  },
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

const DEMO_TREND = Array.from({ length: 30 }, (_, index) => {
  const day = index + 1;
  const actual = [0, -1200, -1700, -2500, -3300, -4200, -5100, -4300, -6000, -5200, -6900, -7600, -8400, -9200, -7200, -6100, -7900, -9300, -8400, -10500, -11600, -12900, -11700, -14300, -15500, -14000, -17200, -16900, -18400, -21100][index];
  const ev = [0, 800, 1400, 2200, 1000, 0, 400, 3000, 6200, 5900, 7200, 6900, 7600, 8100, 9600, 11800, 9700, 11200, 12900, 14100, 13700, 15500, 16800, 15900, 19200, 18400, 20700, 21300, 23000, 23800][index];
  return { day: `6/${day}`, actual, ev, diff: actual - ev };
});

const fmt = (value) => Math.round(Number(value) || 0).toLocaleString("ja-JP");
const signed = (value) => `${Number(value) > 0 ? "+" : ""}${fmt(value)}`;
const moneyClass = (value) => Number(value) >= 0 ? "text-[#25D366]" : "text-[#FF5B6E]";
const card = "rounded-[10px] border border-white/[0.09] bg-[linear-gradient(145deg,rgba(12,25,47,.98),rgba(5,13,27,.98))] shadow-[0_16px_45px_rgba(0,0,0,.34)]";
const label = "text-[9px] font-semibold tracking-[.04em] text-[#8090aa]";

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
    <div className="mb-2 flex items-center justify-between gap-2">
      <div className="min-w-0">
        <h2 className="text-[12px] font-black tracking-[.02em] text-white">{children}</h2>
        {note && <p className="mt-0.5 text-[8px] text-[#8090aa]">{note}</p>}
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

function SummaryHero({ summary, isDemo, heroTitle = "月間収支" }) {
  const actual = isDemo ? -12130 : summary.totalRealPL;
  const ev = isDemo ? 3120 : summary.evAmount;
  const diff = actual - ev;
  const days = isDemo ? 7 : (summary.days || 0);
  return (
    <section className={`${card} overflow-hidden p-4`}>
      <div className={label}>{heroTitle}</div>
      <div className={`mt-1.5 flex items-end font-mono ${moneyClass(actual)}`}>
        <strong className="text-[48px] font-black leading-none tracking-[-.055em]">{signed(actual)}</strong>
        <span className="mb-1.5 ml-1.5 text-[16px] font-bold">円</span>
      </div>
      <div className="mt-4 grid grid-cols-3 border-t border-white/[0.08] pt-3">
        <div className="min-w-0">
          <div className={label}>期待値</div>
          <div className="mt-1 whitespace-nowrap font-mono text-[18px] font-black text-[#16C8FF]">{signed(ev)}<span className="text-[9px]">円</span></div>
        </div>
        <div className="min-w-0 border-l border-white/[0.08] pl-3">
          <div className={label}>期待値超過</div>
          <div className={`mt-1 whitespace-nowrap font-mono text-[18px] font-black ${moneyClass(diff)}`}>{signed(diff)}<span className="text-[9px]">円</span></div>
        </div>
        <div className="min-w-0 border-l border-white/[0.08] pl-3">
          <div className={label}>稼働日数</div>
          <div className="mt-1 whitespace-nowrap font-mono text-[18px] font-black text-white">{days}<span className="text-[9px]">日</span></div>
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

function CalendarCell({ day, row, selected, onSelect }) {
  let heat = "border-white/10 bg-[#1a2436]";
  if (row?.actual >= 10000) heat = "border-[#25D366]/50 bg-[#06623f]";
  else if (row?.actual >= 1000) heat = "border-[#25D366]/35 bg-[#0b493b]";
  else if (row?.actual <= -10000) heat = "border-[#FF5B6E]/55 bg-[#6b1322]";
  else if (row?.actual <= -1000) heat = "border-[#FF5B6E]/35 bg-[#3f1722]";
  return (
    <button
      type="button"
      onClick={() => row && onSelect(day)}
      className={`relative min-h-[58px] rounded-[6px] border p-1 text-left transition ${heat} ${
        selected ? "ring-1 ring-[#16C8FF] shadow-[0_0_14px_rgba(22,200,255,.24)]" : ""
      }`}
    >
      <span className="absolute left-1 top-0.5 text-[9px] font-bold text-white">{day}</span>
      {row && (
        <div className="mt-4 text-center font-mono">
          <div className={`text-[9px] font-black ${moneyClass(row.actual)}`}>{signed(row.actual)}</div>
          <div className="text-[8px] font-bold text-[#a8b5c9]">{signed(row.ev)}</div>
        </div>
      )}
    </button>
  );
}

function DayDetail({ day, row, onShare }) {
  const detail = row || {};
  return (
    <section className={`${card} p-3.5`}>
      <div className="text-[13px] font-black text-white">6月{day}日（木）</div>
      <div className="mt-1.5 flex items-baseline gap-2">
        <span className={`font-mono text-[22px] font-black ${moneyClass(detail.actual || 0)}`}>{signed(detail.actual || 0)}<span className="text-[10px]">円</span></span>
        <span className="text-[9px] text-[#7f8ca3]">期待値 <span className="text-[#16C8FF]">{signed(detail.ev || 0)}円</span></span>
      </div>
      <div className="my-3 h-px bg-white/[0.08]" />
      <dl className="space-y-2.5 text-[10px]">
        <div className="flex justify-between gap-3"><dt className="shrink-0 text-[#74839b]">店舗</dt><dd className="truncate text-right leading-[1.35] text-[#bdc7d7]">{detail.storeName || "丸之内ヘリオス2000竹原"}</dd></div>
        <div className="flex justify-between gap-3"><dt className="shrink-0 text-[#74839b]">機種</dt><dd className="truncate text-right leading-[1.35] text-[#bdc7d7]">{detail.machineName || "スマスロ マギアレコード"}</dd></div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 border-t border-white/[0.08] pt-2.5">
          <div className="flex justify-between gap-2"><dt className="text-[#74839b]">回転率</dt><dd className="font-mono text-[#bdc7d7]">{detail.spinRate || 19.7}回/k</dd></div>
          <div className="flex justify-between gap-2"><dt className="text-[#74839b]">稼働時間</dt><dd className="font-mono text-[#bdc7d7]">{detail.hours || 2.1}時間</dd></div>
          <div className="flex justify-between gap-2"><dt className="text-[#74839b]">投資</dt><dd className="font-mono text-[#bdc7d7]">{fmt(detail.invest || 1000)}円</dd></div>
          <div className="flex justify-between gap-2"><dt className="text-[#74839b]">回収</dt><dd className="font-mono text-[#bdc7d7]">{fmt(detail.recovery || 6406)}円</dd></div>
        </div>
      </dl>
      <button type="button" onClick={onShare} className="mt-4 h-11 w-full rounded-md border border-[#16C8FF]/70 text-[11px] font-black text-[#16C8FF]">
        この日の詳細を見る
      </button>
    </section>
  );
}

function CalendarPanel({ dayMap, selectedDay, setSelectedDay }) {
  const blanks = 1;
  const cells = [...Array(blanks).fill(null), ...Array.from({ length: 30 }, (_, i) => i + 1)];
  return (
    <section className={`${card} overflow-hidden p-3`}>
      <SectionTitle note="実収支 / 下段は期待値">日別収支カレンダー</SectionTitle>
      <div className="mb-2 flex flex-wrap gap-x-2 gap-y-1 text-[7px] text-[#a0aec0]">
        <span><i className="mr-1 inline-block h-2 w-2 rounded-sm bg-[#06623f]" />+10,000</span>
        <span><i className="mr-1 inline-block h-2 w-2 rounded-sm bg-[#0b493b]" />+1,000</span>
        <span><i className="mr-1 inline-block h-2 w-2 rounded-sm bg-[#1a2436]" />±999</span>
        <span><i className="mr-1 inline-block h-2 w-2 rounded-sm bg-[#3f1722]" />-1,000</span>
        <span><i className="mr-1 inline-block h-2 w-2 rounded-sm bg-[#6b1322]" />-10,000</span>
      </div>
      <div className="mb-1 grid grid-cols-7 text-center text-[9px] text-[#a0aec0]">
        {["日", "月", "火", "水", "木", "金", "土"].map((day, index) => (
          <span key={day} className={index === 6 ? "text-[#6ea8ff]" : ""}>{day}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-[4px]">
        {cells.map((day, index) => day
          ? <CalendarCell key={day} day={day} row={dayMap[day]} selected={day === selectedDay} onSelect={setSelectedDay} />
          : <div key={`blank-${index}`} />)}
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

function ShareCTA({ onShare }) {
  return (
    <section className={`${card} flex items-center justify-between gap-3 p-3.5`}>
      <div className="min-w-0">
        <div className="text-[12px] font-black text-white">SNSで成果をシェアしよう！</div>
        <p className="mt-0.5 text-[9px] text-[#8090aa]">月間収支カードを作成して共有できます</p>
      </div>
      <button type="button" onClick={onShare} className="flex h-11 shrink-0 items-center gap-1.5 rounded-lg border border-[#16C8FF]/70 bg-[#16C8FF]/10 px-3.5 text-[11px] font-black text-[#16C8FF]">
        <Share2 className="h-4 w-4" /> SNS用カードを作成
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

function ShareCard({ actual, ev, onClose }) {
  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/80 p-5 backdrop-blur-md" onClick={onClose}>
      <div className="w-full max-w-[350px]" onClick={(event) => event.stopPropagation()}>
        <div className="relative overflow-hidden rounded-[24px] border border-[#16C8FF]/35 bg-[radial-gradient(circle_at_top_right,rgba(22,200,255,.18),transparent_45%),linear-gradient(145deg,#0b1930,#040a14)] p-6 shadow-[0_30px_90px_rgba(0,0,0,.65)]">
          <button type="button" onClick={onClose} className="absolute right-4 top-4 text-[#8090aa]"><X className="h-5 w-5" /></button>
          <div className="text-[11px] font-black tracking-[.22em] text-[#16C8FF]">PACHI TRACKER</div>
          <div className="mt-7 text-[13px] font-bold text-[#a0aec0]">2026年6月</div>
          <div className={`mt-1 font-mono text-[38px] font-black ${moneyClass(actual)}`}>{signed(actual)}円</div>
          <div className="mt-6 grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-white/10 bg-black/20 p-3"><div className={label}>期待値</div><strong className="mt-1 block text-[#25D366]">{signed(ev)}円</strong></div>
            <div className="rounded-xl border border-white/10 bg-black/20 p-3"><div className={label}>期待値ランク</div><strong className="mt-1 block text-[#25D366]">A-</strong></div>
            <div className="rounded-xl border border-white/10 bg-black/20 p-3"><div className={label}>勝率</div><strong className="mt-1 block text-white">60%</strong></div>
            <div className="rounded-xl border border-white/10 bg-black/20 p-3"><div className={label}>稼働日数</div><strong className="mt-1 block text-white">7日</strong></div>
          </div>
          <div className="mt-5 border-t border-white/10 pt-4 text-[15px] font-black text-white">🏆 データ派プレイヤー</div>
        </div>
        <button type="button" onClick={onClose} className="mt-3 h-11 w-full rounded-xl bg-[#16C8FF] text-[12px] font-black text-[#03101c]">カードを閉じる</button>
      </div>
    </div>
  );
}

function DashboardTop({
  periodTab,
  setPeriodTab,
  filterOpen,
  setFilterOpen,
  onShare,
  showActions = true,
}) {
  return (
    <>
      <header className="mb-2.5 flex items-center justify-between">
        <h1 className="text-[16px] font-black tracking-[.02em]">収支分析</h1>
        {showActions && (
          <div className="flex gap-1.5">
            <ActionButton onClick={onShare}><Share2 className="h-3.5 w-3.5" />共有</ActionButton>
            <ActionButton onClick={() => setFilterOpen((value) => !value)} active={filterOpen}><Filter className="h-3.5 w-3.5" />絞り込み</ActionButton>
          </div>
        )}
      </header>
      <nav className="mb-2.5 grid h-[42px] grid-cols-5 rounded-[9px] border border-white/[0.08] bg-[#0b1528] p-0.5">
        {PERIOD_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setPeriodTab(tab.id)}
            className={`rounded-[7px] text-[10px] font-bold transition ${
              periodTab === tab.id
                ? "border border-[#16C8FF] bg-[#0c2743] text-[#16C8FF] shadow-[inset_0_0_18px_rgba(22,200,255,.08),0_0_16px_rgba(22,200,255,.08)]"
                : "text-[#8491a7]"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </nav>
    </>
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
  const periodTab = externalPeriodTab || internalTab;
  const setPeriodTab = onChangePeriodTab || setInternalTab;
  const [internalFilters, setInternalFilters] = useState({ storeName: "", machineName: "", dateStart: "", dateEnd: "", weekdays: [] });
  const filters = externalFilters || internalFilters;
  const setFilters = onChangeFilters || setInternalFilters;
  const [filterOpen, setFilterOpen] = useState(false);
  const [selectedDay, setSelectedDay] = useState(18);
  const [sortMode, setSortMode] = useState("ev");
  const [shareOpen, setShareOpen] = useState(false);
  const [monthOffset, setMonthOffset] = useState(0);

  const baseDate = isDemo ? new Date(2026, 5, 1) : new Date();
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
  const actual = isDemo ? -12130 : summary.totalRealPL;
  const ev = isDemo ? 3120 : summary.evAmount;
  const heroTitle = periodTab === "month" ? "月間収支" : periodTab === "year" ? "年間収支" : "通算収支";
  const shiftAmount = periodTab === "year" ? 12 : 1;

  if (periodTab === "calendar") {
    return (
      <div className="analytics-terminal min-h-full bg-[#050B18] text-white">
        <div className="mx-auto w-full max-w-[430px] px-4 pt-3">
          <DashboardTop periodTab={periodTab} setPeriodTab={setPeriodTab} showActions={false} />
        </div>
        <CalendarTab S={S} onReset={onReset} />
      </div>
    );
  }

  if (periodTab === "analyzer") {
    return (
      <div className="analytics-terminal min-h-full bg-[#050B18] text-white">
        <div className="mx-auto w-full max-w-[430px] px-4 pb-[140px] pt-3">
          <DashboardTop
            periodTab={periodTab}
            setPeriodTab={setPeriodTab}
            filterOpen={filterOpen}
            setFilterOpen={setFilterOpen}
            onShare={() => setShareOpen(true)}
          />
          {filterOpen && <FilterPanel stores={storeOptions} machines={machineOptions} filters={filters} setFilters={setFilters} onClose={() => setFilterOpen(false)} />}
          <AnalyzerView archives={archives} extraFilters={filters} />
          <div className="mt-3 space-y-3">
            <MachinePanel rows={machines} sortMode={sortMode} setSortMode={setSortMode} />
            <StorePanel rows={stores} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="analytics-terminal min-h-full bg-[#050B18] text-white">
      <div className="mx-auto w-full max-w-[430px] px-4 pb-[140px] pt-3">
        <DashboardTop
          periodTab={periodTab}
          setPeriodTab={setPeriodTab}
          filterOpen={filterOpen}
          setFilterOpen={setFilterOpen}
          onShare={() => setShareOpen(true)}
        />

        {filterOpen && <FilterPanel stores={storeOptions} machines={machineOptions} filters={filters} setFilters={setFilters} onClose={() => setFilterOpen(false)} />}

        <div className="mb-2.5 flex items-center justify-between">
          <button type="button" disabled={periodTab === "all"} onClick={() => setMonthOffset((value) => value - shiftAmount)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-[#0b1528] text-[#aab6ca] disabled:opacity-20"><ChevronLeft className="h-4 w-4" /></button>
          <button type="button" className="flex items-center gap-1 text-[15px] font-black">
            {periodTab === "month" ? `${year}年${month}月` : periodTab === "year" ? `${year}年` : "通算"}
            <ChevronDown className="h-3.5 w-3.5 text-[#7d93b7]" />
          </button>
          <button type="button" disabled={periodTab === "all"} onClick={() => setMonthOffset((value) => value + shiftAmount)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-[#0b1528] text-[#aab6ca] disabled:opacity-20"><ChevronRight className="h-4 w-4" /></button>
        </div>

        <main className="space-y-3">
          <SummaryHero summary={summary} isDemo={isDemo} heroTitle={heroTitle} />
          {periodTab === "month" ? (
            <>
              <CalendarPanel dayMap={dayMap} selectedDay={selectedDay} setSelectedDay={setSelectedDay} />
              <DayDetail day={selectedDay} row={dayMap[selectedDay]} onShare={() => setShareOpen(true)} />
            </>
          ) : (
            <PeriodBreakdownPanel periodTab={periodTab} rows={periodRows} isDemo={isDemo} />
          )}
          <TrendPanel data={trend} />
          <Kpis summary={summary} isDemo={isDemo} />
          <ShareCTA onShare={() => setShareOpen(true)} />
        </main>
      </div>
      {shareOpen && <ShareCard actual={actual} ev={ev} onClose={() => setShareOpen(false)} />}
    </div>
  );
}
