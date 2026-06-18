import React, { useMemo, useState } from "react";
import {
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Filter,
  HelpCircle,
  LineChart as LineChartIcon,
  Share2,
  Sparkles,
  Target,
  Trophy,
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
  filterArchives,
  getActualPL,
  getEvAmount,
  listAvailableMachines,
  listAvailableStores,
  machineRanking,
  summarize,
} from "./analysisSelectors";

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

function buildStoreRanking(archives, month) {
  const rows = filterArchives(archives, { month });
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

function SummaryHero({ summary, isDemo }) {
  const actual = isDemo ? -12130 : summary.totalRealPL;
  const ev = isDemo ? 3120 : summary.evAmount;
  const diff = actual - ev;
  return (
    <section className={`${card} grid min-h-[168px] grid-cols-[1.03fr_.97fr] overflow-hidden`}>
      <div className="border-r border-white/[0.07] p-3.5">
        <div className={label}>今月の実質収支</div>
        <div className={`mt-1 flex items-end font-mono ${moneyClass(actual)}`}>
          <strong className="text-[34px] font-black leading-none tracking-[-.055em]">{signed(actual)}</strong>
          <span className="mb-0.5 ml-1 text-[10px] font-bold">円</span>
        </div>
        <div className="mt-3 grid grid-cols-2 border-y border-white/[0.08] py-2">
          <div>
            <div className={label}>期待値</div>
            <div className="mt-1 font-mono text-[15px] font-black text-[#16C8FF]">{signed(ev)}<span className="text-[8px]">円</span></div>
          </div>
          <div className="border-l border-white/[0.08] pl-3">
            <div className={label}>期待値との差</div>
            <div className={`mt-1 font-mono text-[15px] font-black ${moneyClass(diff)}`}>{signed(diff)}<span className="text-[8px]">円</span></div>
          </div>
        </div>
        <div className="mt-2.5">
          <div className="flex items-center justify-between">
            <span className={label}>収束率（目安）</span>
            <span className="font-mono text-[12px] font-black text-[#16C8FF]">38%</span>
          </div>
          <div className="mt-1.5 h-[5px] overflow-hidden rounded-full bg-[#14213a]">
            <div className="h-full w-[38%] rounded-full bg-gradient-to-r from-[#16C8FF] to-[#1688ff] shadow-[0_0_12px_#16C8FF]" />
          </div>
          <p className="mt-1 text-[8px] text-[#a0aec0]">あと62%で収束ライン</p>
        </div>
      </div>
      <div className="relative p-3.5">
        <HelpCircle className="absolute right-3 top-3 h-3.5 w-3.5 text-[#8190a8]" />
        <div className={label}>期待値ランク</div>
        <div className="mt-1 flex items-center gap-2">
          <strong className="text-[36px] font-black leading-none text-[#25D366]">A-</strong>
          <span className="rounded-full border border-white/10 bg-[#07101f] px-2 py-1 text-[8px] font-black text-white">上位18%</span>
        </div>
        <p className="mt-1 text-[9px] text-[#a0aec0]">素晴らしい期待値稼働！</p>
        <div className="my-3 h-px bg-white/[0.07]" />
        <div className={label}>今月の称号</div>
        <div className="mt-1.5 flex items-center gap-2">
          <Trophy className="h-4 w-4 fill-[#FFC83D] text-[#FFC83D]" />
          <strong className="text-[12px] text-white">データ派プレイヤー</strong>
        </div>
        <p className="mt-1 text-[8px] leading-[1.45] text-[#a0aec0]">回転率と期待値のバランスが<br />非常に良い月でした！</p>
      </div>
    </section>
  );
}

function Kpis({ summary, isDemo }) {
  const values = [
    { icon: CalendarDays, title: "稼働日数", value: isDemo ? "7" : summary.days, unit: "日" },
    { icon: Target, title: "勝率", value: isDemo ? "60" : Math.round(summary.winRate || 0), unit: "%", sub: isDemo ? "(3/5)" : "" },
    { icon: Sparkles, title: "平均回転率", value: isDemo ? "27.2" : "—", unit: "回/k" },
    { icon: LineChartIcon, title: "期待値", value: isDemo ? "+3,120" : signed(summary.evAmount), unit: "円", positive: true },
    { icon: Clock3, title: "稼働時間", value: isDemo ? "5.1" : (summary.workHours || 0).toFixed(1), unit: "時間" },
  ];
  return (
    <section className={`${card} grid h-[62px] grid-cols-5 overflow-hidden`}>
      {values.map((item, index) => (
        <div key={item.title} className={`flex min-w-0 flex-col items-center justify-center px-1 ${index ? "border-l border-white/[0.08]" : ""}`}>
          <div className="flex items-center gap-1">
            <item.icon className="h-3 w-3 text-[#5e9df7]" />
            <span className="truncate text-[7px] text-[#8390a7]">{item.title}</span>
          </div>
          <div className={`mt-1 whitespace-nowrap font-mono text-[14px] font-black ${item.positive ? "text-[#25D366]" : "text-white"}`}>
            {item.value}<span className="ml-0.5 text-[7px]">{item.unit}</span>
          </div>
          {item.sub && <span className="-mt-0.5 text-[7px] text-[#6880a4]">{item.sub}</span>}
        </div>
      ))}
    </section>
  );
}

function CalendarCell({ day, row, selected, onSelect }) {
  let heat = "border-white/10 bg-[#0c1628]";
  if (row?.actual >= 10000) heat = "border-[#25D366]/45 bg-[#07563f]";
  else if (row?.actual >= 1000) heat = "border-[#25D366]/35 bg-[#0b493b]";
  else if (row?.actual < -1000) heat = "border-[#FF5B6E]/35 bg-[#4b1e2b]";
  return (
    <button
      type="button"
      onClick={() => row && onSelect(day)}
      className={`relative h-[39px] rounded-[5px] border p-1 text-left transition ${heat} ${
        selected ? "ring-1 ring-[#16C8FF] shadow-[0_0_14px_rgba(22,200,255,.24)]" : ""
      }`}
    >
      <span className="absolute left-1 top-0.5 text-[8px] font-bold text-white">{day}</span>
      {row && (
        <div className="mt-2 text-center font-mono">
          <div className={`text-[8px] font-black ${moneyClass(row.actual)}`}>{signed(row.actual)}</div>
          <div className="text-[7px] font-bold text-[#a8b5c9]">{signed(row.ev)}</div>
        </div>
      )}
    </button>
  );
}

function DayDetail({ day, row, onShare }) {
  const detail = row || {};
  return (
    <aside className="border-l border-white/[0.08] bg-[#071326] p-3">
      <div className="text-[11px] font-black text-white">6月{day}日（木）</div>
      <div className="mt-1 font-mono text-[17px] font-black text-[#16C8FF]">{signed(detail.actual || 0)}<span className="text-[8px]">円</span></div>
      <div className="text-[8px] text-[#7f8ca3]">（期待値 <span className="text-[#16C8FF]">{signed(detail.ev || 0)}円</span>）</div>
      <div className="my-2.5 h-px bg-white/[0.08]" />
      <dl className="grid grid-cols-[48px_1fr] gap-y-2 text-[8px]">
        <dt className="text-[#74839b]">店舗</dt><dd className="leading-[1.35] text-[#bdc7d7]">{detail.storeName || "丸之内ヘリオス2000竹原"}</dd>
        <dt className="text-[#74839b]">機種</dt><dd className="leading-[1.35] text-[#bdc7d7]">{detail.machineName || "スマスロ マギアレコード"}</dd>
        <dt className="text-[#74839b]">回転率</dt><dd className="font-mono text-[#bdc7d7]">{detail.spinRate || 19.7}回/k</dd>
        <dt className="text-[#74839b]">稼働時間</dt><dd className="font-mono text-[#bdc7d7]">{detail.hours || 2.1}時間</dd>
        <dt className="text-[#74839b]">投資</dt><dd className="font-mono text-[#bdc7d7]">{fmt(detail.invest || 1000)}円</dd>
        <dt className="text-[#74839b]">回収</dt><dd className="font-mono text-[#bdc7d7]">{fmt(detail.recovery || 6406)}円</dd>
      </dl>
      <button type="button" onClick={onShare} className="mt-3 h-8 w-full rounded-md border border-[#16C8FF]/70 text-[9px] font-black text-[#16C8FF]">
        この日の詳細を見る
      </button>
    </aside>
  );
}

function CalendarPanel({ dayMap, selectedDay, setSelectedDay, onShare }) {
  const blanks = 1;
  const cells = [...Array(blanks).fill(null), ...Array.from({ length: 30 }, (_, i) => i + 1)];
  return (
    <section className={`${card} overflow-hidden`}>
      <div className="grid grid-cols-[1fr_124px]">
        <div className="p-2.5">
          <SectionTitle note="実収支｜下段は期待値">日別収支カレンダー</SectionTitle>
          <div className="mb-1 grid grid-cols-7 text-center text-[8px] text-[#a0aec0]">
            {["日", "月", "火", "水", "木", "金", "土"].map((day, index) => (
              <span key={day} className={index === 6 ? "text-[#6ea8ff]" : ""}>{day}</span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-[3px]">
            {cells.map((day, index) => day
              ? <CalendarCell key={day} day={day} row={dayMap[day]} selected={day === selectedDay} onSelect={setSelectedDay} />
              : <div key={`blank-${index}`} />)}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[7px] text-[#a0aec0]">
            <span><i className="mr-1 inline-block h-2 w-2 rounded-sm bg-[#07563f]" />+10,000以上</span>
            <span><i className="mr-1 inline-block h-2 w-2 rounded-sm bg-[#0b493b]" />+1,000以上</span>
            <span><i className="mr-1 inline-block h-2 w-2 rounded-sm bg-[#26324b]" />-1,000〜+1,000</span>
            <span><i className="mr-1 inline-block h-2 w-2 rounded-sm bg-[#662433]" />-1,000以下</span>
          </div>
        </div>
        <DayDetail day={selectedDay} row={dayMap[selectedDay]} onShare={onShare} />
      </div>
    </section>
  );
}

function TrendPanel({ data }) {
  return (
    <section className={`${card} overflow-hidden`}>
      <div className="p-2.5">
        <SectionTitle>収支・期待値 累積推移</SectionTitle>
        <div className="h-[132px]">
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
      <div className="flex items-center gap-2 border-t border-white/[0.08] bg-[#0b1a31] px-3 py-2">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#6d85aa]/30 bg-[#13223a]">
          <Sparkles className="h-3.5 w-3.5 text-[#8aa6d2]" />
        </div>
        <div>
          <div className="text-[8px] font-black text-[#16C8FF]">AIからの一言</div>
          <p className="mt-0.5 text-[7px] leading-[1.45] text-[#c2cbda]">期待値は十分積めています。<br />収支は下振れ傾向ですが、回転率は安定しています。</p>
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
      <div className="grid grid-cols-[18px_1fr_35px_34px_42px_42px_25px] gap-1 border-b border-white/[0.08] pb-1 text-right text-[6px] text-[#75839a]">
        <span className="text-left">順位</span><span className="text-left">機種名</span><span>時間</span><span>回転率</span><span>期待値</span><span>実収支</span><span>勝率</span>
      </div>
      {sorted.slice(0, 5).map((row, index) => (
        <div key={row.machineName} className="grid grid-cols-[18px_1fr_35px_34px_42px_42px_25px] items-center gap-1 border-b border-white/[0.06] py-2 text-right font-mono text-[7px]">
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
      <div className="grid grid-cols-[18px_1fr_34px_34px_42px_42px_24px] gap-1 border-b border-white/[0.08] pb-1 text-right text-[6px] text-[#75839a]">
        <span className="text-left">順位</span><span className="text-left">店舗名</span><span>規模</span><span>回転率</span><span>期待値</span><span>実収支</span><span>日</span>
      </div>
      {rows.slice(0, 5).map((row, index) => (
        <div key={row.storeName} className="grid grid-cols-[18px_1fr_34px_34px_42px_42px_24px] items-center gap-1 border-b border-white/[0.06] py-2 text-right font-mono text-[7px]">
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

function MonthlySummary({ actual, ev, isDemo, onShare }) {
  const values = isDemo
    ? [
        ["最高収支日", "+9,672円（6/5）", true],
        ["最大下振れ日", "-15,500円（6/14）", false],
        ["平均収支/日", "-1,733円", false],
        ["平均期待値/日", "+446円", true],
        ["時間あたり収支", "-2,379円/h", false],
        ["時間あたり期待値", "+612円/h", true],
      ]
    : [
        ["実収支", `${signed(actual)}円`, actual >= 0],
        ["期待値", `${signed(ev)}円`, ev >= 0],
        ["期待値との差", `${signed(actual - ev)}円`, actual - ev >= 0],
        ["収束率", `${ev ? Math.round((actual / ev) * 100) : 0}%`, actual >= 0],
        ["期待値ランク", "A-", true],
        ["称号", "データ派プレイヤー", true],
      ];
  return (
    <section className={`${card} p-2.5`}>
      <SectionTitle>今月のサマリー</SectionTitle>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2">
        {values.map(([name, value, positive]) => (
          <div key={name} className="flex items-center justify-between gap-2 text-[7px]">
            <span className="text-[#7e8ba2]">{name}</span>
            <strong className={`whitespace-nowrap font-mono ${positive ? "text-[#25D366]" : "text-[#FF5B6E]"}`}>{value}</strong>
          </div>
        ))}
      </div>
      <button type="button" onClick={onShare} className="mt-4 flex h-10 w-full scroll-mb-24 items-center justify-center gap-2 rounded-md border border-[#16C8FF]/70 text-[10px] font-black text-[#16C8FF]">
        <Share2 className="h-3.5 w-3.5" /> SNS用カードを作成
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

export default function AnalysisDashboard({
  S,
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
  const filtered = useMemo(() => filterArchives(archives, filters), [archives, filters]);
  const summary = useMemo(() => summarize(filtered, { month: monthKey }), [filtered, monthKey]);
  const dayMap = useMemo(() => isDemo ? DEMO_DAYS : buildRealDays(filtered, monthKey), [filtered, isDemo, monthKey]);
  const trend = useMemo(() => isDemo ? DEMO_TREND : buildTrend(dayMap, year, month), [dayMap, isDemo, month, year]);
  const machines = useMemo(() => {
    if (isDemo) return DEMO_MACHINES;
    return machineRanking(filtered, { month: monthKey, limit: 5 }).map((row) => ({
      ...row,
      hours: "—",
      spin: Number(row.spinRate || 0),
      winRate: row.sessions ? Math.round(((row.actualPL > 0 ? 1 : 0) / row.sessions) * 100) : 0,
    }));
  }, [filtered, isDemo, monthKey]);
  const stores = useMemo(() => isDemo ? DEMO_STORES : buildStoreRanking(filtered, monthKey), [filtered, isDemo, monthKey]);
  const storeOptions = useMemo(() => listAvailableStores(archives), [archives]);
  const machineOptions = useMemo(() => listAvailableMachines(archives), [archives]);
  const actual = isDemo ? -12130 : summary.totalRealPL;
  const ev = isDemo ? 3120 : summary.evAmount;

  return (
    <div className="analytics-terminal min-h-full bg-[#050B18] text-white">
      <div className="mx-auto w-full max-w-[480px] px-3 pb-24 pt-3">
        <header className="mb-2.5 flex items-center justify-between">
          <h1 className="text-[16px] font-black tracking-[.02em]">収支分析</h1>
          <div className="flex gap-1.5">
            <ActionButton onClick={() => setShareOpen(true)}><Share2 className="h-3.5 w-3.5" />共有</ActionButton>
            <ActionButton onClick={() => setFilterOpen((value) => !value)} active={filterOpen}><Filter className="h-3.5 w-3.5" />絞り込み</ActionButton>
          </div>
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

        {filterOpen && <FilterPanel stores={storeOptions} machines={machineOptions} filters={filters} setFilters={setFilters} onClose={() => setFilterOpen(false)} />}

        <div className="mb-2.5 flex items-center justify-between">
          <button type="button" onClick={() => setMonthOffset((value) => value - 1)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-[#0b1528] text-[#aab6ca]"><ChevronLeft className="h-4 w-4" /></button>
          <button type="button" className="flex items-center gap-1 text-[15px] font-black">{year}年{month}月 <ChevronDown className="h-3.5 w-3.5 text-[#7d93b7]" /></button>
          <button type="button" onClick={() => setMonthOffset((value) => value + 1)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-[#0b1528] text-[#aab6ca]"><ChevronRight className="h-4 w-4" /></button>
        </div>

        <main className="space-y-2">
          <SummaryHero summary={summary} isDemo={isDemo} />
          <Kpis summary={summary} isDemo={isDemo} />
          <CalendarPanel dayMap={dayMap} selectedDay={selectedDay} setSelectedDay={setSelectedDay} onShare={() => setShareOpen(true)} />
          <div className="grid grid-cols-[.88fr_1.12fr] gap-2">
            <TrendPanel data={trend} />
            <MachinePanel rows={machines} sortMode={sortMode} setSortMode={setSortMode} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <StorePanel rows={stores} />
            <MonthlySummary actual={actual} ev={ev} isDemo={isDemo} onShare={() => setShareOpen(true)} />
          </div>
        </main>
      </div>
      {shareOpen && <ShareCard actual={actual} ev={ev} onClose={() => setShareOpen(false)} />}
    </div>
  );
}
