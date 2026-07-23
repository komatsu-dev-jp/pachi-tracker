import React, { useMemo, useState } from "react";
import { C, font, mono } from "../../constants";
import { Card } from "../Atoms";
import StoreRankingCard from "./StoreRankingCard";
import { getStoreRanking } from "./scoutSelectors";
import { buildStrategyMap } from "../strategy/strategyMapData";
import { localDateStr } from "../../constants";

// 本日予測タブ: 保存済み差玉から P-EVIDENCE 解析（buildStrategyMap）で計算した
// 最新スキャン店舗の狙い台と翌日予測を表示する。仮データ・通信は使わない。
const FORECAST_VERDICT = {
  strong: { label: "本命", color: C.green },
  watch: { label: "様子見", color: C.yellow },
  weak: { label: "回収", color: C.red },
  nodata: { label: "不足", color: C.sub },
};

const EMPTY_LIST = [];

function ForecastTab({ S }) {
  const scans = Array.isArray(S?.deltaScans) ? S.deltaScans : EMPTY_LIST;
  const customMachines = Array.isArray(S?.customMachines) ? S.customMachines : EMPTY_LIST;
  const hallMaps = S?.hallMaps;
  const selectedStoreId = S?.selectedStoreId;
  const data = useMemo(
    () => buildStrategyMap({
      scans,
      customMachines,
      hallMaps,
      selectedStoreId,
      stores: S?.stores,
      targetDate: localDateStr(new Date()),
    }),
    [scans, customMachines, hallMaps, selectedStoreId, S?.stores],
  );

  if (!data.total) {
    return (
      <EmptyState>
        差玉データがまだありません。
        <br />
        ホームの「差玉解析」でスキャンを保存すると、その店舗の本日予測を表示します。
      </EmptyState>
    );
  }

  const rows = data.top5.length ? data.top5 : data.all.slice(0, 5);
  const isReference = !data.actionable;
  return (
    <Card>
      <div style={{ padding: "12px 14px 4px" }}>
        <div style={{ fontSize: 12, color: C.sub, fontWeight: 700, letterSpacing: 0.4 }}>
          {isReference ? "過去解析の参考台" : `本日の狙い台 TOP${rows.length}`}
        </div>
        <div style={{ fontSize: 10, color: C.sub, marginTop: 2 }}>
          {data.machineName} ／ 全{data.total}台 ・ 候補{data.kpi.candidates}台（保存済み差玉から計算）
        </div>
        {isReference && (
          <div style={{ marginTop: 7, padding: "7px 9px", borderRadius: 8, color: C.yellow, border: `1px solid ${C.yellow}` }}>
            {data.freshness?.status === "stale"
              ? `解析日は${data.freshness.sourceDate || "不明"}です。2日以上前のため、本命判定を停止しています。`
              : "解析日を確認できないため、本命判定を停止しています。"}
          </div>
        )}
        {data.freshness?.status === "prepared" && (
          <div style={{ marginTop: 7, padding: "7px 9px", borderRadius: 8, color: C.cyan, border: `1px solid ${C.cyan}` }}>
            前日（{data.freshness.sourceDate}）の解析を本日用として表示しています。
          </div>
        )}
      </div>
      <div style={{ padding: "4px 8px 10px" }}>
        {rows.map((m, i) => {
          const v = isReference
            ? { label: "過去参考", color: C.sub }
            : FORECAST_VERDICT[m.verdict] || FORECAST_VERDICT.nodata;
          return (
            <div
              key={m.id}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                minHeight: 48, padding: "8px 8px",
                borderTop: i === 0 ? "none" : `1px solid ${C.border}`,
              }}
            >
              <span style={{
                minWidth: 44, textAlign: "center", fontSize: 15, fontWeight: 900,
                color: C.text, fontFamily: mono,
              }}>
                台{m.num}
              </span>
              <span style={{
                fontSize: 11, fontWeight: 800, color: v.color,
                border: `1px solid ${v.color}`, borderRadius: 999, padding: "3px 9px",
                flexShrink: 0,
              }}>
                {v.label}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.text, fontFamily: mono }}>
                  予測 {Number(m.rot).toLocaleString("ja-JP", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}/k ・ 信頼度 {m.confidence}%
                </div>
                <div style={{ fontSize: 10, color: C.sub, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {isReference ? "過去データ：" : `${m.predictionDayLabel}の地図：`}{m.nextPrediction}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

const SCOUT_TABS = [
  { id: "forecast", label: "本日予測" },
  { id: "actual",   label: "店舗実績" },
  { id: "event",    label: "イベント" },
];

// ヘッダー（タイトル＋更新時刻＋更新ボタン）
function ScoutHeader({ updatedAt, onRefresh }) {
  return (
    <div style={{ flexShrink: 0, padding: "10px 14px 0" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 10,
        }}
      >
        <div style={{ fontSize: 17, fontWeight: 800, color: C.text, fontFamily: font }}>
          店舗ランキング
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 11, color: C.sub, fontFamily: font }}>
            更新 {updatedAt}
          </span>
          <button
            className="b"
            onClick={onRefresh}
            aria-label="更新する"
            style={{
              minWidth: 44,
              minHeight: 32,
              borderRadius: 10,
              background: C.surface,
              border: `1px solid ${C.border}`,
              color: C.text,
              fontSize: 14,
              cursor: "pointer",
              padding: "0 10px",
              fontFamily: font,
            }}
          >
            ⟳
          </button>
        </div>
      </div>
    </div>
  );
}

// 偵察モード用のタブバー
function ScoutTabBar({ activeId, onChange }) {
  return (
    <div
      style={{
        display: "flex",
        gap: 4,
        background: C.surfaceHi,
        borderRadius: 12,
        padding: 3,
        border: `1px solid ${C.border}`,
        margin: "0 14px 12px",
      }}
    >
      {SCOUT_TABS.map((t) => {
        const active = activeId === t.id;
        return (
          <button
            key={t.id}
            className="b"
            onClick={() => onChange(t.id)}
            style={{
              flex: 1,
              minHeight: 40,
              background: active ? C.surface : "transparent",
              border: "none",
              borderRadius: 9,
              color: active ? C.blue : C.sub,
              fontSize: 13,
              fontWeight: 700,
              fontFamily: font,
              cursor: "pointer",
              letterSpacing: 0.2,
            }}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

// 空状態メッセージ
function EmptyState({ children }) {
  return (
    <Card style={{ padding: "28px 16px", textAlign: "center" }}>
      <div style={{ fontSize: 13, color: C.sub, fontFamily: font, lineHeight: 1.6 }}>
        {children}
      </div>
    </Card>
  );
}

function timeLabel(now = new Date()) {
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

export default function ScoutDashboard({ S }) {
  const archives = useMemo(() => S?.archives || [], [S?.archives]);

  // 過去アーカイブがあれば「店舗実績」、なければ「本日予測」をデフォルトに
  const hasArchives = archives.length > 0;
  const [activeTab, setActiveTab] = useState(hasArchives ? "actual" : "forecast");

  // 更新時刻（refresh ボタンで再評価するためトリガーを持つ）
  const [refreshTick, setRefreshTick] = useState(0);
  const updatedAt = useMemo(() => {
    // refreshTick の変化で時刻だけ最新化する
    void refreshTick;
    return timeLabel(new Date());
  }, [refreshTick]);

  // 実データ: 店舗別ランキング
  const actualRanking = useMemo(
    () => getStoreRanking(archives, { limit: 5 }),
    [archives]
  );

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <ScoutHeader updatedAt={updatedAt} onRefresh={() => setRefreshTick((t) => t + 1)} />
      <ScoutTabBar activeId={activeTab} onChange={setActiveTab} />

      <div
        style={{
          flex: 1,
          overflowY: "auto",
          overflowX: "hidden",
          padding: "0 14px calc(20px + env(safe-area-inset-bottom))",
        }}
      >
        {activeTab === "forecast" && <ForecastTab S={S} />}

        {activeTab === "actual" && (
          <>
            {actualRanking.length === 0 ? (
              <EmptyState>
                {hasArchives
                  ? "店舗名が登録されたアーカイブがありません。実戦記録に店舗名を入れると、ここに集計が表示されます。"
                  : "アーカイブがまだありません。実戦記録を保存すると、ここに店舗別の集計が表示されます。"}
              </EmptyState>
            ) : (
              <Card>
                <div style={{ padding: "12px 14px 4px" }}>
                  <div style={{ fontSize: 12, color: C.sub, fontWeight: 700, letterSpacing: 0.4 }}>
                    実績ランキング TOP5
                  </div>
                  <div style={{ fontSize: 10, color: C.sub, marginTop: 2 }}>
                    アーカイブ {archives.length} 件から集計
                  </div>
                </div>
                <div>
                  {actualRanking.map((r, i) => (
                    <StoreRankingCard
                      key={`${r.storeName}-${r.rank}`}
                      entry={r}
                      isFirst={i === 0}
                    />
                  ))}
                </div>
              </Card>
            )}
          </>
        )}

        {activeTab === "event" && (
          <EmptyState>
            イベント情報はまだ対応していません。
            <br />
            P-WORLD や来店予定の取り込みを今後検討予定です。
          </EmptyState>
        )}
      </div>
    </div>
  );
}
