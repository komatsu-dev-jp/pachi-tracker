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

import React, { useCallback, useMemo, useRef, useState } from "react";
import { BarChart3, ChevronLeft, ChevronRight, LayoutDashboard, SlidersHorizontal } from "lucide-react";
import { Badge } from "../components/store/storeDetailShared";
import { resolveStoreDetail } from "../components/store/storeDetailSelectors";
import { buildStoreDetailPanels, DETAIL_KEYS } from "../components/store/storeDetailPanels";
import StoreMetricDetailSheet from "../components/store/StoreMetricDetailSheet";
import StoreOverviewTab from "../components/store/StoreOverviewTab";
import StoreAnalysisTab from "../components/store/StoreAnalysisTab";
import StoreSettingsTab from "../components/store/StoreSettingsTab";

const TABS = [
  { id: "overview", label: "概要", icon: LayoutDashboard },
  { id: "analysis", label: "分析", icon: BarChart3 },
  { id: "settings", label: "設定", icon: SlidersHorizontal },
];

function HeaderMetric({ label, value, valueClassName = "text-[var(--text)]", onClick }) {
  return (
    <button type="button" onClick={onClick} aria-haspopup="dialog" aria-label={`${label}の詳細を表示`} className="min-w-0 bg-[var(--surface)] px-3 py-2.5 text-left transition-colors active:bg-[var(--surface-hi)]">
      <div className="flex items-center gap-0.5 truncate text-[9px] font-semibold text-[var(--sub)]">{label}<ChevronRight size={10} className="shrink-0" /></div>
      <div className={"mt-1 truncate text-[12px] font-black leading-none " + valueClassName}>{value}</div>
    </button>
  );
}

export default function StoreDetail({ storeId, onBack, onOpenSettings, onStartRecord, S }) {
  const [activeTab, setActiveTab] = useState("overview");
  const [activeDetailKey, setActiveDetailKey] = useState(null);
  const pageRef = useRef(null);
  const data = useMemo(
    () =>
      resolveStoreDetail(S?.stores, storeId, {
        chodamaReplayLimit: S?.chodamaReplayLimit,
        currentRentBalls: S?.rentBalls,
        currentExRate: S?.exRate,
        archives: S?.archives,
        chodamaLog: S?.chodamaLog,
      }),
    [S?.stores, S?.archives, S?.chodamaLog, storeId, S?.chodamaReplayLimit, S?.rentBalls, S?.exRate]
  );
  const detailPanels = useMemo(() => buildStoreDetailPanels(data), [data]);
  const closeDetail = useCallback(() => setActiveDetailKey(null), []);
  const openDetail = useCallback((detailKey) => setActiveDetailKey(detailKey), []);
  const handleDetailAction = useCallback((action) => {
    setActiveDetailKey(null);
    if (action === "settings") onOpenSettings?.();
    if (action === "record") onStartRecord?.();
  }, [onOpenSettings, onStartRecord]);

  const selectTab = (tabId) => {
    setActiveTab(tabId);
    pageRef.current?.scrollTo({ top: 0, behavior: "auto" });
  };

  if (!data.isRealStore) {
    return (
      <div className="flex h-full min-h-0 flex-1 flex-col" style={{ paddingTop: "env(safe-area-inset-top)" }}>
        <div className="flex min-h-[48px] items-center justify-between px-2">
          <button type="button" onClick={onBack} aria-label="戻る" className="flex h-11 w-11 items-center justify-center rounded-full text-[var(--text)] active:opacity-60">
            <ChevronLeft size={22} />
          </button>
          <h1 className="text-[15px] font-bold text-[var(--text)]">店舗詳細</h1>
          <div aria-hidden="true" className="h-11 w-11" />
        </div>
        <div className="mx-3 mt-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 text-center shadow-[var(--card-shadow)]">
          <div className="text-[15px] font-bold text-[var(--text)]">店舗がまだ登録されていません</div>
          <div className="mt-2 text-[12px] leading-6 text-[var(--sub)]">設定画面で店舗を登録すると、店舗別の記録と分析を確認できます。</div>
          <button type="button" onClick={onOpenSettings} className="mt-4 min-h-11 rounded-xl bg-[var(--blue)] px-5 text-[13px] font-bold text-white">設定画面を開く</button>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={pageRef}
      className="h-full min-h-0 flex-1 overflow-y-auto overscroll-y-contain"
      data-store-id={storeId ?? data.id}
      style={{ WebkitOverflowScrolling: "touch" }}
    >
      {/* ヘッダーも本文と一緒に流し、画面上部を占有し続けない。 */}
      <header className="px-3 pt-2">
        <div className="flex min-h-[44px] items-center gap-2.5">
          <button
            type="button"
            onClick={onBack}
            aria-label="戻る"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] shadow-[var(--card-shadow)] active:opacity-60"
          >
            <ChevronLeft size={22} />
          </button>
          <div className="min-w-0 flex-1">
            <div className="text-[9px] font-black tracking-[0.16em] text-[var(--sub)]">STORE DETAIL</div>
            <h1 className="mt-0.5 truncate text-[16px] font-black tracking-tight text-[var(--text)]">{data.name}</h1>
          </div>
          <Badge tone="green" dot>{data.analysisStatus}</Badge>
        </div>

        {/* 店舗カードを廃止し、必要な状態だけを横一列にまとめる。 */}
        <div className="mt-2 grid grid-cols-3 divide-x divide-[var(--border)] overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-[var(--card-shadow)]">
          <HeaderMetric label="記録充足度" value={`${data.analysisScore}%`} valueClassName="text-[16px] text-[var(--blue)]" onClick={() => openDetail(DETAIL_KEYS.COVERAGE)} />
          <HeaderMetric label="データ信頼度" value={data.dataReliability} onClick={() => openDetail(DETAIL_KEYS.RELIABILITY)} />
          <HeaderMetric label="最終更新" value={data.lastUpdatedLabel} onClick={() => openDetail(DETAIL_KEYS.FRESHNESS)} />
        </div>

        {/* セグメントタブ */}
        <nav aria-label="店舗詳細の表示切替" className="mt-3 mb-1 flex gap-1 rounded-2xl border border-[var(--border)] bg-[var(--surface-hi)] p-1.5 shadow-[var(--card-shadow)]">
          {TABS.map((tab) => {
            const active = tab.id === activeTab;
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => selectTab(tab.id)}
                aria-current={active ? "page" : undefined}
                className={
                  "flex min-h-[46px] flex-1 items-center justify-center gap-1.5 rounded-xl text-[13px] font-bold transition-all " +
                  (active
                    ? "bg-[var(--purple)] text-[#1a0b2e] shadow-sm"
                    : "text-[var(--sub-hi)] active:bg-[var(--surface)]")
                }
              >
                <Icon size={15} strokeWidth={2.2} />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </header>

      {/* ページ全体で1つのスクロール領域にし、ヘッダーを自然に画面外へ送れるようにする。 */}
      <div>
        {activeTab === "overview" && <StoreOverviewTab data={data} onNavigateTab={selectTab} onOpenDetail={openDetail} />}
        {activeTab === "analysis" && <StoreAnalysisTab data={data} onOpenDetail={openDetail} />}
        {activeTab === "settings" && <StoreSettingsTab data={data} onOpenSettings={onOpenSettings} onOpenDetail={openDetail} />}
      </div>
      <StoreMetricDetailSheet panel={activeDetailKey ? detailPanels[activeDetailKey] : null} onClose={closeDetail} onAction={handleDetailAction} />
    </div>
  );
}
