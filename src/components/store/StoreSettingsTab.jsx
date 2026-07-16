import React from "react";
import {
  Store,
  CalendarDays,
  StickyNote,
  UserRound,
  Settings,
  Target,
  ArrowLeftRight,
  Database,
  RotateCw,
  Wallet,
  ChevronRight,
} from "lucide-react";
import { SectionCard, SectionHeader, StatTile, TabIntro } from "./storeDetailShared";
import { DETAIL_KEYS } from "./storeDetailPanels";

function InfoRow({ icon, label, value, onClick }) {
  const Icon = icon;
  return (
    <button type="button" onClick={onClick} aria-haspopup="dialog" aria-label={`${label}の詳細を表示`} className="flex min-h-[58px] w-full items-start gap-3 px-4 py-3 text-left transition-colors active:bg-[var(--surface-hi)]">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[var(--surface-hi)] text-[var(--sub-hi)]">
        <Icon size={15} />
      </span>
      <div className="min-w-0">
        <div className="text-[10px] leading-none text-[var(--sub)]">{label}</div>
        <div className="mt-1 text-[13px] font-bold leading-tight text-[var(--text)]">{value}</div>
      </div>
      <ChevronRight size={15} className="ml-auto mt-2 shrink-0 text-[var(--sub)]" />
    </button>
  );
}

function RateCell({ icon, label, value, unit, onClick }) {
  const Icon = icon;
  return (
    <button type="button" onClick={onClick} aria-haspopup="dialog" aria-label={`${label}の詳細を表示`} className="flex min-h-[90px] min-w-0 flex-col items-start rounded-2xl border border-[var(--border)] bg-[var(--surface-hi)] p-3.5 text-left transition-colors active:border-[var(--orange)] active:bg-[var(--orange)]/10">
      <span className="flex w-full items-center gap-2 text-[10px] font-bold text-[var(--sub)]">
        <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-[var(--orange)]/10 text-[var(--orange)]">
          <Icon size={14} />
        </span>
        {label}
        <ChevronRight size={13} className="ml-auto shrink-0 text-[var(--sub)]" />
      </span>
      <span className="mt-auto break-words text-[17px] font-black leading-tight text-[var(--text)]">{value}</span>
      {unit && <span className="mt-1 text-[10px] leading-none text-[var(--sub)]">{unit}</span>}
    </button>
  );
}

export default function StoreSettingsTab({ data, onOpenSettings, onOpenDetail }) {
  const { basicInfo, memberCard, chodama, exchangeInfo } = data;

  return (
    <div className="px-3 pt-4 pb-8">
      <TabIntro
        eyebrow="DETAILS"
        title="登録情報と残高の確認"
        description="店舗情報、会員カード、交換率をまとめて確認できます。"
      />
      <div className="mb-3 flex items-start gap-3 rounded-2xl border border-[var(--blue)]/35 bg-[var(--blue)]/10 p-3.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[var(--blue)]/12 text-[var(--blue)]">
          <Settings size={16} />
        </span>
        <div>
          <div className="text-[12px] font-black text-[var(--text)]">確認専用のページです</div>
          <div className="mt-1 text-[10px] leading-relaxed text-[var(--sub-hi)]">編集や削除は、ページ下部の「設定トップで編集する」から行えます。</div>
        </div>
      </div>

      <SectionCard>
        <SectionHeader title="店舗基本情報" />
        <div className="divide-y divide-[var(--border)]">
          <InfoRow icon={Store} label="店舗名" value={basicInfo.name} onClick={() => onOpenDetail?.(DETAIL_KEYS.STORE_INFO)} />
          <InfoRow icon={CalendarDays} label="最終来店" value={basicInfo.lastVisitLabel || "未記録"} onClick={() => onOpenDetail?.(DETAIL_KEYS.LAST_VISIT)} />
          <InfoRow icon={StickyNote} label="メモ" value={basicInfo.memo || "—"} onClick={() => onOpenDetail?.(DETAIL_KEYS.MEMO)} />
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
          onAction={() => onOpenDetail?.(DETAIL_KEYS.MEMBER_CARD)}
        />
        <div className="grid grid-cols-2 gap-2 px-3 pb-3">
          <StatTile icon={<Database size={14} />} label="最終残高" value={`${memberCard.lastBalanceBalls.toLocaleString("ja-JP")}玉`} valueColorClass="text-[var(--purple)]" sub={`約${memberCard.lastBalanceYen.toLocaleString("ja-JP")}円`} onClick={() => onOpenDetail?.(DETAIL_KEYS.MEMBER_CARD)} />
          <StatTile icon={<Wallet size={14} />} label="入金残高" value={`${memberCard.depositBalanceYen.toLocaleString("ja-JP")}円`} valueColorClass="text-[var(--blue)]" onClick={() => onOpenDetail?.(DETAIL_KEYS.DEPOSIT_BALANCE)} />
        </div>
      </SectionCard>

      <SectionCard>
        <SectionHeader title="貯玉・精算管理" />
        <div className="grid grid-cols-2 gap-2 px-3 pb-3 sm:grid-cols-3">
          <StatTile icon={<Database size={14} />} label="店内貯玉" value={`${chodama.storeBalls.toLocaleString("ja-JP")}玉`} valueColorClass="text-[var(--purple)]" sub={`約${chodama.storeBallsYen.toLocaleString("ja-JP")}円`} onClick={() => onOpenDetail?.(DETAIL_KEYS.STORE_BALLS)} />
          <StatTile icon={<RotateCw size={14} />} label="店内再プレイ" value={`${chodama.storeReplayBalls.toLocaleString("ja-JP")}玉`} valueColorClass="text-[var(--blue)]" sub={`約${chodama.storeReplayYen.toLocaleString("ja-JP")}円`} onClick={() => onOpenDetail?.(DETAIL_KEYS.STORE_REPLAY)} />
          <StatTile icon={<CalendarDays size={14} />} label="本日精算予定" value={`${chodama.todaySettlementBalls.toLocaleString("ja-JP")}玉`} valueColorClass="text-[var(--orange)]" sub={`${chodama.todaySettlementYen.toLocaleString("ja-JP")}円`} onClick={() => onOpenDetail?.(DETAIL_KEYS.TODAY_SETTLEMENT)} />
        </div>
      </SectionCard>

      <SectionCard>
        <SectionHeader title="交換率・貸玉情報" />
        <div className="grid grid-cols-2 gap-2 px-3 pb-3 sm:grid-cols-4">
          <RateCell icon={Target} label="貸玉単価" value={`${exchangeInfo.rentalYenPer100}円`} unit="/1玉" onClick={() => onOpenDetail?.(DETAIL_KEYS.RENTAL_RATE)} />
          <RateCell icon={ArrowLeftRight} label="交換率" value={`${exchangeInfo.exchangeBallsPer100}玉`} unit="/100円" onClick={() => onOpenDetail?.(DETAIL_KEYS.EXCHANGE_RATE)} />
          <RateCell icon={Database} label="玉単価" value={`${exchangeInfo.ballUnitYen.toFixed(2)}円`} unit="/1玉" onClick={() => onOpenDetail?.(DETAIL_KEYS.BALL_UNIT)} />
          <RateCell icon={RotateCw} label="再プレイ上限" value={`${exchangeInfo.replayCapBalls}玉`} unit="まで" onClick={() => onOpenDetail?.(DETAIL_KEYS.REPLAY_CAP)} />
        </div>
      </SectionCard>

      <button type="button" onClick={onOpenSettings} className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-[var(--blue)] text-[13px] font-bold text-[#03121f] active:opacity-80">
        <Settings size={16} />
        設定トップで編集する
      </button>
    </div>
  );
}
