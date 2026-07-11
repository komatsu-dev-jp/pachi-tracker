// 店舗詳細画面「分析」タブ（見た目優先プロトタイプ）
// props の data は src/data/mockStoreDetail.js のダミーデータ。実データ接続は次ステップ。

import React from "react";
import {
  CalendarDays,
  Clock3,
  Gamepad2,
  FileText,
  History,
  Flag,
  Target,
  Search,
  LogOut,
  ChevronRight,
  AlertTriangle,
} from "lucide-react";
import { SectionCard, SectionHeader, MiniBarSpark, WarningCard } from "./storeDetailShared";

function SufficiencyCard({ icon, label, value }) {
  const Icon = icon;
  return (
    <div className="flex min-w-[86px] shrink-0 flex-col items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--surface-hi)] px-3 py-3 text-center">
      <Icon size={16} className="text-[var(--blue)]" />
      <span className="text-[14px] font-black leading-none text-[var(--text)]">{value}</span>
      <span className="text-[10px] leading-none text-[var(--sub)]">{label}</span>
    </div>
  );
}

const trendIcons = {
  dayOfWeek: CalendarDays,
  timeSlot: Clock3,
  machine: Gamepad2,
  event: Flag,
};

function TrendRow({ trend }) {
  const Icon = trendIcons[trend.id] || CalendarDays;
  return (
    <button
      type="button"
      className="flex min-h-[44px] flex-1 items-center justify-between gap-1 rounded-xl border border-[var(--border)] bg-[var(--surface-hi)] px-2.5 py-2.5 active:opacity-70"
    >
      <span className="flex min-w-0 items-center gap-1.5">
        <Icon size={14} className="shrink-0 text-[var(--sub-hi)]" />
        <span className="truncate text-[12px] font-bold text-[var(--text)]">{trend.label}</span>
      </span>
      <span className="flex shrink-0 items-center gap-1">
        <MiniBarSpark values={trend.spark} colorVar={`var(--${trend.color})`} />
        <ChevronRight size={13} className="shrink-0 text-[var(--sub)]" />
      </span>
    </button>
  );
}

function JudgmentRow({ icon, iconColorClass, label, count, countLabel }) {
  const Icon = icon;
  return (
    <button
      type="button"
      className="flex min-h-[48px] w-full items-center justify-between gap-2 border-b border-[var(--border)] px-4 py-3 last:border-b-0 active:opacity-70"
    >
      <span className="flex min-w-0 items-center gap-2.5">
        <Icon size={17} className={"shrink-0 " + iconColorClass} />
        <span className="truncate text-[13px] font-bold text-[var(--text)]">{label}</span>
      </span>
      <span className="flex shrink-0 items-center gap-2">
        <span className="text-[12px] text-[var(--sub)]">{countLabel}</span>
        <span className="text-[14px] font-black text-[var(--blue)]">{count}件</span>
        <ChevronRight size={14} className="text-[var(--sub)]" />
      </span>
    </button>
  );
}

export default function StoreAnalysisTab({ data, onNavigateTab }) {
  const { dataSufficiency, trends, judgmentLog, nextToCheck } = data;

  return (
    <div className="px-3 pt-3 pb-6">
      {/* 1. データ充足状況 */}
      <SectionCard>
        <SectionHeader title="データ充足状況" />
        <div className="flex gap-2 overflow-x-auto px-3 pb-3" style={{ scrollbarWidth: "none" }}>
          <SufficiencyCard icon={CalendarDays} label="曜日" value={`${dataSufficiency.dayOfWeekCovered}/${dataSufficiency.dayOfWeekTotal}`} />
          <SufficiencyCard icon={Clock3} label="時間帯" value={`${dataSufficiency.timeSlotCovered}/${dataSufficiency.timeSlotTotal}`} />
          <SufficiencyCard icon={Gamepad2} label="機種" value={`${dataSufficiency.knownMachines}機種`} />
          <SufficiencyCard icon={FileText} label="有効記録" value={`${dataSufficiency.validRecords}件`} />
          <SufficiencyCard icon={History} label="最新性" value={dataSufficiency.freshnessLabel} />
        </div>
      </SectionCard>

      {/* 2. 傾向 */}
      <SectionCard>
        <SectionHeader title="傾向" />
        <div className="grid grid-cols-2 gap-2 px-3 pb-3">
          {trends.map((trend) => (
            <TrendRow key={trend.id} trend={trend} />
          ))}
        </div>
      </SectionCard>

      {/* 3. 判断ログ */}
      <SectionCard>
        <SectionHeader title="判断ログ" />
        <div className="pb-1">
          <JudgmentRow icon={Target} iconColorClass="text-[var(--teal)]" label="良かった判断" countLabel="良い判断" count={judgmentLog.good} />
          <JudgmentRow icon={Search} iconColorClass="text-[var(--orange)]" label="見直し候補" countLabel="見直し候補" count={judgmentLog.review} />
          <JudgmentRow icon={LogOut} iconColorClass="text-[var(--blue)]" label="撤退タイミング" countLabel="直近の撤退判断" count={judgmentLog.withdrawal} />
        </div>
      </SectionCard>

      {/* 4. 不足データ */}
      <WarningCard
        Icon={AlertTriangle}
        title={nextToCheck.title}
        body={nextToCheck.body}
        cta="次に確認する"
        onCta={() => onNavigateTab?.("overview")}
      />
    </div>
  );
}
