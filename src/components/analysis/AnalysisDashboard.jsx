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
  Plus,
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
  getEvBreakdown,
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
  { id: "month", label: "月別", desc: "日ごとの収支をカレンダーで確認", Icon: CalendarDays },
  { id: "year", label: "年別", desc: "月ごとの収支を比較", Icon: CalendarRange },
  { id: "all", label: "通算", desc: "すべての記録を合計", Icon: Sigma },
  { id: "analyzer", label: "詳細分析", desc: "機種・店舗ごとの成績", Icon: BarChart3 },
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
  { storeName: "サンプル店舗A", size: "大型店", spin: 17.6, ev: 4220, actual: 2910, days: 1 },
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
// カレンダーセル金額のフォントサイズ（桁数と画面幅で段階調整し、実額のまま枠内に収める）。
// セル幅を広げた（カード余白を詰めて gap を 4px→3px に）ぶん、各段階を 1〜2px ずつ大きくしている。
// 320px 幅でも「+100,000」相当まで収まる想定（tracking を詰めた tabular-nums 前提）。
const cellAmountSize = (text) => {
  if (text.length <= 5) return "text-[12px] min-[360px]:text-[13px]";
  if (text.length <= 6) return "text-[11px] min-[360px]:text-[12px]";
  if (text.length <= 7) return "text-[10px] min-[360px]:text-[11px]";
  if (text.length <= 8) return "text-[9px] min-[360px]:text-[10px]";
  if (text.length <= 9) return "text-[8px] min-[360px]:text-[9px]";
  return "text-[7px] min-[360px]:text-[8px]";
};
const shareCellAmountSize = (text) => {
  if (text.length <= 5) return "text-[8px]";
  if (text.length <= 6) return "text-[7px]";
  if (text.length <= 8) return "text-[6px]";
  return "text-[5px]";
};
// iOS のグループ化リスト（インセットグルーブド）に寄せたカード。角丸を大きめに、影は最小限。
const card = "rounded-[16px] border border-[var(--at-ln-soft)] bg-[image:var(--at-card-grad)] shadow-[var(--at-card-shadow2)]";
const label = "text-[12px] font-semibold text-[var(--at-mut)]";
// iOS のセクションヘッダー（カードの外・上に置く小さな見出し）。
function GroupLabel({ children, action }) {
  return (
    <div className="mb-1.5 flex items-end justify-between gap-2 px-1">
      <span className="text-[13px] font-semibold text-[var(--at-mut)]">{children}</span>
      {action}
    </div>
  );
}
// iOS の丸型ツールバーボタン（ナビゲーションバー右上などの円形ボタン）。最小 40px。
function RoundButton({ onClick, disabled, ariaLabel, active = false, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-pressed={active}
      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition active:scale-95 disabled:opacity-25 ${
        active
          ? "bg-[var(--at-cyan)] text-white"
          : "bg-[var(--at-rowbg)] text-[var(--at-cyan)]"
      }`}
    >
      {children}
    </button>
  );
}

function buildRealDays(archives, month) {
  return Object.fromEntries(
    aggregateByDay(archives, month).map((row) => [
      Number(row.date.slice(8, 10)),
      {
        // 月間ヒーローと同じく、現金収支に貯玉消費を含めた実質収支を使う。
        actual: row.hasActual ? (row.realPL ?? row.actualPL) : 0,
        ev: row.evAmount,
        date: row.date,
        hours: (row.workMinutes || 0) / 60,
      },
    ]),
  );
}

// 店舗別の集計（表示専用）。既存の getEvAmount / getActualPL をそのまま合算するだけで、
// 集計式そのものは変更していない。sortBy / limit は「すべて見る」の一覧画面で使う表示オプション。
const STORE_SORTS = [
  { id: "actual", label: "実収支順" },
  { id: "ev", label: "期待値順" },
  { id: "days", label: "稼働日数順" },
];
function buildStoreRanking(archives, { sortBy = "ev", limit = 5 } = {}) {
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
  const list = [...map.values()]
    .map((row) => ({
      ...row,
      size: "中型店",
      spin: row.spinCount ? row.spinTotal / row.spinCount : 0,
      days: row.days.size,
    }))
    .sort((a, b) => {
      if (sortBy === "actual") return b.actual - a.actual;
      if (sortBy === "days") return b.days - a.days || b.actual - a.actual;
      return b.ev - a.ev;
    });
  return limit > 0 ? list.slice(0, limit) : list;
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
    actual += row.realPL ?? row.actualPL ?? 0;
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
      actual: row.realPL ?? row.actualPL,
      ev: row.evAmount,
      days: row.days,
    }));
  }
  return aggregateByYear(archives).map((row) => ({
    key: row.year,
    label: `${row.year}年`,
    actual: row.realPL ?? row.actualPL,
    ev: row.evAmount,
    days: row.days,
  }));
}

function SectionTitle({ children, note, action }) {
  return (
    <div className="mb-2.5 flex items-center justify-between gap-2">
      <div className="min-w-0">
        <h2 className="text-[16px] font-bold tracking-[-.01em] text-[var(--at-strong)]">{children}</h2>
        {note && <p className="mt-0.5 text-[11px] text-[var(--at-mut)]">{note}</p>}
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
      className={`flex h-9 items-center gap-1.5 rounded-full px-3 text-[12px] font-semibold transition active:scale-95 ${
        active
          ? "bg-[var(--at-cyan)] text-white"
          : "bg-[var(--at-rowbg)] text-[var(--at-cyan)]"
      }`}
    >
      {children}
    </button>
  );
}

// 常設4タブをやめ、年月見出しから開く1枚のメニューへ集約する（iOS のアクションシート形式）。
// 画面の縦幅をカレンダーへ戻しつつ、月ジャンプと表示範囲の変更は残す。
function ViewMenuSheet({ current, monthValue, onSelect, onMonthChange, onClose }) {
  return (
    <div className="fixed inset-0 z-[320] flex items-end justify-center bg-black/40 px-2 pb-[max(8px,env(safe-area-inset-bottom))] backdrop-blur-[2px]" onClick={onClose}>
      <div className="w-full max-w-[430px]" onClick={(event) => event.stopPropagation()}>
        {/* 表示範囲のリスト（iOS のグループ化リスト：行の高さ 56px・選択行にチェックマーク） */}
        <section className="overflow-hidden rounded-[14px] bg-[var(--at-panel)] shadow-[var(--at-menu-shadow)]">
          <div className="px-4 pb-2 pt-3.5 text-center text-[13px] font-semibold text-[var(--at-mut)]">表示を切り替える</div>
          {VIEW_MENU.map((item) => {
            const active = current === item.id;
            const Icon = item.Icon;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelect(item.id)}
                aria-pressed={active}
                className="flex min-h-[56px] w-full items-center gap-3 border-t border-[var(--at-ln-soft)] px-4 py-2.5 text-left active:bg-[var(--at-hoverbg)]"
              >
                <Icon className="h-[22px] w-[22px] shrink-0 text-[var(--at-cyan)]" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[17px] font-semibold text-[var(--at-strong)]">{item.label}</span>
                  <span className="mt-0.5 block truncate text-[12px] text-[var(--at-mut)]">{item.desc}</span>
                </span>
                {active && <Check className="h-5 w-5 shrink-0 text-[var(--at-cyan)]" />}
              </button>
            );
          })}
          {/* 月ジャンプ（iOS のフォーム行：左ラベル・右にコントロール） */}
          <label className="flex min-h-[56px] items-center justify-between gap-3 border-t border-[var(--at-ln-soft)] px-4 py-2.5">
            <span className="text-[17px] font-semibold text-[var(--at-strong)]">月を選ぶ</span>
            <input type="month" value={monthValue} onChange={(event) => onMonthChange(event.target.value)} className="h-11 rounded-[10px] bg-[var(--at-rowbg)] px-3 text-right text-[16px] font-semibold text-[var(--at-cyan)]" />
          </label>
        </section>
        {/* iOS のアクションシート同様、キャンセルは分離した1枚のボタンにする */}
        <button type="button" onClick={onClose} className="mt-2 h-[56px] w-full rounded-[14px] bg-[var(--at-panel)] text-[17px] font-bold text-[var(--at-cyan)] shadow-[var(--at-menu-shadow)]">
          キャンセル
        </button>
      </div>
    </div>
  );
}

// 月別トップのヒーローカード（月収支の大型表示 ＋ 勝率リング ＋ 収支管理の基本3項目）。
// 値はすべて既存 summary から算出した actual/ev/diff/winRate/invest/recovery/days を
// そのまま表示するだけで、計算ロジックには未介入（円弧の割合計算のみ・金銭計算は含まない）。
const RING_R = 30;
const RING_CIRC = 2 * Math.PI * RING_R;
function MonthHero({ title = "今月の収支", actual, ev, diff, winRate, invest, recovery, days }) {
  const clampedRate = Math.max(0, Math.min(100, Number(winRate) || 0));
  const dashOffset = RING_CIRC * (1 - clampedRate / 100);
  // 収支管理として最初に知りたい「出ていったお金 / 戻ってきたお金 / 通った日数」。
  const foot = [
    { label: "投資", value: `${fmt(invest)}円`, cls: "text-[var(--at-strong)]" },
    { label: "回収", value: `${fmt(recovery)}円`, cls: "text-[var(--at-strong)]" },
    { label: "稼働", value: `${days || 0}日`, cls: "text-[var(--at-strong)]" },
  ];
  return (
    <section className={`${card} p-4`}>
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold text-[var(--at-mut)]">{title}</div>
          <div className={`mt-1 flex items-end gap-1 ${moneyClass(actual)}`}>
            <strong className="text-[clamp(30px,9.6vw,42px)] font-bold leading-none tracking-[-.03em] tabular-nums">{signed(actual)}</strong>
            <span className="pb-0.5 text-[15px] font-semibold text-[var(--at-mut)]">円</span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] font-semibold">
            <span className="whitespace-nowrap text-[var(--at-cyan)]">期待値 {signed(ev)}円</span>
            <span className="h-[3px] w-[3px] shrink-0 rounded-full bg-[var(--at-faint)]" />
            <span className={`whitespace-nowrap ${moneyClass(diff)}`}>差 {signed(diff)}円</span>
          </div>
        </div>
        <div className="relative h-[72px] w-[72px] shrink-0">
          <svg width="72" height="72" viewBox="0 0 72 72" className="-rotate-90">
            <circle cx="36" cy="36" r={RING_R} fill="none" stroke="var(--at-rowbg)" strokeWidth="8" />
            <circle
              cx="36" cy="36" r={RING_R} fill="none" stroke="var(--at-cyan)" strokeWidth="8"
              strokeLinecap="round" strokeDasharray={RING_CIRC} strokeDashoffset={dashOffset}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[18px] font-bold tabular-nums text-[var(--at-strong)]">{Math.round(clampedRate)}<span className="text-[10px]">%</span></span>
            <span className="text-[10px] font-semibold text-[var(--at-mut)]">勝率</span>
          </div>
        </div>
      </div>
      <div className="mt-3.5 grid grid-cols-3 border-t border-[var(--at-ln-soft)] pt-3">
        {foot.map((item, index) => (
          <div key={item.label} className={`min-w-0 text-center ${index > 0 ? "border-l border-[var(--at-ln-soft)]" : ""}`}>
            <div className="text-[11.5px] font-semibold text-[var(--at-mut)]">{item.label}</div>
            <div className={`mt-1 truncate whitespace-nowrap text-[15px] font-bold tabular-nums ${item.cls}`}>{item.value}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function SummaryHero({ summary, isDemo, heroTitle = "月間収支" }) {
  const actual = isDemo ? -12130 : summary.totalRealPL;
  const ev = isDemo ? 3120 : summary.evAmount;
  const winRate = isDemo ? 60 : Math.round(summary.winRate || 0);
  const days = isDemo ? 7 : (summary.days || 0);
  return (
    <section className={`${card} overflow-hidden p-4`}>
      <div className={label}>{heroTitle}</div>
      <div className={`mt-1 flex items-end ${moneyClass(actual)}`}>
        <strong className="text-[clamp(30px,9.6vw,42px)] font-bold leading-none tracking-[-.03em] tabular-nums">{signed(actual)}</strong>
        <span className="mb-0.5 ml-1 text-[15px] font-semibold text-[var(--at-mut)]">円</span>
      </div>
      <div className="mt-3.5 grid grid-cols-3 border-t border-[var(--at-ln-soft)] pt-3">
        <div className="min-w-0 text-center">
          <div className={label}>期待値</div>
          <div className="mt-1 whitespace-nowrap text-[16px] font-bold tabular-nums text-[var(--at-cyan)]">{signed(ev)}<span className="text-[10px]">円</span></div>
        </div>
        <div className="min-w-0 border-l border-[var(--at-ln-soft)] text-center">
          <div className={label}>勝率</div>
          <div className="mt-1 whitespace-nowrap text-[16px] font-bold tabular-nums text-[var(--at-strong)]">{winRate}<span className="text-[10px]">%</span></div>
        </div>
        <div className="min-w-0 border-l border-[var(--at-ln-soft)] text-center">
          <div className={label}>稼働日数</div>
          <div className="mt-1 whitespace-nowrap text-[16px] font-bold tabular-nums text-[var(--at-strong)]">{days}<span className="text-[10px]">日</span></div>
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
          className={`flex min-h-[68px] min-w-0 flex-col items-center justify-center px-2 py-3 ${
            index === values.length - 1 ? "col-span-2" : ""
          } ${index % 2 === 1 ? "border-l border-[var(--at-ln-soft)]" : ""} ${index >= 2 ? "border-t border-[var(--at-ln-soft)]" : ""}`}
        >
          <div className="flex items-center gap-1">
            <item.icon className="h-4 w-4 text-[var(--at-iconblue)]" />
            <span className="truncate text-[12px] font-semibold text-[var(--at-mut)]">{item.title}</span>
          </div>
          <div className={`mt-1.5 max-w-full truncate whitespace-nowrap text-[19px] font-bold tabular-nums ${item.positive ? "text-[var(--at-pos)]" : "text-[var(--at-strong)]"}`}>
            {item.value}<span className="ml-0.5 text-[11px] font-semibold text-[var(--at-mut)]">{item.unit}</span>
          </div>
          {item.sub && <span className="mt-0.5 text-[10px] text-[var(--at-faint2)]">{item.sub}</span>}
        </div>
      ))}
    </section>
  );
}

// 金額の大きさで塗りを 2 段階に分ける閾値（円）。淡い塗りだけだと「大負けした日」が
// ひと目で判別できないため、この額を超えた日は濃いほうの塗りにする。表示専用の定数。
const HEAT_STRONG_YEN = 30000;

function CalendarCell({ day, row, selected, weekday, isToday, onSelect }) {
  // iOS カレンダー準拠：セルの枠線をなくし「日付＝丸バッジ / 金額＝下段」の2段構成にする。
  // 稼働日だけ損益色で塗り、未稼働日は無地にして目線が稼働日へ向くようにする。
  const amount = Number(row?.actual) || 0;
  const hasAmount = Boolean(row) && amount !== 0;
  const strong = Math.abs(amount) >= HEAT_STRONG_YEN;
  let heat = "";
  if (amount > 0) heat = strong ? "bg-[var(--at-heat-p2)]" : "bg-[var(--at-heat-p)]";
  else if (amount < 0) heat = strong ? "bg-[var(--at-heat-m2)]" : "bg-[var(--at-heat-m)]";
  else if (row) heat = "bg-[var(--at-cellbg)]"; // 記録はあるが収支±0の日
  // 日付バッジ：選択日＝塗りつぶし、今日＝薄い丸＋アクセント文字（iOS カレンダーと同じ扱い）。
  // それ以外は曜日色（日＝赤 / 土＝青）。
  const dateTone = selected
    ? "bg-[var(--at-cyan)] text-white"
    : isToday
      ? "bg-[var(--at-rowbg)] text-[var(--at-cyan)]"
      : weekday === 0
        ? "text-[var(--at-sun)]"
        : weekday === 6
          ? "text-[var(--at-sat)]"
          : "text-[var(--at-strong)]";
  const amountText = signed(amount);
  return (
    <button
      type="button"
      onClick={() => onSelect(day)}
      aria-pressed={selected}
      aria-label={`${day}日${hasAmount ? ` ${amountText}円` : ""}`}
      className={`relative flex aspect-[1/1.12] min-w-0 flex-col items-center overflow-hidden rounded-[10px] px-0 pb-1 pt-1 transition ${heat} ${
        selected ? "shadow-[inset_0_0_0_1.5px_var(--at-cyan)]" : ""
      }`}
    >
      <span className={`flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full text-[13.5px] font-semibold leading-none tabular-nums ${dateTone}`}>{day}</span>
      {/* 金額は実額のまま表示し、桁数に応じてフォントサイズを段階調整して枠内に収める。 */}
      {hasAmount ? (
        <span className={`mt-auto block w-full max-w-full overflow-hidden whitespace-nowrap px-px text-center font-bold leading-none tracking-[-.06em] tabular-nums ${cellAmountSize(amountText)} ${moneyClass(amount)}`}>{amountText}</span>
      ) : row ? (
        <span className="mt-auto block w-full text-center text-[11px] font-semibold leading-none text-[var(--at-faint)]">±0</span>
      ) : null}
    </button>
  );
}

// 日別詳細の実践記録カード（参考画像のレイアウトを analytics-terminal ダークトークンへ翻訳）。
// 数値は記録エディタ（CalendarTab）の SummaryCard と同一の式:
//   実収支 =（回収 − 投資）− 貯玉消費円 / 期待値 = 通常期待値 + 有効な遊タイム判断EV
//   時間 = netRot ÷ rotPerHour / 時給 = 実収支 ÷ 時間
// タップで既存の「記録を編集」導線（記録エディタ遷移）を開く。
function DaySessionCard({ archive, onOpen }) {
  const isSlot = archive.gameType === "slot";
  const slotStats = archive.slotStats || {};
  const invest = Number(archive.investYen) || 0;
  const recovery = Number(archive.recoveryYen) || 0;
  const chodamaYen = Number(archive.chodamaYen) || 0;
  const actual = (recovery - invest) - chodamaYen;
  const evBreakdown = getEvBreakdown(archive);
  const ev = evBreakdown.total;
  const hasEv = ev !== 0;
  // 稼働時間: 実践記録は netRot/rotPerHour、手動記録は遊技時間（playMinutes）を使用
  const hours = archiveWorkMinutes(archive) / 60;
  const wage = hours > 0 ? Math.round(actual / hours) : 0;
  const denom = archive.settings?.synthDenom;
  const machineName = archive.machineName && archive.machineName !== `1/${denom}`
    ? archive.machineName
    : (archive.machineName || (isSlot ? "機種未入力" : `1/${denom || "—"}`));
  const ballVal = Number(archive.settings?.ballVal) || 0;
  const rateLabel = isSlot
    ? `${Number(slotStats.rateYen) || 20}円スロ`
    : (ballVal > 0 ? `${Number.isInteger(ballVal) ? ballVal : ballVal.toFixed(1)}パチ` : "");
  const subLabel = [isSlot ? "パチスロ" : "パチンコ", archive.machineNum ? `${archive.machineNum}番台` : "", rateLabel].filter(Boolean).join(" / ");
  const evCls = hasEv ? (ev >= 0 ? "text-[var(--at-cyan)]" : "text-[var(--at-neg)]") : "text-[var(--at-faint)]";
  const slotBonus = [
    Number(slotStats.bbCount) > 0 ? `BB ${Number(slotStats.bbCount)}` : "",
    Number(slotStats.rbCount) > 0 ? `RB ${Number(slotStats.rbCount)}` : "",
    Number(slotStats.atCount) > 0 ? `AT ${Number(slotStats.atCount)}` : "",
  ].filter(Boolean).join(" / ") || "—";
  const middle = [
    { label: "投資", value: `${fmt(invest)}円`, cls: "text-[var(--at-strong)]" },
    { label: "回収", value: `${fmt(recovery)}円`, cls: "text-[var(--at-strong)]" },
    { label: "収支", value: `${signed(actual)}円`, cls: moneyClass(actual) },
    isSlot
      ? { label: "ボーナス", value: slotBonus, cls: "text-[var(--at-strong)]" }
      : { label: "期待値", value: hasEv ? `${signed(ev)}円` : "—", cls: evCls },
  ];
  return (
    <button type="button" onClick={onOpen} className={`${card} mt-2.5 block w-full p-4 text-left active:bg-[var(--at-hoverbg)]`}>
      {/* 上段: 店舗名（小）/ 機種名（太字）/ 台番号・レート ＋ 右側に期待値・収支・chevron */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {archive.storeName && <div className="truncate text-[12px] font-medium text-[var(--at-mut)]">{archive.storeName}</div>}
          <div className="mt-0.5 text-[15px] font-semibold leading-snug text-[var(--at-strong)]">{machineName}</div>
          {subLabel && <div className="mt-1 text-[11.5px] font-medium text-[var(--at-mut)]">{subLabel}</div>}
        </div>
        <div className="flex shrink-0 items-center gap-2.5">
          <div className="text-right">
            <div className="text-[11.5px] font-medium text-[var(--at-mut)]">{isSlot ? "総ゲーム" : "期待値"}</div>
            <div className={`whitespace-nowrap text-[17px] font-bold tabular-nums ${isSlot ? "text-[var(--at-cyan)]" : evCls}`}>
              {isSlot ? fmt(slotStats.totalGames) : (hasEv ? signed(ev) : "—")}
              {isSlot ? <span className="text-[9px]">G</span> : (hasEv && <span className="text-[9px]">円</span>)}
            </div>
          </div>
          <div className="border-l border-[var(--at-ln-soft)] pl-2.5 text-right">
            <div className="text-[11.5px] font-medium text-[var(--at-mut)]">収支</div>
            <div className={`whitespace-nowrap text-[17px] font-bold tabular-nums ${moneyClass(actual)}`}>
              {signed(actual)}<span className="text-[9px]">円</span>
            </div>
          </div>
          <ChevronRight className="h-4 w-4 shrink-0 text-[var(--at-faint)]" />
        </div>
      </div>
      {/* 中段: 投資 / 回収 / 収支 / 期待値 の4列 */}
      <div className="mt-3 grid grid-cols-4 gap-1 border-t border-[var(--at-ln-soft)] pt-2.5 text-center">
        {middle.map((m) => (
          <div key={m.label} className="min-w-0">
            <div className="truncate text-[11.5px] font-medium text-[var(--at-mut)]">{m.label}</div>
            <div className={`mt-1 truncate whitespace-nowrap text-[14px] font-bold tabular-nums ${m.cls}`}>{m.value}</div>
          </div>
        ))}
      </div>
      {evBreakdown.yutime !== 0 && (
        <div className="mt-2 border-t border-[var(--at-ln-soft)] pt-2 text-right text-[11.5px] font-medium text-[var(--at-mut)]">
          通常期待値 {signed(Math.round(evBreakdown.normal))}円 ＋ 遊タイム期待値 {signed(Math.round(evBreakdown.yutime))}円
        </div>
      )}
      {/* 下段: 時間 / 時給 */}
      <div className="mt-2.5 flex items-center gap-4 border-t border-[var(--at-ln-soft)] pt-2 text-[12px] font-medium text-[var(--at-mut)]">
        <span>時間 <span className="text-[14px] font-bold tabular-nums text-[var(--at-strong)]">{hours > 0 ? hours.toFixed(1) : "0.0"}</span>h</span>
        <span className="border-l border-[var(--at-ln-soft)] pl-4">
          時給 <span className={`text-[14px] font-bold tabular-nums ${wage !== 0 ? moneyClass(wage) : "text-[var(--at-strong)]"}`}>{wage !== 0 ? signed(wage) : "0"}</span>円/h
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
    <section>
      {/* iOS のグループ化リスト同様、日付はカードの外に見出しとして置く。 */}
      <div className="mb-1.5 flex items-center justify-between gap-2 px-1">
        <h2 className="min-w-0 truncate text-[17px] font-bold tracking-[-.01em] text-[var(--at-strong)]">{dateLabel}</h2>
        {row && (
          <span className={`shrink-0 rounded-full px-2.5 py-1 text-[13px] font-bold tabular-nums ${actual >= 0
            ? "bg-[var(--at-heat-p)] text-[var(--at-pos)]"
            : "bg-[var(--at-heat-m)] text-[var(--at-neg)]"}`}>
            {signed(actual)}円
          </span>
        )}
      </div>
      {/* 実収支 / 期待値 / 差 / 稼働時間。4列だと数字が 11px まで縮むため 2×2 にして読める字数を確保する。 */}
      <div className={`${card} grid grid-cols-2 overflow-hidden`}>
        {stats.map((s, index) => (
          <div
            key={s.label}
            className={`min-w-0 px-4 py-3 ${index % 2 === 1 ? "border-l border-[var(--at-ln-soft)]" : ""} ${index >= 2 ? "border-t border-[var(--at-ln-soft)]" : ""}`}
          >
            <div className="truncate text-[12px] font-semibold text-[var(--at-mut)]">{s.label}</div>
            <div className={`mt-1 truncate whitespace-nowrap text-[19px] font-bold leading-none tracking-[-.02em] tabular-nums ${s.cls}`}>{s.value}</div>
          </div>
        ))}
      </div>
      {/* 記録の編集・追加はカレンダーなしの編集シート（CalendarTab focusMode）へ直行する。
          記録のない日は「記録を追加」表記で追加フォームが展開済みのシートを開く。 */}
      <button type="button" onClick={() => onEditRecords(null)} className="mt-2.5 flex h-[50px] w-full items-center justify-center gap-1.5 rounded-[14px] bg-[var(--at-cyan)] text-[16px] font-semibold text-white transition active:scale-[.99]">
        {row ? (
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
          </svg>
        ) : <Plus className="h-[19px] w-[19px]" />}
        {row ? "記録を編集" : "記録を追加"}
      </button>
      {/* この日の実践記録カード（タップで該当記録の編集シートへ直行）。記録がない日は何も表示しない */}
      {archives.map((a) => (
        <DaySessionCard key={a.id} archive={a} onOpen={() => onEditRecords(a.id)} />
      ))}
    </section>
  );
}

function CalendarPanel({ dayMap, selectedDay, setSelectedDay, year, month, todayDay, onToday }) {
  // 月の初日曜日と日数から正しいグリッドを生成する（固定px・固定30日を避ける）。
  const blanks = new Date(year, month - 1, 1).getDay();
  const count = new Date(year, month, 0).getDate();
  const cells = [...Array(blanks).fill(null), ...Array.from({ length: count }, (_, i) => i + 1)];
  // 週ごとの収支（日曜起点の行単位）。カレンダーの右にもう1列足すと金額が読めなくなるため、
  // 表の下に「第n週」の横並びとして出す。値は dayMap の実額をそのまま足すだけ（計算ロジック非依存）。
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) {
    const days = cells.slice(i, i + 7).filter(Boolean);
    let total = 0;
    let hasRecord = false;
    for (const d of days) {
      if (!dayMap[d]) continue;
      total += Number(dayMap[d].actual) || 0;
      hasRecord = true;
    }
    weeks.push({ index: weeks.length + 1, total, hasRecord });
  }
  return (
    <section className={`${card} -mx-2 px-2 pb-3 pt-3`}>
      {/* 見出し（凡例は廃止しシンプルに）。右側は現在月以外のとき「今日」へ戻る導線。 */}
      <div className="mb-3 flex items-center justify-between gap-2 px-1.5">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-[19px] w-[19px] shrink-0 text-[var(--at-cyan)]" />
          <h2 className="text-[17px] font-bold tracking-[-.01em] text-[var(--at-strong)]">収支カレンダー</h2>
        </div>
        {onToday
          ? <button type="button" onClick={onToday} className="flex h-9 shrink-0 items-center rounded-full bg-[var(--at-rowbg)] px-3.5 text-[13px] font-semibold text-[var(--at-cyan)] active:scale-95">今日</button>
          : <span className="shrink-0 text-[12px] font-semibold text-[var(--at-mut)]">日付をタップ</span>}
      </div>
      {/* 曜日見出し。日曜は赤系・土曜は青系。セルと同じ7列・同じ余白で整列。 */}
      <div className="grid grid-cols-7 gap-[3px] px-0 pb-1.5 text-center text-[12px] font-semibold text-[var(--at-mut)]">
        {WEEKDAYS.map((day, index) => (
          <span key={day} className={index === 0 ? "text-[var(--at-sun)]" : index === 6 ? "text-[var(--at-sat)]" : ""}>{day}</span>
        ))}
      </div>
      {/* 角丸の独立セルを gap で並べる（空白セルは描画しないほうが日付の並びが読みやすい）。 */}
      <div className="grid grid-cols-7 gap-[3px]">
        {cells.map((day, index) => day
          ? (
            <CalendarCell
              key={day}
              day={day}
              row={dayMap[day]}
              selected={day === selectedDay}
              weekday={new Date(year, month - 1, day).getDay()}
              isToday={day === todayDay}
              onSelect={setSelectedDay}
            />
          )
          : <div key={`blank-${index}`} className="aspect-[1/1.12]" />)}
      </div>
      {/* 週別の収支。どの週で勝ち負けが偏ったかを1行で確認できる。 */}
      <div className="mt-3 flex items-stretch gap-[3px] border-t border-[var(--at-ln-soft)] pt-2.5">
        {weeks.map((week) => (
          <div key={week.index} className="min-w-0 flex-1 text-center">
            <div className="text-[10px] font-semibold text-[var(--at-mut)]">{week.index}週</div>
            <div className={`mt-0.5 overflow-hidden whitespace-nowrap font-bold leading-none tracking-[-.05em] tabular-nums ${cellAmountSize(week.hasRecord ? signed(week.total) : "—")} ${week.hasRecord ? moneyClass(week.total) : "text-[var(--at-faint)]"}`}>
              {week.hasRecord ? signed(week.total) : "—"}
            </div>
          </div>
        ))}
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
    <section className={`${card} p-3.5`}>
      <SectionTitle note="実収支｜期待値｜稼働日数">
        {periodTab === "year" ? "月別パフォーマンス" : "年別パフォーマンス"}
      </SectionTitle>
      {displayRows.length === 0 ? (
        <div className="py-10 text-center text-[13px] text-[var(--at-mut)]">対象期間の記録がありません</div>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {displayRows.map((row) => (
            <div key={row.key} className="min-w-0 rounded-[12px] bg-[var(--at-rowbg)] p-2.5">
              <div className="text-[12px] font-semibold text-[var(--at-mut)]">{row.label}</div>
              <div className={`mt-1.5 truncate text-[15px] font-bold tracking-[-.03em] tabular-nums ${moneyClass(row.actual)}`}>{signed(row.actual)}</div>
              <div className="mt-1 truncate text-[10.5px] font-semibold tabular-nums text-[var(--at-cyan)]">期待値 {signed(row.ev)}</div>
              <div className="mt-1.5 text-[10.5px] text-[var(--at-mut)]">稼働 {row.days || 0}日</div>
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
              <CartesianGrid stroke="rgba(120,120,128,.24)" vertical={false} />
              <XAxis dataKey="day" tick={{ fill: "#8E8E93", fontSize: 7 }} tickLine={false} axisLine={false} interval={6} />
              <YAxis width={38} tick={{ fill: "#8E8E93", fontSize: 7 }} tickLine={false} axisLine={false} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
              <ReferenceLine y={0} stroke="rgba(120,120,128,.5)" />
              <Tooltip
                contentStyle={{ background: "var(--at-panel)", border: "1px solid var(--at-ln-md)", borderRadius: 8, fontSize: 9 }}
                formatter={(value) => `${signed(value)}円`}
              />
              <Legend iconSize={7} wrapperStyle={{ fontSize: 8 }} />
              <Line type="monotone" dataKey="actual" name="実収支" stroke="#30D158" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="ev" name="期待値" stroke="#0A84FF" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="diff" name="差異" stroke="#8E8E93" strokeDasharray="4 4" strokeWidth={1.2} dot={false} />
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
  "bg-[var(--at-gold)] text-[var(--at-on-gold)]",
  "bg-[var(--at-rowbg)] text-[var(--at-subtle-hi)]",
  "bg-[var(--at-amber)]/20 text-[var(--at-amber)]",
];
function MachinePodium({ rows }) {
  const top3 = rows.slice(0, 3);
  if (top3.length === 0) {
    return <section className={`${card} p-5 text-center text-[13px] text-[var(--at-mut)]`}>対象期間の記録がありません</section>;
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
            className={`${card} min-w-0 px-2 text-center ${isFirst ? "py-4 outline outline-[1.5px] -outline-offset-[1.5px] outline-[var(--at-gold)]" : "py-3.5"}`}
          >
            <div className={`mx-auto flex items-center justify-center rounded-full font-bold tabular-nums ${isFirst ? "h-8 w-8 text-[15px]" : "h-7 w-7 text-[13px]"} ${RANK_BADGE[idx]}`}>
              {idx + 1}
            </div>
            <div className={`mt-2 line-clamp-2 font-semibold leading-tight text-[var(--at-strong)] ${isFirst ? "text-[13px]" : "text-[12.5px]"}`}>
              {m.machineName}
            </div>
            <div className={`mt-1.5 truncate font-bold tracking-[-.03em] tabular-nums ${moneyClass(m.actualPL)} ${isFirst ? "text-[19px]" : "text-[16px]"}`}>
              {signed(m.actualPL)}
            </div>
            <div className="mt-0.5 truncate text-[10.5px] font-semibold text-[var(--at-mut)]">
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
      <div className="space-y-3">
        {rows.map((row) => (
          <div key={row.machineName}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="min-w-0 truncate text-[14px] font-semibold text-[var(--at-strong)]">{row.machineName}</span>
              <span className={`shrink-0 text-[14px] font-bold tabular-nums ${moneyClass(row.actualPL)}`}>{signed(row.actualPL)}円</span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-[var(--at-rowbg)]">
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
function StorePanel({ rows, onSelect, onSeeAll, totalCount }) {
  const top3 = rows.slice(0, 3);
  if (top3.length === 0) {
    return <section className={`${card} p-5 text-center text-[13px] text-[var(--at-mut)]`}>対象期間の記録がありません</section>;
  }
  return (
    <section>
      {/* 「すべて見る」で全店舗の一覧画面（StoreListScreen）へ遷移する。 */}
      <GroupLabel
        action={(
          <button type="button" onClick={onSeeAll} className="flex h-8 shrink-0 items-center gap-0.5 rounded-full px-1 text-[13px] font-semibold text-[var(--at-cyan)] active:opacity-60">
            すべて見る{totalCount > 0 ? `（${totalCount}）` : ""}
            <ChevronRight className="h-4 w-4" />
          </button>
        )}
      >
        店舗トップ3
      </GroupLabel>
      <div className={`${card} overflow-hidden`}>
        {top3.map((row, index) => (
          <button
            key={row.storeName}
            type="button"
            onClick={() => onSelect?.(row.storeName)}
            className={`flex min-h-[60px] w-full items-center gap-3 px-4 py-3 text-left active:bg-[var(--at-hoverbg)] ${index > 0 ? "border-t border-[var(--at-ln-soft)]" : ""}`}
          >
            <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[13px] font-bold tabular-nums ${RANK_BADGE[index]}`}>{index + 1}</span>
            <span className="min-w-0 flex-1">
              <div className="truncate text-[15px] font-semibold text-[var(--at-strong)]">{row.storeName}</div>
              <div className="text-[12px] font-medium text-[var(--at-mut)]">期待値 {signed(row.ev)}円 ・ {row.days}日</div>
            </span>
            <span className={`shrink-0 text-[16px] font-bold tabular-nums ${moneyClass(row.actual)}`}>{signed(row.actual)}円</span>
            <ChevronRight className="h-4 w-4 shrink-0 text-[var(--at-faint)]" />
          </button>
        ))}
      </div>
    </section>
  );
}

// 店舗トップ3の「すべて見る」で開く全店舗一覧（iOS のプッシュ遷移相当のサブ画面）。
// 集計は buildStoreRanking（表示専用の純関数）に委譲し、並び替えだけを画面側で持つ。
function StoreListScreen({ archives, onSelect, onBack, sortBy, setSortBy }) {
  const rows = useMemo(() => buildStoreRanking(archives, { sortBy, limit: 0 }), [archives, sortBy]);
  const totals = useMemo(() => rows.reduce(
    (acc, row) => ({ actual: acc.actual + row.actual, ev: acc.ev + row.ev, days: acc.days + row.days }),
    { actual: 0, ev: 0, days: 0 },
  ), [rows]);
  return (
    <div className="analytics-terminal flex min-h-0 flex-1 flex-col overflow-hidden bg-[var(--at-page)] text-[var(--at-strong)]">
      <div className="mx-auto flex min-h-0 w-full max-w-[430px] flex-1 flex-col px-4 pt-3">
        {/* iOS のナビゲーションバー（左に戻る・中央にタイトル） */}
        <div className="mb-2.5 flex h-[52px] shrink-0 items-center gap-1">
          <RoundButton onClick={onBack} ariaLabel="戻る">
            <ChevronLeft className="h-[22px] w-[22px]" />
          </RoundButton>
          <h1 className="min-w-0 flex-1 truncate text-[20px] font-bold tracking-[-.02em]">店舗一覧</h1>
          <span className="shrink-0 text-[13px] font-semibold text-[var(--at-mut)]">{rows.length}店舗</span>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden overscroll-contain pb-12">
          {/* 全店舗の合計（この画面の対象範囲＝現在の絞り込み・全期間） */}
          <section className={`${card} grid grid-cols-3 overflow-hidden`}>
            {[
              { label: "合計収支", value: `${signed(totals.actual)}円`, cls: moneyClass(totals.actual) },
              { label: "期待値", value: `${signed(totals.ev)}円`, cls: "text-[var(--at-cyan)]" },
              { label: "稼働", value: `${totals.days}日`, cls: "text-[var(--at-strong)]" },
            ].map((item, index) => (
              <div key={item.label} className={`min-w-0 px-2 py-3 text-center ${index > 0 ? "border-l border-[var(--at-ln-soft)]" : ""}`}>
                <div className="text-[11.5px] font-semibold text-[var(--at-mut)]">{item.label}</div>
                <div className={`mt-1 truncate whitespace-nowrap text-[16px] font-bold tabular-nums ${item.cls}`}>{item.value}</div>
              </div>
            ))}
          </section>

          {/* 並び替え（iOS セグメンテッドコントロール） */}
          <div className="grid grid-cols-3 gap-1 rounded-[10px] bg-[var(--at-rowbg)] p-1">
            {STORE_SORTS.map((item) => {
              const active = sortBy === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSortBy(item.id)}
                  aria-pressed={active}
                  className={`h-9 rounded-[8px] text-[14px] font-semibold transition ${active
                    ? "bg-[var(--at-panel)] text-[var(--at-strong)] shadow-[0_1px_3px_rgba(0,0,0,.25)]"
                    : "text-[var(--at-mut)]"}`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>

          {rows.length === 0 ? (
            <section className={`${card} p-6 text-center text-[13px] text-[var(--at-mut)]`}>記録のある店舗がありません</section>
          ) : (
            <section className={`${card} overflow-hidden`}>
              {rows.map((row, index) => (
                <button
                  key={row.storeName}
                  type="button"
                  onClick={() => onSelect(row.storeName)}
                  className={`flex min-h-[64px] w-full items-center gap-3 px-4 py-3 text-left active:bg-[var(--at-hoverbg)] ${index > 0 ? "border-t border-[var(--at-ln-soft)]" : ""}`}
                >
                  <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[13px] font-bold tabular-nums ${index < 3 ? RANK_BADGE[index] : "bg-[var(--at-rowbg)] text-[var(--at-mut)]"}`}>{index + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold text-[var(--at-strong)]">{row.storeName}</span>
                    <span className="mt-0.5 block truncate text-[11px] font-medium tabular-nums text-[var(--at-mut)]">
                      期待値 {signed(row.ev)} ・ {row.days}日{row.spin > 0 ? ` ・ ${row.spin.toFixed(1)}回/k` : ""}
                    </span>
                  </span>
                  <span className={`shrink-0 text-[15px] font-bold tabular-nums ${moneyClass(row.actual)}`}>{signed(row.actual)}円</span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-[var(--at-faint)]" />
                </button>
              ))}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function ShareCTA({ onShare, title = "今月の結果を共有", subtitle = "月間収支カードをSNSに投稿できます" }) {
  // iOS のリスト行そのままの形（アイコン＋本文＋シェブロン）。カード全体がタップ領域。
  return (
    <button type="button" onClick={onShare} className={`${card} flex w-full items-center gap-3 p-4 text-left active:bg-[var(--at-hoverbg)]`}>
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[11px] bg-[var(--at-cyan)]">
        <Share2 className="h-[22px] w-[22px] text-white" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[16px] font-semibold text-[var(--at-strong)]">{title}</span>
        <span className="mt-0.5 block text-[12.5px] text-[var(--at-mut)]">{subtitle}</span>
      </span>
      <ChevronRight className="h-5 w-5 shrink-0 text-[var(--at-faint)]" />
    </button>
  );
}

// iOS の設定フォーム風パネル。セグメンテッドコントロール＋リスト行（左ラベル・右コントロール）。
function FilterPanel({ stores, machines, filters, setFilters, onClose }) {
  const selectCls = "h-11 max-w-[62%] rounded-[10px] bg-[var(--at-rowbg)] px-2.5 text-right text-[15px] font-semibold text-[var(--at-cyan)]";
  return (
    <div className={`${card} mb-2.5 shrink-0 overflow-hidden`}>
      <div className="p-3">
        <div className={label}>遊技種別</div>
        <div className="mt-2 grid grid-cols-3 gap-1 rounded-[10px] bg-[var(--at-rowbg)] p-1">
          {[
            ["all", "すべて"],
            ["pachinko", "パチンコ"],
            ["slot", "パチスロ"],
          ].map(([value, text]) => {
            const active = (filters.gameType || "all") === value;
            return (
              <button key={value} type="button" onClick={() => setFilters({ ...filters, gameType: value })} aria-pressed={active}
                className={`h-9 rounded-[8px] text-[14px] font-semibold transition ${active
                  ? "bg-[var(--at-panel)] text-[var(--at-strong)] shadow-[0_1px_3px_rgba(0,0,0,.25)]"
                  : "text-[var(--at-mut)]"}`}>
                {text}
              </button>
            );
          })}
        </div>
      </div>
      <label className="flex min-h-[52px] items-center justify-between gap-3 border-t border-[var(--at-ln-soft)] px-4 py-2">
        <span className="shrink-0 text-[16px] font-semibold text-[var(--at-strong)]">店舗</span>
        <select value={filters.storeName || ""} onChange={(e) => setFilters({ ...filters, storeName: e.target.value })} className={selectCls}>
          <option value="">すべての店舗</option>
          {stores.map((store) => <option key={store} value={store}>{store}</option>)}
        </select>
      </label>
      <label className="flex min-h-[52px] items-center justify-between gap-3 border-t border-[var(--at-ln-soft)] px-4 py-2">
        <span className="shrink-0 text-[16px] font-semibold text-[var(--at-strong)]">機種</span>
        <select value={filters.machineName || ""} onChange={(e) => setFilters({ ...filters, machineName: e.target.value })} className={selectCls}>
          <option value="">すべての機種</option>
          {machines.map((machine) => <option key={machine} value={machine}>{machine}</option>)}
        </select>
      </label>
      <button type="button" onClick={onClose} className="h-12 w-full border-t border-[var(--at-ln-soft)] text-[15px] font-semibold text-[var(--at-cyan)] active:bg-[var(--at-hoverbg)]">絞り込みを閉じる</button>
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
    <div className="mt-5 grid grid-cols-7 gap-1">
      {WEEKDAYS.map((day) => (
        <span key={day} className="pb-1 text-center text-[10px] font-black text-[#7d8797]">{day}</span>
      ))}
      {cells.map((day, index) => {
        if (!day) return <div key={`blank-${index}`} />;
        const row = dayMap[day];
        const hasAmount = row && Number(row.actual) !== 0;
        const amountText = hasAmount ? signed(row.actual) : "";
        return (
          <div key={day} className={`flex min-h-[38px] min-w-0 flex-col overflow-hidden rounded-[6px] px-0.5 py-1 ${row ? heatTone(row.actual) : "bg-[#f6f6f4]"}`}>
            <span className="text-[12px] font-black leading-none text-[#333b49]">{day}</span>
            {hasAmount && (
              <span className={`mt-auto block w-full max-w-full overflow-hidden whitespace-nowrap text-center font-mono font-black leading-none tracking-[-.1em] ${shareCellAmountSize(amountText)} ${moneyTone(row.actual)}`}>{amountText}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function createShareImageBlob({ year, month, actual, winRate, days, dayMap }) {
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1350;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.reject(new Error("画像を作成できませんでした"));
  const font = 'system-ui, -apple-system, "Hiragino Sans", "Yu Gothic", sans-serif';
  const mono = 'ui-monospace, "SFMono-Regular", Menlo, monospace';
  const blanks = new Date(year, month - 1, 1).getDay();
  const count = new Date(year, month, 0).getDate();
  const rows = Math.ceil((blanks + count) / 7);

  ctx.fillStyle = "#f7f8fb";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#4aa9df";
  ctx.fillRect(0, 0, canvas.width, 300);
  ctx.textAlign = "center";
  ctx.fillStyle = "#ffffff";
  ctx.font = `800 54px ${font}`;
  ctx.fillText(`${year}年 ${month}月`, 540, 105);
  ctx.font = `900 82px ${mono}`;
  ctx.fillText(`${signed(actual)}円`, 540, 212);
  ctx.font = `700 28px ${font}`;
  ctx.fillStyle = "rgba(255,255,255,.9)";
  ctx.fillText(`勝率 ${Math.round(winRate)}%  ・  稼働 ${days}日`, 540, 266);

  const left = 36;
  const top = 340;
  const width = 1008;
  const cellW = width / 7;
  const headerH = 62;
  const rowH = Math.min(150, (900 - headerH) / rows);
  ctx.font = `800 28px ${font}`;
  WEEKDAYS.forEach((weekday, index) => {
    ctx.fillStyle = index === 0 ? "#dc5264" : index === 6 ? "#2c78d2" : "#5b6475";
    ctx.fillText(weekday, left + cellW * index + cellW / 2, top + 40);
  });
  for (let rowIndex = 0; rowIndex < rows; rowIndex += 1) {
    for (let column = 0; column < 7; column += 1) {
      const day = rowIndex * 7 + column - blanks + 1;
      if (day < 1 || day > count) continue;
      const x = left + column * cellW + 4;
      const y = top + headerH + rowIndex * rowH + 4;
      const row = dayMap[day];
      const amount = Number(row?.actual) || 0;
      ctx.fillStyle = amount > 0 ? "#e8f1ff" : amount < 0 ? "#fff0f2" : "#ffffff";
      ctx.beginPath();
      ctx.roundRect(x, y, cellW - 8, rowH - 8, 12);
      ctx.fill();
      ctx.textAlign = "left";
      ctx.fillStyle = column === 0 ? "#dc5264" : column === 6 ? "#2c78d2" : "#111827";
      ctx.font = `900 42px ${font}`;
      ctx.fillText(String(day), x + 15, y + 48);
      if (amount !== 0) {
        ctx.textAlign = "center";
        ctx.fillStyle = amount > 0 ? "#195fc5" : "#df364e";
        ctx.font = `900 28px ${mono}`;
        ctx.fillText(signed(amount), x + (cellW - 8) / 2, y + rowH - 30);
      }
    }
  }
  ctx.textAlign = "center";
  ctx.fillStyle = "#8b95a5";
  ctx.font = `800 25px ${font}`;
  ctx.fillText("PachiTracker ・ 遊技収支記録", 540, 1310);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("画像を作成できませんでした")), "image/png");
  });
}

function ShareCard({ year, month, actual, ev, winRate, days, dayMap, onClose }) {
  const mainTone = actual >= 0 ? "text-[#1a8f4c]" : "text-[#d6394c]";
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  const shareImage = async () => {
    if (busy) return;
    setBusy(true);
    setStatus("");
    try {
      const blob = await createShareImageBlob({ year, month, actual, winRate, days, dayMap });
      const file = new File([blob], `収支カレンダー-${year}-${String(month).padStart(2, "0")}.png`, { type: "image/png" });
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        setStatus("端末の共有画面を開いています…");
        await navigator.share({ title: `${year}年${month}月の収支`, files: [file] });
        setStatus("共有画面を開きました");
      } else {
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = file.name;
        anchor.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        setStatus("画像を保存しました");
      }
    } catch (error) {
      if (error?.name !== "AbortError") setStatus("共有できませんでした。もう一度お試しください");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/80 p-5 backdrop-blur-md" onClick={onClose}>
      <div className="w-full max-w-[370px]" onClick={(event) => event.stopPropagation()}>
        <div className="relative max-h-[72vh] overflow-y-auto rounded-[20px] border border-black/[0.06] bg-[#fbfbf9] p-5 text-[#1c2230] shadow-[0_30px_90px_rgba(0,0,0,.55)]">
          <button type="button" onClick={onClose} className="absolute right-4 top-4 text-[#aab0bd]"><X className="h-5 w-5" /></button>
          <div className="text-center">
            <div className="text-[19px] font-black tracking-[.06em] text-[#2c3444]">{year}年{month}月</div>
            <div className="mt-4 text-[10px] font-bold tracking-[.24em] text-[#9aa3b2]">実質収支</div>
            <div className={`mt-1 font-mono text-[38px] font-black tracking-[-.04em] ${mainTone}`}>{signed(actual)}円</div>
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
        {status && <div className="mt-2 text-center text-[11px] font-bold text-white/80">{status}</div>}
        <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
          <button type="button" onClick={shareImage} disabled={busy} className="h-12 rounded-xl bg-[var(--at-cyan)] px-4 text-[14px] font-black text-[#03101c] disabled:opacity-60">
            {busy ? (status ? "共有画面を確認" : "画像を作成中…") : "画像を共有・保存"}
          </button>
          <button type="button" onClick={onClose} className="h-12 rounded-xl border border-white/20 px-4 text-[13px] font-black text-white">閉じる</button>
        </div>
      </div>
    </div>
  );
}

// 月間サマリー詳細の統計1項目（ラベル＋値のピル）。値が無い項目は「—」。
function SummaryStat({ label, value, cls = "text-[var(--at-strong)]" }) {
  return (
    <div className="flex min-h-[46px] items-center justify-between gap-2 rounded-[12px] bg-[var(--at-rowbg)] px-3.5 py-2.5">
      <span className="shrink-0 text-[13px] font-medium text-[var(--at-mut)]">{label}</span>
      <span className={`min-w-0 truncate text-right text-[15px] font-bold tabular-nums ${cls}`}>{value}</span>
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
              <CartesianGrid stroke="rgba(120,120,128,.24)" vertical={false} />
              <XAxis dataKey="day" tick={{ fill: "#8E8E93", fontSize: 8 }} tickLine={false} axisLine={false} interval={6} />
              <YAxis width={38} tick={{ fill: "#8E8E93", fontSize: 8 }} tickLine={false} axisLine={false} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
              <ReferenceLine y={0} stroke="rgba(120,120,128,.5)" />
              <Tooltip contentStyle={{ background: "var(--at-panel)", border: "1px solid var(--at-ln-md)", borderRadius: 8, fontSize: 10 }} formatter={(value) => `${signed(value)}円`} />
              <Legend iconSize={8} wrapperStyle={{ fontSize: 9 }} />
              <Bar dataKey="daily" name="日別収支" fill="#30D158" radius={[3, 3, 0, 0]} maxBarSize={12}>
                {chartData.map((d, i) => <Cell key={i} fill={d.daily >= 0 ? "#30D158" : "#FF453A"} />)}
              </Bar>
              <Line type="monotone" dataKey="cum" name="累計収支" stroke="#0A84FF" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="cumEv" name="累計期待値" stroke="#FF9F0A" strokeWidth={1.6} strokeDasharray="4 3" dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </section>
      {/* 今月の成績（実質総収支）。 */}
      <section className={`${card} flex items-center justify-between gap-3 p-4`}>
        <div className="text-[16px] font-semibold text-[var(--at-strong)]">今月の成績</div>
        <div className={`whitespace-nowrap text-[clamp(20px,7.6vw,30px)] font-bold leading-none tracking-[-.03em] tabular-nums ${moneyClass(score)}`}>{signed(score)}<span className="ml-1 text-[13px] font-semibold text-[var(--at-mut)]">円</span></div>
      </section>
      {/* 統計グリッド（2列）。期待値系は未連携のため「—」表示。 */}
      <div className="grid grid-cols-2 gap-2">
        {stats.map((s) => <SummaryStat key={s.label} label={s.label} value={s.value} cls={s.cls} />)}
      </div>
    </>
  );
}

// iOS のナビゲーションバー相当。左に「‹ 年月 ⌄ ›」の期間ナビ、右に丸型ツールバーボタン。
// 中央寄せの絶対配置をやめ、左右2グループの素直な配置にして操作対象を指で追いやすくした。
function HeaderBar({
  title,
  onPrev,
  onNext,
  navDisabled,
  onToggleDetail,
  detailActive,
  onOpenViewMenu,
  onOpenFilter,
  filterActive,
}) {
  const hasNav = Boolean(onPrev && onNext);
  return (
    <div className="relative z-40 mb-2.5 flex h-[52px] shrink-0 items-center justify-between gap-1">
      <div className="flex min-w-0 items-center gap-0.5">
        {hasNav && (
          <RoundButton onClick={onPrev} disabled={navDisabled} ariaLabel="前の期間へ">
            <ChevronLeft className="h-[22px] w-[22px]" />
          </RoundButton>
        )}
        <button type="button" onClick={onOpenViewMenu} aria-label="表示範囲を変更" className="flex min-h-11 min-w-0 items-center gap-1 rounded-xl px-1 text-[var(--at-strong)] active:opacity-60">
          <h1 className="truncate text-[clamp(15px,5.4vw,22px)] font-bold tracking-[-.02em]">{title}</h1>
          <ChevronDown className="h-[17px] w-[17px] shrink-0 text-[var(--at-cyan)]" />
        </button>
        {hasNav && (
          <RoundButton onClick={onNext} disabled={navDisabled} ariaLabel="次の期間へ">
            <ChevronRight className="h-[22px] w-[22px]" />
          </RoundButton>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        {onToggleDetail && (
          <RoundButton onClick={onToggleDetail} active={detailActive} ariaLabel="月次詳細">
            <BarChart3 className="h-[19px] w-[19px]" />
          </RoundButton>
        )}
        <RoundButton onClick={onOpenFilter} active={filterActive} ariaLabel="絞り込み">
          <Filter className="h-[18px] w-[18px]" />
        </RoundButton>
      </div>
    </div>
  );
}

// 店舗詳細（#3a）: 1店舗の指標（実施回数・勝敗・勝率・時間・投資/回収・平均額・時給・期待値合計/平均）＋実施履歴。
// archives は呼び出し側で既に対象スコープ（現在のフィルタ）まで絞り込み済みのものを渡す想定。
function StoreStatRow({ label, value, cls = "text-[var(--at-strong)]" }) {
  return (
    <div className="flex min-h-[46px] items-center justify-between gap-3 border-b border-[var(--at-ln-soft)] py-2 last:border-b-0">
      <span className="text-[15px] font-medium text-[var(--at-strong)]">{label}</span>
      <span className={`text-[16px] font-semibold tabular-nums ${cls}`}>{value}</span>
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
      <div className="relative mx-auto flex min-h-0 w-full max-w-[430px] flex-1 flex-col px-4 pt-3">
        {/* iOS のナビゲーションバー（丸型の戻るボタン＋タイトル） */}
        <div className="mb-2 flex min-h-[52px] shrink-0 items-center gap-1.5">
          <RoundButton onClick={onBack} ariaLabel="戻る">
            <ChevronLeft className="h-[22px] w-[22px]" />
          </RoundButton>
          <h1 className="min-w-0 flex-1 truncate text-[20px] font-bold leading-tight tracking-[-.02em]">{storeName}</h1>
          {isTopStore && (
            <span className="shrink-0 rounded-full bg-[var(--at-gold)] px-2.5 py-1 text-[12px] font-bold text-[var(--at-on-gold)]">1位</span>
          )}
        </div>

        <section className={`${card} p-4`}>
          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[13px] font-semibold text-[var(--at-mut)]">この店舗での収支（全期間）</div>
              <div className="mt-1 flex items-baseline gap-1">
                <span className={`text-[clamp(28px,9vw,40px)] font-bold leading-none tracking-[-.03em] tabular-nums ${moneyClass(heroPL)}`}>{signed(heroPL)}</span>
                <span className="text-[14px] font-semibold text-[var(--at-mut)]">円</span>
              </div>
            </div>
            <div className="shrink-0 pb-0.5 text-right">
              <div className="text-[11.5px] font-semibold text-[var(--at-mut)]">平均回転率</div>
              <div className="mt-1 text-[18px] font-bold tabular-nums">
                {avgSpin != null ? avgSpin.toFixed(1) : "—"}<span className="ml-0.5 text-[11px] font-semibold text-[var(--at-mut)]">回/k</span>
              </div>
            </div>
          </div>
        </section>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden overscroll-contain pb-12 pt-4">
          <section className={`${card} px-4 py-1`}>
            {stats.map((s) => <StoreStatRow key={s.label} {...s} />)}
          </section>

          <section>
            <GroupLabel action={<span className="shrink-0 text-[13px] font-semibold text-[var(--at-mut)]">収支順</span>}>実施履歴</GroupLabel>
            <div className={`${card} overflow-hidden`}>
              {visits.length === 0 ? (
                <div className="px-4 py-6 text-center text-[13px] text-[var(--at-mut)]">実戦記録がありません</div>
              ) : (
                visits.map((v, index) => (
                  <div key={v.key} className={`flex min-h-[60px] items-center gap-3 px-4 py-3 ${index > 0 ? "border-t border-[var(--at-ln-soft)]" : ""}`}>
                    <span className="w-[42px] shrink-0 text-[13px] font-semibold tabular-nums text-[var(--at-mut)]">{v.date?.slice(5).replace("-", "/")}</span>
                    <span className="min-w-0 flex-1">
                      <div className="truncate text-[15px] font-semibold">{v.machineName}</div>
                      <div className="mt-0.5 text-[12px] font-medium text-[var(--at-cyan)]">期待値 {signed(Math.round(v.ev))}円</div>
                    </span>
                    <span className={`shrink-0 text-[16px] font-bold tabular-nums ${v.pl != null ? moneyClass(v.pl) : "text-[var(--at-faint)]"}`}>
                      {v.pl != null ? `${signed(v.pl)}円` : "—"}
                    </span>
                  </div>
                ))
              )}
            </div>
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
      machineNum: a.machineNum != null ? String(a.machineNum) : "",
    }))
    .sort((a, b) => a.sortKey.localeCompare(b.sortKey));
}

function MachineDetailScreen({ machineName, archives, isDemo, onBack }) {
  const demoMachine = isDemo ? DEMO_MACHINES.find((m) => m.machineName === machineName) : null;
  // 実戦履歴の並び替え: recent=新しい順 / spin=回転率が高い順 / machineNum=台番号順（同一台番号内は回転率が高い順）。
  // 台番号ごとの回転率の傾向を比較しやすくするための表示専用ソート（logic・保存データは非変更）。
  const [sortMode, setSortMode] = useState("recent");

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

  const rows = useMemo(() => {
    if (sortMode === "spin") {
      // 回転率が高い順（未記録は末尾）。
      return [...chartRows].sort((a, b) => (b.spin ?? -Infinity) - (a.spin ?? -Infinity));
    }
    if (sortMode === "machineNum") {
      // 台番号の小さい順にまとめ、同一台番号内は回転率が高い順（台番号未入力は末尾）。
      return [...chartRows].sort((a, b) => {
        const na = Number(a.machineNum);
        const nb = Number(b.machineNum);
        const aHas = a.machineNum !== "" && !Number.isNaN(na);
        const bHas = b.machineNum !== "" && !Number.isNaN(nb);
        if (aHas && bHas && na !== nb) return na - nb;
        if (aHas !== bHas) return aHas ? -1 : 1;
        return (b.spin ?? -Infinity) - (a.spin ?? -Infinity);
      });
    }
    // 新しい順（既定）。
    return [...chartRows].reverse();
  }, [chartRows, sortMode]);

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
      <div className="relative mx-auto flex min-h-0 w-full max-w-[430px] flex-1 flex-col px-4 pt-3">
        {/* iOS のナビゲーションバー（丸型の戻るボタン＋タイトル） */}
        <div className="mb-2 flex min-h-[52px] shrink-0 items-center gap-1.5">
          <RoundButton onClick={onBack} ariaLabel="戻る">
            <ChevronLeft className="h-[22px] w-[22px]" />
          </RoundButton>
          <h1 className="min-w-0 flex-1 truncate text-[20px] font-bold leading-tight tracking-[-.02em]">{machineName}</h1>
        </div>

        <section className={`${card} p-4`}>
          <div className="text-[13px] font-semibold text-[var(--at-mut)]">この機種の通算収支</div>
          <div className="mt-1 flex items-baseline gap-1">
            <span className={`text-[clamp(28px,9vw,40px)] font-bold leading-none tracking-[-.03em] tabular-nums ${moneyClass(heroPL)}`}>{signed(heroPL)}</span>
            <span className="text-[14px] font-semibold text-[var(--at-mut)]">円</span>
          </div>
          <div className="mt-2 text-[12.5px] font-semibold text-[var(--at-cyan)]">期待値累計 {signed(heroEv)}円</div>
          <div className="mt-3.5 grid grid-cols-3 border-t border-[var(--at-ln-soft)] pt-3">
            {[
              { label: "実戦", value: `${isDemo ? "—" : summaryX?.count ?? 0}回`, cls: "text-[var(--at-strong)]" },
              {
                label: "勝率",
                value: `${isDemo ? (demoMachine?.winRate ?? "—") : (summaryX?.winRate ?? "—")}%`,
                sub: !isDemo && summaryX ? `${summaryX.wins}勝${summaryX.losses}敗` : "",
                cls: "text-[var(--at-strong)]",
              },
              {
                label: "時給",
                value: !isDemo && summaryX?.wage != null ? `${signed(summaryX.wage)}円` : "—",
                cls: !isDemo && summaryX?.wage != null ? moneyClass(summaryX.wage) : "text-[var(--at-strong)]",
              },
            ].map((item, index) => (
              <div key={item.label} className={`min-w-0 text-center ${index > 0 ? "border-l border-[var(--at-ln-soft)]" : ""}`}>
                <div className="text-[11.5px] font-semibold text-[var(--at-mut)]">{item.label}</div>
                <div className={`mt-1 truncate whitespace-nowrap text-[15px] font-bold tabular-nums ${item.cls}`}>{item.value}</div>
                {item.sub && <div className="mt-0.5 truncate text-[10.5px] font-medium text-[var(--at-faint2)]">{item.sub}</div>}
              </div>
            ))}
          </div>
        </section>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden overscroll-contain pb-12 pt-4">
          <section className={`${card} overflow-hidden p-3`}>
            <SectionTitle note="累計実収支（実線）／累計期待値（破線）">実戦ごとの累計推移</SectionTitle>
            {chartRows.length === 0 ? (
              <div className="px-2 py-8 text-center text-[11px] text-[var(--at-mut)]">実戦記録がありません</div>
            ) : (
              <div className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartRows} margin={{ top: 6, right: 4, bottom: 0, left: 0 }}>
                    <CartesianGrid stroke="rgba(120,120,128,.24)" vertical={false} />
                    <XAxis dataKey="day" tick={{ fill: "#8E8E93", fontSize: 8 }} tickLine={false} axisLine={false} />
                    <YAxis width={38} tick={{ fill: "#8E8E93", fontSize: 8 }} tickLine={false} axisLine={false} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                    <ReferenceLine y={0} stroke="rgba(120,120,128,.5)" />
                    <Tooltip contentStyle={{ background: "var(--at-panel)", border: "1px solid var(--at-ln-md)", borderRadius: 8, fontSize: 10 }} formatter={(value) => `${signed(value)}円`} />
                    <Legend iconSize={8} wrapperStyle={{ fontSize: 9 }} />
                    <Bar dataKey="pl" name="単発収支" fill="#30D158" radius={[3, 3, 0, 0]} maxBarSize={16}>
                      {chartRows.map((d, i) => <Cell key={i} fill={(d.pl ?? 0) >= 0 ? "rgba(48,209,88,.55)" : "rgba(255,69,58,.5)"} />)}
                    </Bar>
                    <Line type="monotone" dataKey="cum" name="累計実収支" stroke="#30D158" strokeWidth={2.2} dot={false} />
                    <Line type="monotone" dataKey="cumEv" name="累計期待値" stroke="#FF9F0A" strokeWidth={1.6} strokeDasharray="4 3" dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}
          </section>

          <section className={`${card} px-4 py-3.5`}>
            <div className="mb-2.5 text-[16px] font-bold">通算サマリー</div>
            <div className="grid grid-cols-3 gap-2">
              <MiniStat label="平均回転率" value={!isDemo && summaryX?.avgSpin != null ? `${summaryX.avgSpin.toFixed(1)}回/k` : (isDemo ? `${demoMachine?.spin ?? "—"}回/k` : "—")} />
              <MiniStat label="総回転数" value={!isDemo && summaryX ? `${fmt(summaryX.totalSpins)}G` : "—"} />
              <MiniStat label="総遊技時間" value={!isDemo && summaryX ? `${summaryX.totalHours.toFixed(1)}h` : (isDemo ? `${demoMachine?.hours ?? "—"}h` : "—")} />
            </div>
          </section>

          <section>
            <GroupLabel>実戦履歴</GroupLabel>
            {/* 並び替え（新しい順／回転率順／台番号順）。台番号ごとの回転率比較用の表示専用トグル。 */}
            <div className="mb-2 grid grid-cols-3 gap-1 rounded-[10px] bg-[var(--at-rowbg)] p-1">
              {[["recent", "新しい順"], ["spin", "回転率順"], ["machineNum", "台番号順"]].map(([key, label]) => (
                <button key={key} type="button" onClick={() => setSortMode(key)} aria-pressed={sortMode === key}
                  className={`h-9 rounded-[8px] text-[14px] font-semibold transition ${sortMode === key
                    ? "bg-[var(--at-panel)] text-[var(--at-strong)] shadow-[0_1px_3px_rgba(0,0,0,.25)]"
                    : "text-[var(--at-mut)]"}`}>
                  {label}
                </button>
              ))}
            </div>
            <div className={`${card} overflow-hidden`}>
              {rows.length === 0 ? (
                <div className="px-4 py-6 text-center text-[13px] text-[var(--at-mut)]">実戦記録がありません</div>
              ) : (
                <>
                  {/* 3つの数値列が何を指すかが分からなかったため見出し行を追加（表示のみ）。 */}
                  <div className="grid grid-cols-[1fr_66px_66px_66px] items-center gap-1.5 border-b border-[var(--at-ln-soft)] bg-[var(--at-rowbg)] px-4 py-2 text-right text-[11px] font-semibold text-[var(--at-mut)]">
                    <span className="text-left">日付 / 店舗</span>
                    <span>収支</span>
                    <span>期待値</span>
                    <span>累計</span>
                  </div>
                  {rows.map((r, index) => (
                  <div key={r.key} className={`px-4 py-3 ${index > 0 ? "border-t border-[var(--at-ln-soft)]" : ""}`}>
                    <div className="grid grid-cols-[1fr_66px_66px_66px] items-center gap-1.5 text-right">
                      <span className="min-w-0 text-left">
                        <div className="truncate text-[14px] font-semibold">{r.day}</div>
                        {/* 台番号は幅の余っている下段へ回し、店舗名が省略されないようにする */}
                        <div className="mt-0.5 truncate text-[11px] font-medium text-[var(--at-mut)]">{r.store}</div>
                      </span>
                      <span className={`text-[13px] font-bold tabular-nums ${r.pl != null ? moneyClass(r.pl) : "text-[var(--at-faint)]"}`}>{r.pl != null ? signed(r.pl) : "—"}</span>
                      <span className="text-[13px] font-bold tabular-nums text-[var(--at-cyan)]">{signed(Math.round(r.ev))}</span>
                      <span className={`text-[13px] font-bold tabular-nums ${moneyClass(r.cum)}`}>{signed(r.cum)}</span>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-medium text-[var(--at-mut)]">
                      {r.machineNum && <span className="rounded-full bg-[var(--at-rowbg)] px-2 py-0.5 font-semibold tabular-nums text-[var(--at-subtle-hi)]">{r.machineNum}番台</span>}
                      <span>投資 <span className="font-semibold tabular-nums text-[var(--at-strong)]">{fmt(r.invest)}</span></span>
                      <span>回収 <span className="font-semibold tabular-nums text-[var(--at-strong)]">{fmt(r.recovery)}</span></span>
                      <span className="tabular-nums">{r.spin != null ? `${r.spin.toFixed(1)}回/k` : "—"}</span>
                      <span className="tabular-nums">{r.hours > 0 ? `${r.hours.toFixed(1)}h` : "—"}</span>
                    </div>
                  </div>
                  ))}
                </>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function MiniStat({ label, value }) {
  return (
    <div className="min-w-0">
      <div className="text-[11.5px] font-medium text-[var(--at-mut)]">{label}</div>
      <div className="mt-0.5 truncate text-[15px] font-bold tabular-nums">{value}</div>
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
  // 審査版では未記録時に架空の収支・店舗を表示せず、空状態を表示する。
  const isDemo = false;
  const [internalTab, setInternalTab] = useState("month");
  const rawPeriodTab = externalPeriodTab || internalTab;
  // 旧上位タブ「カレンダー」(記録エディタ単独タブ)の永続値は廃止。月別として扱う。
  const periodTab = rawPeriodTab === "calendar" ? "month" : rawPeriodTab;
  const setPeriodTab = onChangePeriodTab || setInternalTab;
  const [internalFilters, setInternalFilters] = useState({ storeName: "", machineName: "", dateStart: "", dateEnd: "", weekdays: [], gameType: "all" });
  const filters = externalFilters || internalFilters;
  const setFilters = onChangeFilters || setInternalFilters;
  const [filterOpen, setFilterOpen] = useState(false);
  const [viewMenuOpen, setViewMenuOpen] = useState(false);
  // 収支管理では「今日」を起点に見るのが自然なため、初期選択日は今日にする（旧: 14 固定）。
  const [selectedDay, setSelectedDay] = useState(() => new Date().getDate());
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
  // 「すべて見る」で開く全店舗一覧のサブ画面状態と、その並び替え。
  // 並び替えは親で持ち、店舗詳細へ進んで戻ってきても選択が保たれるようにする。
  const [storeListOpen, setStoreListOpen] = useState(false);
  const [storeListSort, setStoreListSort] = useState("actual");
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
    setShareOpen(false);
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

  // 期間スクラバーのチップタップで指定の月へ直接ジャンプ（相対送りの goPeriod と異なり絶対値指定）。
  const gotoMonth = (offset) => {
    if (offset === monthOffset) return;
    setSlideDir(offset > monthOffset ? "next" : "prev");
    setMonthOffset(offset);
  };

  // 「今日」ボタン: 今月へ戻して本日を選択する（何ヶ月さかのぼっても1タップで復帰できる）。
  const goToday = () => {
    const now = new Date();
    gotoMonth(0);
    setSelectedDay(now.getDate());
  };

  const jumpToMonth = (value) => {
    const match = /^(\d{4})-(\d{2})$/.exec(value || "");
    if (!match) return;
    const targetYear = Number(match[1]);
    const targetMonth = Number(match[2]) - 1;
    const offset = (targetYear - baseDate.getFullYear()) * 12 + (targetMonth - baseDate.getMonth());
    setPeriodTab("month");
    setDetailView(false);
    setShareOpen(false);
    gotoMonth(offset);
    setViewMenuOpen(false);
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
  // 「すべて見る」のバッジ用。トップ3の裏にいくつ店舗があるかを示す。
  const storeCount = useMemo(
    () => isDemo ? DEMO_STORES.length : buildStoreRanking(filtered, { limit: 0 }).length,
    [filtered, isDemo],
  );
  const storeOptions = useMemo(() => listAvailableStores(archives), [archives]);
  const machineOptions = useMemo(() => listAvailableMachines(archives), [archives]);
  const filterActive = Boolean(
    (filters.gameType && filters.gameType !== "all")
    || filters.storeName
    || filters.machineName
    || filters.dateStart
    || filters.dateEnd
    || (Array.isArray(filters.weekdays) && filters.weekdays.length > 0),
  );
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
        : "詳細分析";
  // 表示中の月の日数。31日を選んだまま30日以下の月へ送ると存在しない日付になるため、
  // 選択日は必ず月内へ丸めてから使う（Date が翌月へ繰り上がり、曜日ラベルがずれるのを防ぐ）。
  const daysInMonth = new Date(year, month, 0).getDate();
  const activeDay = Math.min(Math.max(1, selectedDay), daysInMonth);
  // 今日のセルに印を付けるための日付（表示中の月が今月のときだけ有効）。
  const today = new Date();
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() + 1 === month;
  const todayDay = isCurrentMonth ? today.getDate() : null;
  const selectedDateLabel = `${month}月${activeDay}日（${WEEKDAYS[new Date(year, month - 1, activeDay).getDay()]}）`;
  const selectedDateStr = `${year}-${String(month).padStart(2, "0")}-${String(activeDay).padStart(2, "0")}`;
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
          <CalendarTab S={S} onReset={onReset} initialDate={sheetDay} focusMode initialArchiveId={recordsDay.archiveId} onDone={() => setRecordsDay(null)}
            onOpenMachine={(name) => { if (name) { setRecordsDay(null); setMachineDetailName(name); } }} />
        </div>
      </div>
    );
  }

  // 「すべて見る」で開く全店舗一覧のサブ画面。店舗詳細と同じく全期間スコープ。
  // 行タップで店舗詳細へ進み、そこから戻るとこの一覧に戻る（iOS のプッシュ遷移と同じ積み方）。
  if (storeListOpen && storeDetailName === null) {
    return (
      <StoreListScreen
        archives={filterArchives(archives, filters)}
        onSelect={setStoreDetailName}
        onBack={() => setStoreListOpen(false)}
        sortBy={storeListSort}
        setSortBy={setStoreListSort}
      />
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
        <div className="relative mx-auto flex min-h-0 w-full max-w-[430px] flex-1 flex-col px-4 pt-3">
          <HeaderBar
            title={headerTitle}
            onOpenViewMenu={() => setViewMenuOpen(true)}
            onOpenFilter={() => setFilterOpen((value) => !value)}
            filterActive={filterActive}
          />
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden overscroll-contain pb-12">
            {filterOpen && <FilterPanel stores={storeOptions} machines={machineOptions} filters={filters} setFilters={setFilters} onClose={() => setFilterOpen(false)} />}
            <MachinePodium rows={machines} />
            <BalanceBars rows={machines} />
            <StorePanel rows={stores} onSelect={setStoreDetailName} onSeeAll={() => setStoreListOpen(true)} totalCount={storeCount} />
            <AnalyzerView archives={archives} extraFilters={filters} onSelectMachine={setMachineDetailName} />
          </div>
        </div>
        {viewMenuOpen && <ViewMenuSheet current={periodTab} monthValue={monthKey} onSelect={handleSelectView} onMonthChange={jumpToMonth} onClose={() => setViewMenuOpen(false)} />}
      </div>
    );
  }

  return (
    <div className="analytics-terminal flex min-h-0 flex-1 flex-col overflow-hidden bg-[var(--at-page)] text-[var(--at-strong)]">
      {/* overflow-x:clip 必須（横スワイプ月送りのズレ対策）: このコンテナは overflow-y が visible のため
          clip がそのまま効き、スクロールボックスを作らずに横方向をハードクリップする。これにより月送り
          スライド（.month-pane-*）の一時的な横はみ出しや幅超過要素が、rubber-band 可能な祖先（.analytics-terminal）
          へ伝播して「画面全体が左へパンしたまま固定される」現象を根元で遮断する。 */}
      <div className="relative mx-auto flex min-h-0 w-full max-w-[430px] flex-1 flex-col overflow-x-clip px-4 pt-3">
        {/* 左の ‹ ／ 右側の › と中央ラベル横の › で月（年別は年）送り。
            右端の「月次詳細」ボタンでカレンダーと収支グラフ＋成績を同一画面で切り替える（月別のみ）。 */}
        <HeaderBar
          title={headerTitle}
          onPrev={() => goPeriod(-1)}
          onNext={() => goPeriod(1)}
          navDisabled={periodTab === "all"}
          onToggleDetail={periodTab === "month" ? toggleDetailView : undefined}
          detailActive={detailView}
          onOpenViewMenu={() => setViewMenuOpen(true)}
          onOpenFilter={() => setFilterOpen((value) => !value)}
          filterActive={filterActive}
        />

        {filterOpen && <FilterPanel stores={storeOptions} machines={machineOptions} filters={filters} setFilters={setFilters} onClose={() => setFilterOpen(false)} />}

        {/* 画面内スクロール領域。横スワイプで月送り（縦スクロールは阻害しない）。
            touch-pan-y必須: 指定なしだとブラウザが横方向の触操作を「未確定のパン」として解釈し、
            スワイプ中に画面が横にわずかに引っ張られて元に戻る（弾性バウンス）挙動でブレて見える。
            pan-yで縦スクロールのみブラウザに許可し、横方向は即座にJS(onSwipeStart/End)へ渡す。
            横方向の弾性オーバースクロール（rubber-band）による「画面全体が左へパンしたまま固定」は
            親コンテナ（下記コメント）の overflow-x:clip で遮断する。ここは overflow-y:auto のため
            overflow-x:clip を付けても CSS 仕様上 hidden に計算されクリップバリアにならない。 */}
        <main onTouchStart={onSwipeStart} onTouchEnd={onSwipeEnd} className="touch-pan-y min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain pb-12">
          {/* 月送り・表示切替で key が変わり、向きに応じたアニメーションを再生する。 */}
          <div key={`${periodTab}-${monthOffset}-${detailView}`} className={`month-pane-${slideDir} space-y-5`}>
            {periodTab === "month" ? (
              detailView ? (
                /* 月次詳細：今月の収支グラフ＋成績＋統計（モック2）。 */
                <MonthDetailContent chartData={summaryChart} score={summaryScore} stats={summaryStats} />
              ) : (
                <>
                  {/* 月間数値＋大きな収支カレンダー＋選択日詳細。月一覧チップは年月メニューへ移動した。 */}
                  <MonthHero
                    title={`${month}月の収支`}
                    actual={actual}
                    ev={ev}
                    diff={monthDiff}
                    winRate={winRate}
                    invest={summary.totalInvest}
                    recovery={summary.totalRecovery}
                    days={days}
                  />
                  <CalendarPanel
                    dayMap={dayMap}
                    selectedDay={activeDay}
                    setSelectedDay={setSelectedDay}
                    year={year}
                    month={month}
                    todayDay={todayDay}
                    onToday={monthOffset !== 0 || todayDay !== activeDay ? goToday : null}
                  />
                  <DayDetail dateLabel={selectedDateLabel} row={dayMap[activeDay]} archives={dayArchives} onEditRecords={(archiveId = null) => setRecordsDay({ day: selectedDateStr, archiveId })} />
                  <ShareCTA onShare={() => setShareOpen(true)} title="今月のカレンダーを共有" subtitle="店舗名や台番号を含まない画像を作成します" />
                </>
              )
            ) : (
              <>
                <SummaryHero summary={summary} isDemo={isDemo} heroTitle={heroTitle} />
                <PeriodBreakdownPanel periodTab={periodTab} rows={periodRows} isDemo={isDemo} />
                <TrendPanel data={trend} />
                <Kpis summary={summary} isDemo={isDemo} />
              </>
            )}
          </div>
        </main>
      </div>
      {viewMenuOpen && <ViewMenuSheet current={periodTab} monthValue={monthKey} onSelect={handleSelectView} onMonthChange={jumpToMonth} onClose={() => setViewMenuOpen(false)} />}
      {shareOpen && periodTab === "month" && <ShareCard year={year} month={month} actual={actual} ev={ev} winRate={winRate} days={days} dayMap={dayMap} onClose={() => setShareOpen(false)} />}
    </div>
  );
}
