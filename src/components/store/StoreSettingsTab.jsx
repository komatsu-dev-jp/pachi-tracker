import React from "react";
import { Store, CalendarDays, StickyNote, UserRound, Settings } from "lucide-react";
import { SectionCard, SectionHeader, StatTile } from "./storeDetailShared";

function InfoRow({ icon, label, value }) {
  const Icon = icon;
  return (
    <div className="flex items-start gap-2.5 px-4 py-2.5">
      <Icon size={15} className="mt-0.5 shrink-0 text-[var(--sub-hi)]" />
      <div className="min-w-0">
        <div className="text-[10px] leading-none text-[var(--sub)]">{label}</div>
        <div className="mt-1 text-[13px] font-bold leading-tight text-[var(--text)]">{value}</div>
      </div>
    </div>
  );
}

function RateCell({ label, value, unit }) {
  return (
    <div className="flex flex-1 flex-col items-center gap-1 rounded-xl border border-[var(--border)] bg-[var(--surface-hi)] px-2 py-3 text-center">
      <span className="text-[10px] leading-none text-[var(--sub)]">{label}</span>
      <span className="text-[15px] font-black leading-none text-[var(--text)]">{value}</span>
      {unit && <span className="text-[10px] leading-none text-[var(--sub)]">{unit}</span>}
    </div>
  );
}

export default function StoreSettingsTab({ data, onOpenSettings }) {
  const { basicInfo, memberCard, chodama, exchangeInfo } = data;

  return (
    <div className="px-3 pt-3 pb-6">
      <div className="mb-3 rounded-xl border border-[var(--blue)]/35 bg-[var(--blue)]/10 px-3 py-2.5 text-[11px] leading-relaxed text-[var(--sub-hi)]">
        この画面は確認専用です。編集や削除は設定トップから行えます。
      </div>

      <SectionCard>
        <SectionHeader title="店舗基本情報" />
        <div className="divide-y divide-[var(--border)]">
          <InfoRow icon={Store} label="店舗名" value={basicInfo.name} />
          <InfoRow icon={CalendarDays} label="最終来店" value={basicInfo.lastVisitLabel} />
          <InfoRow icon={StickyNote} label="メモ" value={basicInfo.memo || "—"} />
        </div>
        <div className="px-4 pb-3 text-[11px] text-[var(--sub)]">{basicInfo.address}</div>
      </SectionCard>

      <SectionCard>
        <SectionHeader
          title="会員カード"
          action={
            <span className="inline-flex items-center gap-1">
              <UserRound size={12} />
              {memberCard.created ? "会員カード作成済み" : "未作成"}
            </span>
          }
        />
        <div className="flex gap-2 px-3 pb-3">
          <StatTile label="最終残高" value={`${memberCard.lastBalanceBalls.toLocaleString("ja-JP")}玉`} valueColorClass="text-[var(--purple)]" sub={`約${memberCard.lastBalanceYen.toLocaleString("ja-JP")}円`} />
          <StatTile label="入金残高" value={`${memberCard.depositBalanceYen.toLocaleString("ja-JP")}円`} valueColorClass="text-[var(--blue)]" />
        </div>
      </SectionCard>

      <SectionCard>
        <SectionHeader title="貯玉・精算管理" />
        <div className="flex gap-2 px-3 pb-3">
          <StatTile label="店内貯玉" value={`${chodama.storeBalls.toLocaleString("ja-JP")}玉`} valueColorClass="text-[var(--purple)]" sub={`約${chodama.storeBallsYen.toLocaleString("ja-JP")}円`} />
          <StatTile label="店内再プレイ" value={`${chodama.storeReplayBalls.toLocaleString("ja-JP")}玉`} valueColorClass="text-[var(--blue)]" sub={`約${chodama.storeReplayYen.toLocaleString("ja-JP")}円`} />
          <StatTile label="本日精算予定" value={`${chodama.todaySettlementBalls.toLocaleString("ja-JP")}玉`} valueColorClass="text-[var(--orange)]" sub={`${chodama.todaySettlementYen.toLocaleString("ja-JP")}円`} />
        </div>
      </SectionCard>

      <SectionCard>
        <SectionHeader title="交換率・貸玉情報" />
        <div className="flex gap-2 px-3 pb-3">
          <RateCell label="貸玉単価" value={`${exchangeInfo.rentalYenPer100}円`} unit="/100円" />
          <RateCell label="交換率" value={`${exchangeInfo.exchangeBallsPer100}玉`} unit="/100円" />
          <RateCell label="玉単価" value={`${exchangeInfo.ballUnitYen.toFixed(2)}円`} unit="/1玉" />
          <RateCell label="再プレイ上限" value={`${exchangeInfo.replayCapBalls}玉`} unit="まで" />
        </div>
      </SectionCard>

      <button type="button" onClick={onOpenSettings} className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-[var(--blue)] text-[13px] font-bold text-[#03121f] active:opacity-80">
        <Settings size={16} />
        設定トップで編集する
      </button>
    </div>
  );
}
