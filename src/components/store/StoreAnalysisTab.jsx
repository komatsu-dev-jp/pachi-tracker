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
  AlertTriangle,
  BarChart3,
  ChevronRight,
} from "lucide-react";
import { SectionCard, SectionHeader, MiniBarSpark, TabIntro, WarningCard } from "./storeDetailShared";
import { DETAIL_KEYS } from "./storeDetailPanels";

function SufficiencyCard({ icon, label, value, progress, onClick }) {
  const Icon = icon;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-haspopup="dialog"
      aria-label={`${label}の詳細を表示`}
      className="flex min-h-[100px] min-w-0 flex-col rounded-2xl border border-[var(--border)] bg-[var(--surface-hi)] p-3 text-left transition-colors last:col-span-2 active:border-[var(--blue)] active:bg-[var(--blue)]/10 sm:last:col-span-1"
    >
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-[var(--blue)]/10 text-[var(--blue)]">
          <Icon size={14} />
        </span>
        <span className="text-[10px] font-bold text-[var(--sub)]">{label}</span>
        <ChevronRight size={13} className="ml-auto text-[var(--sub)]" />
      </div>
      <span className="mt-3 text-[17px] font-black leading-none text-[var(--text)]">{value}</span>
      {typeof progress === "number" && (
        <div className="mt-auto pt-3">
          <div className="h-1.5 overflow-hidden rounded-full bg-[var(--surface)]">
            <div
              className="h-full rounded-full bg-[var(--blue)]"
              style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
            />
          </div>
          <div className="mt-1 text-[9px] text-[var(--sub)]">カバー率 {progress}%</div>
        </div>
      )}
    </button>
  );
}

const trendIcons = {
  dayOfWeek: CalendarDays,
  timeSlot: Clock3,
  machine: Gamepad2,
  event: Flag,
};

function TrendRow({ trend, onClick }) {
  const Icon = trendIcons[trend.id] || CalendarDays;
  return (
    <button type="button" onClick={onClick} aria-haspopup="dialog" aria-label={`${trend.label}の詳細を表示`} className="flex min-h-[54px] min-w-0 items-center justify-between gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surface-hi)] px-3 py-2.5 text-left transition-colors active:border-[var(--blue)] active:bg-[var(--blue)]/10">
      <span className="flex min-w-0 items-center gap-1.5">
        <Icon size={14} className="shrink-0 text-[var(--sub-hi)]" />
        <span className="truncate text-[12px] font-bold text-[var(--text)]">{trend.label}</span>
      </span>
      <span className="flex shrink-0 items-center gap-1">
        <MiniBarSpark values={trend.spark} colorVar={`var(--${trend.color})`} />
        <ChevronRight size={14} className="text-[var(--sub)]" />
      </span>
    </button>
  );
}

function JudgmentRow({ icon, iconColorClass, label, count, countLabel, onClick }) {
  const Icon = icon;
  return (
    <button type="button" onClick={onClick} aria-haspopup="dialog" aria-label={`${label}の詳細を表示`} className="flex min-h-[58px] w-full items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3 text-left transition-colors last:border-b-0 active:bg-[var(--surface-hi)]">
      <span className="flex min-w-0 items-center gap-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[var(--surface-hi)]">
          <Icon size={16} className={iconColorClass} />
        </span>
        <span className="min-w-0">
          <span className="block text-[13px] font-bold text-[var(--text)]">{label}</span>
          <span className="mt-0.5 block text-[10px] text-[var(--sub)]">{countLabel}</span>
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-1 text-[16px] font-black text-[var(--blue)]">{count}件 <ChevronRight size={14} className="text-[var(--sub)]" /></span>
    </button>
  );
}

export default function StoreAnalysisTab({ data, onOpenDetail }) {
  const { dataSufficiency, trends, judgmentLog, nextToCheck } = data;
  const weekdayProgress = dataSufficiency.dayOfWeekTotal > 0
    ? Math.round((dataSufficiency.dayOfWeekCovered / dataSufficiency.dayOfWeekTotal) * 100)
    : 0;
  const timeSlotProgress = dataSufficiency.timeSlotTotal > 0
    ? Math.round((dataSufficiency.timeSlotCovered / dataSufficiency.timeSlotTotal) * 100)
    : 0;

  return (
    <div className="px-3 pt-4 pb-8">
      <TabIntro
        eyebrow="ANALYSIS"
        title="記録から見える傾向"
        description="データの集まり具合と、これまでの判断を読みやすく整理しています。"
      />
      {dataSufficiency.validRecords === 0 && (
        <div className="mb-3 flex items-start gap-3 rounded-2xl border border-[var(--orange)]/40 bg-[var(--orange)]/10 p-3.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[var(--orange)]/12 text-[var(--orange)]">
            <AlertTriangle size={16} />
          </span>
          <div>
            <div className="text-[12px] font-black text-[var(--orange)]">実戦記録がまだありません</div>
            <div className="mt-1 text-[10px] leading-relaxed text-[var(--sub-hi)]">記録を追加すると、傾向と判断ログが自動で更新されます。</div>
          </div>
        </div>
      )}
      {/* 1. データ充足状況 */}
      <SectionCard>
        <SectionHeader title="データ充足状況" />
        <div className="grid grid-cols-2 gap-2 px-3 pb-3 sm:grid-cols-5">
          <SufficiencyCard icon={CalendarDays} label="曜日" value={`${dataSufficiency.dayOfWeekCovered}/${dataSufficiency.dayOfWeekTotal}`} progress={weekdayProgress} onClick={() => onOpenDetail?.(DETAIL_KEYS.WEEKDAYS)} />
          <SufficiencyCard icon={Clock3} label="時間帯" value={`${dataSufficiency.timeSlotCovered}/${dataSufficiency.timeSlotTotal}`} progress={timeSlotProgress} onClick={() => onOpenDetail?.(DETAIL_KEYS.TIME_SLOTS)} />
          <SufficiencyCard icon={Gamepad2} label="機種" value={`${dataSufficiency.knownMachines}機種`} onClick={() => onOpenDetail?.(DETAIL_KEYS.MACHINES)} />
          <SufficiencyCard icon={FileText} label="有効記録" value={`${dataSufficiency.validRecords}件`} onClick={() => onOpenDetail?.(DETAIL_KEYS.RECORDS)} />
          <SufficiencyCard icon={History} label="最新性" value={dataSufficiency.freshnessLabel} onClick={() => onOpenDetail?.(DETAIL_KEYS.FRESHNESS)} />
        </div>
      </SectionCard>

      {/* 2. 傾向 */}
      <SectionCard>
        <SectionHeader title="傾向" />
        <div className="grid grid-cols-1 gap-2 px-3 pb-3 sm:grid-cols-2">
          {trends.length === 0 ? (
            <button type="button" onClick={() => onOpenDetail?.(DETAIL_KEYS.NEXT_CHECK)} aria-haspopup="dialog" className="col-span-2 flex flex-col items-center rounded-2xl border border-dashed border-[var(--border-hi)] bg-[var(--surface-hi)] px-4 py-5 text-center active:border-[var(--blue)]">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--blue)]/10 text-[var(--blue)]">
                <BarChart3 size={17} />
              </span>
              <div className="mt-2 text-[12px] font-bold text-[var(--text)]">傾向はまだありません</div>
              <div className="mt-1 text-[10px] leading-relaxed text-[var(--sub)]">実戦記録が増えると、曜日・時間帯・機種ごとの傾向が表示されます。</div>
              <span className="mt-2 inline-flex items-center gap-1 text-[10px] font-bold text-[var(--blue)]">詳細を見る <ChevronRight size={12} /></span>
            </button>
          ) : trends.map((trend) => (
            <TrendRow key={trend.id} trend={trend} onClick={() => onOpenDetail?.(trend.id === "dayOfWeek" ? DETAIL_KEYS.WEEKDAYS : trend.id === "timeSlot" ? DETAIL_KEYS.TIME_SLOTS : DETAIL_KEYS.MACHINES)} />
          ))}
        </div>
      </SectionCard>

      {/* 3. 判断ログ */}
      <SectionCard>
        <SectionHeader title="判断ログ" />
        <div className="pb-1">
          <JudgmentRow icon={Target} iconColorClass="text-[var(--teal)]" label="良かった判断" countLabel="良い判断" count={judgmentLog.good} onClick={() => onOpenDetail?.(DETAIL_KEYS.JUDGMENT_GOOD)} />
          <JudgmentRow icon={Search} iconColorClass="text-[var(--orange)]" label="見直し候補" countLabel="見直し候補" count={judgmentLog.review} onClick={() => onOpenDetail?.(DETAIL_KEYS.JUDGMENT_REVIEW)} />
          <JudgmentRow icon={LogOut} iconColorClass="text-[var(--blue)]" label="撤退タイミング" countLabel="直近の撤退判断" count={judgmentLog.withdrawal} onClick={() => onOpenDetail?.(DETAIL_KEYS.JUDGMENT_WITHDRAWAL)} />
        </div>
      </SectionCard>

      {/* 4. 不足データ */}
      <WarningCard
        Icon={AlertTriangle}
        title={nextToCheck.title}
        body={nextToCheck.body}
        cta="次に確認する"
        onCta={() => onOpenDetail?.(DETAIL_KEYS.NEXT_CHECK)}
      />
    </div>
  );
}
