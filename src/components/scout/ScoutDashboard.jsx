import React, { useMemo, useState } from "react";
import { C, font } from "../../constants";
import { Card } from "../Atoms";
import StoreRankingCard from "./StoreRankingCard";
import TodayHighlightList from "./TodayHighlightList";
import { getStoreRanking } from "./scoutSelectors";
import {
  getDummyStoreRanking,
  getDummyHighlights,
  todayKey,
  timeLabel,
} from "../../dummyData";

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

// ダミーデータ告知バナー
function DummyBanner({ children }) {
  return (
    <div
      style={{
        margin: "0 0 12px",
        padding: "8px 12px",
        background: "rgba(234,179,8,0.12)",
        border: "1px solid rgba(234,179,8,0.4)",
        borderRadius: 10,
        color: "#fcd34d",
        fontSize: 11,
        fontFamily: font,
        lineHeight: 1.5,
      }}
    >
      {children}
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

  // ダミー店舗ランキング & 本日の注目ポイント
  const dummyRanking = useMemo(() => getDummyStoreRanking(todayKey(), 5), []);
  const dummyHighlights = useMemo(() => getDummyHighlights(todayKey(), 4), []);

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
        {activeTab === "forecast" && (
          <>
            <DummyBanner>
              ※ 本日予測はダミー表示です。実データへの切り替えは P-EVIDENCE エンジン実装後に行います。
            </DummyBanner>

            <Card>
              <div style={{ padding: "12px 14px 4px" }}>
                <div style={{ fontSize: 12, color: C.sub, fontWeight: 700, letterSpacing: 0.4 }}>
                  期待値ランキング TOP5
                </div>
              </div>
              <div>
                {dummyRanking.map((r, i) => (
                  <StoreRankingCard
                    key={r.storeName}
                    entry={r}
                    isFirst={i === 0}
                    isDummy
                  />
                ))}
              </div>
            </Card>

            <Card>
              <div style={{ padding: "12px 14px 4px" }}>
                <div style={{ fontSize: 12, color: C.sub, fontWeight: 700, letterSpacing: 0.4 }}>
                  本日の注目ポイント
                </div>
              </div>
              <TodayHighlightList items={dummyHighlights} />
            </Card>
          </>
        )}

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
