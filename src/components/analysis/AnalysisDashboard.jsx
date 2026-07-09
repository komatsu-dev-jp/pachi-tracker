import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  BarChart3,
  CalendarDays,
  CalendarRange,
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
  archiveWorkMinutes,
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
import { storeAnalysis } from "./analyticsViewSelectors";
import { getSpinRate } from "./analyzerSelectors";

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
const moneyClass = (value) => Number(value) >= 0 ? "text-[var(--at-pos)]" : "text-[var(--at-neg)]";
const card = "rounded-[14px] border border-[var(--at-ln-md)] bg-[image:var(--at-card-grad)] shadow-[var(--at-card-shadow2)]";
const label = "text-[11px] font-semibold tracking-[.04em] text-[var(--at-mut)]";

function buildRealDays(archives, month) {
  return Object.fromEntries(
    aggregateByDay(archives, month).map((row) => [
      Number(row.date.slice(8, 10)),
      {
        actual: row.hasActual ? row.actualPL : 0,
        ev: row.evAmount,
        date: row.date,
        hours: (row.workMinutes || 0) / 60,
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
        <h2 className="text-[15px] font-black tracking-[.02em] text-[var(--at-strong)]">{children}</h2>
        {note && <p className="mt-0.5 text-[10px] text-[var(--at-mut)]">{note}</p>}
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
          ? "border-[var(--at-cyan)] bg-[var(--at-cyan)]/10 text-[var(--at-cyan)] shadow-[0_0_18px_rgba(22,200,255,.12)]"
          : "border-[var(--at-ln-md)] bg-[var(--at-chipbg)] text-[var(--at-subtle-hi)] hover:border-[var(--at-cyan)]/50"
      }`}
    >
      {children}
    </button>
  );
}

// 常設の表示切替ピル（月別/年別/通算/分析）。ヘッダー直下に固定表示し、
// どの画面からも1タップで切替できる（5b 常設タブ＋期間スクラバー 採用。旧ヘッダープルダウンは廃止）。
const PILL_LABELS = { month: "月別", year: "年別", all: "通算", analyzer: "分析" };
function MonthPillTabs({ current, onSelect }) {
  return (
    <div className="flex gap-1.5">
      {VIEW_MENU.map((item) => {
        const active = current === item.id;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(item.id)}
            aria-pressed={active}
            className={`flex min-h-10 flex-1 items-center justify-center rounded-full text-[13px] font-bold transition ${
              active
                ? "bg-[var(--at-cyan)] text-[var(--at-page)]"
                : "border border-[var(--at-ln-md)] text-[var(--at-mut)]"
            }`}
          >
            {PILL_LABELS[item.id]}
          </button>
        );
      })}
    </div>
  );
}

// 月別トップのヒーロー数値（月収支の大型表示 ＋ 勝率の円形リング）。
// 値はすべて既存 summary から算出した actual/ev/diff/winRate をそのまま表示するだけで、
// 計算ロジックには未介入（円弧の割合計算のみ・金銭計算は含まない）。
const RING_R = 36;
const RING_CIRC = 2 * Math.PI * RING_R;
function MonthHero({ actual, ev, diff, winRate }) {
  const clampedRate = Math.max(0, Math.min(100, Number(winRate) || 0));
  const dashOffset = RING_CIRC * (1 - clampedRate / 100);
  return (
    <section className="flex items-center gap-4 px-0.5 pb-1 pt-1">
      <div className="min-w-0 flex-1">
        <div className="text-[12px] font-extrabold tracking-[.14em] text-[var(--at-mut)]">月間収支</div>
        <div className={`mt-1 flex items-end gap-1.5 font-mono ${moneyClass(actual)}`}>
          <strong className="text-[clamp(32px,11vw,54px)] font-black leading-none tracking-[-.05em]">{signed(actual)}</strong>
          <span className="pb-1 text-[16px] font-extrabold text-[var(--at-mut)]">円</span>
        </div>
        <div className="mt-2.5 flex flex-wrap items-center gap-2 text-[12px] font-bold">
          <span className="whitespace-nowrap text-[var(--at-cyan)]">期待値 {signed(ev)}円</span>
          <span className="h-[3px] w-[3px] shrink-0 rounded-full bg-[var(--at-ln-hi)]" />
          <span className={`whitespace-nowrap ${moneyClass(diff)}`}>差 {signed(diff)}円</span>
        </div>
      </div>
      <div className="relative h-[84px] w-[84px] shrink-0">
        <svg width="84" height="84" viewBox="0 0 84 84" className="-rotate-90">
          <circle cx="42" cy="42" r={RING_R} fill="none" stroke="var(--at-ln-hi)" strokeWidth="7" />
          <circle
            cx="42" cy="42" r={RING_R} fill="none" stroke="var(--at-gold)" strokeWidth="7"
            strokeLinecap="round" strokeDasharray={RING_CIRC} strokeDashoffset={dashOffset}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-mono text-[19px] font-black tabular-nums text-[var(--at-strong)]">{Math.round(clampedRate)}<span className="text-[10px]">%</span></span>
          <span className="text-[8px] font-extrabold tracking-[.14em] text-[var(--at-mut)]">勝率</span>
        </div>
      </div>
    </section>
  );
}

// 期間スクラバー（5b 常設タブ＋期間スクラバー）。現在月を中心に前後の月チップを横スクロール表示し、
// タップで直接その月へジャンプできる（ヘッダーの‹›が1ヶ月ずつの送りなのに対し、離れた月へ一気に移動する用途）。
// 各チップの金額は既存 summarize().totalRealPL をそのまま表示するだけで、計算ロジックには未介入。
const SCRUB_MONTHS_BEFORE = 5;
const SCRUB_MONTHS_AFTER = 2;
function MonthScrubber({ monthOffset, baseDate, archives, filters, isDemo, currentActual, onSelect }) {
  const scrollRef = useRef(null);

  const items = useMemo(() => {
    const list = [];
    for (let o = monthOffset - SCRUB_MONTHS_BEFORE; o <= monthOffset + SCRUB_MONTHS_AFTER; o++) {
      const d = new Date(baseDate.getFullYear(), baseDate.getMonth() + o, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const isCurrent = o === monthOffset;
      const crossesYear = d.getFullYear() !== baseDate.getFullYear();
      let hasData = false;
      let value = 0;
      if (isCurrent) {
        hasData = true;
        value = currentActual;
      } else if (!isDemo) {
        const s = summarize(archives, { ...filters, month: key });
        hasData = (s.sessions || 0) > 0;
        value = s.totalRealPL || 0;
      }
      list.push({
        offset: o,
        isCurrent,
        label: isCurrent || crossesYear ? `${d.getFullYear()}年${d.getMonth() + 1}月` : `${d.getMonth() + 1}月`,
        hasData,
        value,
      });
    }
    return list;
  }, [archives, baseDate, currentActual, filters, isDemo, monthOffset]);

  useEffect(() => {
    const current = scrollRef.current?.querySelector('[data-current="true"]');
    current?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [monthOffset]);

  return (
    <div
      ref={scrollRef}
      className="-mx-0.5 flex gap-2 overflow-x-auto px-0.5 pb-0.5"
      // 親<main>のonTouchStart/onTouchEndは横スワイプで月送り(goPeriod)を発火するため、
      // スクラバー内のドラッグ操作（チップの横スクロール）が伝播して誤って月移動しないよう遮断する。
      onTouchStart={(e) => e.stopPropagation()}
      onTouchEnd={(e) => e.stopPropagation()}
    >
      {items.map((item) => (
        <button
          key={item.offset}
          type="button"
          data-current={item.isCurrent}
          onClick={() => onSelect(item.offset)}
          className={`flex shrink-0 flex-col items-center gap-0.5 rounded-2xl border px-3.5 py-2.5 transition ${
            item.isCurrent
              ? "border-[var(--at-cyan)] bg-[var(--at-cyan)]/12 text-[var(--at-strong)]"
              : "border-[var(--at-ln-md)] text-[var(--at-mut)]"
          }`}
        >
          <span className={`whitespace-nowrap text-[12px] ${item.isCurrent ? "font-black" : "font-extrabold"}`}>{item.label}</span>
          <span className={`whitespace-nowrap font-mono text-[9px] font-extrabold tabular-nums ${
            item.hasData ? moneyClass(item.value) : "text-[var(--at-faint2)]"
          }`}>
            {item.hasData ? signed(item.value) : "記録なし"}
          </span>
        </button>
      ))}
    </div>
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
      <div className="mt-3 grid grid-cols-3 border-t border-[var(--at-ln)] pt-2.5">
        <div className="min-w-0">
          <div className={label}>期待値</div>
          <div className="mt-0.5 whitespace-nowrap font-mono text-[16px] font-black text-[var(--at-cyan)]">{signed(ev)}<span className="text-[9px]">円</span></div>
        </div>
        <div className="min-w-0 border-l border-[var(--at-ln)] pl-3">
          <div className={label}>勝率</div>
          <div className="mt-0.5 whitespace-nowrap font-mono text-[16px] font-black text-[var(--at-strong)]">{winRate}<span className="text-[9px]">%</span></div>
        </div>
        <div className="min-w-0 border-l border-[var(--at-ln)] pl-3">
          <div className={label}>稼働日数</div>
          <div className="mt-0.5 whitespace-nowrap font-mono text-[16px] font-black text-[var(--at-strong)]">{days}<span className="text-[9px]">日</span></div>
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
          } ${index % 2 === 1 ? "border-l border-[var(--at-ln)]" : ""} ${index >= 2 ? "border-t border-[var(--at-ln)]" : ""}`}
        >
          <div className="flex items-center gap-1">
            <item.icon className="h-3.5 w-3.5 text-[var(--at-iconblue)]" />
            <span className="truncate text-[9px] text-[var(--at-mut)]">{item.title}</span>
          </div>
          <div className={`mt-1.5 max-w-full truncate whitespace-nowrap font-mono text-[18px] font-black ${item.positive ? "text-[var(--at-pos)]" : "text-[var(--at-strong)]"}`}>
            {item.value}<span className="ml-0.5 text-[9px]">{item.unit}</span>
          </div>
          {item.sub && <span className="mt-0.5 text-[8px] text-[var(--at-faint2)]">{item.sub}</span>}
        </div>
      ))}
    </section>
  );
}

function CalendarCell({ day, row, selected, weekday, onSelect }) {
  // 全セルを均一な細枠でそろえたグリッド。稼働日はごく淡いヒート塗りで損益を示す（うるさくしない）。
  const amount = Number(row?.actual);
  const hasAmount = row && amount !== 0;
  // ベースは全セル共通の淡い枠。稼働日だけ控えめなヒート塗り＋枠色を重ねる。
  let heat = "bg-[var(--at-cellbg)] border-[var(--at-ln-soft)]";
  if (amount > 0) heat = "bg-[var(--at-heat-p)] border-[var(--at-heat-p-bd)]";
  else if (amount < 0) heat = "bg-[var(--at-heat-m)] border-[var(--at-heat-m-bd)]";
  // 日付色：プラス＝緑で強調。マイナスは中立（赤は下段の金額が担う）。未稼働は曜日色（日＝赤 / 土＝青）。
  const dayColor = selected
    ? "text-[var(--at-strong)]"
    : hasAmount && amount > 0
      ? "text-[var(--at-pos-hi)]"
      : weekday === 0
        ? "text-[var(--at-sun)]"
        : weekday === 6
          ? "text-[var(--at-sat)]"
          : "text-[var(--at-subtle-hi)]";
  return (
    <button
      type="button"
      onClick={() => onSelect(day)}
      className={`relative flex aspect-square min-w-0 flex-col items-start overflow-hidden rounded-[8px] border px-1.5 pb-1 pt-1.5 transition ${heat} ${
        selected ? "z-10 border-[var(--at-cyan)] shadow-[0_0_0_1px_var(--at-cyan)]" : ""
      }`}
    >
      {/* 日付は左上。金額は日付の下に配置（「k」を使わず実額・等幅・詰め字で枠内に収める）。 */}
      <span className={`text-[13px] font-bold leading-none ${dayColor}`}>{day}</span>
      {hasAmount && (
        <span className={`mt-auto w-full text-center font-mono text-[9.5px] font-black leading-none tracking-[-.04em] tabular-nums ${moneyClass(amount)}`}>{signed(amount)}</span>
      )}
    </button>
  );
}

// 日別詳細の実践記録カード（参考画像のレイアウトを analytics-terminal ダークトークンへ翻訳）。
// 数値は記録エディタ（CalendarTab）の SummaryCard と同一の式:
//   実収支 =（回収 − 投資）− 貯玉消費円 / 期待値 = stats.effectiveWorkAmount ?? workAmount
//   時間 = netRot ÷ rotPerHour / 時給 = 実収支 ÷ 時間
// タップで既存の「記録を編集」導線（記録エディタ遷移）を開く。
function DaySessionCard({ archive, onOpen }) {
  const st = archive.stats || {};
  const invest = Number(archive.investYen) || 0;
  const recovery = Number(archive.recoveryYen) || 0;
  const chodamaYen = Number(archive.chodamaYen) || 0;
  const actual = (recovery - invest) - chodamaYen;
  const ev = Number(st.effectiveWorkAmount ?? st.workAmount) || 0;
  const hasEv = ev !== 0;
  // 稼働時間: 実践記録は netRot/rotPerHour、手動記録は遊技時間（playMinutes）を使用
  const hours = archiveWorkMinutes(archive) / 60;
  const wage = hours > 0 ? Math.round(actual / hours) : 0;
  const denom = archive.settings?.synthDenom;
  const machineName = archive.machineName && archive.machineName !== `1/${denom}`
    ? archive.machineName
    : (archive.machineName || `1/${denom || "—"}`);
  const ballVal = Number(archive.settings?.ballVal) || 0;
  const rateLabel = ballVal > 0 ? `${Number.isInteger(ballVal) ? ballVal : ballVal.toFixed(1)}パチ` : "";
  const subLabel = [archive.machineNum ? `${archive.machineNum}番台` : "", rateLabel].filter(Boolean).join(" / ");
  const evCls = hasEv ? (ev >= 0 ? "text-[var(--at-cyan)]" : "text-[var(--at-neg)]") : "text-[var(--at-faint)]";
  const middle = [
    { label: "投資", value: `${fmt(invest)}円`, cls: "text-[var(--at-strong)]" },
    { label: "回収", value: `${fmt(recovery)}円`, cls: "text-[var(--at-strong)]" },
    { label: "収支", value: `${signed(actual)}円`, cls: moneyClass(actual) },
    { label: "期待値", value: hasEv ? `${signed(ev)}円` : "—", cls: evCls },
  ];
  return (
    <button type="button" onClick={onOpen} className={`${card} mt-2 block w-full p-3.5 text-left`}>
      {/* 上段: 店舗名（小）/ 機種名（太字）/ 台番号・レート ＋ 右側に期待値・収支・chevron */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {archive.storeName && <div className="truncate text-[10px] font-semibold text-[var(--at-mut)]">{archive.storeName}</div>}
          <div className="mt-0.5 text-[15px] font-black leading-snug text-[var(--at-strong)]">{machineName}</div>
          {subLabel && <div className="mt-1 text-[11px] font-semibold text-[var(--at-mut)]">{subLabel}</div>}
        </div>
        <div className="flex shrink-0 items-center gap-2.5">
          <div className="text-right">
            <div className="text-[10px] font-semibold text-[var(--at-mut)]">期待値</div>
            <div className={`whitespace-nowrap font-mono text-[17px] font-black tabular-nums ${evCls}`}>
              {hasEv ? signed(ev) : "—"}{hasEv && <span className="text-[9px]">円</span>}
            </div>
          </div>
          <div className="border-l border-[var(--at-ln)] pl-2.5 text-right">
            <div className="text-[10px] font-semibold text-[var(--at-mut)]">収支</div>
            <div className={`whitespace-nowrap font-mono text-[17px] font-black tabular-nums ${moneyClass(actual)}`}>
              {signed(actual)}<span className="text-[9px]">円</span>
            </div>
          </div>
          <ChevronRight className="h-4 w-4 shrink-0 text-[var(--at-faint)]" />
        </div>
      </div>
      {/* 中段: 投資 / 回収 / 収支 / 期待値 の4列 */}
      <div className="mt-3 grid grid-cols-4 gap-1 border-t border-[var(--at-ln)] pt-2.5 text-center">
        {middle.map((m) => (
          <div key={m.label} className="min-w-0">
            <div className="truncate text-[10px] font-semibold text-[var(--at-mut)]">{m.label}</div>
            <div className={`mt-1 truncate whitespace-nowrap font-mono text-[13px] font-black tabular-nums ${m.cls}`}>{m.value}</div>
          </div>
        ))}
      </div>
      {/* 下段: 時間 / 時給 */}
      <div className="mt-2.5 flex items-center gap-4 border-t border-[var(--at-ln)] pt-2 text-[11px] font-semibold text-[var(--at-mut)]">
        <span>時間 <span className="font-mono text-[13px] font-black tabular-nums text-[var(--at-strong)]">{hours > 0 ? hours.toFixed(1) : "0.0"}</span>h</span>
        <span className="border-l border-[var(--at-ln)] pl-4">
          時給 <span className={`font-mono text-[13px] font-black tabular-nums ${wage !== 0 ? moneyClass(wage) : "text-[var(--at-strong)]"}`}>{wage !== 0 ? signed(wage) : "0"}</span>円/h
        </span>
      </div>
    </button>
  );
}

function DayDetail({ dateLabel, row, onEditRecords, archives = [] }) {
  const detail = row || {};
  const actual = Number(detail.actual) || 0;
  const ev = Number(detail.ev) || 0;
  const diffVal = actual - ev;
  // 稼働時間は日別集計（dayMap）に含まれないため、未連携時は「—」を表示（将来連携予定）。
  const hours = Number(detail.hours) || 0;
  const stats = [
    { label: "実収支", value: `${signed(actual)}円`, cls: moneyClass(actual) },
    { label: "期待値", value: `${signed(ev)}円`, cls: ev >= 0 ? "text-[var(--at-cyan)]" : "text-[var(--at-neg)]" },
    { label: "差", value: `${signed(diffVal)}円`, cls: moneyClass(diffVal) },
    { label: "稼働時間", value: hours > 0 ? `${hours.toFixed(1)}時間` : "—", cls: "text-[var(--at-strong)]" },
  ];
  return (
    <section className={`${card} p-4`}>
      <div className="text-[15px] font-black text-[var(--at-strong)]">{dateLabel}</div>
      {/* 実収支 / 期待値 / 差 / 稼働時間（4列・モック準拠）。 */}
      <div className="mt-3 grid grid-cols-4 gap-1.5 border-t border-[var(--at-ln)] pt-3">
        {stats.map((s) => (
          <div key={s.label} className="min-w-0">
            <div className="truncate text-[10px] text-[var(--at-mut)]">{s.label}</div>
            <div className={`mt-1.5 whitespace-nowrap font-mono text-[clamp(11px,3.2vw,13px)] font-black leading-none tracking-[-.04em] tabular-nums ${s.cls}`}>{s.value}</div>
          </div>
        ))}
      </div>
      {/* 記録の編集・追加はカレンダーなしの編集シート（CalendarTab focusMode）へ直行する。
          記録のない日は「記録を追加」表記で追加フォームが展開済みのシートを開く。 */}
      <button type="button" onClick={() => onEditRecords(null)} className="mt-3 flex h-10 w-full items-center justify-center gap-1.5 rounded-lg border border-[var(--at-ln-md)] bg-[var(--at-panel2)] text-[11px] font-bold text-[var(--at-subtle)]">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
        </svg>
        {row ? "記録を編集" : "記録を追加"}
      </button>
      {/* この日の実践記録カード（タップで該当記録の編集シートへ直行）。記録がない日は何も表示しない */}
      {archives.map((a) => (
        <DaySessionCard key={a.id} archive={a} onOpen={() => onEditRecords(a.id)} />
      ))}
    </section>
  );
}

function CalendarPanel({ dayMap, selectedDay, setSelectedDay, year, month }) {
  // 月の初日曜日と日数から正しいグリッドを生成する（固定px・固定30日を避ける）。
  const blanks = new Date(year, month - 1, 1).getDay();
  const count = new Date(year, month, 0).getDate();
  const cells = [...Array(blanks).fill(null), ...Array.from({ length: count }, (_, i) => i + 1)];
  return (
    <section className={`${card} p-3.5`}>
      {/* 見出し（凡例は廃止しシンプルに）。 */}
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-5 w-5 shrink-0 text-[var(--at-cyan)]" />
          <h2 className="text-[14px] font-black tracking-[.02em] text-[var(--at-strong)]">日別ヒートマップ</h2>
        </div>
        <span className="shrink-0 text-[10px] font-bold text-[var(--at-mut)]">タップで日別詳細</span>
      </div>
      {/* 曜日見出し。日曜は赤系・土曜は青系。セルと同じ7列・同じ余白で整列。 */}
      <div className="grid grid-cols-7 gap-1 px-0.5 text-center text-[11px] font-bold text-[var(--at-mut3)]">
        {WEEKDAYS.map((day, index) => (
          <span key={day} className={index === 0 ? "text-[var(--at-sun)]" : index === 6 ? "text-[var(--at-sat)]" : ""}>{day}</span>
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
          : <div key={`blank-${index}`} className="aspect-square rounded-[8px] border border-[var(--at-ln-soft)] bg-[var(--at-cellbg)]" />)}
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
        <div className="py-10 text-center text-[10px] text-[var(--at-mut)]">対象期間の記録がありません</div>
      ) : (
        <div className="grid grid-cols-3 gap-1.5">
          {displayRows.map((row) => (
            <div key={row.key} className="rounded-lg border border-[var(--at-ln)] bg-[var(--at-panel2)] p-2.5">
              <div className="text-[10px] font-black text-[var(--at-strong)]">{row.label}</div>
              <div className={`mt-2 font-mono text-[13px] font-black ${moneyClass(row.actual)}`}>{signed(row.actual)}円</div>
              <div className="mt-1 font-mono text-[9px] font-bold text-[var(--at-cyan)]">期待値 {signed(row.ev)}円</div>
              <div className="mt-2 text-[8px] text-[var(--at-mut)]">稼働 {row.days || 0}日</div>
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
            {/* 負のマージンはY軸ラベルの左端切れ・横はみ出しの原因になるため使わず、YAxis width で余白を管理する */}
            <LineChart data={data} margin={{ top: 4, right: 3, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="rgba(255,255,255,.07)" vertical={false} />
              <XAxis dataKey="day" tick={{ fill: "#8794a9", fontSize: 7 }} tickLine={false} axisLine={false} interval={6} />
              <YAxis width={38} tick={{ fill: "#8794a9", fontSize: 7 }} tickLine={false} axisLine={false} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
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

// 表彰台（1〜3位）。中央＝1位を一回り大きく表示し、実収支の符号で緑/赤に色分けする。
// rows は既に実収支（actualPL）降順で渡ってくる想定（machineRanking のデフォルト順）。
const RANK_BADGE = [
  "bg-[var(--at-gold)] text-[#1d1503]",
  "bg-[var(--at-subtle-hi)]/15 text-[var(--at-subtle-hi)]",
  "bg-[var(--at-amber)]/15 text-[var(--at-amber)]",
];
function MachinePodium({ rows }) {
  const top3 = rows.slice(0, 3);
  if (top3.length === 0) {
    return <section className={`${card} p-4 text-center text-[11px] text-[var(--at-mut)]`}>対象期間の記録がありません</section>;
  }
  return (
    <section className="grid grid-cols-3 items-end gap-2">
      {[1, 0, 2].map((idx) => {
        const m = top3[idx];
        if (!m) return <div key={idx} />;
        const isFirst = idx === 0;
        return (
          <div
            key={m.machineName}
            className={`rounded-2xl border text-center ${
              isFirst
                ? "border-[var(--at-gold)]/40 bg-[image:linear-gradient(170deg,rgba(255,200,61,.16),rgba(255,200,61,.02))] px-2.5 py-4"
                : `${card} px-2.5 py-3.5`
            }`}
          >
            <div className={`mx-auto flex items-center justify-center rounded-full font-mono font-black ${isFirst ? "h-8 w-8 text-[15px]" : "h-7 w-7 text-[13px]"} ${RANK_BADGE[idx]}`}>
              {idx + 1}
            </div>
            <div className={`mt-2 line-clamp-2 font-black leading-tight text-[var(--at-strong)] ${isFirst ? "text-[13px]" : "text-[12px]"}`}>
              {m.machineName}
            </div>
            <div className={`mt-1.5 font-mono font-black tabular-nums ${moneyClass(m.actualPL)} ${isFirst ? "text-[20px]" : "text-[16px]"}`}>
              {signed(m.actualPL)}
            </div>
            <div className="mt-0.5 truncate text-[9px] font-bold text-[var(--at-mut)]">
              勝率{m.winRate || 0}%・{m.spin ? Number(m.spin).toFixed(1) : "—"}回/k
            </div>
          </div>
        );
      })}
    </section>
  );
}

// 実収支バランス：機種名＋符号付き金額を並べ、下に水平バー。多列テーブルを使わない。
function BalanceBars({ rows }) {
  if (rows.length === 0) return null;
  const maxAbs = Math.max(1, ...rows.map((row) => Math.abs(row.actualPL)));
  return (
    <section className={`${card} p-3.5`}>
      <SectionTitle note="機種別（実収支）">実収支バランス</SectionTitle>
      <div className="space-y-2.5">
        {rows.map((row) => (
          <div key={row.machineName}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="min-w-0 truncate text-[12px] font-bold text-[var(--at-subtle-hi)]">{row.machineName}</span>
              <span className={`shrink-0 font-mono text-[13px] font-black tabular-nums ${moneyClass(row.actualPL)}`}>{signed(row.actualPL)}円</span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-[var(--at-ln-soft)]">
              <div
                className={`h-full rounded-full ${row.actualPL >= 0 ? "bg-[var(--at-pos)]" : "bg-[var(--at-neg)]"}`}
                style={{ width: `${Math.max(4, Math.round((Math.abs(row.actualPL) / maxAbs) * 100))}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// 店舗トップ3。行タップで店舗詳細（storeDetailName）へ遷移する。
function StorePanel({ rows, onSelect }) {
  const top3 = rows.slice(0, 3);
  if (top3.length === 0) {
    return <section className={`${card} p-4 text-center text-[11px] text-[var(--at-mut)]`}>対象期間の記録がありません</section>;
  }
  return (
    <section className={`${card} p-0`}>
      <div className="flex items-center justify-between px-3.5 pb-1.5 pt-3">
        <h2 className="text-[14px] font-black text-[var(--at-strong)]">店舗トップ3</h2>
        <span className="text-[11px] font-bold text-[var(--at-cyan)]">すべて見る</span>
      </div>
      {top3.map((row, index) => (
        <button
          key={row.storeName}
          type="button"
          onClick={() => onSelect?.(row.storeName)}
          className="flex w-full items-center gap-3 border-t border-[var(--at-ln-soft)] px-3.5 py-3 text-left"
        >
          <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg font-mono text-[12px] font-black ${RANK_BADGE[index]}`}>{index + 1}</span>
          <span className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-bold text-[var(--at-strong)]">{row.storeName}</div>
            <div className="text-[10.5px] font-semibold text-[var(--at-mut)]">期待値 {signed(row.ev)}円 ・ {row.days}日</div>
          </span>
          <span className={`shrink-0 font-mono text-[15px] font-black tabular-nums ${moneyClass(row.actual)}`}>{signed(row.actual)}円</span>
          <ChevronRight className="h-4 w-4 shrink-0 text-[var(--at-faint)]" />
        </button>
      ))}
    </section>
  );
}

function ShareCTA({ onShare, title = "今月の結果を共有", subtitle = "月間収支カードをSNSに投稿できます" }) {
  return (
    <section className={`${card} flex items-center gap-3 p-4`}>
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-[var(--at-cyan)]/40 bg-[var(--at-cyan)]/10">
        <Share2 className="h-6 w-6 text-[var(--at-cyan)]" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[14px] font-black text-[var(--at-strong)]">{title}</div>
        <p className="mt-0.5 text-[11px] text-[var(--at-mut)]">{subtitle}</p>
      </div>
      <button type="button" onClick={onShare} className="h-12 shrink-0 rounded-lg border border-[var(--at-cyan)]/70 bg-[var(--at-cyan)]/10 px-4 text-[13px] font-black text-[var(--at-cyan)]">
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
        <select value={filters.storeName || ""} onChange={(e) => setFilters({ ...filters, storeName: e.target.value })} className="mt-1 h-9 w-full rounded-md border border-[var(--at-ln-md)] bg-[var(--at-panel)] px-2 text-[10px] text-[var(--at-strong)]">
          <option value="">すべての店舗</option>
          {stores.map((store) => <option key={store} value={store}>{store}</option>)}
        </select>
      </div>
      <div>
        <label className={label}>機種</label>
        <select value={filters.machineName || ""} onChange={(e) => setFilters({ ...filters, machineName: e.target.value })} className="mt-1 h-9 w-full rounded-md border border-[var(--at-ln-md)] bg-[var(--at-panel)] px-2 text-[10px] text-[var(--at-strong)]">
          <option value="">すべての機種</option>
          {machines.map((machine) => <option key={machine} value={machine}>{machine}</option>)}
        </select>
      </div>
      <button type="button" onClick={onClose} className="text-left text-[9px] font-bold text-[var(--at-cyan)]">絞り込みを閉じる</button>
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
function SummaryStat({ label, value, cls = "text-[var(--at-strong)]" }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg bg-[var(--at-rowbg)] px-3 py-2.5">
      <span className="shrink-0 text-[11px] text-[var(--at-mut)]">{label}</span>
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
            {/* 負のマージンはY軸ラベルの左端切れ・横はみ出しの原因になるため使わず、YAxis width で余白を管理する */}
            <ComposedChart data={chartData} margin={{ top: 6, right: 4, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="rgba(255,255,255,.07)" vertical={false} />
              <XAxis dataKey="day" tick={{ fill: "#8794a9", fontSize: 8 }} tickLine={false} axisLine={false} interval={6} />
              <YAxis width={38} tick={{ fill: "#8794a9", fontSize: 8 }} tickLine={false} axisLine={false} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
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
        <div className="text-[15px] font-black text-[var(--at-strong)]">今月の成績</div>
        <div className={`whitespace-nowrap font-mono text-[clamp(20px,7.6vw,30px)] font-black leading-none tracking-[-.04em] tabular-nums ${moneyClass(score)}`}>{signed(score)}<span className="ml-1 text-[13px]">円</span></div>
      </section>
      {/* 統計グリッド（2列）。期待値系は未連携のため「—」表示。 */}
      <div className="grid grid-cols-2 gap-2">
        {stats.map((s) => <SummaryStat key={s.label} label={s.label} value={s.value} cls={s.cls} />)}
      </div>
    </>
  );
}

// 画面ヘッダー。左に前の月（‹）、中央に期間ラベル＋次の月（›）、右端に「月次詳細」トグルボタン（月別のみ）。
// 月別/年別/通算/分析+ の切替は常設ピル（MonthPillTabs、ヘッダー直下）に統合したため、
// ヘッダー側のタップ式プルダウンは廃止した（5b 常設タブ＋期間スクラバー 採用に伴う変更）。
function HeaderBar({ title, onPrev, onNext, navDisabled, onToggleDetail, detailActive }) {
  const hasNav = Boolean(onPrev && onNext);
  return (
    <div className="relative z-40 mb-3 flex h-12 shrink-0 items-center justify-between">
      {/* 左：前の月（カレンダーのフリックと併存）。 */}
      {hasNav ? (
        <button type="button" onClick={onPrev} disabled={navDisabled} aria-label="前へ" className="flex h-10 w-10 items-center justify-center rounded-xl text-[var(--at-subtle)] disabled:opacity-20">
          <ChevronLeft className="h-6 w-6" />
        </button>
      ) : <span className="h-10 w-10 shrink-0" />}

      {/* 中央：期間ラベル＋次の月（絶対配置で中央寄せ）。 */}
      <div className="absolute left-1/2 flex -translate-x-1/2 items-center gap-1">
        <h1 className="whitespace-nowrap px-1.5 py-0.5 text-[21px] font-black tracking-[.01em] text-[var(--at-strong)]">{title}</h1>
        {hasNav && (
          <button type="button" onClick={onNext} disabled={navDisabled} aria-label="次へ" className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--at-subtle)] disabled:opacity-20">
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
              ? "border-[var(--at-cyan)] bg-[var(--at-cyan)]/12 text-[var(--at-cyan)] shadow-[0_0_18px_rgba(22,200,255,.18)]"
              : "border-[var(--at-ln-hi)] bg-[var(--at-panel2)] text-[var(--at-subtle-hi)]"
          }`}
        >
          <BarChart3 className="h-[18px] w-[18px]" />
          月次詳細
        </button>
      ) : <span className="h-10 w-10 shrink-0" />}
    </div>
  );
}

// 店舗詳細（#3a）: 1店舗の指標（実施回数・勝敗・勝率・時間・投資/回収・平均額・時給・期待値合計/平均）＋実施履歴。
// archives は呼び出し側で既に対象スコープ（現在のフィルタ）まで絞り込み済みのものを渡す想定。
function StoreStatRow({ label, value, cls = "text-[var(--at-strong)]" }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-3 border-b border-[var(--at-ln-soft)] py-2 last:border-b-0">
      <span className="text-[12px] font-semibold text-[var(--at-mut)]">{label}</span>
      <span className={`font-mono text-[15px] font-black tabular-nums ${cls}`}>{value}</span>
    </div>
  );
}

function StoreDetailScreen({ storeName, archives, isDemo, onBack }) {
  const storeArchives = useMemo(
    () => archives.filter((a) => (a?.storeName || "") === storeName),
    [archives, storeName],
  );

  const demoStore = isDemo ? DEMO_STORES.find((s) => s.storeName === storeName) : null;

  const summaryX = useMemo(() => (isDemo ? null : summarize(storeArchives)), [isDemo, storeArchives]);
  const avgSpin = useMemo(() => {
    if (isDemo) return demoStore?.spin ?? null;
    const store = storeAnalysis(storeArchives).find((s) => s.storeName === storeName);
    return store?.spinRate ?? null;
  }, [isDemo, storeArchives, storeName, demoStore]);
  const isTopStore = useMemo(() => {
    if (isDemo) return DEMO_STORES[0]?.storeName === storeName;
    return storeAnalysis(archives)[0]?.storeName === storeName;
  }, [isDemo, archives, storeName]);

  const heroPL = isDemo ? (demoStore?.actual ?? 0) : (summaryX.totalRealPL || 0);
  const visits = useMemo(() => {
    return [...storeArchives]
      .map((a) => ({
        key: a.id ?? `${a.date}-${a.time}`,
        date: a.date,
        machineName: a.machineName || "未設定",
        pl: getActualPL(a),
        ev: getEvAmount(a),
      }))
      .sort((a, b) => {
        if (a.pl != null && b.pl == null) return -1;
        if (a.pl == null && b.pl != null) return 1;
        if (a.pl != null && b.pl != null) return b.pl - a.pl;
        return (b.date || "").localeCompare(a.date || "");
      });
  }, [storeArchives]);

  const stats = isDemo
    ? [
      { label: "実施回数", value: `${demoStore?.days ?? 0}回` },
      { label: "勝ち・負け", value: "—" },
      { label: "勝率", value: "—" },
      { label: "総遊技時間", value: "—" },
      { label: "投資合計", value: "—" },
      { label: "回収合計", value: "—" },
      { label: "平均額", value: "—" },
      { label: "時給", value: "—" },
      { label: "期待値合計", value: `${signed(demoStore?.ev ?? 0)}円`, cls: "text-[var(--at-cyan)]" },
      { label: "期待値平均", value: "—" },
    ]
    : [
      { label: "実施回数", value: `${summaryX.sessions}回` },
      { label: "勝ち・負け", value: `${summaryX.winCount}勝${Math.max(0, summaryX.realSessions - summaryX.winCount)}敗` },
      { label: "勝率", value: summaryX.winRate != null ? `${Math.round(summaryX.winRate)}%` : "—", cls: "text-[var(--at-gold)]" },
      { label: "総遊技時間", value: `${summaryX.workHours.toFixed(1)}h` },
      { label: "投資合計", value: `${fmt(summaryX.totalInvest)}円` },
      { label: "回収合計", value: `${fmt(summaryX.totalRecovery)}円` },
      {
        label: "平均額",
        value: summaryX.realSessions > 0 ? `${signed(Math.round(summaryX.totalRealPL / summaryX.realSessions))}円` : "—",
        cls: summaryX.realSessions > 0 ? moneyClass(summaryX.totalRealPL) : undefined,
      },
      {
        label: "時給",
        value: summaryX.wage != null ? `${signed(summaryX.wage)}円/h` : "—",
        cls: summaryX.wage != null ? moneyClass(summaryX.wage) : undefined,
      },
      { label: "期待値合計", value: `${signed(Math.round(summaryX.evAmount))}円`, cls: "text-[var(--at-cyan)]" },
      {
        label: "期待値平均",
        value: summaryX.sessions > 0 ? `${signed(Math.round(summaryX.evAmount / summaryX.sessions))}円` : "—",
        cls: "text-[var(--at-cyan)]",
      },
    ];

  return (
    <div className="analytics-terminal flex min-h-0 flex-1 flex-col overflow-hidden bg-[var(--at-page)] text-[var(--at-strong)]">
      <div className="relative mx-auto flex min-h-0 w-full max-w-[430px] flex-1 flex-col px-5 pt-4">
        <div className="flex items-center gap-2.5">
          <button type="button" onClick={onBack} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[var(--at-ln-md)] bg-[var(--at-panel2)] text-[var(--at-mut)]">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-extrabold tracking-[.24em] text-[var(--at-gold)]">STORE REPORT</div>
            <h1 className="mt-0.5 truncate text-[19px] font-black leading-tight">{storeName}</h1>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-[var(--at-ln-md)] px-3 py-1.5 text-[11px] font-bold text-[var(--at-subtle-hi)]">全期間</span>
          {isTopStore && (
            <span className="rounded-full border border-[var(--at-gold)]/35 bg-[var(--at-gold)]/10 px-3 py-1.5 text-[11px] font-extrabold text-[var(--at-gold)]">店舗1位</span>
          )}
        </div>

        <div className="mt-4 flex items-end justify-between gap-3">
          <div>
            <div className="text-[12px] font-extrabold tracking-[.14em] text-[var(--at-mut)]">この店舗での収支</div>
            <div className="mt-1 flex items-baseline gap-1">
              <span className={`font-mono text-[42px] font-black leading-none tracking-[-.03em] tabular-nums ${moneyClass(heroPL)}`}>{signed(heroPL)}</span>
              <span className="pb-0.5 text-[14px] font-extrabold text-[var(--at-mut)]">円</span>
            </div>
          </div>
          <div className="pb-1 text-right">
            <div className="text-[10px] font-extrabold text-[var(--at-mut)]">平均回転率</div>
            <div className="mt-0.5 font-mono text-[18px] font-black tabular-nums">
              {avgSpin != null ? avgSpin.toFixed(1) : "—"}<span className="text-[10px] font-bold text-[var(--at-mut)]">回/k</span>
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden overscroll-contain pb-12 pt-4">
          <section className={`${card} px-4 py-1`}>
            {stats.map((s) => <StoreStatRow key={s.label} {...s} />)}
          </section>

          <section className={`${card} p-0`}>
            <div className="flex items-center justify-between px-3.5 pb-1.5 pt-3">
              <h2 className="text-[14px] font-black text-[var(--at-strong)]">実施履歴</h2>
              <span className="text-[11px] font-bold text-[var(--at-mut)]">収支順</span>
            </div>
            {visits.length === 0 ? (
              <div className="px-3.5 py-6 text-center text-[11px] text-[var(--at-mut)]">実戦記録がありません</div>
            ) : (
              visits.map((v) => (
                <div key={v.key} className="flex items-center gap-3 border-t border-[var(--at-ln-soft)] px-3.5 py-3">
                  <span className="w-14 shrink-0 font-mono text-[12px] font-extrabold text-[var(--at-subtle-hi)]">{v.date?.slice(5).replace("-", "/")}</span>
                  <span className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-extrabold">{v.machineName}</div>
                    <div className="text-[10.5px] font-bold text-[var(--at-cyan)]">期待値 {signed(Math.round(v.ev))}円</div>
                  </span>
                  <span className={`shrink-0 font-mono text-[15px] font-black tabular-nums ${v.pl != null ? moneyClass(v.pl) : "text-[var(--at-faint)]"}`}>
                    {v.pl != null ? `${signed(v.pl)}円` : "—"}
                  </span>
                </div>
              ))
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

// 機種詳細（#4a）: 1機種の複数実戦履歴を推移グラフ＋明細表で表示。
// archives は呼び出し側で既に対象スコープ（現在のフィルタ）まで絞り込み済みのものを渡す想定。
function buildMachineSessions(archives, machineName) {
  return archives
    .filter((a) => (a?.machineName || "") === machineName)
    .map((a) => ({
      key: a.id ?? `${a.date}-${a.time}`,
      sortKey: `${a.date || ""}_${a.id ?? 0}`,
      date: a.date,
      store: a.storeName || "未設定",
      pl: getActualPL(a),
      ev: getEvAmount(a),
      invest: Number(a.investYen) || 0,
      recovery: Number(a.recoveryYen) || 0,
      spin: getSpinRate(a),
      hours: archiveWorkMinutes(a) / 60,
      netRot: Number(a?.stats?.netRot) || 0,
    }))
    .sort((a, b) => a.sortKey.localeCompare(b.sortKey));
}

function MachineDetailScreen({ machineName, archives, isDemo, onBack }) {
  const demoMachine = isDemo ? DEMO_MACHINES.find((m) => m.machineName === machineName) : null;

  const chartRows = useMemo(() => {
    if (isDemo) return [];
    let cum = 0;
    let cumEv = 0;
    return buildMachineSessions(archives, machineName).map((s) => {
      cum += s.pl ?? 0;
      cumEv += s.ev;
      const [, m, d] = (s.date || "").split("-");
      return { ...s, day: m && d ? `${Number(m)}/${Number(d)}` : s.date, cum, cumEv };
    });
  }, [isDemo, archives, machineName]);

  const rows = useMemo(() => [...chartRows].reverse(), [chartRows]);

  const summaryX = useMemo(() => {
    if (isDemo || chartRows.length === 0) return null;
    const realRows = chartRows.filter((s) => s.pl != null);
    const wins = realRows.filter((s) => s.pl > 0).length;
    const totalHours = chartRows.reduce((t, s) => t + s.hours, 0);
    const totalPl = chartRows[chartRows.length - 1].cum;
    const spinRows = chartRows.filter((s) => s.spin != null);
    return {
      count: chartRows.length,
      totalPl,
      totalEv: chartRows[chartRows.length - 1].cumEv,
      winRate: realRows.length > 0 ? Math.round((wins / realRows.length) * 100) : null,
      wins, losses: realRows.length - wins,
      avgSpin: spinRows.length > 0 ? spinRows.reduce((t, s) => t + s.spin, 0) / spinRows.length : null,
      totalSpins: chartRows.reduce((t, s) => t + s.netRot, 0),
      totalHours,
      wage: totalHours > 0 && realRows.length > 0 ? Math.round(totalPl / totalHours) : null,
    };
  }, [isDemo, chartRows]);

  const heroPL = isDemo ? (demoMachine?.actualPL ?? 0) : (summaryX?.totalPl ?? 0);
  const heroEv = isDemo ? (demoMachine?.evAmount ?? 0) : (summaryX?.totalEv ?? 0);

  return (
    <div className="analytics-terminal flex min-h-0 flex-1 flex-col overflow-hidden bg-[var(--at-page)] text-[var(--at-strong)]">
      <div className="relative mx-auto flex min-h-0 w-full max-w-[430px] flex-1 flex-col px-5 pt-4">
        <div className="flex items-center gap-2.5">
          <button type="button" onClick={onBack} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[var(--at-ln-md)] bg-[var(--at-panel2)] text-[var(--at-mut)]">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-extrabold tracking-[.24em] text-[var(--at-gold)]">MACHINE REPORT</div>
            <h1 className="mt-0.5 truncate text-[19px] font-black leading-tight">{machineName}</h1>
          </div>
        </div>

        <div className="mt-4">
          <div className="text-[12px] font-extrabold tracking-[.14em] text-[var(--at-mut)]">この機種の通算収支</div>
          <div className={`mt-1 font-mono text-[42px] font-black leading-none tracking-[-.03em] tabular-nums ${moneyClass(heroPL)}`}>{signed(heroPL)}</div>
          <div className="mt-2 text-[12px] font-extrabold text-[var(--at-cyan)]">期待値累計 {signed(heroEv)}円</div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-[var(--at-ln-md)] px-3 py-1.5 text-[11px] font-bold text-[var(--at-subtle-hi)]">
            実戦 {isDemo ? "—" : summaryX?.count ?? 0}回
          </span>
          <span className="rounded-full border border-[var(--at-gold)]/35 bg-[var(--at-gold)]/10 px-3 py-1.5 text-[11px] font-extrabold text-[var(--at-gold)]">
            勝率 {isDemo ? (demoMachine?.winRate ?? "—") : (summaryX?.winRate ?? "—")}%
            {!isDemo && summaryX && <>（{summaryX.wins}勝{summaryX.losses}敗）</>}
          </span>
          <span className="rounded-full border border-[var(--at-ln-md)] px-3 py-1.5 text-[11px] font-bold text-[var(--at-subtle-hi)]">
            時給 {!isDemo && summaryX?.wage != null ? `${signed(summaryX.wage)}円/h` : "—"}
          </span>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden overscroll-contain pb-12 pt-4">
          <section className={`${card} overflow-hidden p-3`}>
            <SectionTitle note="累計実収支（実線）／累計期待値（破線）">実戦ごとの累計推移</SectionTitle>
            {chartRows.length === 0 ? (
              <div className="px-2 py-8 text-center text-[11px] text-[var(--at-mut)]">実戦記録がありません</div>
            ) : (
              <div className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartRows} margin={{ top: 6, right: 4, bottom: 0, left: 0 }}>
                    <CartesianGrid stroke="rgba(255,255,255,.07)" vertical={false} />
                    <XAxis dataKey="day" tick={{ fill: "#8794a9", fontSize: 8 }} tickLine={false} axisLine={false} />
                    <YAxis width={38} tick={{ fill: "#8794a9", fontSize: 8 }} tickLine={false} axisLine={false} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                    <ReferenceLine y={0} stroke="rgba(255,255,255,.2)" />
                    <Tooltip contentStyle={{ background: "#071326", border: "1px solid rgba(255,255,255,.12)", borderRadius: 8, fontSize: 10 }} formatter={(value) => `${signed(value)}円`} />
                    <Legend iconSize={8} wrapperStyle={{ fontSize: 9 }} />
                    <Bar dataKey="pl" name="単発収支" radius={[2, 2, 0, 0]} maxBarSize={16}>
                      {chartRows.map((d, i) => <Cell key={i} fill={(d.pl ?? 0) >= 0 ? "rgba(37,211,102,.5)" : "rgba(255,99,122,.45)"} />)}
                    </Bar>
                    <Line type="monotone" dataKey="cum" name="累計実収支" stroke="#25D366" strokeWidth={2.2} dot={false} />
                    <Line type="monotone" dataKey="cumEv" name="累計期待値" stroke="#FFC83D" strokeWidth={1.6} strokeDasharray="4 3" dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}
          </section>

          <section className={`${card} px-4 py-3`}>
            <div className="mb-1 text-[14px] font-black">通算サマリー</div>
            <div className="grid grid-cols-3 gap-2">
              <MiniStat label="平均回転率" value={!isDemo && summaryX?.avgSpin != null ? `${summaryX.avgSpin.toFixed(1)}回/k` : (isDemo ? `${demoMachine?.spin ?? "—"}回/k` : "—")} />
              <MiniStat label="総回転数" value={!isDemo && summaryX ? `${fmt(summaryX.totalSpins)}G` : "—"} />
              <MiniStat label="総遊技時間" value={!isDemo && summaryX ? `${summaryX.totalHours.toFixed(1)}h` : (isDemo ? `${demoMachine?.hours ?? "—"}h` : "—")} />
            </div>
          </section>

          <section className={`${card} p-0`}>
            <div className="flex items-center justify-between px-3.5 pb-1.5 pt-3">
              <h2 className="text-[14px] font-black text-[var(--at-strong)]">実戦履歴</h2>
              <span className="text-[11px] font-bold text-[var(--at-mut)]">新しい順</span>
            </div>
            {rows.length === 0 ? (
              <div className="px-3.5 py-6 text-center text-[11px] text-[var(--at-mut)]">実戦記録がありません</div>
            ) : (
              rows.map((r) => (
                <div key={r.key} className="border-t border-[var(--at-ln-soft)] px-3.5 py-3">
                  <div className="grid grid-cols-[1fr_66px_66px_62px] items-center gap-1.5 text-right">
                    <span className="min-w-0 text-left">
                      <div className="truncate text-[12.5px] font-black">{r.day}</div>
                      <div className="truncate text-[9.5px] font-bold text-[var(--at-mut)]">{r.store}</div>
                    </span>
                    <span className={`font-mono text-[12px] font-black tabular-nums ${r.pl != null ? moneyClass(r.pl) : "text-[var(--at-faint)]"}`}>{r.pl != null ? signed(r.pl) : "—"}</span>
                    <span className="font-mono text-[12px] font-black tabular-nums text-[var(--at-cyan)]">{signed(Math.round(r.ev))}</span>
                    <span className={`font-mono text-[12px] font-black tabular-nums ${moneyClass(r.cum)}`}>{signed(r.cum)}</span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-3.5 text-[9.5px] font-bold text-[var(--at-mut)]">
                    <span>投資 <span className="font-mono tabular-nums text-[var(--at-strong)]">{fmt(r.invest)}</span></span>
                    <span>回収 <span className="font-mono tabular-nums text-[var(--at-strong)]">{fmt(r.recovery)}</span></span>
                    <span>{r.spin != null ? `${r.spin.toFixed(1)}回/k` : "—"}</span>
                    <span>{r.hours > 0 ? `${r.hours.toFixed(1)}h` : "—"}</span>
                  </div>
                </div>
              ))
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function MiniStat({ label, value }) {
  return (
    <div className="min-w-0">
      <div className="text-[9.5px] font-bold text-[var(--at-mut)]">{label}</div>
      <div className="mt-0.5 truncate font-mono text-[14px] font-black tabular-nums">{value}</div>
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
  const [shareOpen, setShareOpen] = useState(false);
  const [monthOffset, setMonthOffset] = useState(0);
  // 月別画面の「月次詳細」表示トグル（false=カレンダー / true=収支グラフ＋成績）。
  const [detailView, setDetailView] = useState(false);
  // 月送り遷移の向き（next=左スワイプ/prev=右スワイプ/fade=メニュー切替）。CSSアニメーション用。
  const [slideDir, setSlideDir] = useState("fade");
  // 編集シート（CalendarTab focusMode）を開くためのサブ画面状態。
  //   null=非表示 / { day: "YYYY-MM-DD", archiveId: number|null }（archiveId 指定時はその記録の編集フォームを直接開く）
  const [recordsDay, setRecordsDay] = useState(null);
  // 店舗トップ3の行タップで開く店舗詳細のサブ画面状態。null=非表示 / string=対象の店舗名。
  const [storeDetailName, setStoreDetailName] = useState(null);
  // 分析+の機種カルテ行タップで開く機種詳細のサブ画面状態。null=非表示 / string=対象の機種名。
  const [machineDetailName, setMachineDetailName] = useState(null);
  // スワイプ判定用のタッチ開始座標。
  const touchRef = useRef({ x: 0, y: 0, active: false });

  // 常設ピル（月別/年別/通算/分析+）から期間/分析を選択（切替はフェード遷移）。
  // 月別以外へ移ると月次詳細トグルは意味を持たないため false に戻す。
  const handleSelectView = (id) => {
    setSlideDir("fade");
    setPeriodTab(id);
    setDetailView(false);
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

  // 期間スクラバーのチップタップで指定の月へ直接ジャンプ（相対送りの goPeriod と異なり絶対値指定）。
  const gotoMonth = (offset) => {
    if (offset === monthOffset) return;
    setSlideDir(offset > monthOffset ? "next" : "prev");
    setMonthOffset(offset);
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
  // 選択日の実践記録（日別詳細のカード表示用）。デモ表示中は実カードを出さない。
  const dayArchives = useMemo(
    () => (isDemo ? [] : filtered.filter((a) => a.date === selectedDateStr)),
    [filtered, isDemo, selectedDateStr],
  );

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
    const muted = "text-[var(--at-faint2)]";
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

  // 月別の「記録を編集/追加」導線で開く編集シートのサブ画面（カレンダーなし・該当記録へ直行）。
  if (recordsDay !== null) {
    // ヘッダー用の日付ラベルと日計（記録カードと同じ式: (回収−投資)−貯玉消費円）。
    const sheetDay = recordsDay.day;
    const sheetArchives = archives.filter((a) => a.date === sheetDay);
    const [sy, sm, sd] = sheetDay.split("-").map(Number);
    const sheetLabel = `${sm}月${sd}日（${WEEKDAYS[new Date(sy, sm - 1, sd).getDay()]}）記録を${sheetArchives.length > 0 ? "編集" : "追加"}`;
    let sheetPL = 0;
    let sheetHasActual = false;
    for (const a of sheetArchives) {
      const inv = Number(a.investYen) || 0;
      const rec = Number(a.recoveryYen) || 0;
      const cy = Number(a.chodamaYen) || 0;
      if (inv > 0 || rec > 0 || cy > 0) {
        sheetPL += (rec - inv) - cy;
        sheetHasActual = true;
      }
    }
    return (
      <div className="analytics-terminal flex min-h-0 flex-1 flex-col overflow-hidden bg-[var(--at-page)] text-[var(--at-strong)]">
        <div className="mx-auto flex w-full max-w-[430px] shrink-0 items-center gap-2 px-5 pt-4">
          <button type="button" onClick={() => setRecordsDay(null)} className="flex h-9 shrink-0 items-center gap-1 rounded-lg border border-[var(--at-ln-md)] bg-[var(--at-panel2)] px-3 text-[12px] font-bold text-[var(--at-subtle)]">
            <ChevronLeft className="h-4 w-4" />戻る
          </button>
          <h1 className="min-w-0 flex-1 truncate text-[15px] font-black tracking-[.02em]">{sheetLabel}</h1>
          {sheetHasActual && (
            <span className={`shrink-0 rounded-full border px-2.5 py-1 font-mono text-[11px] font-black tabular-nums ${sheetPL >= 0
              ? "border-[var(--at-heat-p-bd)] bg-[var(--at-heat-p)] text-[var(--at-pos)]"
              : "border-[var(--at-heat-m-bd)] bg-[var(--at-heat-m)] text-[var(--at-neg)]"}`}>
              日計 {signed(sheetPL)}円
            </span>
          )}
        </div>
        {/* スクロールを画面内に閉じ込める（親mainの高さ依存を避け、下部ナビと重ならない）。
            overflow-x-hidden 必須: overflow-y のみ指定だと横方向が auto になり、幅超過要素があると画面全体が左へパンしたまま固定される */}
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain">
          <CalendarTab S={S} onReset={onReset} initialDate={sheetDay} focusMode initialArchiveId={recordsDay.archiveId} onDone={() => setRecordsDay(null)} />
        </div>
      </div>
    );
  }

  // 分析タブの店舗トップ3タップで開く店舗詳細のサブ画面。
  // 分析タブの集計は期間絞り込みなし（periodFilters === {} for "analyzer"）のため、対象は常に全期間。
  if (storeDetailName !== null) {
    return (
      <StoreDetailScreen
        storeName={storeDetailName}
        archives={filterArchives(archives, filters)}
        isDemo={isDemo}
        onBack={() => setStoreDetailName(null)}
      />
    );
  }

  // 分析+の機種カルテ行タップで開く機種詳細のサブ画面。店舗詳細と同じく全期間スコープ。
  if (machineDetailName !== null) {
    return (
      <MachineDetailScreen
        machineName={machineDetailName}
        archives={filterArchives(archives, filters)}
        isDemo={isDemo}
        onBack={() => setMachineDetailName(null)}
      />
    );
  }

  if (periodTab === "analyzer") {
    return (
      <div className="analytics-terminal flex min-h-0 flex-1 flex-col overflow-hidden bg-[var(--at-page)] text-[var(--at-strong)]">
        <div className="relative mx-auto flex min-h-0 w-full max-w-[430px] flex-1 flex-col px-5 pt-4">
          <HeaderBar title={headerTitle} />
          <MonthPillTabs current={periodTab} onSelect={handleSelectView} />
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden overscroll-contain pb-12">
            {filterOpen && <FilterPanel stores={storeOptions} machines={machineOptions} filters={filters} setFilters={setFilters} onClose={() => setFilterOpen(false)} />}
            <MachinePodium rows={machines} />
            <BalanceBars rows={machines} />
            <StorePanel rows={stores} onSelect={setStoreDetailName} />
            <AnalyzerView archives={archives} extraFilters={filters} onSelectMachine={setMachineDetailName} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="analytics-terminal flex min-h-0 flex-1 flex-col overflow-hidden bg-[var(--at-page)] text-[var(--at-strong)]">
      <div className="relative mx-auto flex min-h-0 w-full max-w-[430px] flex-1 flex-col px-5 pt-4">
        {/* 左の ‹ ／ 右側の › と中央ラベル横の › で月（年別は年）送り。
            右端の「月次詳細」ボタンでカレンダーと収支グラフ＋成績を同一画面で切り替える（月別のみ）。 */}
        <HeaderBar
          title={headerTitle}
          onPrev={() => goPeriod(-1)}
          onNext={() => goPeriod(1)}
          navDisabled={periodTab === "all"}
          onToggleDetail={periodTab === "month" ? toggleDetailView : undefined}
          detailActive={detailView}
        />
        {/* 常設ピル：月別/年別/通算/分析+ をどの画面からも1タップで切替（5b 常設タブ＋期間スクラバー 採用）。 */}
        <MonthPillTabs current={periodTab} onSelect={handleSelectView} />

        {filterOpen && <FilterPanel stores={storeOptions} machines={machineOptions} filters={filters} setFilters={setFilters} onClose={() => setFilterOpen(false)} />}

        {/* 画面内スクロール領域。横スワイプで月送り（縦スクロールは阻害しない）。 */}
        <main onTouchStart={onSwipeStart} onTouchEnd={onSwipeEnd} className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain pb-12">
          {/* 月送り・表示切替で key が変わり、向きに応じたアニメーションを再生する。 */}
          <div key={`${periodTab}-${monthOffset}-${detailView}`} className={`month-pane-${slideDir} space-y-5`}>
            {periodTab === "month" ? (
              detailView ? (
                /* 月次詳細：今月の収支グラフ＋成績＋統計（モック2）。 */
                <MonthDetailContent chartData={summaryChart} score={summaryScore} stats={summaryStats} />
              ) : (
                <>
                  {/* 期間スクラバー＋ヒーロー数値（勝率リング付き）＋日別ヒートマップ＋選択日詳細。 */}
                  <MonthScrubber
                    monthOffset={monthOffset}
                    baseDate={baseDate}
                    archives={archives}
                    filters={filters}
                    isDemo={isDemo}
                    currentActual={actual}
                    onSelect={gotoMonth}
                  />
                  <MonthHero actual={actual} ev={ev} diff={monthDiff} winRate={winRate} />
                  <CalendarPanel dayMap={dayMap} selectedDay={selectedDay} setSelectedDay={setSelectedDay} year={year} month={month} />
                  <DayDetail dateLabel={selectedDateLabel} row={dayMap[selectedDay]} archives={dayArchives} onEditRecords={(archiveId = null) => setRecordsDay({ day: selectedDateStr, archiveId })} />
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
