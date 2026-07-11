// 店舗詳細画面「設定」タブ（見た目優先プロトタイプ）
// props の data は src/data/mockStoreDetail.js のダミーデータ。実データ接続は次ステップ。
// 会員カード管理・貯玉入出金・実戦設定への適用は、いずれも本画面では未接続（TODO）。

import React, { useState } from "react";
import { Store, CalendarDays, StickyNote, UserRound, Database, RefreshCw, AlertTriangle, Trash2 } from "lucide-react";
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

export default function StoreSettingsTab({ data, onEditBasicInfo, onManageMemberCard, onDeposit, onWithdraw, onApplyToSession, onEditExchangeInfo }) {
  const { basicInfo, memberCard, chodama, exchangeInfo } = data;
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div className="px-3 pt-3 pb-6">
      {/* 1. 店舗基本情報 */}
      <SectionCard>
        <SectionHeader title="店舗基本情報" action="編集" onAction={onEditBasicInfo} />
        <div className="divide-y divide-[var(--border)]">
          <InfoRow icon={Store} label="店舗名" value={basicInfo.name} />
          <InfoRow icon={CalendarDays} label="最終来店" value={basicInfo.lastVisitLabel} />
          <InfoRow icon={StickyNote} label="メモ" value={basicInfo.memo || "—"} />
        </div>
        <div className="px-4 pb-3 text-[11px] text-[var(--sub)]">{basicInfo.address}</div>
      </SectionCard>

      {/* 2. 会員カード */}
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
          <StatTile
            label="最終残高"
            value={`${memberCard.lastBalanceBalls.toLocaleString("ja-JP")}玉`}
            valueColorClass="text-[var(--purple)]"
            sub={`約${memberCard.lastBalanceYen.toLocaleString("ja-JP")}円`}
          />
          <StatTile
            label="入金残高"
            value={`${memberCard.depositBalanceYen.toLocaleString("ja-JP")}円`}
            valueColorClass="text-[var(--blue)]"
          />
          <button
            type="button"
            onClick={onManageMemberCard}
            className="flex min-h-[76px] flex-1 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface-hi)] px-2 text-[12px] font-bold text-[var(--text)] active:opacity-70"
          >
            会員カードを管理 ›
          </button>
        </div>
      </SectionCard>

      {/* 3. 貯玉・精算管理 */}
      <SectionCard>
        <SectionHeader title="貯玉・精算管理" />
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
        <div className="flex flex-col gap-2 px-3 pb-4">
          <button
            type="button"
            onClick={onDeposit}
            className="flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-xl bg-[var(--green)] text-[13px] font-bold text-[#04140a] active:opacity-80"
          >
            <Database size={15} />
            貯玉に入れる
          </button>
          <button
            type="button"
            onClick={onWithdraw}
            className="flex min-h-[44px] w-full items-center justify-center rounded-xl border border-[var(--border-hi)] bg-[var(--surface-hi)] text-[13px] font-bold text-[var(--text)] active:opacity-70"
          >
            貯玉から使う
          </button>
        </div>
      </SectionCard>

      {/* 4. 交換率・貸玉情報 */}
      <SectionCard>
        <SectionHeader title="交換率・貸玉情報" />
        <div className="flex gap-2 px-3 pb-3">
          <RateCell label="貸玉単価" value={`${exchangeInfo.rentalYenPer100}円`} unit="/100円" />
          <RateCell label="交換率" value={`${exchangeInfo.exchangeBallsPer100}玉`} unit="/100円" />
          <RateCell label="玉単価" value={`${exchangeInfo.ballUnitYen.toFixed(2)}円`} unit="/1玉" />
          <RateCell label="再プレイ上限" value={`${exchangeInfo.replayCapBalls}玉`} unit="まで" />
        </div>
        <div className="flex flex-col gap-2 px-3 pb-4">
          <button
            type="button"
            onClick={onApplyToSession}
            className="flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-xl bg-[var(--blue)] text-[13px] font-bold text-[#03121f] active:opacity-80"
          >
            <RefreshCw size={15} />
            現在の実戦設定に適用
          </button>
          <button
            type="button"
            onClick={onEditExchangeInfo}
            className="flex min-h-[44px] w-full items-center justify-center rounded-xl border border-[var(--border-hi)] bg-[var(--surface-hi)] text-[13px] font-bold text-[var(--text)] active:opacity-70"
          >
            編集
          </button>
        </div>
      </SectionCard>

      {/* 5. 危険な操作 */}
      <div className="mb-4 rounded-2xl border border-[var(--red)]/45 bg-[var(--red)]/8 p-4">
        <div className="flex items-center gap-2 text-[13px] font-bold text-[var(--red)]">
          <AlertTriangle size={16} />
          危険な操作
        </div>
        <p className="mt-2 text-[12px] leading-snug text-[var(--sub-hi)]">
          この店舗の全データ（貯玉残高・会員カード・設定）を削除します。
          <br />
          元に戻せません。
        </p>

        {!confirmDelete ? (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="mt-3 flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-xl bg-[var(--red)] text-[13px] font-bold text-[#210404] active:opacity-80"
          >
            <Trash2 size={15} />
            この店舗を削除する
          </button>
        ) : (
          <div className="mt-3 rounded-xl border border-[var(--red)]/45 bg-[var(--surface)] p-3">
            <p className="text-[12px] font-bold text-[var(--text)]">本当に削除しますか？この操作は元に戻せません。</p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="flex min-h-[44px] flex-1 items-center justify-center rounded-xl border border-[var(--border-hi)] bg-[var(--surface-hi)] text-[13px] font-bold text-[var(--text)] active:opacity-70"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={() => {
                  // TODO: 実際の削除処理を実装（pt_stores からの削除・貯玉ログ/会員カードのクリーンアップ等）。
                  // 本プロトタイプでは確認ダイアログの表示までを実装対象とする。
                  setConfirmDelete(false);
                }}
                className="flex min-h-[44px] flex-1 items-center justify-center rounded-xl bg-[var(--red)] text-[13px] font-bold text-[#210404] active:opacity-80"
              >
                削除する
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
