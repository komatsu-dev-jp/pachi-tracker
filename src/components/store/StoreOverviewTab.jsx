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
} from "lucide-react";
import { SectionCard, SectionHeader, StatTile, WarningCard } from "./storeDetailShared";

function SettingIcon({ icon, label, value }) {
  const Icon = icon;
  return (
    <div className="flex flex-1 flex-col items-center gap-1.5 py-1 text-center">
      <Icon size={20} className="text-[var(--orange)]" />
      <span className="text-[12px] font-bold leading-tight text-[var(--text)]">{value}</span>
      {label && <span className="text-[10px] leading-none text-[var(--sub)]">{label}</span>}
    </div>
  );
}

export default function StoreOverviewTab({ data, onNavigateTab }) {
  const { currentSettings, chodama, dataSufficiency, nextToCheck } = data;

  return (
    <div className="px-3 pt-3 pb-6">
      {/* 1. 現在の店舗設定 */}
      <SectionCard>
        <SectionHeader
          title="現在の店舗設定"
          action={currentSettings.appliedToCurrentSession ? "✓ 現在の実戦設定に適用中" : undefined}
        />
        <div className="flex items-stretch gap-1 px-3 pb-4">
          <SettingIcon icon={Target} value={`${currentSettings.rentalYenPer100}円パチンコ`} />
          <SettingIcon icon={ArrowLeftRight} value={`${currentSettings.exchangeBallsPer100}玉交換`} />
          <SettingIcon icon={Database} value={currentSettings.hasChodama ? "貯玉あり" : "貯玉なし"} />
          <SettingIcon icon={RotateCw} value={`${currentSettings.replayCapBalls}玉`} label="再プレイ上限" />
        </div>
      </SectionCard>

      {/* 2. 貯玉状況 */}
      <SectionCard>
        <SectionHeader title="貯玉状況" action="貯玉管理 ›" onAction={() => onNavigateTab?.("settings")} />
        <div className="flex gap-2 px-3 pb-3">
          <StatTile
            label="店内貯玉"
            value={`${chodama.storeBalls.toLocaleString("ja-JP")}玉`}
            valueColorClass="text-[var(--purple)]"
            sub={`約${chodama.storeBallsYen.toLocaleString("ja-JP")}円`}
          />
          <StatTile
            label="店内再プレイ"
            value={`${chodama.storeReplayBalls.toLocaleString("ja-JP")}玉`}
            valueColorClass="text-[var(--blue)]"
            sub={`約${chodama.storeReplayYen.toLocaleString("ja-JP")}円`}
          />
          <StatTile
            label="本日精算予定"
            value={`${chodama.todaySettlementBalls.toLocaleString("ja-JP")}玉`}
            valueColorClass="text-[var(--orange)]"
            sub={`${chodama.todaySettlementYen.toLocaleString("ja-JP")}円`}
          />
        </div>
      </SectionCard>

      {/* 3. 分析サマリー */}
      <SectionCard>
        <SectionHeader title="分析サマリー" action="分析を見る ›" onAction={() => onNavigateTab?.("analysis")} />
        <div className="flex gap-2 px-3 pb-3">
          <StatTile icon={<FileText size={14} />} label="有効記録" value={`${dataSufficiency.validRecords}件`} />
          <StatTile icon={<Gamepad2 size={14} />} label="把握機種" value={`${dataSufficiency.knownMachines}機種`} />
          <StatTile
            icon={<CalendarDays size={14} />}
            label="曜日"
            value={`${dataSufficiency.dayOfWeekCovered}/${dataSufficiency.dayOfWeekTotal}`}
          />
          <StatTile
            icon={<Clock3 size={14} />}
            label="時間帯"
            value={`${dataSufficiency.timeSlotCovered}/${dataSufficiency.timeSlotTotal}`}
          />
        </div>
      </SectionCard>

      {/* 4. 次に確認すること */}
      <WarningCard
        Icon={AlertTriangle}
        title={nextToCheck.title}
        body={nextToCheck.body}
        cta="詳細を見る ›"
        onCta={() => onNavigateTab?.("analysis")}
      />
    </div>
  );
}
