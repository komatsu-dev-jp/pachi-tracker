// 店舗詳細画面「概要」タブ（見た目優先プロトタイプ）
// props の data は src/data/mockStoreDetail.js のダミーデータ。実データ接続は次ステップ。

import React from "react";
import {
  Target,
  ArrowLeftRight,
  Database,
  RotateCw,
  FileText,
  Gamepad2,
  CalendarDays,
  Clock3,
  AlertTriangle,
  ChevronRight,
} from "lucide-react";
import { SectionCard, SectionHeader, StatTile, TabIntro, WarningCard } from "./storeDetailShared";
import { DETAIL_KEYS } from "./storeDetailPanels";

function SettingIcon({ icon, label, value, onClick }) {
  const Icon = icon;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-haspopup="dialog"
      aria-label={`${label}の詳細を表示`}
      className="flex min-h-[88px] min-w-0 flex-col rounded-2xl border border-[var(--border)] bg-[var(--surface-hi)] p-3 text-left transition-colors active:border-[var(--orange)] active:bg-[var(--orange)]/10"
    >
      <span className="flex w-full items-start justify-between gap-2">
        <Icon size={18} className="text-[var(--orange)]" />
        <ChevronRight size={14} className="shrink-0 text-[var(--sub)]" />
      </span>
      <span className="mt-auto break-words text-[14px] font-black leading-tight text-[var(--text)]">{value}</span>
      <span className="mt-1 text-[10px] leading-none text-[var(--sub)]">{label || "現在の設定"}</span>
    </button>
  );
}

export default function StoreOverviewTab({ data, onNavigateTab, onOpenDetail }) {
  const { currentSettings, chodama, dataSufficiency, nextToCheck } = data;

  return (
    <div className="px-3 pt-4 pb-8">
      <TabIntro
        eyebrow="OVERVIEW"
        title="店舗のいまを、ひと目で確認"
        description="実戦前に必要な設定、貯玉、記録の集まり具合をまとめています。"
      />
      {/* 1. 現在の店舗設定 */}
      <SectionCard>
        <SectionHeader
          title="現在の店舗設定"
          action={currentSettings.appliedToCurrentSession ? "✓ 現在の実戦設定に適用中" : undefined}
        />
        <div className="grid grid-cols-2 gap-2 px-3 pb-4 sm:grid-cols-4">
          <SettingIcon icon={Target} value={`${currentSettings.rentalYenPer100}円パチンコ`} label="貸玉" onClick={() => onOpenDetail?.(DETAIL_KEYS.RENTAL_RATE)} />
          <SettingIcon icon={ArrowLeftRight} value={`${currentSettings.exchangeBallsPer100}玉交換`} label="交換率" onClick={() => onOpenDetail?.(DETAIL_KEYS.EXCHANGE_RATE)} />
          <SettingIcon icon={Database} value={currentSettings.hasChodama ? "貯玉あり" : "貯玉なし"} label="貯玉利用" onClick={() => onOpenDetail?.(DETAIL_KEYS.CHODAMA_STATUS)} />
          <SettingIcon icon={RotateCw} value={`${currentSettings.replayCapBalls}玉`} label="再プレイ上限" onClick={() => onOpenDetail?.(DETAIL_KEYS.REPLAY_CAP)} />
        </div>
      </SectionCard>

      {/* 2. 貯玉状況 */}
      <SectionCard>
        <SectionHeader title="貯玉状況" action="貯玉管理 ›" onAction={() => onNavigateTab?.("settings")} />
        <div className="grid grid-cols-2 gap-2 px-3 pb-3 sm:grid-cols-3">
          <StatTile
            label="店内貯玉"
            value={`${chodama.storeBalls.toLocaleString("ja-JP")}玉`}
            valueColorClass="text-[var(--purple)]"
            sub={`約${chodama.storeBallsYen.toLocaleString("ja-JP")}円`}
            onClick={() => onOpenDetail?.(DETAIL_KEYS.STORE_BALLS)}
          />
          <StatTile
            label="店内再プレイ"
            value={`${chodama.storeReplayBalls.toLocaleString("ja-JP")}玉`}
            valueColorClass="text-[var(--blue)]"
            sub={`約${chodama.storeReplayYen.toLocaleString("ja-JP")}円`}
            onClick={() => onOpenDetail?.(DETAIL_KEYS.STORE_REPLAY)}
          />
          <StatTile
            label="本日精算予定"
            value={`${chodama.todaySettlementBalls.toLocaleString("ja-JP")}玉`}
            valueColorClass="text-[var(--orange)]"
            sub={`${chodama.todaySettlementYen.toLocaleString("ja-JP")}円`}
            onClick={() => onOpenDetail?.(DETAIL_KEYS.TODAY_SETTLEMENT)}
          />
        </div>
      </SectionCard>

      {/* 3. 分析サマリー */}
      <SectionCard>
        <SectionHeader title="分析サマリー" action="分析を見る ›" onAction={() => onNavigateTab?.("analysis")} />
        <div className="grid grid-cols-2 gap-2 px-3 pb-3 sm:grid-cols-4">
          <StatTile icon={<FileText size={14} />} label="有効記録" value={`${dataSufficiency.validRecords}件`} onClick={() => onOpenDetail?.(DETAIL_KEYS.RECORDS)} />
          <StatTile icon={<Gamepad2 size={14} />} label="把握機種" value={`${dataSufficiency.knownMachines}機種`} onClick={() => onOpenDetail?.(DETAIL_KEYS.MACHINES)} />
          <StatTile
            icon={<CalendarDays size={14} />}
            label="曜日"
            value={`${dataSufficiency.dayOfWeekCovered}/${dataSufficiency.dayOfWeekTotal}`}
            onClick={() => onOpenDetail?.(DETAIL_KEYS.WEEKDAYS)}
          />
          <StatTile
            icon={<Clock3 size={14} />}
            label="時間帯"
            value={`${dataSufficiency.timeSlotCovered}/${dataSufficiency.timeSlotTotal}`}
            onClick={() => onOpenDetail?.(DETAIL_KEYS.TIME_SLOTS)}
          />
        </div>
      </SectionCard>

      {/* 4. 次に確認すること */}
      <WarningCard
        Icon={AlertTriangle}
        title={nextToCheck.title}
        body={nextToCheck.body}
        cta="詳細を見る ›"
        onCta={() => onOpenDetail?.(DETAIL_KEYS.NEXT_CHECK)}
      />
    </div>
  );
}
