// 店舗詳細ページ（見た目優先プロトタイプ）
//
// 対象: /stores/:storeId 相当の画面。このアプリは react-router 等のルーティングライブラリを
// 導入しておらず、画面遷移は App.jsx の currentMode（状態文字列）で行う既存方式に統一されている
// （scout/select/record/analysis/settings/delta/deltaMap と同様）。
// 本コンポーネントも同じ方式に合わせ、App.jsx 側で
//   currentMode === "storeDetail" のとき <StoreDetail storeId={storeDetailId} onBack={...} />
// を描画する形で組み込む（実URL "/stores/:storeId" は発行しない）。
//
// 概要/分析/設定の3タブは状態管理のみで切り替え、画面遷移は発生しない。
// 各タブは独立したスクロールコンテナを持ち、非表示時も DOM を維持することで
// タブごとのスクロール位置を保持する。
//
// 店舗基本情報・貯玉・会員カード・交換率は S.stores（pt_stores）から実データを解決する
// （resolveStoreDetail、Tabs.jsx の Store detail view と同一の計算式を使用）。
// 分析タブ関連（店舗分析度・データ充足状況・傾向・判断ログ）はまだ実集計ロジックが無いため
// mockStoreDetail.js のダミー値のまま。TODO: archives ベースの店舗別集計は別ステップで実装。

import React, { useState, useMemo } from "react";
import { ChevronLeft, Share2 } from "lucide-react";
import { Badge } from "../components/store/storeDetailShared";
import { resolveStoreDetail } from "../components/store/storeDetailSelectors";
import StoreOverviewTab from "../components/store/StoreOverviewTab";
import StoreAnalysisTab from "../components/store/StoreAnalysisTab";
import StoreSettingsTab from "../components/store/StoreSettingsTab";

const TABS = [
  { id: "overview", label: "概要" },
  { id: "analysis", label: "分析" },
  { id: "settings", label: "設定" },
];

export default function StoreDetail({ storeId, onBack, S }) {
  const [activeTab, setActiveTab] = useState("overview");
  const data = useMemo(
    () =>
      resolveStoreDetail(S?.stores, storeId, {
        chodamaReplayLimit: S?.chodamaReplayLimit,
        currentRentBalls: S?.rentBalls,
        currentExRate: S?.exRate,
      }),
    [S?.stores, storeId, S?.chodamaReplayLimit, S?.rentBalls, S?.exRate]
  );

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden" data-store-id={storeId ?? data.id}>
      {/* 共通ヘッダー（全タブ固定） */}
      <div className="shrink-0" style={{ paddingTop: "env(safe-area-inset-top)" }}>
        <div className="flex min-h-[48px] items-center justify-between px-2">
          <button
            type="button"
            onClick={onBack}
            aria-label="戻る"
            className="flex h-11 w-11 items-center justify-center rounded-full text-[var(--text)] active:opacity-60"
          >
            <ChevronLeft size={22} />
          </button>
          <h1 className="text-[15px] font-bold text-[var(--text)]">店舗詳細</h1>
          <button
            type="button"
            // TODO: 共有機能は次ステップで実装（現状は導線のみ）
            onClick={() => {}}
            aria-label="共有"
            className="flex h-11 w-11 items-center justify-center rounded-full text-[var(--text)] active:opacity-60"
          >
            <Share2 size={19} />
          </button>
        </div>

        {/* 店舗ヘッダーカード */}
        <div className="mx-3 mb-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--card-shadow)]">
          <div className="flex items-start gap-3">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[var(--border-hi)] bg-[var(--surface-hi)]">
              {data.logoUrl ? (
                <img src={data.logoUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="text-[20px] font-black text-[var(--sub-hi)]">{data.logoInitial}</span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[17px] font-bold text-[var(--text)]">{data.name}</div>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1.5">
                <span className="text-[12px] font-semibold text-[var(--sub-hi)]">
                  店舗分析度 <b className="text-[15px] font-black text-[var(--blue)]">{data.analysisScore}%</b>
                </span>
                <Badge tone="amber">データ信頼度 {data.dataReliability}</Badge>
                <Badge tone="green" dot>
                  {data.analysisStatus}
                </Badge>
              </div>
            </div>
          </div>
          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-hi)]">
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.min(100, Math.max(0, data.analysisScore))}%`,
                background: "linear-gradient(90deg, var(--blue), var(--teal))",
              }}
            />
          </div>
          <div className="mt-2 text-[11px] text-[var(--sub)]">最終更新 {data.lastUpdatedLabel}</div>
        </div>

        {/* セグメントタブ */}
        <div className="mx-3 mb-2 flex gap-1 rounded-xl border border-[var(--border)] bg-[var(--surface-hi)] p-1">
          {TABS.map((tab) => {
            const active = tab.id === activeTab;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={
                  "min-h-[40px] flex-1 rounded-lg text-[13px] font-bold transition-colors " +
                  (active ? "bg-[var(--purple)] text-[#1a0b2e]" : "text-[var(--sub-hi)] active:opacity-70")
                }
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* タブ本文（それぞれ独立スクロール、非表示時も維持してスクロール位置を保持） */}
      <div className="relative min-h-0 flex-1">
        <div
          className="absolute inset-0 overflow-y-auto"
          style={{ display: activeTab === "overview" ? "block" : "none" }}
        >
          <StoreOverviewTab data={data} onNavigateTab={setActiveTab} />
        </div>
        <div
          className="absolute inset-0 overflow-y-auto"
          style={{ display: activeTab === "analysis" ? "block" : "none" }}
        >
          <StoreAnalysisTab data={data} onNavigateTab={setActiveTab} />
        </div>
        <div
          className="absolute inset-0 overflow-y-auto"
          style={{ display: activeTab === "settings" ? "block" : "none" }}
        >
          {/* TODO: 編集/会員カード管理/入出金/実戦設定への適用は次ステップで実装 */}
          <StoreSettingsTab data={data} />
        </div>
      </div>
    </div>
  );
}
